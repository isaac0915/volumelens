"""Intraday cumulative volume for many symbols per request from TWSE's MIS endpoint.

This is the JSON endpoint behind mis.twse.com.tw's live quote pages; it covers
both TWSE and TPEx symbols. It is undocumented, so requests are spaced out to
avoid IP blocks, and it lags the market by a few seconds. A request accepts
about 100 symbols: 150 returns rtcode 9999 and ~300 overflows the URL (HTTP 414).

Volume ("v") is cumulative for the day in lots (張), like Fugle's intraday quotes.
"""
import asyncio
import logging
from datetime import date

import requests

logger = logging.getLogger(__name__)

MIS_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
BATCH_SIZE = 100
REQUEST_SPACING = 2  # seconds between requests; a full scan of ~2,300 symbols takes ~70s
TIMEOUT = 15
HEADERS = {"User-Agent": "Mozilla/5.0"}


def _channel(symbol: str, exchange: str) -> str:
    return f"{'tse' if exchange == 'TWSE' else 'otc'}_{symbol}.tw"


def _fetch_batch(channels: list[str]) -> list[dict]:
    resp = requests.get(
        MIS_URL,
        params={"ex_ch": "|".join(channels), "json": 1, "delay": 0},
        headers=HEADERS,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("rtcode") != "0000":
        raise RuntimeError(f"MIS rtcode {payload.get('rtcode')}: {payload.get('rtmessage')}")
    return payload.get("msgArray", [])


INDEX_CHANNELS = {"TAIEX": "tse_t00.tw", "TPEX": "otc_o00.tw"}


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def fetch_indices() -> list[dict]:
    """TAIEX (加權指數) and the TPEx index (櫃買指數): latest value, previous close, as-of."""
    rows = await asyncio.to_thread(_fetch_batch, list(INDEX_CHANNELS.values()))
    by_channel = {f"{m.get('ex')}_{m.get('c')}.tw": m for m in rows}

    indices = []
    for key, channel in INDEX_CHANNELS.items():
        m = by_channel.get(channel)
        if not m:
            continue
        value, prev = _float(m.get("z")), _float(m.get("y"))
        if value is None or prev is None:
            continue
        indices.append({
            "key": key,
            "name": "加權指數" if key == "TAIEX" else "櫃買指數",
            "value": value,
            "change": round(value - prev, 2),
            "change_pct": round((value - prev) / prev * 100, 2),
            "date": f"{m['d'][:4]}-{m['d'][4:6]}-{m['d'][6:]}",
            "time": m.get("t"),
        })
    return indices


async def fetch_volumes(exchanges: dict[str, str], trading_day: date) -> tuple[dict[str, tuple[str, int]], int]:
    """Cumulative volume for each symbol in {symbol: exchange}.

    Returns ({symbol: (name, volume_lots)}, failed_batch_count). Quotes dated
    before trading_day (e.g. before the first trade of the day) are dropped.
    """
    channels = [_channel(s, ex) for s, ex in exchanges.items()]
    day = trading_day.strftime("%Y%m%d")
    volumes: dict[str, tuple[str, int]] = {}
    failed = 0

    for i in range(0, len(channels), BATCH_SIZE):
        try:
            rows = await asyncio.to_thread(_fetch_batch, channels[i:i + BATCH_SIZE])
        except Exception as e:
            failed += 1
            logger.warning(f"[mis] batch {i // BATCH_SIZE + 1} failed: {str(e).splitlines()[0][:200]}")
            rows = []

        for m in rows:
            if m.get("d") != day:
                continue
            try:
                volumes[m["c"]] = (m.get("n", ""), int(m["v"]))
            except (KeyError, ValueError):
                continue  # "v" is "-" when nothing has traded

        await asyncio.sleep(REQUEST_SPACING)

    return volumes, failed
