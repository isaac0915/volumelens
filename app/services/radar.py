import asyncio
import logging
from datetime import date, datetime, timedelta

from app.core.database import AsyncSessionLocal
from app.models.volume_alert import VolumeAlert

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VOLUME_MULTIPLIER = 2.0
SCAN_INTERVAL = 60       # seconds between scans
LOOKBACK_DAYS = 30       # fetch 30 calendar days to get ~20 trading days
MAX_CONCURRENT = 10      # concurrent Fugle API calls during scan

# symbol -> 20-day average daily volume
volume_averages: dict[str, float] = {}


async def _run_in_executor(func):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, func)


async def _fetch_all_symbols(client) -> list[str]:
    try:
        result = await _run_in_executor(
            lambda: client.stock.intraday.tickers(**{"type": "EQUITY", "isNormal": "true"})
        )
        return [t["symbol"] for t in result.get("data", [])]
    except Exception as e:
        logger.error(f"[radar] Failed to fetch ticker list: {e}")
        return []


async def _load_volume_averages(client, symbols: list[str]) -> None:
    to_date = date.today().isoformat()
    from_date = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()

    logger.info(f"[radar] Loading 20-day volume averages for {len(symbols)} symbols (this may take a few minutes)...")

    for i, symbol in enumerate(symbols, 1):
        try:
            candles = await _run_in_executor(
                lambda s=symbol: client.stock.historical.candles(
                    **{"symbol": s, "from": from_date, "to": to_date, "fields": "volume"}
                )
            )
            data = candles.get("data", [])
            volumes = [d["volume"] for d in data if d.get("volume")]
            if volumes:
                volume_averages[symbol] = sum(volumes) / len(volumes)
        except Exception:
            pass

        # Throttle to avoid hitting rate limits
        await asyncio.sleep(0.2)

        if i % 100 == 0:
            logger.info(f"[radar] Progress: {i}/{len(symbols)}")

    logger.info(f"[radar] Ready — averages loaded for {len(volume_averages)} symbols")


async def _scan_once(client) -> None:
    if not volume_averages:
        return

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    alerts: list[tuple] = []

    async def check_symbol(symbol: str, avg: float):
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
                pass

    await asyncio.gather(*[check_symbol(s, a) for s, a in volume_averages.items()])

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
    symbols = await _fetch_all_symbols(client)
    if not symbols:
        logger.error("[radar] No symbols loaded, radar disabled")
        return

    await _load_volume_averages(client, symbols)

    while True:
        await _scan_once(client)
        await asyncio.sleep(SCAN_INTERVAL)
