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

    diff, reason = None, None
    try:
        import requests
        r = requests.get(IDX_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        payload = r.json()
        rows = payload.get("data") or payload.get("Data") or []
        # Structural sanity (§C.6.5): a changed layout must fail loud.
        if not rows or not isinstance(rows, list):
            raise ValueError("IDX roster response missing data rows")
        live = {str(x.get("Code") or x.get("code") or "").strip().upper() for x in rows}
        live.discard("")
        if len(live) < 700:
            raise ValueError(f"IDX roster implausibly small ({len(live)})")
        missing = sorted(live - universe)
        delisted = sorted(universe - live)
        diff = {"liveCount": len(live), "missingFromUniverse": missing[:50],
                "missingCount": len(missing), "inUniverseNotListed": delisted[:50],
                "delistedCount": len(delisted)}
    except Exception as e:
        reason = f"IDX roster fetch failed: {type(e).__name__}: {e}"

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
