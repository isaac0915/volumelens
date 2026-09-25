"""Backfill daily candles into stock_candles.

Usage:
    # whole market, last 180 days
    docker compose exec api python -m app.script.backfill_candles

    # quick test on the first 5 symbols
    docker compose exec api python -m app.script.backfill_candles --limit 5

    # specific symbols / range
    docker compose exec api python -m app.script.backfill_candles --symbols 2330 2317 --days 365

Days already stored are skipped (ON CONFLICT DO NOTHING on symbol+date), so the
script is safe to re-run after an interruption.
"""
import argparse
import asyncio
import logging
from datetime import date, timedelta

from fugle_marketdata import RestClient
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.stock_candle import StockCandle

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

FIELDS = "open,high,low,close,volume,turnover,change"
THROTTLE_SECONDS = 0.5  # pause between Fugle calls to stay under rate limits
MAX_RETRIES = 5
RETRY_BASE_SECONDS = 5  # backoff on HTTP 429: 5s, 10s, 20s, 40s, 80s


async def call_fugle(func):
    """Run a blocking Fugle call in a thread, backing off and retrying on 429."""
    for attempt in range(MAX_RETRIES):
        try:
            return await asyncio.to_thread(func)
        except Exception as e:
            if "429" not in str(e) or attempt == MAX_RETRIES - 1:
                raise
            wait = RETRY_BASE_SECONDS * 2 ** attempt
            logger.info(f"Rate limited, retrying in {wait}s")
            await asyncio.sleep(wait)


async def fetch_all_symbols(client) -> list[str]:
    result = await call_fugle(
        lambda: client.stock.intraday.tickers(**{"type": "EQUITY", "isNormal": "true"})
    )
    return [t["symbol"] for t in result.get("data", [])]


async def backfill_symbol(client, session, symbol: str, from_date: date, to_date: date) -> int:
    """Fetch one symbol's daily candles and insert the missing days. Returns rows inserted."""
    result = await call_fugle(
        lambda: client.stock.historical.candles(**{
            "symbol": symbol,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "fields": FIELDS,
        })
    )

    rows = [
        {
            "symbol": symbol,
            "date": date.fromisoformat(d["date"]),
            "open": d["open"],
            "high": d["high"],
            "low": d["low"],
            "close": d["close"],
            "volume": d["volume"],
            "turnover": d["turnover"],
            "change": d["change"],
        }
        for d in result.get("data", [])
    ]
    if not rows:
        return 0

    stmt = insert(StockCandle).values(rows).on_conflict_do_nothing(
        index_elements=["symbol", "date"]
    )
    inserted = await session.execute(stmt)
    await session.commit()  # commit per symbol so progress survives a crash
    return inserted.rowcount


async def main(symbols: list[str] | None, days: int, limit: int | None) -> None:
    client = RestClient(api_key=settings.fugle_api_key)

    if not symbols:
        symbols = await fetch_all_symbols(client)
    if limit:
        symbols = symbols[:limit]

    to_date = date.today()
    from_date = to_date - timedelta(days=days)
    logger.info(f"Backfilling {len(symbols)} symbols from {from_date} to {to_date}")

    total_inserted = 0
    failed: list[str] = []

    async with AsyncSessionLocal() as session:
        for i, symbol in enumerate(symbols, 1):
            try:
                total_inserted += await backfill_symbol(client, session, symbol, from_date, to_date)
            except Exception as e:
                await session.rollback()
                failed.append(symbol)
                logger.warning(f"{symbol} failed: {str(e).splitlines()[0][:200]}")

            await asyncio.sleep(THROTTLE_SECONDS)

            if i % 100 == 0 or i == len(symbols):
                logger.info(f"Progress: {i}/{len(symbols)} (inserted {total_inserted} rows)")

    logger.info(f"Done — inserted {total_inserted} rows, {len(failed)} symbols failed")
    if failed:
        logger.info(f"Failed symbols: {' '.join(failed)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill daily candles from Fugle")
    parser.add_argument("--symbols", nargs="+", help="symbols to backfill (default: whole market)")
    parser.add_argument("--days", type=int, default=180, help="calendar days to look back (default: 180)")
    parser.add_argument("--limit", type=int, help="only process the first N symbols (for testing)")
    args = parser.parse_args()

    asyncio.run(main(args.symbols, args.days, args.limit))
