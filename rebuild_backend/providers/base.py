from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Any


class ProviderStatus(StrEnum):
    OK = "OK"
    PARTIAL = "PARTIAL"
    BLOCKED = "BLOCKED"
    NOT_FOUND = "NOT_FOUND"
    NO_FIELD = "NO_FIELD"
    ERROR = "ERROR"


@dataclass
class ProviderResult:
    provider: str
    status: ProviderStatus
    data: Any = None
    source_url: str | None = None
    as_of: str | None = None
    reason: str | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["status"] = self.status.value
        return payload


class MarketDataProvider(ABC):
    name: str

    @abstractmethod
    def fetch_ohlcv(self, ticker: str, start: str | None, end: str | None) -> ProviderResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_profile(self, ticker: str) -> ProviderResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_income_statement(self, ticker: str, period: str) -> ProviderResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_balance_sheet(self, ticker: str, period: str) -> ProviderResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_cash_flow(self, ticker: str, period: str) -> ProviderResult:
        raise NotImplementedError

    @abstractmethod
    def fetch_ratios(self, ticker: str) -> ProviderResult:
        raise NotImplementedError
