from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

from .base import MarketDataProvider, ProviderResult, ProviderStatus


class InvestingComProvider(MarketDataProvider):
    """Public-page adapter with raw/parsed cache and explicit blocked states."""

    name = "investing_com"
    base_url = "https://www.investing.com"

    def __init__(
        self,
        cache_root: Path | str = "cache/investing_com",
        *,
        retries: int = 3,
        backoff_seconds: float = 1.5,
        timeout_seconds: int = 20,
        session: requests.Session | None = None,
    ) -> None:
        self.cache_root = Path(cache_root)
        self.retries = max(1, retries)
        self.backoff_seconds = max(0.0, backoff_seconds)
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/124 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.8",
            }
        )

    def _retry(self, operation: Callable[[], requests.Response]) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                response = operation()
                if response.status_code in {401, 403, 429}:
                    return response
                response.raise_for_status()
                return response
            except requests.RequestException as exc:
                last_error = exc
                if attempt + 1 < self.retries:
                    time.sleep(self.backoff_seconds * (2**attempt))
        if last_error:
            raise last_error
        raise RuntimeError("Investing.com request failed")

    @staticmethod
    def _slug(ticker: str) -> str:
        return ticker.upper().replace(".JK", "").strip()

    def _paths(self, ticker: str, market_date: str | None = None) -> tuple[Path, Path]:
        day = market_date or datetime.now(timezone.utc).date().isoformat()
        clean = self._slug(ticker)
        raw = self.cache_root / "raw" / clean / f"{day}.html"
        parsed = self.cache_root / "parsed" / clean / f"{day}.json"
        raw.parent.mkdir(parents=True, exist_ok=True)
        parsed.parent.mkdir(parents=True, exist_ok=True)
        return raw, parsed

    def _search_url(self, ticker: str) -> str:
        return f"{self.base_url}/search/?q={quote(self._slug(ticker))}"

    def _fetch_public_page(self, ticker: str) -> ProviderResult:
        url = self._search_url(ticker)
        raw_path, parsed_path = self._paths(ticker)
        try:
            response = self._retry(
                lambda: self.session.get(url, timeout=self.timeout_seconds, allow_redirects=True)
            )
            if response.status_code in {401, 403, 429}:
                return ProviderResult(
                    self.name,
                    ProviderStatus.BLOCKED,
                    source_url=url,
                    reason=f"http_{response.status_code}",
                )
            text = response.text
            lowered = text.lower()
            if "captcha" in lowered or "access denied" in lowered:
                return ProviderResult(
                    self.name,
                    ProviderStatus.BLOCKED,
                    source_url=response.url,
                    reason="provider_challenge",
                )
            raw_path.write_text(text, encoding="utf-8")
            parsed = self._parse_public_page(text, ticker)
            parsed_path.write_text(
                json.dumps(parsed, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            status = ProviderStatus.OK if parsed.get("fields") else ProviderStatus.NO_FIELD
            return ProviderResult(
                self.name,
                status,
                data=parsed,
                source_url=response.url,
                reason=None if status == ProviderStatus.OK else "public_fields_not_found",
            )
        except requests.RequestException as exc:
            return ProviderResult(self.name, ProviderStatus.ERROR, source_url=url, reason=str(exc))

    @staticmethod
    def _parse_public_page(html: str, ticker: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.get_text(" ", strip=True) if soup.title else None
        description = None
        description_tag = soup.find("meta", attrs={"name": "description"})
        if description_tag:
            description = description_tag.get("content")
        fields: dict[str, Any] = {}
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                payload = json.loads(script.string or "")
            except json.JSONDecodeError:
                continue
            candidates = payload if isinstance(payload, list) else [payload]
            for item in candidates:
                if isinstance(item, dict):
                    for key in ("name", "description", "url", "tickerSymbol"):
                        if item.get(key) is not None:
                            fields[f"jsonld_{key}"] = item[key]
        text = soup.get_text(" ", strip=True)
        match = re.search(r"\b(?:Price|Last)\s*[:\-]?\s*([\d,.]+)", text, flags=re.IGNORECASE)
        if match:
            fields["public_price_text"] = match.group(1)
        return {
            "ticker": ticker.upper().replace(".JK", ""),
            "title": title,
            "description": description,
            "fields": fields,
        }

    def fetch_profile(self, ticker: str) -> ProviderResult:
        return self._fetch_public_page(ticker)

    def fetch_ratios(self, ticker: str) -> ProviderResult:
        result = self._fetch_public_page(ticker)
        if result.status != ProviderStatus.OK:
            return result
        fields = (result.data or {}).get("fields") or {}
        ratio_fields = {
            key: value
            for key, value in fields.items()
            if any(token in key.lower() for token in ("ratio", "margin", "return", "yield"))
        }
        if not ratio_fields:
            return ProviderResult(
                self.name,
                ProviderStatus.NO_FIELD,
                data={},
                source_url=result.source_url,
                reason="ratio_fields_not_found",
            )
        return ProviderResult(
            self.name,
            ProviderStatus.OK,
            data=ratio_fields,
            source_url=result.source_url,
        )

    def fetch_ohlcv(self, ticker: str, start: str | None, end: str | None) -> ProviderResult:
        return ProviderResult(
            self.name,
            ProviderStatus.NO_FIELD,
            reason="public_historical_parser_not_configured",
            source_url=self._search_url(ticker),
        )

    def fetch_income_statement(self, ticker: str, period: str) -> ProviderResult:
        return ProviderResult(self.name, ProviderStatus.NO_FIELD, reason="statement_parser_not_configured")

    def fetch_balance_sheet(self, ticker: str, period: str) -> ProviderResult:
        return ProviderResult(self.name, ProviderStatus.NO_FIELD, reason="statement_parser_not_configured")

    def fetch_cash_flow(self, ticker: str, period: str) -> ProviderResult:
        return ProviderResult(self.name, ProviderStatus.NO_FIELD, reason="statement_parser_not_configured")
