import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fugle_marketdata import RestClient

from app.core.config import settings
from app.services.stock_poller import poll_stocks, stock_cache
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