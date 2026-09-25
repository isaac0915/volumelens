import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fugle_marketdata import RestClient
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.stock_quote import StockQuote
from app.models.volume_alert import VolumeAlert
from app.models.stock_candle import StockCandle
from app.services.stock_poller import get_average_volume, poll_stocks, stock_cache
from app.services.daily_sync import run_daily_sync
from app.services.radar import run_radar

fugle_client = RestClient(api_key=settings.fugle_api_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(poll_stocks(fugle_client)),
        asyncio.create_task(run_radar(fugle_client)),
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
def get_cached_stocks():
    return {"status": "success", "data": stock_cache}


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
async def get_stock_detail(symbol: str, limit: int = Query(default=100, ge=1, le=1000)):
    async with AsyncSessionLocal() as session:
        history_result = await session.execute(
            select(StockQuote)
            .where(StockQuote.symbol == symbol)
            .order_by(StockQuote.recorded_at.desc())
            .limit(limit)
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

    if not history and not alerts and not daily_candles and symbol not in stock_cache:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")

    avg_volume = await get_average_volume(symbol)

    return {
        "status": "success",
        "data": {
            "current": stock_cache.get(symbol),
            "average_volume_5d": avg_volume,
            "history": [
                {
                    "price": float(q.price),
                    "volume": q.volume,
                    "recorded_at": q.recorded_at.isoformat(),
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