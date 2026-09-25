import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.stock_candle import StockCandle
from app.models.volume_alert import VolumeAlert
from app.services.market_hours import is_market_open

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VOLUME_MULTIPLIER = 2.0
SCAN_INTERVAL = 60       # seconds between scans
AVERAGE_DAYS = 20        # trading days in the volume average
MIN_HISTORY_DAYS = 10    # skip symbols with too little history (e.g. new listings)
LOOKBACK_DAYS = 45       # calendar-day window to search for those trading days
MAX_CONCURRENT = 10      # concurrent Fugle API calls during scan
SHARES_PER_LOT = 1000    # candles store shares; Fugle intraday quotes report lots (張)

# symbol -> 20-day average daily volume, in lots (張) to match intraday quotes
volume_averages: dict[str, float] = {}
_averages_loaded_on: date | None = None


async def _run_in_executor(func):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, func)


def _today_taipei() -> date:
    return datetime.now(ZoneInfo("Asia/Taipei")).date()


async def _load_volume_averages() -> None:
    """Compute each symbol's average volume over its last 20 trading days from stock_candles.

    ROW_NUMBER() numbers each symbol's candles newest-first, so rn <= 20 keeps
    the latest 20 trading days per symbol regardless of holidays.
    """
    global _averages_loaded_on

    rn = func.row_number().over(
        partition_by=StockCandle.symbol, order_by=StockCandle.date.desc()
    ).label("rn")
    recent = (
        select(StockCandle.symbol, StockCandle.volume, rn)
        .where(StockCandle.date >= _today_taipei() - timedelta(days=LOOKBACK_DAYS))
        .subquery()
    )
    stmt = (
        select(recent.c.symbol, func.avg(recent.c.volume).label("avg_volume"))
        .where(recent.c.rn <= AVERAGE_DAYS)
        .group_by(recent.c.symbol)
        .having(func.count() >= MIN_HISTORY_DAYS)
    )

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(stmt)).all()

    volume_averages.clear()
    for symbol, avg_shares in rows:
        if avg_shares:
            volume_averages[symbol] = float(avg_shares) / SHARES_PER_LOT
    _averages_loaded_on = _today_taipei()
    logger.info(f"[radar] Averages loaded from DB for {len(volume_averages)} symbols")


async def _scan_once(client) -> None:
    if not volume_averages:
        return

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    alerts: list[tuple] = []
    failures = 0

    async def check_symbol(symbol: str, avg: float):
        nonlocal failures
        async with semaphore:
            try:
                quote = await _run_in_executor(
                    lambda s=symbol: client.stock.intraday.quote(symbol=s)
                )
                current_vol = quote.get("total", {}).get("tradeVolume", 0)
                if current_vol and current_vol > VOLUME_MULTIPLIER * avg:
                    alerts.append((
                        symbol,
                        quote.get("name", ""),
                        current_vol,
                        avg,
                        current_vol / avg,
                    ))
            except Exception:
                failures += 1  # usually HTTP 429; counted so gaps in coverage are visible

    await asyncio.gather(*[check_symbol(s, a) for s, a in volume_averages.items()])
    if failures:
        logger.warning(f"[radar] {failures}/{len(volume_averages)} quotes failed this scan")

    if alerts:
        alerts.sort(key=lambda x: -x[4])
        logger.info(f"[radar] === ABNORMAL VOLUME: {len(alerts)} stocks ===")
        async with AsyncSessionLocal() as session:
            for symbol, name, vol, avg, ratio in alerts:
                logger.info(f"[radar]  {symbol} {name:12s}  volume {vol:>10,}  ({ratio:.1f}x avg {avg:>10,.0f})")
                session.add(VolumeAlert(
                    symbol=symbol,
                    name=name,
                    current_volume=vol,
                    average_volume=avg,
                    ratio=ratio,
                    detected_at=datetime.utcnow(),
                ))
            await session.commit()
    else:
        logger.info("[radar] Scan complete — no abnormal volume detected")


async def run_radar(client) -> None:
    while True:
        # Only hit Fugle during market hours: quotes don't change after close.
        if not is_market_open():
            await asyncio.sleep(SCAN_INTERVAL)
            continue

        # Reload once per trading day so new daily candles are picked up
        if _averages_loaded_on != _today_taipei():
            await _load_volume_averages()

        await _scan_once(client)
        await asyncio.sleep(SCAN_INTERVAL)
