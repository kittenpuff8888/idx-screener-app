"""Live IDX roster audit (MASTER_PROMPT §1.1 / Phase 0 §3) — networked CI.

Fetches the official IDX listed-companies roster and diffs it against the
pipeline universe (KSEI roster). New listings are reported (IPO gap); the
previous universe is never silently replaced. Offline → loud reason in
data-health.json, exit 0 (report-level failure, not a pipeline crash).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
IDX_URL = "https://www.idx.co.id/primary/StockData/GetSecuritiesStock?start=0&length=9999"


def _load(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def main() -> None:
    manifest = _load(DATA / "manifest.json") or {}
    md = manifest.get("latestMarketDate") or manifest.get("latest")
    tech = (_load(DATA / "dates" / md / "technical.json") or {}).get("records") or {}
    universe = set(tech.keys())

    diff, reason, roster_source = None, None, None
    live, roster_asof = None, None

    # Prefer the committed canonical roster (data_sources/idx-listed.json,
    # from the official Daftar Saham export) — works offline and is the
    # source of truth for "what is listed". Fall back to the live IDX endpoint.
    roster_path = ROOT / "data_sources" / "idx-listed.json"
    if roster_path.exists():
        try:
            payload = json.loads(roster_path.read_text(encoding="utf-8"))
            recs = payload.get("records") or []
            live = {str(r.get("ticker", "")).strip().upper() for r in recs}
            live.discard("")
            roster_source = f"data_sources/idx-listed.json ({payload.get('source')})"
            roster_asof = payload.get("asOf")
        except Exception as e:
            reason = f"local roster unreadable: {type(e).__name__}: {e}"

    if live is None:
        try:
            import requests
            r = requests.get(IDX_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            payload = r.json()
            rows = payload.get("data") or payload.get("Data") or []
            if not rows or not isinstance(rows, list):
                raise ValueError("IDX roster response missing data rows")
            live = {str(x.get("Code") or x.get("code") or "").strip().upper() for x in rows}
            live.discard("")
            roster_source = "live IDX endpoint"
        except Exception as e:
            reason = f"IDX roster unavailable (no local file, live fetch failed): {type(e).__name__}: {e}"

    if live is not None:
        if len(live) < 700:
            reason = f"IDX roster implausibly small ({len(live)})"
        else:
            missing = sorted(live - universe)
            delisted = sorted(universe - live)
            diff = {"rosterSource": roster_source, "rosterAsOf": roster_asof,
                    "liveCount": len(live), "missingFromUniverse": missing[:50],
                    "missingCount": len(missing), "inUniverseNotListed": delisted[:50],
                    "delistedCount": len(delisted)}

    health = _load(DATA / "data-health.json") or {}
    health.setdefault("universe", {})
    health["universe"].update({
        "size": len(universe),
        "source": "KSEI workbook roster",
        "liveIdxRosterDiff": diff,
        "liveIdxRosterDiffReason": reason,
        "auditedAt": datetime.now(timezone(timedelta(hours=7))).isoformat(),
    })
    (DATA / "data-health.json").write_text(json.dumps(health, indent=1, ensure_ascii=False), encoding="utf-8")
    print("universe audit:", diff or reason)


if __name__ == "__main__":
    main()
