from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any


SCHEMA_VERSION = 5
FORMULA_VERSION = "source-limited-v3"
MISSING_REASONS = {
    "source_unavailable",
    "provider_blocked",
    "insufficient_history",
    "formula_not_applicable",
    "denominator_zero",
    "calculation_error",
    "field_not_found",
    "latest_reference_not_point_in_time",
}


def iso_date(value: str | date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


@dataclass(frozen=True)
class FieldValue:
    value: Any
    display: str
    status: str
    reason: str | None
    source: str
    asOf: str | None
    formula: str | None
    formulaVersion: str
    sourceUrl: str | None = None
    sourceMode: str = "point_in_time"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def observed(
    value: Any,
    *,
    source: str,
    as_of: str | date | datetime | None,
    formula: str | None = None,
    display: str | None = None,
    source_url: str | None = None,
    source_mode: str = "point_in_time",
) -> dict[str, Any]:
    return FieldValue(
        value=value,
        display=str(value) if display is None else display,
        status="ok",
        reason=None,
        source=source,
        asOf=iso_date(as_of),
        formula=formula,
        formulaVersion=FORMULA_VERSION,
        sourceUrl=source_url,
        sourceMode=source_mode,
    ).to_dict()


def missing(
    *,
    reason: str,
    source: str,
    as_of: str | date | datetime | None,
    formula: str | None = None,
    source_url: str | None = None,
    source_mode: str = "point_in_time",
) -> dict[str, Any]:
    if reason not in MISSING_REASONS:
        raise ValueError(f"Unsupported missing reason: {reason}")
    return FieldValue(
        value=None,
        display="\u2014",
        status="missing",
        reason=reason,
        source=source,
        asOf=iso_date(as_of),
        formula=formula,
        formulaVersion=FORMULA_VERSION,
        sourceUrl=source_url,
        sourceMode=source_mode,
    ).to_dict()


def field_metadata(
    value: Any,
    *,
    source: str,
    as_of: str,
    formula: str | None = None,
    reason: str = "source_unavailable",
    source_mode: str = "point_in_time",
) -> dict[str, Any]:
    if value is None or value == "" or value == "-" or value == "N/A":
        return missing(
            reason=reason,
            source=source,
            as_of=as_of,
            formula=formula,
            source_mode=source_mode,
        )
    return observed(
        value,
        source=source,
        as_of=as_of,
        formula=formula,
        source_mode=source_mode,
    )
