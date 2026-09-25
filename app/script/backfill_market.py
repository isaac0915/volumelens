"""Backfill daily candles for the whole market (TWSE + TPEx), one day per request.

Each trading day costs one TWSE and one TPEx request, versus one Fugle call per
symbol in backfill_candles.py, so 180 days is ~250 requests. The API keeps the
last few days current on its own (app/services/daily_sync.py); this script is
for the initial load or a longer gap.

Usage:
    # last 180 calendar days
    docker compose exec api python -m app.script.backfill_market

    # last week (quick check)
    docker compose exec api python -m app.script.backfill_market --days 7

Complete days are skipped and inserts use ON CONFLICT DO NOTHING, so the script
is safe to re-run; incomplete days are listed at the end.
"""
import argparse
import asyncio
import logging
from datetime import timedelta

from app.services.daily_sync import sync_range, today_taipei

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("urllib3").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


async def main(days: int) -> None:
    end = today_taipei()
    statuses = await sync_range(end - timedelta(days=days), end, verbose=True)

    counts = {s: sum(1 for v in statuses.values() if v == s) for s in ("complete", "holiday", "incomplete")}
    logger.info(f"Done — {counts['complete']} complete, {counts['holiday']} holidays, {counts['incomplete']} incomplete")
    incomplete = [str(d) for d, s in statuses.items() if s == "incomplete"]
    if incomplete:
        logger.info(f"Incomplete (re-run to retry): {', '.join(incomplete)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill whole-market daily candles from TWSE + TPEx")
    parser.add_argument("--days", type=int, default=180, help="calendar days to look back (default: 180)")
    args = parser.parse_args()

    asyncio.run(main(args.days))
