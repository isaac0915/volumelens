"""Fetch one trading day's closing quotes for the whole market from TWSE and TPEx.

These are the JSON endpoints behind the exchanges' "daily closing quotes" pages.
They are not a documented API: requests must be spaced out (TWSE temporarily
blocks IPs that send more than a few requests per 5 seconds) and the format can
change without notice.

Volume is in shares and turnover in NTD for both exchanges, matching Fugle's
historical candles. Each row also carries "name" and "exchange", which aren't
StockCandle columns; callers split them off into the stocks table.
"""
import logging
import re
import time
from datetime import date

import requests

logger = logging.getLogger(__name__)

TWSE_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"
TPEX_URL = "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes"
TIMEOUT = 60  # the TPEx response is ~2MB and can be slow
HEADERS = {"User-Agent": "Mozilla/5.0"}
MAX_ATTEMPTS = 3
RETRY_SECONDS = 5


def _get_json(url: str, params: dict) -> dict:
    """GET with retries: the TPEx endpoint often cuts off its ~2MB response midway."""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            if attempt == MAX_ATTEMPTS:
                raise
            logger.info(f"{url} attempt {attempt} failed ({type(e).__name__}), retrying in {RETRY_SECONDS}s")
            time.sleep(RETRY_SECONDS)


def is_tracked_symbol(symbol: str) -> bool:
    """Common stocks (4 digits) and ETFs (00 prefix).

    Drops warrants, convertible bonds, ETNs, beneficiary securities and
    preferred shares, which are thinly traded and would add noise to the radar.
    """
    return bool(re.fullmatch(r"\d{4}", symbol)) or symbol.startswith("00")


def _num(value: str) -> float | None:
    """'22,871,974' -> 22871974.0; '--', '---', '' -> None (no trade)."""
    cleaned = value.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _candle(symbol, name, exchange, day, open_, high, low, close, volume, turnover, change) -> dict | None:
    prices = [_num(v) for v in (open_, high, low, close)]
    if any(p is None for p in prices):
        return None  # no trades that day
    return {
        "symbol": symbol,
        "name": name.strip(),
        "exchange": exchange,
        "date": day,
        "open": prices[0],
        "high": prices[1],
        "low": prices[2],
        "close": prices[3],
        "volume": int(_num(volume) or 0),
        "turnover": _num(turnover) or 0.0,
        "change": change,
    }


def fetch_twse_day(day: date) -> list[dict]:
    payload = _get_json(
        TWSE_URL,
        {"response": "json", "date": day.strftime("%Y%m%d"), "type": "ALLBUT0999"},
    )
    if payload.get("stat") != "OK":
        return []  # non-trading day: stat is "很抱歉，沒有符合條件的資料!"

    table = next((t for t in payload.get("tables", []) if "證券代號" in t.get("fields", [])), None)
    if table is None:
        return []
    f = {name: i for i, name in enumerate(table["fields"])}

    candles = []
    for row in table["data"]:
        symbol = row[f["證券代號"]].strip()
        if not is_tracked_symbol(symbol):
            continue
        # Sign is an HTML snippet like '<p style= color:green>-</p>'; the
        # magnitude is in a separate column. 'X' (no comparison) keeps the value.
        magnitude = _num(row[f["漲跌價差"]]) or 0.0
        sign = -1 if "-" in row[f["漲跌(+/-)"]] else 1
        candle = _candle(
            symbol, row[f["證券名稱"]], "TWSE", day,
            row[f["開盤價"]], row[f["最高價"]], row[f["最低價"]], row[f["收盤價"]],
            row[f["成交股數"]], row[f["成交金額"]],
            sign * magnitude,
        )
        if candle:
            candles.append(candle)
    return candles


def fetch_tpex_day(day: date) -> list[dict]:
    payload = _get_json(
        TPEX_URL,
        {"date": day.strftime("%Y/%m/%d"), "id": "", "response": "json"},
    )

    table = next((t for t in payload.get("tables", []) if t.get("title") == "上櫃股票行情"), None)
    if table is None or not table.get("data"):
        return []  # non-trading day
    f = {name: i for i, name in enumerate(table["fields"])}

    candles = []
    for row in table["data"]:
        symbol = row[f["代號"]].strip()
        if not is_tracked_symbol(symbol):
            continue
        candle = _candle(
            symbol, row[f["名稱"]], "TPEx", day,
            row[f["開盤"]], row[f["最高"]], row[f["最低"]], row[f["收盤"]],
            row[f["成交股數"]], row[f["成交金額(元)"]],
            _num(row[f["漲跌"]]) or 0.0,  # e.g. '+0.10', '-0.03 '
        )
        if candle:
            candles.append(candle)
    return candles


def fetch_market_day(day: date) -> list[dict]:
    """All tracked TWSE + TPEx candles for one day; empty on non-trading days."""
    return fetch_twse_day(day) + fetch_tpex_day(day)
