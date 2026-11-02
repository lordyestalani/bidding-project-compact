"""Fixed ECB feed via Frankfurter. No API keys and no blended-provider fallback."""

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from api.valuation import parse_decimal

ROOT = "https://api.frankfurter.dev/v2/providers/ecb"


@dataclass
class SourceResponse:
    url: str
    body: bytes
    fetched_at: datetime
    status_code: int


def validate_window(start: date, end: date):
    if start < date(1999, 1, 4) or start > end or (end - start).days > 366:
        raise ValueError(
            "Use an ordered interval of at most 367 days, beginning on or after 1999-01-04."
        )
    if end > datetime.now(timezone.utc).date():
        raise ValueError("Future source intervals are not supported.")


def fetch(start: date, end: date):
    validate_window(start, end)
    urls = [
        f"{ROOT}/rates?base=USD&quotes=PHP&from={start}&to={end}",
        f"{ROOT}/rate/USD/PHP?date={start}",
    ]
    for url in urls:
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "BiddingFXPortfolio/1.0",
            },
        )
        try:
            with urlopen(request, timeout=20) as response:
                yield SourceResponse(
                    url, response.read(), datetime.now(timezone.utc), response.status
                )
        except HTTPError as error:
            # Yield failure bodies so the caller persists them before validation.
            yield SourceResponse(
                url, error.read(), datetime.now(timezone.utc), error.code
            )
            return


def parse_rates(
    body: bytes, start: date, end: date, *, allow_empty=False, allow_prior=False
):
    try:
        data = json.loads(
            body,
            parse_float=Decimal,
            parse_int=Decimal,
            parse_constant=lambda _: (_ for _ in ()).throw(
                ValueError("Nonfinite source rate.")
            ),
        )
        rows = data if isinstance(data, list) else [data]
        result = []
        seen = set()
        for row in rows:
            if (
                set(row) != {"date", "base", "quote", "rate"}
                or row["base"] != "USD"
                or row["quote"] != "PHP"
            ):
                raise ValueError("Unexpected source pair or schema.")
            observed = date.fromisoformat(row["date"])
            lower = date(1999, 1, 4) if allow_prior else start
            if not lower <= observed <= end or observed in seen:
                raise ValueError("Unexpected or duplicate observation date.")
            if not isinstance(row["rate"], Decimal):
                raise ValueError("Expected a JSON numeric rate.")
            rate = parse_decimal(format(row["rate"], "f"), places=8, positive=True)
            seen.add(observed)
            result.append((observed, rate))
        if not result and not allow_empty:
            raise ValueError("No valid source observations.")
        if allow_prior and sum(observed < start for observed, _ in result) > 1:
            raise ValueError("Expected at most one preceding anchor observation.")
        return result
    except (TypeError, KeyError, AttributeError, UnicodeDecodeError) as error:
        raise ValueError("Unexpected source response.") from error
