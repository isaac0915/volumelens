import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fugle_marketdata import RestClient
from sqlalchemy import Date, Time, case, func, or_, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.stock_quote import StockQuote
from app.models.volume_alert import VolumeAlert
from app.models.stock import Stock
from app.models.stock_candle import StockCandle
from app.services.market_hours import MARKET_CLOSE, MARKET_OPEN, TZ_TAIPEI, is_market_open
from app.services.mis_quotes import fetch_indices, fetch_quotes
from app.services.stock_poller import (
    WATCHED_SYMBOLS,
    get_latest_closes,
    poll_stocks,
    stock_cache,
)
from app.services.daily_sync import run_daily_sync
from app.services.radar import run_radar

fugle_client = RestClient(api_key=settings.fugle_api_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(poll_stocks(fugle_client)),
        asyncio.create_task(run_radar()),
        asyncio.create_task(run_daily_sync()),
    ]
    yield
    for t in tasks:
        t.cancel()
    for t in tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Taiwan Stock Monitor API", lifespan=lifespan)

@app.get("/api/stocks")
async def get_stocks():
    """Live quotes from the poller; symbols it hasn't quoted fall back to the latest close."""
    data = dict(stock_cache)
    missing = [s for s in WATCHED_SYMBOLS if s not in data]
    if missing:
        data.update(await get_latest_closes(missing))
    return {"status": "success", "market_open": is_market_open(), "data": data}


INDEX_CACHE_SECONDS = 15  # the dashboard polls every few seconds; don't forward each poll to MIS
_index_cache: dict = {"at": 0.0, "data": [], "refreshing": None}


async def _refresh_indices() -> None:
    try:
        _index_cache["data"] = await fetch_indices()
    except Exception:
        pass  # keep serving the last good value
    finally:
        _index_cache["at"] = time.monotonic()
        _index_cache["refreshing"] = None


@app.get("/api/market")
async def get_market():
    """Market indices plus coverage stats.

    Indices are cached stale-while-revalidate: a stale cache is returned
    immediately while one background task refreshes it, so a slow MIS
    response never blocks the dashboard. Only the very first request waits.
    """
    stale = time.monotonic() - _index_cache["at"] > INDEX_CACHE_SECONDS
    if stale and _index_cache["refreshing"] is None:
        _index_cache["refreshing"] = asyncio.create_task(_refresh_indices())
    if not _index_cache["data"] and _index_cache["refreshing"] is not None:
        await _index_cache["refreshing"]
    async with AsyncSessionLocal() as session:
        tracked = (await session.execute(select(func.count()).select_from(Stock))).scalar_one()
        latest_session = (await session.execute(select(func.max(StockCandle.date)))).scalar_one()
    return {
        "status": "success",
        "market_open": is_market_open(),
        "data": {
            "indices": _index_cache["data"],
            "tracked_symbols": tracked,
            "latest_session": latest_session.isoformat() if latest_session else None,
        },
    }


DAILY_SPIKE_MULTIPLIER = 2.0
DAILY_SPIKE_MIN_SHARES = 500_000  # 500 lots, same noise floor as the intraday radar


@app.get("/api/daily-spikes")
async def get_daily_spikes(limit: int = Query(default=5, ge=1, le=100)):
    """Volume spikes on the latest trading day in stock_candles.

    Each day's volume is compared with the average of that symbol's previous 20
    trading days (a window of ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING), so
    this works after the close and on weekends, unlike the intraday radar.
    """
    async with AsyncSessionLocal() as session:
        latest = (await session.execute(select(func.max(StockCandle.date)))).scalar_one()
        if latest is None:
            return {"status": "success", "data": {"date": None, "total": 0, "stocks": []}}

        window = {"partition_by": StockCandle.symbol, "order_by": StockCandle.date, "rows": (-20, -1)}
        recent = (
            select(
                StockCandle.symbol,
                StockCandle.date,
                StockCandle.close,
                StockCandle.change,
                StockCandle.volume,
                func.avg(StockCandle.volume).over(**window).label("avg_volume"),
                func.count().over(**window).label("history_days"),
            )
            .where(StockCandle.date >= latest - timedelta(days=45))
            .subquery()
        )
        ratio = (recent.c.volume / recent.c.avg_volume).label("ratio")
        result = await session.execute(
            select(recent, ratio, Stock.name)
            .join(Stock, Stock.symbol == recent.c.symbol)
            .where(
                recent.c.date == latest,
                recent.c.history_days >= 10,
                recent.c.volume >= DAILY_SPIKE_MIN_SHARES,
                recent.c.volume >= DAILY_SPIKE_MULTIPLIER * recent.c.avg_volume,
            )
            .order_by(ratio.desc())
        )
        rows = result.all()

    def pct(close, change):
        prev = float(close) - float(change)
        return round(float(change) / prev * 100, 2) if prev else 0.0

    return {
        "status": "success",
        "data": {
            "date": latest.isoformat(),
            "total": len(rows),
            "stocks": [
                {
                    "symbol": r.symbol,
                    "name": r.name,
                    "close": float(r.close),
                    "change": float(r.change),
                    "change_pct": pct(r.close, r.change),
                    "volume": r.volume // 1000,  # lots (張)
                    "average_volume": round(float(r.avg_volume) / 1000),
                    "ratio": round(float(r.ratio), 2),
                }
                for r in rows[:limit]
            ],
        },
    }


