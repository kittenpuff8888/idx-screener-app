from __future__ import annotations

from typing import Any


OFFICIAL_IDX_SECTORS = (
    "IDXENERGY",
    "IDXBASIC",
    "IDXINDUST",
    "IDXNONCYC",
    "IDXCYCLIC",
    "IDXHEALTH",
    "IDXFINANCE",
    "IDXPROPERT",
    "IDXTECHNO",
    "IDXINFRA",
    "IDXTRANS",
)

_ALIASES = {
    "ENERGY": "IDXENERGY",
    "BASIC MATERIALS": "IDXBASIC",
    "MATERIALS": "IDXBASIC",
    "INDUSTRIALS": "IDXINDUST",
    "CONSUMER DEFENSIVE": "IDXNONCYC",
    "CONSUMER NON-CYCLICALS": "IDXNONCYC",
    "CONSUMER NON CYCLICALS": "IDXNONCYC",
    "CONSUMER CYCLICAL": "IDXCYCLIC",
    "CONSUMER CYCLICALS": "IDXCYCLIC",
    "HEALTHCARE": "IDXHEALTH",
    "FINANCIAL SERVICES": "IDXFINANCE",
    "FINANCIALS": "IDXFINANCE",
    "REAL ESTATE": "IDXPROPERT",
    "PROPERTIES & REAL ESTATE": "IDXPROPERT",
    "TECHNOLOGY": "IDXTECHNO",
    "INFRASTRUCTURES": "IDXINFRA",
    "UTILITIES": "IDXINFRA",
    "COMMUNICATION SERVICES": "IDXINFRA",
    "TRANSPORTATION & LOGISTIC": "IDXTRANS",
    "TRANSPORTATION & LOGISTICS": "IDXTRANS",
}

_MISSING = {"", "-", "N/A", "NA", "NONE", "NULL", "UNDEFINED", "UNKNOWN", "UNCLASSIFIED"}


def normalize_idx_sector(value: Any, fallback: Any = None) -> str:
    """Return one of the 11 official IDX sector codes or ``Others``.

    Tries `value` first, then `fallback` — but a candidate that's merely the
    workbook's missing-value placeholder ("-", "", "N/A", ...) must be treated
    as absent just like `None`, or `fallback` never actually gets a turn: the
    real "IDX Sector" column virtually always reads "-" rather than `None`.
    """
    for candidate in (value, fallback):
        if candidate is None:
            continue
        normalized = " ".join(str(candidate).strip().upper().split())
        if normalized in _MISSING:
            continue
        if normalized in OFFICIAL_IDX_SECTORS:
            return normalized
        if normalized in _ALIASES:
            return _ALIASES[normalized]
    return "Others"


def is_official_idx_sector(value: Any) -> bool:
    return normalize_idx_sector(value) in OFFICIAL_IDX_SECTORS
