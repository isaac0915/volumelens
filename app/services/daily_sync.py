"""Keep stock_candles up to date with TWSE + TPEx daily closing quotes.

run_daily_sync() is a reconciliation loop rather than a once-a-day job: every
30 minutes it checks the last CATCH_UP_DAYS weekdays and fetches any day that
isn't complete yet. That covers days the server was down, exchanges publishing
late, and partial failures, without tracking any state beyond known holidays.
"""
import asyncio
import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.core.database import AsyncSessionLocal
from app.models.stock_candle import StockCandle
from app.services.exchange_daily import fetch_tpex_day, fetch_twse_day

logger = logging.getLogger(__name__)

_TZ_TAIPEI = ZoneInfo("Asia/Taipei")
SYNC_AFTER = time(15, 30)   # both exchanges have published the day's quotes by then
CHECK_INTERVAL = 30 * 60    # seconds between reconciliation passes
CATCH_UP_DAYS = 10          # how far back each pass looks for missing days
THROTTLE_SECONDS = 3        # TWSE blocks IPs that send more than a few requests per 5s
INSERT_CHUNK = 1000         # 9 params per row; asyncpg caps a statement at 32,767 params
# A full day is ~2,300 rows (TWSE ~1,300 + TPEx ~1,000). Fewer means one exchange
# failed or hasn't published yet, so the day is fetched again.
COMPLETE_DAY_ROWS = 2000

# Weekdays both exchanges returned no data for, so they aren't re-requested
_known_holidays: set[date] = set()


def today_taipei() -> date:
    return datetime.now(_TZ_TAIPEI).date()


async def _count_rows(session, day: date) -> int:
    result = await session.execute(select(func.count()).where(StockCandle.date == day))
    return result.scalar_one()


async def _insert_candles(session, candles: list[dict]) -> int:
    inserted = 0
    for i in range(0, len(candles), INSERT_CHUNK):
        stmt = insert(StockCandle).values(candles[i:i + INSERT_CHUNK]).on_conflict_do_nothing(
            index_elements=["symbol", "date"]
        )
        inserted += (await session.execute(stmt)).rowcount
    await session.commit()
    return inserted


async def sync_day(session, day: date) -> str:
    """Fetch one day if it isn't stored yet. Returns 'complete', 'holiday' or 'incomplete'."""
    if day in _known_holidays:
        return "holiday"
    existing = await _count_rows(session, day)
    if existing >= COMPLETE_DAY_ROWS:
        return "complete"

    got_data = failed = False
    for name, fetch in [("TWSE", fetch_twse_day), ("TPEx", fetch_tpex_day)]:
        try:
            candles = await asyncio.to_thread(fetch, day)
        except Exception as e:
            failed = True
            logger.warning(f"[sync] {day} {name} failed: {str(e).splitlines()[0][:200]}")
            continue
        if candles:
            got_data = True
            inserted = await _insert_candles(session, candles)
            logger.info(f"[sync] {day} {name} +{inserted} rows")
        await asyncio.sleep(THROTTLE_SECONDS)

    if failed:
        return "incomplete"
    if not got_data and existing == 0:
        _known_holidays.add(day)
        return "holiday"
    return "complete" if await _count_rows(session, day) >= COMPLETE_DAY_ROWS else "incomplete"


async def sync_range(start: date, end: date, verbose: bool = False) -> dict[date, str]:
    """Sync every weekday in [start, end]; weekends are skipped without a request."""
    days = [start + timedelta(days=n) for n in range((end - start).days + 1)]
    weekdays = [d for d in days if d.weekday() < 5]
    statuses: dict[date, str] = {}
    async with AsyncSessionLocal() as session:
        for i, day in enumerate(weekdays, 1):
            statuses[day] = await sync_day(session, day)
            if verbose:
                logger.info(f"[sync] [{i}/{len(weekdays)}] {day} {statuses[day]}")
    return statuses


async def run_daily_sync() -> None:
    while True:
        now = datetime.now(_TZ_TAIPEI)
        # Today's quotes only exist after the close is published
        end = now.date() if now.time() >= SYNC_AFTER else now.date() - timedelta(days=1)
        try:
            statuses = await sync_range(end - timedelta(days=CATCH_UP_DAYS), end)
            pending = [str(d) for d, s in statuses.items() if s == "incomplete"]
            if pending:
                logger.info(f"[sync] still incomplete, will retry: {', '.join(pending)}")
        except Exception:
            logger.exception("[sync] pass failed")
        await asyncio.sleep(CHECK_INTERVAL)
