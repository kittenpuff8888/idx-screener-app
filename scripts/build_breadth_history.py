#!/usr/bin/env python3
"""Precompute IDX market-breadth history for the dashboard panel.

For each dated technical snapshot, compute the share of stocks above their
200-day and 50-day moving averages, measured over a fixed liquid universe
(top N by traded value = price x 20-day average volume), per the IDX
market-breadth study. Writes a small time series the browser can read in one
request instead of fetching every daily snapshot.

Output: docs/data/breadth-history.json
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATES = REPO / "docs" / "data" / "dates"
OUT = REPO / "docs" / "data" / "breadth-history.json"
UNIVERSE_N = 300          # fixed liquid universe size (article: 300 by traded value)
LOOKBACK_DAYS = 160       # trading days of history to keep


def _records(doc):
    recs = doc.get("records", doc)
    return recs if isinstance(recs, list) else list(recs.values())


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def breadth_for(path: Path):
    try:
        recs = _records(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return None
    rows = []
    for r in recs:
        price = _num(r.get("lastPrice"))
        avgvol = _num(r.get("averageVolume20")) or _num(r.get("volume"))
        ma = r.get("movingAverages") or {}
        s200 = _num(ma.get("sma200"))
        e50 = _num(ma.get("ema50"))
        if price is None or s200 is None or s200 <= 0:
            continue
        traded = price * (avgvol or 0.0)           # traded-value proxy for liquidity
        rows.append((traded, price, s200, e50))
    if not rows:
        return None
    # Fixed liquid universe: top N by traded value, re-selected each day.
    rows.sort(key=lambda x: x[0], reverse=True)
    universe = rows[:UNIVERSE_N]
    n200 = len(universe)
    a200 = sum(1 for _, p, s, _ in universe if p >= s)
    n50 = sum(1 for _, _, _, e in universe if e is not None)
    a50 = sum(1 for _, p, _, e in universe if e is not None and p >= e)
    return {
        "pct200": round(a200 / n200, 4) if n200 else None,
        "pct50": round(a50 / n50, 4) if n50 else None,
        "n": n200,
        # n200 == universeSize by construction (the universe is filtered on
        # having sma200 before selection); n50 is independently gated and can
        # be smaller (a top-300-by-liquidity ticker can lack a 50-day EMA) —
        # kept separately so the frontend can disclose the right denominator
        # for the 50-day tile instead of reusing n200/universeSize for both.
        "n50": n50,
    }


def main() -> int:
    if not DATES.is_dir():
        print(f"no dated snapshots at {DATES}", file=sys.stderr)
        return 1
    dirs = sorted(d for d in DATES.iterdir() if d.is_dir())[-LOOKBACK_DAYS:]
    points = []
    for d in dirs:
        tech = d / "technical.json"
        if not tech.exists():
            continue
        b = breadth_for(tech)
        if b is None:
            continue
        points.append({"date": d.name, **b})
    out = {
        "schemaVersion": 1,
        "generatedAt": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
        "method": f"share of the top {UNIVERSE_N} stocks by traded value (price x 20d avg vol) above their 200-day / 50-day MA, re-selected each day",
        "universeSize": UNIVERSE_N,
        "points": points,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} — {len(points)} days, latest {points[-1] if points else 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
