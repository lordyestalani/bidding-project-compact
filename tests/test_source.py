from datetime import date
from decimal import Decimal

import pytest

from pipeline.source import parse_rates, validate_window


def test_source_parses_decimal_without_float_and_keeps_observation_date():
    rows = parse_rates(
        b'[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":58.12345678}]',
        date(2026, 10, 30),
        date(2026, 11, 1),
    )
    assert rows == [(date(2026, 10, 30), Decimal("58.12345678"))]


@pytest.mark.parametrize(
    "body",
    [
        b"[]",
        b"not json",
        b'[{"date":"2026-10-30","base":"PHP","quote":"USD","rate":58}]',
        b'[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":NaN}]',
        b'[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":0}]',
        b'[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":58.123456789}]',
        b'[{"date":"2026-11-02","base":"USD","quote":"PHP","rate":58}]',
    ],
)
def test_invalid_source_is_rejected(body):
    with pytest.raises(ValueError):
        parse_rates(body, date(2026, 10, 1), date(2026, 11, 1))


def test_invalid_intervals_are_rejected():
    for start, end in [
        (date(2026, 2, 1), date(2026, 1, 1)),
        (date(1990, 1, 1), date(1990, 1, 2)),
        (date(2020, 1, 1), date(2026, 1, 1)),
    ]:
        with pytest.raises(ValueError):
            validate_window(start, end)


def test_provider_weekend_interval_can_return_a_prior_anchor():
    rows = parse_rates(
        b'[{"date":"2026-10-30","base":"USD","quote":"PHP","rate":63.68}]',
        date(2026, 11, 1),
        date(2026, 11, 1),
        allow_prior=True,
    )
    assert rows == [(date(2026, 10, 30), Decimal("63.68"))]
