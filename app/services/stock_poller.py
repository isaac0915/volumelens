import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select

from sqlalchemy import func

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.stock import Stock
from app.models.stock_candle import StockCandle
from app.models.stock_quote import StockQuote
from app.services.market_hours import is_market_open
from app.services.volume_detection import is_volume_spike

stock_cache: dict = {}

WATCHED_SYMBOLS = ["2330", "2317"]
POLL_INTERVAL = 3  # seconds

async def _save_quote(symbol: str, data: dict) -> None:
    async with AsyncSessionLocal() as session:
        session.add(StockQuote(
            symbol=symbol,
            name=data["name"],
            price=data["price"],
            volume=data["volume"],
            recorded_at=datetime.utcnow(),
        ))
        await session.commit()

async def get_average_volume(symbol: str) -> float:
    five_days_ago = datetime.utcnow() - timedelta(days=5)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(func.avg(StockQuote.volume))
            .where(StockQuote.symbol == symbol)
            .where(StockQuote.recorded_at >= five_days_ago)
        )
        avg = result.scalar()
        return float(avg) if avg else 0.0

async def get_latest_closes(symbols: list[str]) -> dict:
    """Latest daily close per symbol, shaped like a stock_cache entry.

    Used when the in-memory cache is empty, e.g. outside market hours or after a
    restart, so the dashboard still shows the last close instead of nothing.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StockCandle, Stock.name)
            .outerjoin(Stock, Stock.symbol == StockCandle.symbol)
            .where(StockCandle.symbol.in_(symbols))
            .distinct(StockCandle.symbol)
            .order_by(StockCandle.symbol, StockCandle.date.desc())
        )
        rows = result.all()

    return {
        candle.symbol: {
            "symbol": candle.symbol,
            "name": name or candle.symbol,
            "price": float(candle.close),
            "change": float(candle.change),
            "volume": candle.volume // 1000,  # candles are in shares; live quotes in lots (張)
            "updated_at": candle.date.isoformat(),
            "source": "close",
        }
        for candle, name in rows
    }


async def poll_stocks(client) -> None:
    loop = asyncio.get_event_loop()
    while True:
        if not is_market_open():
            print("[poller] Market closed, sleeping 60s")
            await asyncio.sleep(60)
            continue

        for symbol in WATCHED_SYMBOLS:
            try:
                quote = await loop.run_in_executor(
                    None, lambda s=symbol: client.stock.intraday.quote(symbol=s)
                )
                data = {
                    "symbol": symbol,
                    "name": quote.get("name", "Unknown"),
                    "price": quote.get("lastPrice", 0),
                    "change": quote.get("change", 0),
                    "volume": quote.get("total", {}).get("tradeVolume", 0),
                    "updated_at": datetime.utcnow().isoformat(),
                    "source": "live",
                }
                stock_cache[symbol] = data
                await _save_quote(symbol, data)
                avg_volume = await get_average_volume(symbol)
                if is_volume_spike(data["volume"], avg_volume):
                    print(f"[ALERT] Volume spike detected for {symbol}! Current: {data['volume']}, Average: {avg_volume:.2f}")
            except Exception as e:
                print(f"[poller] {symbol}: {e}")

        await asyncio.sleep(POLL_INTERVAL)

