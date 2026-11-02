from decimal import Decimal as D

import pytest

from api.valuation import metrics, money, parse_decimal


def test_usd_revenue_and_php_costs():
    assert metrics(D("0"), D("100000"), D("5000000"), D("0"), True, D("55")) == {
        "incoming_php": "5500000.0000",
        "outgoing_php": "5000000.0000",
        "profit_php": "500000.0000",
        "net_usd": "100000.0000",
        "complete": True,
    }
    assert (
        metrics(D("0"), D("100000"), D("5000000"), D("0"), True, D("58"))["profit_php"]
        == "800000.0000"
    )


def test_usd_cost_exposure_and_zero_exposure():
    assert (
        metrics(D("6000000"), D("0"), D("0"), D("90000"), True, D("55"))["profit_php"]
        == "1050000.0000"
    )
    assert (
        metrics(D("6000000"), D("0"), D("0"), D("90000"), True, D("58"))["profit_php"]
        == "780000.0000"
    )
    assert (
        metrics(D("100"), D("200"), D("0"), D("200"), True, D("58"))["profit_php"]
        == "100.0000"
    )


def test_php_only_needs_no_rate_but_usd_does():
    assert (
        metrics(D("200"), D("0"), D("100"), D("0"), True, None)["profit_php"]
        == "100.0000"
    )
    assert metrics(D("0"), D("1"), D("100"), D("0"), True, None)["profit_php"] is None


def test_unknown_inputs_suppress_results():
    result = metrics(D("100"), D("0"), D("0"), D("0"), False, D("55"))
    assert result["profit_php"] is None
    assert result["incoming_php"] is None
    assert result["complete"] is False


@pytest.mark.parametrize(
    "value", ["NaN", "Infinity", "-1", "1e2", "1.00000", "1000000000000"]
)
def test_invalid_money_is_rejected(value):
    with pytest.raises(ValueError):
        parse_decimal(value, places=4)


def test_decimal_strings_and_precision():
    assert parse_decimal("0", places=4) == D("0")
    assert parse_decimal("58.12345678", places=8, positive=True) == D("58.12345678")
    with pytest.raises(ValueError):
        parse_decimal(58.1, places=8)
    with pytest.raises(ValueError):
        parse_decimal("0", places=8, positive=True)
    assert money(D("-1.23445")) == "-1.2345"
    assert money(D("-0.0000001")) == "0.0000"
    # Two tiny USD amounts are aggregated before rounding, not rounded per line.
    assert (
        metrics(D("0"), D("0.0002"), D("0"), D("0"), True, D("0.3"))["profit_php"]
        == "0.0001"
    )
