from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.valuation import parse_decimal


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProjectCreate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    request_id: UUID


class CashFlow(StrictModel):
    label: str = Field(min_length=1, max_length=200)
    direction: Literal["incoming", "outgoing"]
    currency: Literal["PHP", "USD"]
    amount: str | None
    expected_date: date | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, value):
        if value is not None:
            parse_decimal(value, places=4)
        return value


class ProjectSave(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    customer: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    archived: bool = False
    version: int = Field(ge=1)
    lines: list[CashFlow] = Field(max_length=200)


class Scenario(StrictModel):
    rate_php_per_usd: str

    @field_validator("rate_php_per_usd", mode="before")
    @classmethod
    def validate_rate(cls, value):
        parse_decimal(value, places=8, positive=True)
        return value
