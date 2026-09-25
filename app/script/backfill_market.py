"""Backfill daily candles for the whole market (TWSE + TPEx), one day per request.

Each trading day costs one TWSE and one TPEx request, versus one Fugle call per
symbol in backfill_candles.py, so 180 days is ~250 requests instead of ~2,300 x N.

Usage:
    # last 180 calendar days
    docker compose exec api python -m app.script.backfill_market

    # last week (quick check)
    docker compose exec api python -m app.script.backfill_market --days 7

Days already stored are skipped, and inserts use ON CONFLICT DO NOTHING, so the
script is safe to re-run; days where an exchange failed are listed at the end.
"""
import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.core.database import AsyncSessionLocal
from app.models.stock_candle import StockCandle
from app.services.exchange_daily import fetch_tpex_day, fetch_twse_day

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("urllib3").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

THROTTLE_SECONDS = 3  # TWSE blocks IPs that send more than a few requests per 5s
INSERT_CHUNK = 1000  # 9 params per row; asyncpg caps a statement at 32,767 params
# A full day is ~2,300 rows (TWSE ~1,300 + TPEx ~1,000). Fewer means one exchange
# failed or hasn't published yet, so the day is fetched again.
COMPLETE_DAY_ROWS = 2000


async def count_rows(session, day: date) -> int:
    result = await session.execute(select(func.count()).where(StockCandle.date == day))
    return result.scalar_one()


async def insert_candles(session, candles: list[dict]) -> int:
    inserted = 0
    for i in range(0, len(candles), INSERT_CHUNK):
        stmt = insert(StockCandle).values(candles[i:i + INSERT_CHUNK]).on_conflict_do_nothing(
            index_elements=["symbol", "date"]
        )
        inserted += (await session.execute(stmt)).rowcount
    await session.commit()
    return inserted


async def backfill_day(session, day: date, failed: list[str]) -> int:
    """Fetch and store one day from both exchanges. Returns rows inserted."""
    inserted = 0
    for name, fetch in [("TWSE", fetch_twse_day), ("TPEx", fetch_tpex_day)]:
        try:
            candles = await asyncio.to_thread(fetch, day)
        except Exception as e:
            failed.append(f"{day} {name}")
            logger.warning(f"{day} {name} failed: {str(e).splitlines()[0][:200]}")
            continue
        if candles:
            inserted += await insert_candles(session, candles)
        await asyncio.sleep(THROTTLE_SECONDS)
    return inserted


async def main(days: int) -> None:
    today = datetime.now(ZoneInfo("Asia/Taipei")).date()  # container clock is UTC
    dates = [today - timedelta(days=n) for n in range(days, -1, -1)]
    weekdays = [d for d in dates if d.weekday() < 5]  # skip weekends without a request
    logger.info(f"Backfilling {weekdays[0]} to {weekdays[-1]} ({len(weekdays)} weekdays)")

    total = 0
    failed: list[str] = []
    async with AsyncSessionLocal() as session:
        for i, day in enumerate(weekdays, 1):
            existing = await count_rows(session, day)
            if existing >= COMPLETE_DAY_ROWS:
                logger.info(f"[{i}/{len(weekdays)}] {day} already stored ({existing} rows), skipped")
                continue

            inserted = await backfill_day(session, day, failed)
            total += inserted
            note = "no data (holiday?)" if existing + inserted == 0 else f"+{inserted} rows"
            logger.info(f"[{i}/{len(weekdays)}] {day} {note}")

    logger.info(f"Done — inserted {total} rows")
    if failed:
        logger.info(f"Failed (re-run to retry): {', '.join(failed)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill whole-market daily candles from TWSE + TPEx")
    parser.add_argument("--days", type=int, default=180, help="calendar days to look back (default: 180)")
    args = parser.parse_args()

    asyncio.run(main(args.days))
