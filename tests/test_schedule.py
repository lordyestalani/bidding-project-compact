from datetime import date, datetime, timezone

from pipeline.schedule import previous_day


def test_schedule_uses_previous_manila_calendar_day():
    assert previous_day(datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)) == date(
        2026, 11, 1
    )
    assert previous_day(datetime(2026, 10, 31, 20, 0, tzinfo=timezone.utc)) == date(
        2026, 10, 31
    )
