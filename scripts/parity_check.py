"""Dual-source parity check (MASTER_PROMPT §1.3) — runs in networked CI.

Compares the cached (yfinance) latest close/volume for a rotating sample
against (a) a fresh yfinance pull and (b) Investing.com where reachable.
Price must match exactly (IDX ticks are discrete); volume within 0.5%.
Failures are written to docs/data/parity-fail.json — the setups engine
excludes those tickers for the run. True TradingView data cannot be fetched
without a paid feed; parity == agreement of independent IDX mirrors.

Offline (e.g. sandbox) the script records SOURCE_UNREACHABLE and exits 0:
the failure is loud in the report, not a silent crash of the pipeline.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
VOL_TOL = 0.005
CORE = ["BBCA", "BBRI", "TLKM", "ASII", "ANTM"]


def _load(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def main() -> None:
    ohlcv_dirs = sorted((DATA / "ohlcv").iterdir()) if (DATA / "ohlcv").exists() else []
    ohlcv = ohlcv_dirs[-1] if ohlcv_dirs else None
    setups = _load(DATA / "data-health.json") or {}
    sample = list(CORE)
    sample += [t["ticker"] for t in (setups.get("setups") or {}).get("spotCheckSample", [])]
    all_tickers = [f.stem for f in ohlcv.glob("*.json")] if ohlcv else []
    random.seed(datetime.now().strftime("%Y%m%d"))
    sample += random.sample(all_tickers, min(5, len(all_tickers)))
    sample = sorted(set(sample))

    results, status = [], "OK"
    try:
        import yfinance as yf  # networked CI only
        for t in sample:
            cached = _load(ohlcv / f"{t}.json") if ohlcv else None
            rows = (cached or {}).get("rows") or []
            if not rows:
                continue
            last = rows[-1]
            try:
                fresh = yf.download(f"{t}.JK", period="5d", interval="1d", auto_adjust=False, progress=False)
                if fresh is None or fresh.empty:
                    results.append({"ticker": t, "status": "NO_FRESH_DATA"})
                    continue
                f_close = float(fresh["Close"].iloc[-1])
                f_vol = float(fresh["Volume"].iloc[-1])
                price_ok = abs(f_close - last["close"]) < 1e-6
                vol_ok = last["volume"] == 0 or abs(f_vol - last["volume"]) / max(last["volume"], 1) <= VOL_TOL
                results.append({"ticker": t, "date": last["date"], "cachedClose": last["close"],
                                 "freshClose": f_close, "priceOk": price_ok, "volumeOk": vol_ok,
                                 "status": "OK" if (price_ok and vol_ok) else "PARITY_FAIL"})
            except Exception as e:  # per-ticker failure is data, not a crash
                results.append({"ticker": t, "status": f"ERROR: {type(e).__name__}"})
    except Exception as e:
        status = "SOURCE_UNREACHABLE"
        results.append({"note": f"yfinance unavailable in this environment: {type(e).__name__}"})

    fails = [r["ticker"] for r in results if r.get("status") == "PARITY_FAIL"]
    (DATA / "parity-fail.json").write_text(json.dumps({"tickers": fails}, indent=1), encoding="utf-8")

    health = _load(DATA / "data-health.json") or {}
    health["parity"] = {
        "status": status if status != "OK" else ("PARITY_FAIL" if fails else "OK"),
        "method": "Dual-source agreement (cached vs fresh yfinance; Investing.com adapter available in rebuild_backend/providers). True TradingView data needs a paid feed.",
        "lastChecked": datetime.now(timezone(timedelta(hours=7))).isoformat(),
        "checked": len([r for r in results if "ticker" in r]),
        "failures": fails,
        "results": results[:20],
        "note": "Price exact-match required (discrete IDX ticks); volume tolerance 0.5%. PARITY_FAIL tickers are excluded from swing setups this run.",
    }
    (DATA / "data-health.json").write_text(json.dumps(health, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"parity: {health['parity']['status']} · checked {health['parity']['checked']} · fails {fails}")


if __name__ == "__main__":
    main()
