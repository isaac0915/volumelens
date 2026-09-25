from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.core.config import settings

TZ_TAIPEI = ZoneInfo("Asia/Taipei")
MARKET_OPEN = time(9, 0)
MARKET_CLOSE = time(13, 30)


def is_market_open() -> bool:
    """True during Taiwan market hours (Mon-Fri 09:00-13:30 Asia/Taipei).

    FORCE_POLL=true bypasses the check for development outside market hours.
    Holidays are not handled.
    """
    if settings.force_poll:
        return True
    now = datetime.now(TZ_TAIPEI)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE
