from fugle_marketdata import RestClient
from app.core.config import settings

import asyncio
from datetime import date
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.stock_candle import StockCandle

async def main():
    symbol = "2330"
    client = RestClient(api_key = settings.fugle_api_key)  # 輸入您的 API key
    stock = client.stock  # Stock REST API client
    result = stock.historical.candles(**{"symbol": symbol, "from": "2025-07-01", "to": "2025-07-10", "fields": "open,high,low,close,volume,turnover,change"})

    async with AsyncSessionLocal() as session:
        for d in result["data"]:
            candle_date = date.fromisoformat(d["date"])

            existing = await session.execute(
                select(StockCandle).where(
                    StockCandle.symbol == symbol,
                    StockCandle.date == candle_date,
                )
            )
            if existing.scalar_one_or_none() is not None:
                continue  # 這天已經存在,跳過

            session.add(StockCandle(
                symbol=symbol,
                date=candle_date,
                open=d["open"],
                high=d["high"],
                low=d["low"],
                close=d["close"],
                volume=d["volume"],
                turnover=d["turnover"],
                change=d["change"],
            ))

        await session.commit()

asyncio.run(main())