from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from .base import MarketDataProvider, ProviderResult, ProviderStatus


class YFinanceProvider(MarketDataProvider):
    """Production adapter derived from the attached yfinance field probe."""

    name = "yfinance"

    def __init__(
        self,
        cache_root: Path | str = "cache/yfinance",
        *,
        retries: int = 3,
        backoff_seconds: float = 1.0,
    ) -> None:
        self.cache_root = Path(cache_root)
        self.retries = max(1, retries)
        self.backoff_seconds = max(0.0, backoff_seconds)

    @staticmethod
    def source_symbol(ticker: str) -> str:
        clean = ticker.upper().replace(".JK", "").strip()
        return f"{clean}.JK"

    def _retry(self, operation: Callable[[], Any]) -> Any:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                return operation()
            except Exception as exc:  # provider failures must remain ticker-local
                last_error = exc
                if attempt + 1 < self.retries:
                    time.sleep(self.backoff_seconds * (2**attempt))
        if last_error:
            raise last_error
        raise RuntimeError("Provider operation failed without an exception")

    def _ticker(self, ticker: str):
        import yfinance as yf

        return yf.Ticker(self.source_symbol(ticker))

    def _cache_path(self, ticker: str, suffix: str) -> Path:
        day = datetime.now(timezone.utc).date().isoformat()
        path = self.cache_root / ticker.upper().replace(".JK", "") / f"{day}-{suffix}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _write_cache(self, ticker: str, suffix: str, payload: Any) -> None:
        self._cache_path(ticker, suffix).write_text(
            json.dumps(payload, ensure_ascii=False, default=str, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _frame_payload(frame: pd.DataFrame) -> list[dict[str, Any]]:
        if frame is None or frame.empty:
            return []
        clean = frame.copy()
        clean.index = clean.index.map(str)
        return json.loads(clean.reset_index().to_json(orient="records", date_format="iso"))

    def fetch_ohlcv(self, ticker: str, start: str | None, end: str | None) -> ProviderResult:
        symbol = self.source_symbol(ticker)
        try:
            frame = self._retry(
                lambda: self._ticker(ticker).history(
                    start=start,
                    end=end,
                    period=None if start else "max",
                    auto_adjust=False,
                    actions=True,
                )
            )
            if frame is None or frame.empty:
                return ProviderResult(self.name, ProviderStatus.NOT_FOUND, reason="no_history")
            frame = frame.sort_index()
            payload = self._frame_payload(frame)
            self._write_cache(ticker, "ohlcv", payload)
            return ProviderResult(
                self.name,
                ProviderStatus.OK,
                data=frame,
                source_url=f"https://finance.yahoo.com/quote/{symbol}/history",
                as_of=str(frame.index[-1])[:10],
            )
        except Exception as exc:
            return ProviderResult(self.name, ProviderStatus.ERROR, reason=str(exc))

    def fetch_profile(self, ticker: str) -> ProviderResult:
        symbol = self.source_symbol(ticker)
        try:
            instrument = self._ticker(ticker)
            info = self._retry(lambda: instrument.info or {})
            try:
                fast_info = dict(instrument.fast_info)
            except Exception:
                fast_info = {}
            try:
                history_metadata = instrument.history_metadata or {}
            except Exception:
                history_metadata = {}
            payload = {
                "ticker": ticker.upper().replace(".JK", ""),
                "symbol": symbol,
                "info": info,
                "fast_info": fast_info,
                "history_metadata": history_metadata,
            }
            self._write_cache(ticker, "profile", payload)
            status = ProviderStatus.OK if info else ProviderStatus.PARTIAL
            return ProviderResult(
                self.name,
                status,
                data=payload,
                source_url=f"https://finance.yahoo.com/quote/{symbol}",
                reason=None if info else "info_empty",
            )
        except Exception as exc:
            return ProviderResult(self.name, ProviderStatus.ERROR, reason=str(exc))

    def _statement(self, ticker: str, attribute: str, period: str) -> ProviderResult:
        try:
            instrument = self._ticker(ticker)
            target = f"quarterly_{attribute}" if period.lower().startswith("q") else attribute
            frame = self._retry(lambda: getattr(instrument, target))
            if frame is None or frame.empty:
                return ProviderResult(self.name, ProviderStatus.NO_FIELD, reason=f"{target}_empty")
            payload = self._frame_payload(frame)
            self._write_cache(ticker, target, payload)
            return ProviderResult(self.name, ProviderStatus.OK, data=frame)
        except Exception as exc:
            return ProviderResult(self.name, ProviderStatus.ERROR, reason=str(exc))

    def fetch_income_statement(self, ticker: str, period: str) -> ProviderResult:
        return self._statement(ticker, "income_stmt", period)

    def fetch_balance_sheet(self, ticker: str, period: str) -> ProviderResult:
        return self._statement(ticker, "balance_sheet", period)

    def fetch_cash_flow(self, ticker: str, period: str) -> ProviderResult:
        return self._statement(ticker, "cashflow", period)

    def fetch_ratios(self, ticker: str) -> ProviderResult:
        profile = self.fetch_profile(ticker)
        if profile.status not in {ProviderStatus.OK, ProviderStatus.PARTIAL}:
            return profile
        info = (profile.data or {}).get("info") or {}
        keys = (
            "trailingPE",
            "forwardPE",
            "priceToBook",
            "priceToSalesTrailing12Months",
            "enterpriseToEbitda",
            "returnOnAssets",
            "returnOnEquity",
            "debtToEquity",
            "currentRatio",
            "quickRatio",
            "profitMargins",
            "grossMargins",
            "operatingMargins",
        )
        ratios = {key: info.get(key) for key in keys if info.get(key) is not None}
        status = ProviderStatus.OK if ratios else ProviderStatus.NO_FIELD
        return ProviderResult(
            self.name,
            status,
            data=ratios,
            source_url=profile.source_url,
            reason=None if ratios else "ratio_fields_missing",
        )
