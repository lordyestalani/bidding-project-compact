from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def previous_day(interval_end: datetime):
    return interval_end.astimezone(ZoneInfo("Asia/Manila")).date() - timedelta(days=1)