MAX_QUOTE_SYMBOLS = 50
QUOTE_CACHE_SECONDS = 10
_quote_cache: dict[str, tuple[float, dict]] = {}  # symbol -> (fetched_at, live quote)


@app.get("/api/quotes")
async def get_quotes(symbols: str = Query(max_length=600, description="Comma-separated symbols")):
    """Quotes for an arbitrary list of symbols, e.g. a viewer's watchlist.

    During market hours, live prices come from the MIS endpoint in batches and
    are cached per symbol for a few seconds, so many viewers with overlapping
    watchlists share upstream requests. Outside market hours, or for symbols
    without a trade yet today, each symbol falls back to its latest daily close.
    Unknown symbols are dropped; results keep the requested order.
    """
    requested = list(dict.fromkeys(s.strip() for s in symbols.split(",") if s.strip()))[:MAX_QUOTE_SYMBOLS]
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(Stock).where(Stock.symbol.in_(requested)))).scalars().all()
    exchanges = {s.symbol: s.exchange for s in rows}
    known = [s for s in requested if s in exchanges]

    data = await get_latest_closes(known)
    market_open = is_market_open()
    if market_open and known:
        now = time.monotonic()
        stale = {s: exchanges[s] for s in known if now - _quote_cache.get(s, (0.0, None))[0] > QUOTE_CACHE_SECONDS}
        if stale:
            try:
                fresh = await fetch_quotes(stale, datetime.now(TZ_TAIPEI).date())
            except Exception:
                fresh = {}
            for symbol in stale:
                # Cache misses too, so a symbol with no trade yet isn't re-requested every poll
                _quote_cache[symbol] = (now, fresh.get(symbol))
        for symbol in known:
            live = _quote_cache.get(symbol, (0.0, None))[1]
            if live:
                data[symbol] = {
                    "symbol": symbol,
                    "name": live["name"] or data.get(symbol, {}).get("name", symbol),
                    "price": live["price"],
                    "change": live["change"],
                    "volume": live["volume"],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "source": "live",
                }

    return {"status": "success", "market_open": market_open, "data": [data[s] for s in known if s in data]}


@app.get("/api/search")
async def search_stocks(q: str = Query(min_length=1, max_length=20), limit: int = Query(default=8, ge=1, le=20)):
    """Match symbols by prefix and names by substring; exact symbol first, then prefix, then name."""
    q = q.strip()
    rank = case(
        (Stock.symbol == q, 0),
        (Stock.symbol.startswith(q, autoescape=True), 1),
        else_=2,
    )
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Stock)
            .where(or_(Stock.symbol.startswith(q, autoescape=True), Stock.name.contains(q, autoescape=True)))
            .order_by(rank, Stock.symbol)
            .limit(limit)
        )
        stocks = result.scalars().all()
    return {
        "status": "success",
        "data": [{"symbol": s.symbol, "name": s.name, "exchange": s.exchange} for s in stocks],
    }


@app.get("/api/alerts")
async def get_alerts(days: int = Query(default=7, ge=1, le=30)):
    """Recent volume spikes, one row per stock per day (the day's highest ratio).

    The radar re-inserts an alert every scan while a stock stays above the
    threshold, so rows are grouped by (day, symbol) to avoid duplicates.
    detected_at is stored in UTC; Taiwan market hours (09:00-13:30 UTC+8)
    fall on the same UTC date, so date(detected_at) is the trading day.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)
    day = func.date(VolumeAlert.detected_at).label("day")
    max_ratio = func.max(VolumeAlert.ratio).label("max_ratio")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(
                day,
                VolumeAlert.symbol,
                VolumeAlert.name,
                max_ratio,
                func.max(VolumeAlert.current_volume).label("max_volume"),
                func.max(VolumeAlert.average_volume).label("average_volume"),
                func.max(VolumeAlert.detected_at).label("last_detected_at"),
            )
            .where(VolumeAlert.detected_at >= cutoff)
            .group_by(day, VolumeAlert.symbol, VolumeAlert.name)
            .order_by(day.desc(), max_ratio.desc())
        )
        rows = result.all()

    grouped: dict[str, list] = {}
    for r in rows:
        grouped.setdefault(r.day.isoformat(), []).append({
            "symbol": r.symbol,
            "name": r.name,
            "ratio": float(r.max_ratio),
            "max_volume": r.max_volume,
            "average_volume": float(r.average_volume),
            "last_detected_at": r.last_detected_at.replace(tzinfo=timezone.utc).isoformat(),
        })

    return {
        "status": "success",
        "data": [{"date": d, "stocks": stocks} for d, stocks in grouped.items()],
    }


@app.get("/api/stocks/{symbol}/detail")
async def get_stock_detail(symbol: str):
    # recorded_at is naive UTC; convert to Taipei wall time to find trading sessions
    taipei = func.timezone("Asia/Taipei", func.timezone("UTC", StockQuote.recorded_at))
    in_session = (
        (func.extract("isodow", taipei) <= 5)
        & (func.cast(taipei, Time) >= MARKET_OPEN)
        & (func.cast(taipei, Time) <= MARKET_CLOSE)
    )

    async with AsyncSessionLocal() as session:
        # Intraday history: the latest trading session only, one quote per minute
        # (the last in each minute), so the chart shows one day, not a mix of days
        latest_day = (
            await session.execute(
                select(func.max(func.cast(taipei, Date))).where(StockQuote.symbol == symbol, in_session)
            )
        ).scalar_one()
        history = []
        if latest_day:
            minute = func.date_trunc("minute", StockQuote.recorded_at)
            history_result = await session.execute(
                select(StockQuote)
                .where(StockQuote.symbol == symbol, in_session, func.cast(taipei, Date) == latest_day)
                .distinct(minute)
                .order_by(minute, StockQuote.recorded_at.desc())
            )
            history = history_result.scalars().all()

        alerts_result = await session.execute(
            select(VolumeAlert)
            .where(VolumeAlert.symbol == symbol)
            .order_by(VolumeAlert.detected_at.desc())
            .limit(5)
        )
        alerts = alerts_result.scalars().all()

        daily_candles_result = await session.execute(
            select(StockCandle)
            .where(StockCandle.symbol == symbol)
            .order_by(StockCandle.date.asc())
        )
        daily_candles = daily_candles_result.scalars().all()

        stock = await session.get(Stock, symbol)

    if not history and not alerts and not daily_candles and symbol not in stock_cache:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")

    return {
        "status": "success",
        "data": {
            "name": stock.name if stock else None,
            "exchange": stock.exchange if stock else None,
            "current": stock_cache.get(symbol),
            "session_date": latest_day.isoformat() if latest_day else None,
            "history": [
                {
                    "price": float(q.price),
                    "volume": q.volume,
                    "recorded_at": q.recorded_at.replace(tzinfo=timezone.utc).isoformat(),
                }
                for q in history
            ],
            "alerts": [
                {
                    "name": a.name,
                    "current_volume": a.current_volume,
                    "average_volume": float(a.average_volume),
                    "ratio": float(a.ratio),
                    "detected_at": a.detected_at.replace(tzinfo=timezone.utc).isoformat(),
                }
                for a in alerts
            ],
            "daily_candles": [
                {
                    "date": c.date.isoformat(),
                    "open": float(c.open),
                    "high": float(c.high),
                    "low": float(c.low),
                    "close": float(c.close),
                    "volume": c.volume,
                    "turnover": float(c.turnover),
                    "change": float(c.change),
                }
                for c in daily_candles
            ],
        },
    }


@app.get("/")
def read_root():
    return {"message": "Welcome to the Taiwan Stock Monitor API backend"}

@app.get("/api/stock/{stock_id}")
def get_stock_info(stock_id: str):
    try:
        # Fetch real-time intraday quote from Fugle API
        quote_data = fugle_client.stock.intraday.quote(symbol=stock_id)
        
        # Parse the required fields (price and volume)
        # Note: 'lastPrice' is the current price, 'total' contains volume info
        last_price = quote_data.get("lastPrice", 0)
        total_volume = quote_data.get("total", {}).get("tradeVolume", 0)
        stock_name = quote_data.get("name", "Unknown")

        return {
            "status": "success",
            "data": {
                "symbol": stock_id,
                "name": stock_name,
                "price": last_price,
                "volume": total_volume
            }
        }
        

    except Exception as e:
        # Handle errors (e.g., invalid stock ID or API key issues)
        raise HTTPException(status_code=404, detail=f"Fugle API Error or Stock not found: {str(e)}")