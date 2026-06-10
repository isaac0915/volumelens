import asyncio
from datetime import datetime

from app.core.database import AsyncSessionLocal
from app.models.stock_quote import StockQuote

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


async def poll_stocks(client) -> None:
    loop = asyncio.get_event_loop()
    while True:
        for symbol in WATCHED_SYMBOLS:
            try:
                quote = await loop.run_in_executor(
                    None, lambda s=symbol: client.stock.intraday.quote(symbol=s)
                )
                data = {
                    "symbol": symbol,
                    "name": quote.get("name", "Unknown"),
                    "price": quote.get("lastPrice", 0),
                    "volume": quote.get("total", {}).get("tradeVolume", 0),
                    "updated_at": datetime.utcnow().isoformat(),
                }
                stock_cache[symbol] = data
                await _save_quote(symbol, data)
            except Exception as e:
                print(f"[poller] {symbol}: {e}")

        await asyncio.sleep(POLL_INTERVAL)
