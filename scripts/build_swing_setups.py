"""Swing Setups engine — ranked 2-5 day long-reversal candidates + Data Health.

Reads (all repo-local, produced by the daily pipeline):
  docs/data/ohlcv/<latest>/<TICKER>.json   per-ticker daily OHLCV cache
  docs/data/dates/<D>/technical.json       POIs, structure, liquidity, dataStatus
  docs/data/ksei/dates/<S>/ownership.json  ownership deltas (monthly, lagged)
  docs/data/{update-log,manifest}.json     run metadata
  docs/data/dates/<D>/{qa-audit,processing-results}.json

Writes:
  docs/data/dates/<D>/setups.json          ranked setup candidates + config echo
  docs/data/data-health.json               per-run health report for the site

Design rules (MASTER_PROMPT §0.3): the website renders, it does not compute.
Every number here traces to a cached fetch; anything unverifiable is emitted
as null with a reason, never fabricated.

CVD is an APPROXIMATION (no tick data for IDX retail): per-bar delta =
volume * (2*(close-low)/(high-low) - 1); flat bars contribute 0. It is
labelled "CVD (approx.)" everywhere downstream. // TODO(vault-rule): replace
baseline thresholds below with owner's vault rules when the vault is
accessible; none were readable in this execution environment.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"

CONFIG = {
    "minMedianValueTraded": 1_000_000_000,  # IDR, 20-day median close*volume
    "minScore": 55,
    "cvdLookback": 20,
    "divergenceLookback": 30,
    "sweepLookback": 20,
    "recentIpoMaxBars": 90,
    "weights": {"location": 25, "structure": 25, "orderflow": 25, "ownership": 15, "liquidity": 10},
}


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def latest_dir(base: Path) -> Path | None:
    dirs = sorted([p for p in base.iterdir() if p.is_dir()]) if base.exists() else []
    return dirs[-1] if dirs else None


def validate_bars(rows: list[dict]) -> list[str]:
    """Sanity validators (§1.2). Returns list of issue strings (empty = clean)."""
    issues = []
    seen = set()
    for r in rows[-260:]:
        d = r.get("date")
        if d in seen:
            issues.append(f"duplicate date {d}")
        seen.add(d)
        o, h, l, c, v = (r.get(k) for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, l, c, v):
            issues.append(f"missing field on {d}")
            continue
        if h < max(o, c) or l > min(o, c):
            issues.append(f"OHLC inconsistency on {d}")
        if v < 0:
            issues.append(f"negative volume on {d}")
    # ARA/ARB sanity (§1.2): IDX auto-reject caps daily moves at ±35% even on
    # the loosest band; anything beyond that vs the prior close is bad data
    # (unadjusted split, feed glitch) — quarantine, don't propagate.
    # 0.355 not 0.35: a close AT the +35% ARA ceiling is legal; float rounding
    # of e.g. 135/100 must not quarantine limit-up days.
    closes = [(r.get("date"), r.get("close")) for r in rows[-260:] if r.get("close")]
    for (d0, c0), (d1, c1) in zip(closes, closes[1:]):
        if c0 and abs(c1 / c0 - 1) > 0.355:
            issues.append(f"move beyond ARA/ARB bound {d0}->{d1} ({c0}->{c1})")
    return issues[:5]


def cvd_series(rows: list[dict]) -> list[float]:
    out, acc = [], 0.0
    for r in rows:
        h, l, c, v = r["high"], r["low"], r["close"], r["volume"]
        rng = h - l
        delta = 0.0 if rng <= 0 else v * (2 * (c - l) / rng - 1)
        acc += delta
        out.append(acc)
    return out


def pct_slope(vals: list[float], n: int) -> float | None:
    if len(vals) < n + 1:
        return None
    base = vals[-n - 1]
    scale = max(abs(base), 1e-9)
    return (vals[-1] - base) / scale


def orderflow_signals(rows: list[dict]) -> dict:
    """CVD-approx signals on the daily bars. All keys may be None => N/A."""
    n = len(rows)
    if n < CONFIG["divergenceLookback"] + 5:
        return {"cvdSlope20": None, "bullishDivergence": None, "absorption": None,
                "spark": None, "reason": "insufficient history"}
    cvd = cvd_series(rows)
    look = CONFIG["divergenceLookback"]
    closes = [r["close"] for r in rows]
    lows = [r["low"] for r in rows]
    vols = [r["volume"] for r in rows]
    ranges = [r["high"] - r["low"] for r in rows]

    # Bullish divergence: price low of last 5 bars undercuts the prior
    # lookback low, while CVD holds above its value at that prior low.
    win_lows = lows[-look:-5] or lows[-look:]
    prior_min_i = len(lows) - look + win_lows.index(min(win_lows))
    recent_min = min(lows[-5:])
    divergence = bool(recent_min <= lows[prior_min_i] and cvd[-1] > cvd[prior_min_i])

    # Absorption: effort vs result at the low — top-quartile volume,
    # bottom-third range, close in upper half of bar, within 3% of 20d low.
    v_sorted = sorted(vols[-60:])
    r_sorted = sorted(ranges[-60:])
    v_hi = v_sorted[int(len(v_sorted) * 0.75)]
    r_lo = r_sorted[int(len(r_sorted) * 0.33)]
    last = rows[-1]
    near_low = last["close"] <= min(lows[-CONFIG["sweepLookback"]:]) * 1.03
    rng = last["high"] - last["low"]
    close_pos = 0.5 if rng <= 0 else (last["close"] - last["low"]) / rng
    absorption = bool(last["volume"] >= v_hi and rng <= r_lo and close_pos >= 0.5 and near_low)

    return {
        "cvdSlope20": pct_slope(cvd, CONFIG["cvdLookback"]),
        "bullishDivergence": divergence,
        "absorption": absorption,
        "spark": [round(x) for x in cvd[-30:]],
        "reason": None,
    }


def sweep_reclaim(rows: list[dict]) -> dict:
    """Failed breakdown: a bar sweeps the prior N-day low then price reclaims it."""
    look = CONFIG["sweepLookback"]
    if len(rows) < look + 6:
        return {"swept": None, "reclaimed": None, "sweptLow": None}
    prior_low = min(r["low"] for r in rows[-look - 5:-5])
    swept_bars = [r for r in rows[-5:] if r["low"] < prior_low]
    reclaimed = bool(swept_bars) and rows[-1]["close"] > prior_low
    return {"swept": bool(swept_bars), "reclaimed": reclaimed,
            "sweptLow": min((r["low"] for r in swept_bars), default=None)}


def ksei_footprint(ticker: str) -> dict:
    """Accumulation footprint from the two latest KSEI snapshots (monthly lag)."""
    base = DATA / "ksei" / "dates"
    snaps = sorted([p.name for p in base.iterdir() if p.is_dir()]) if base.exists() else []
    if len(snaps) < 2:
        return {"available": False, "reason": "fewer than 2 KSEI snapshots"}
    latest = _load(base / snaps[-1] / "ownership.json") or {}
    net = 0.0
    hits = []
    for ch in latest.get("investorChanges", []):
        if str(ch.get("ticker", "")).upper() != ticker:
            continue
        delta = (ch.get("newPercentage") or 0) - (ch.get("oldPercentage") or 0)
        net += delta
        hits.append({"investor": ch.get("investor"), "deltaPP": round(delta, 2)})
    return {"available": True, "asOf": latest.get("asOf"), "netDeltaPP": round(net, 2),
            "accumulation": net > 0.25, "changes": hits[:3]}


def evaluate(ticker: str, bars: list[dict], tech: dict, market_date: str) -> dict | None:
    rows = [r for r in bars if r.get("date") and r["date"] <= market_date]
    if len(rows) < 30:
        return None  # recent IPO / thin history: indicators would be garbage (§1.1)
    issues = validate_bars(rows)
    if issues:
        return {"ticker": ticker, "quarantined": True, "issues": issues}

    last = rows[-1]
    close = last["close"]
    w = CONFIG["weights"]

    # --- Tradability gate (§2.3.4) ---
    vals = sorted(r["close"] * r["volume"] for r in rows[-20:])
    med_value = vals[len(vals) // 2]
    if med_value < CONFIG["minMedianValueTraded"]:
        return None
    if str(tech.get("dataStatus", "OK")).upper() not in ("OK", "PARTIAL"):
        return None

    # --- Location (§2.3.1): near pipeline POI entry, or near 20d low band ---
    entry = tech.get("entry")
    entry_dist = tech.get("entryDistancePercent")
    low20 = min(r["low"] for r in rows[-20:])
    near_poi = entry is not None and entry_dist is not None and abs(entry_dist) <= 0.03
    near_low = close <= low20 * 1.05
    loc_score = w["location"] if near_poi else (w["location"] * 0.6 if near_low else 0)

    # --- Structure (§2.3.2): bullish CHoCH from pipeline, or sweep+reclaim ---
    st = tech.get("structure") or {}
    st_text = f"{st.get('internal') or ''} | {st.get('swing') or ''}"
    choch = "Bullish CHoCH" in st_text
    sw = sweep_reclaim(rows)
    struct_score = w["structure"] if choch else (w["structure"] * 0.8 if sw["reclaimed"] else 0)

    # --- Orderflow (§2.1): CVD-approx divergence / absorption ---
    of = orderflow_signals(rows)
    of_score = 0.0
    if of["bullishDivergence"]:
        of_score += w["orderflow"] * 0.6
    if of["absorption"]:
        of_score += w["orderflow"] * 0.4
    if of["cvdSlope20"] is not None and of["cvdSlope20"] > 0:
        of_score = min(w["orderflow"], of_score + w["orderflow"] * 0.2)

    # --- Ownership (conviction bonus, never a timing trigger — monthly lag) ---
    ks = ksei_footprint(ticker)
    own_score = w["ownership"] if ks.get("accumulation") else 0

    # --- Liquidity ---
    liq_score = w["liquidity"] if med_value >= 5e9 else w["liquidity"] * 0.5

    score = round(loc_score + struct_score + of_score + own_score + liq_score)
    # §2.3.3: orderflow confirmation means divergence or absorption — a positive
    # CVD slope alone is a bonus, not confirmation.
    if score < CONFIG["minScore"] or struct_score == 0 or not (of["bullishDivergence"] or of["absorption"]):
        return None

    # --- Levels: invalidation below swept low / POI; target = 20d mid / pipeline target ---
    invalidation = tech.get("invalidation") or (sw["sweptLow"] * 0.99 if sw["sweptLow"] else low20 * 0.98)
    high20 = max(r["high"] for r in rows[-20:])
    target = tech.get("target") or round((high20 + low20) / 2)
    why = []
    if near_poi:
        why.append(f"at POI {tech.get('entryPoi') or entry}")
    elif near_low:
        why.append("basing at 20-day low band")
    if choch:
        why.append(f"bullish CHoCH ({(st.get('internal') if 'Bullish CHoCH' in str(st.get('internal')) else st.get('swing'))})")
    if sw["reclaimed"]:
        why.append("failed breakdown: low swept and reclaimed")
    if of["bullishDivergence"]:
        why.append("CVD(approx.) bullish divergence at lows")
    if of["absorption"]:
        why.append("absorption bar (high volume, small range at low)")
    if ks.get("accumulation"):
        why.append(f"KSEI net +{ks['netDeltaPP']}pp ({ks.get('asOf')}, monthly lag)")

    return {
        "ticker": ticker,
        "name": tech.get("companyName"),
        "sector": tech.get("sector"),
        "close": close,
        "score": score,
        "components": {"location": round(loc_score), "structure": round(struct_score),
                        "orderflow": round(of_score), "ownership": round(own_score),
                        "liquidity": round(liq_score)},
        "entryZone": entry or round(low20 * 1.01),
        "invalidation": invalidation,
        "target": target,
        "medianValueTraded20": round(med_value),
        "rvol": tech.get("rvol"),
        "isRecentIpo": len(rows) < CONFIG["recentIpoMaxBars"],
        "kseiFootprint": ks if ks.get("available") else None,
        "cvdSpark": of["spark"],
        "dataSource": rows[-1].get("source", "yfinance"),
        "why": "; ".join(why),
        "history": ticker_history_stats(rows),
        "tradingView": f"https://www.tradingview.com/chart/?symbol=IDX%3A{ticker}",
    }


def ticker_history_stats(rows: list[dict]) -> dict | None:
    """Per-ticker historical stats for the price-computable core signal:
    how often this ticker's sweep+reclaim+CVD signals hit target before
    invalidation within 5 bars. Honest sample sizes; None when too thin."""
    wins = losses = 0
    for i in range(60, len(rows) - 6, 2):
        win = rows[: i + 1]
        sw = sweep_reclaim(win)
        if not sw["reclaimed"]:
            continue
        of = orderflow_signals(win)
        if not (of["bullishDivergence"] or of["absorption"]):
            continue
        entry = win[-1]["close"]
        inval = (sw["sweptLow"] or entry) * 0.99
        low20 = min(r["low"] for r in win[-20:])
        high20 = max(r["high"] for r in win[-20:])
        tgt = max((high20 + low20) / 2, entry * 1.03)
        for fwd in rows[i + 1: i + 6]:
            if fwd["low"] <= inval:
                losses += 1
                break
            if fwd["high"] >= tgt:
                wins += 1
                break
    total = wins + losses
    if total < 3:
        return None
    return {"signals": total, "hitRate": round(wins / total, 2),
            "note": "price-only core signal history for this ticker; small sample"}


def backtest(ohlcv_dir: Path, dates_back: int) -> dict:
    """Sanity harness (§2.4): price-computable core only (sweep+reclaim with CVD
    confirmation); POI/ownership components are excluded because historical
    technical.json snapshots are not retained per bar. Reported as measured.
    Component attribution: divergence-only vs absorption-only vs both."""
    wins = losses = undecided = signals = 0
    comp = {"divergence": [0, 0], "absorption": [0, 0], "both": [0, 0]}
    for f in sorted(ohlcv_dir.glob("*.json")):
        data = _load(f)
        rows = (data or {}).get("rows") or []
        if len(rows) < 120:
            continue
        for i in range(60, len(rows) - 6, 3):  # every 3rd bar to bound runtime
            if len(range(60, len(rows) - 6, 3)) and i > len(rows) - 6:
                break
            win = rows[: i + 1]
            sw = sweep_reclaim(win)
            if not sw["reclaimed"]:
                continue
            of = orderflow_signals(win)
            if not (of["bullishDivergence"] or of["absorption"]):
                continue
            if i < dates_back:
                continue
            signals += 1
            entry = win[-1]["close"]
            inval = (sw["sweptLow"] or entry) * 0.99
            low20 = min(r["low"] for r in win[-20:])
            high20 = max(r["high"] for r in win[-20:])
            tgt = (high20 + low20) / 2
            if tgt <= entry:
                tgt = entry * 1.03
            hit = None
            for fwd in rows[i + 1: i + 6]:
                if fwd["low"] <= inval:
                    hit = False
                    break
                if fwd["high"] >= tgt:
                    hit = True
                    break
            key = "both" if (of["bullishDivergence"] and of["absorption"]) else ("divergence" if of["bullishDivergence"] else "absorption")
            if hit is True:
                wins += 1
                comp[key][0] += 1
                comp[key][1] += 1
            elif hit is False:
                losses += 1
                comp[key][1] += 1
            else:
                undecided += 1
    total = wins + losses
    return {"signals": signals, "targetFirst": wins, "invalidationFirst": losses,
            "undecidedIn5Bars": undecided,
            "hitRateDecided": round(wins / total, 3) if total else None,
            "componentAttribution": {k: {"decided": v[1], "hitRate": round(v[0] / v[1], 3) if v[1] else None} for k, v in comp.items()},
            "caveats": "Price-only core (sweep+reclaim + CVD-approx); POI/KSEI components not replayable historically; thresholds NOT tuned on these results."}


def build_setups_history(ohlcv_dir: Path, current_date: str) -> dict:
    """Forward outcomes for previously published setups (§'past setups view').
    For each historical dates/<D>/setups.json, check the 5 bars after D:
    target-first, invalidation-first, undecided, or still-open. Real forward
    data only — no backtest, no re-simulation."""
    entries = []
    for ddir in sorted((DATA / "dates").iterdir()):
        if not ddir.is_dir() or ddir.name >= current_date:
            continue
        payload = _load(ddir / "setups.json")
        if not payload:
            continue
        for s in payload.get("setups", []):
            bars = ((_load(ohlcv_dir / f"{s['ticker']}.json") or {}).get("rows")) or []
            fwd = [r for r in bars if r["date"] > ddir.name][:5]
            outcome = "open"
            for r in fwd:
                if r["low"] <= s["invalidation"]:
                    outcome = "invalidated"
                    break
                if r["high"] >= s["target"]:
                    outcome = "target"
                    break
            else:
                outcome = "undecided" if len(fwd) >= 5 else "open"
            entries.append({"date": ddir.name, "ticker": s["ticker"], "score": s["score"],
                             "close": s["close"], "target": s["target"], "invalidation": s["invalidation"],
                             "outcome": outcome, "barsObserved": len(fwd)})
    decided = [e for e in entries if e["outcome"] in ("target", "invalidated")]
    hits = sum(1 for e in decided if e["outcome"] == "target")
    return {"schemaVersion": 1, "asOf": current_date, "entries": entries[-200:],
            "summary": {"total": len(entries), "decided": len(decided),
                         "targetFirst": hits,
                         "hitRate": round(hits / len(decided), 3) if decided else None},
            "note": "Forward outcomes of published setups (5 bars). Small samples early on; analytics, not advice."}


def build_data_health(market_date: str, setup_stats: dict) -> dict:
    log = _load(DATA / "update-log.json") or {}
    manifest = _load(DATA / "manifest.json") or {}
    qa = _load(DATA / "dates" / market_date / "qa-audit.json") or {}
    proc = _load(DATA / "dates" / market_date / "processing-results.json") or {}
    ksei_base = DATA / "ksei" / "dates"
    snaps = sorted([p.name for p in ksei_base.iterdir() if p.is_dir()]) if ksei_base.exists() else []
    # Preserve contributions written earlier this run by audit_universe.py
    # (roster diff) and parity_check.py (real verdict) so we don't clobber them.
    prev_health = _load(DATA / "data-health.json") or {}
    prev_universe = prev_health.get("universe") or {}
    prev_parity = prev_health.get("parity")
    universe = {"size": (proc.get("summary") or {}).get("total") or manifest.get("tickerCount") or setup_stats.get("scanned"),
                "source": "KSEI workbook roster",
                "liveIdxRosterDiff": None,
                "liveIdxRosterDiffReason": "IDX roster diff not yet computed this run"}
    for key in ("liveIdxRosterDiff", "liveIdxRosterDiffReason", "auditedAt"):
        if prev_universe.get(key) is not None:
            universe[key] = prev_universe[key]
    parity = prev_parity if prev_parity and prev_parity.get("lastChecked") else {
        "status": "UNVERIFIED",
        "method": "Dual-source agreement (yfinance vs Investing) approximates TradingView parity; true TV data needs a paid feed.",
        "lastChecked": None,
        "note": "Automated cross-check must run in networked CI; this sandbox cannot reach either source.",
    }
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone(timedelta(hours=7))).isoformat(),
        "marketDate": market_date,
        "universe": universe,
        "runLog": (log.get("entries") or [])[-8:],
        "qaSummary": qa.get("summary"),
        "processingSummary": proc.get("summary"),
        "ksei": {"snapshots": snaps, "latest": snaps[-1] if snaps else None,
                  "lagNote": "KSEI is monthly; ownership signals are context, never timing triggers."},
        "parity": parity,
        "setups": setup_stats,
        "manualSpotCheck": {
            "instructions": "Compare each close/volume below against TradingView (IDX:<ticker>, daily, unadjusted display) and tick off.",
            "tickers": setup_stats.get("spotCheckSample", []),
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help="market date (default: manifest latest)")
    ap.add_argument("--backtest", type=int, default=0, help="run sanity backtest over N recent bars per ticker")
    args = ap.parse_args()

    manifest = _load(DATA / "manifest.json") or {}
    entry_dates = [e.get("marketDate") for e in (manifest.get("dates") or []) if e.get("marketDate")]
    market_date = (
        args.date
        or (max(entry_dates) if entry_dates else None)
        or manifest.get("latestMarketDate")
        or manifest.get("latest")
    )
    tech_all = (_load(DATA / "dates" / market_date / "technical.json") or {}).get("records") or {}
    ohlcv_dir = latest_dir(DATA / "ohlcv")
    if not ohlcv_dir or not tech_all:
        raise SystemExit(f"missing inputs for {market_date} (ohlcv dir: {ohlcv_dir})")

    parity_fail = set((_load(DATA / "parity-fail.json") or {}).get("tickers") or [])
    setups, quarantined, scanned = [], [], 0
    spot_sample = []
    for f in sorted(ohlcv_dir.glob("*.json")):
        ticker = f.stem.upper()
        tech = tech_all.get(ticker)
        if not tech:
            continue
        if ticker in parity_fail:
            quarantined.append({"ticker": ticker, "quarantined": True, "issues": ["PARITY_FAIL this run"]})
            scanned += 1
            continue
        data = _load(f) or {}
        rows = data.get("rows") or []
        scanned += 1
        if rows and ticker in ("BBCA", "BBRI", "TLKM", "ASII", "ANTM"):
            spot_sample.append({"ticker": ticker, "date": rows[-1]["date"],
                                 "close": rows[-1]["close"], "volume": rows[-1]["volume"],
                                 "source": rows[-1].get("source", "yfinance")})
        res = evaluate(ticker, rows, tech, market_date)
        if res is None:
            continue
        if res.get("quarantined"):
            quarantined.append(res)
        else:
            setups.append(res)

    setups.sort(key=lambda s: s["score"], reverse=True)
    # rotate a few extra tickers into the manual spot-check list from top setups
    for s in setups[:5]:
        if all(x["ticker"] != s["ticker"] for x in spot_sample):
            spot_sample.append({"ticker": s["ticker"], "date": market_date,
                                 "close": s["close"], "volume": None, "source": s["dataSource"]})

    out = {
        "schemaVersion": 1,
        "marketDate": market_date,
        "generatedAt": datetime.now(timezone(timedelta(hours=7))).isoformat(),
        "config": CONFIG,
        "methodology": "CVD is approximated from candle structure + volume (labelled 'approx.'); KSEI is monthly-lagged context; outputs are screening analytics, not trade advice.",
        "count": len(setups),
        "setups": setups,
        "quarantined": quarantined,
        "scanned": scanned,
    }
    dest = DATA / "dates" / market_date / "setups.json"
    dest.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"setups: {len(setups)} candidates / {scanned} scanned -> {dest}")

    stats = {"count": len(setups), "scanned": scanned, "quarantined": len(quarantined),
             "spotCheckSample": spot_sample[:10]}
    if args.backtest:
        stats["backtest"] = backtest(ohlcv_dir, args.backtest)
        print("backtest:", stats["backtest"])
    history = build_setups_history(ohlcv_dir, market_date)
    (DATA / "setups-history.json").write_text(json.dumps(history, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"setups history: {history['summary']}")

    stats["forwardOutcomes"] = history["summary"]
    health = build_data_health(market_date, stats)
    (DATA / "data-health.json").write_text(json.dumps(health, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"data health -> {DATA / 'data-health.json'}")


if __name__ == "__main__":
    main()
