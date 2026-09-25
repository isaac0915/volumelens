import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fugle_marketdata import RestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.stock_quote import StockQuote
from app.models.volume_alert import VolumeAlert
from app.models.stock_candle import StockCandle
from app.services.stock_poller import get_average_volume, poll_stocks, stock_cache
from app.services.radar import run_radar

fugle_client = RestClient(api_key=settings.fugle_api_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(poll_stocks(fugle_client))
    radar_task = asyncio.create_task(run_radar(fugle_client))
    yield
    task.cancel()
    radar_task.cancel()
    for t in [task, radar_task]:
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Taiwan Stock Monitor API", lifespan=lifespan)

@app.get("/api/stocks")
def get_cached_stocks():
    return {"status": "success", "data": stock_cache}


@app.get("/api/alerts")
async def get_alerts():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(VolumeAlert).order_by(VolumeAlert.detected_at.desc()).limit(50)
        )
        alerts = result.scalars().all()
    return {
        "status": "success",
        "data": [
            {
                "symbol": a.symbol,
                "name": a.name,
                "current_volume": a.current_volume,
                "average_volume": float(a.average_volume),
                "ratio": float(a.ratio),
                "detected_at": a.detected_at.isoformat(),
            }
            for a in alerts
        ],
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

    if not history and symbol not in stock_cache:
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
                    "current_volume": a.current_volume,
                    "average_volume": float(a.average_volume),
                    "ratio": float(a.ratio),
                    "detected_at": a.detected_at.isoformat(),
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