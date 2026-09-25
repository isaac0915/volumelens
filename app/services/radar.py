import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.stock import Stock
from app.models.stock_candle import StockCandle
from app.models.volume_alert import VolumeAlert
from app.services.market_hours import is_market_open
from app.services.mis_quotes import fetch_volumes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VOLUME_MULTIPLIER = 2.0
MIN_VOLUME_LOTS = 500    # ignore thinly traded symbols, where a few lots is already "2x"
SCAN_INTERVAL = 60       # seconds between the start of each scan
AVERAGE_DAYS = 20        # trading days in the volume average
MIN_HISTORY_DAYS = 10    # skip symbols with too little history (e.g. new listings)
LOOKBACK_DAYS = 45       # calendar-day window to search for those trading days
SHARES_PER_LOT = 1000    # candles store shares; intraday quotes report lots (張)

# symbol -> 20-day average daily volume, in lots (張) to match intraday quotes
volume_averages: dict[str, float] = {}
# symbol -> "TWSE" / "TPEx", needed to address symbols on the MIS endpoint
_exchanges: dict[str, str] = {}
_averages_loaded_on: date | None = None


def _today_taipei() -> date:
    return datetime.now(ZoneInfo("Asia/Taipei")).date()


async def _load_volume_averages() -> None:
    """Compute each symbol's average volume over its last 20 trading days from stock_candles.

    ROW_NUMBER() numbers each symbol's candles newest-first, so rn <= 20 keeps
    the latest 20 trading days per symbol regardless of holidays. Joining
    stocks limits the scan to symbols whose exchange is known.
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
        select(recent.c.symbol, Stock.exchange, func.avg(recent.c.volume).label("avg_volume"))
        .join(Stock, Stock.symbol == recent.c.symbol)
        .where(recent.c.rn <= AVERAGE_DAYS)
        .group_by(recent.c.symbol, Stock.exchange)
        .having(func.count() >= MIN_HISTORY_DAYS)
    )

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(stmt)).all()

    volume_averages.clear()
    _exchanges.clear()
    for symbol, exchange, avg_shares in rows:
        if avg_shares:
            volume_averages[symbol] = float(avg_shares) / SHARES_PER_LOT
            _exchanges[symbol] = exchange
    _averages_loaded_on = _today_taipei()
    logger.info(f"[radar] Averages loaded from DB for {len(volume_averages)} symbols")


async def _scan_once() -> None:
    if not volume_averages:
        return

    quotes, failed_batches = await fetch_volumes(_exchanges, _today_taipei())
    logger.info(
        f"[radar] Scanned {len(quotes)}/{len(volume_averages)} symbols"
        + (f" ({failed_batches} batches failed)" if failed_batches else "")
    )

    alerts = [
        (symbol, name, volume, volume_averages[symbol], volume / volume_averages[symbol])
        for symbol, (name, volume) in quotes.items()
        if symbol in volume_averages
        and volume >= MIN_VOLUME_LOTS
        and volume > VOLUME_MULTIPLIER * volume_averages[symbol]
    ]
    if not alerts:
        return

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


async def run_radar() -> None:
    while True:
        # Only scan during market hours: volumes don't change after close.
        if not is_market_open():
            await asyncio.sleep(SCAN_INTERVAL)
            continue

        started = asyncio.get_running_loop().time()

        # Reload once per trading day so new daily candles are picked up
        if _averages_loaded_on != _today_taipei():
            await _load_volume_averages()

        try:
            await _scan_once()
        except Exception:
            logger.exception("[radar] scan failed")

        # A scan takes ~70s, so the next one usually starts right away
        elapsed = asyncio.get_running_loop().time() - started
        await asyncio.sleep(max(0, SCAN_INTERVAL - elapsed))
