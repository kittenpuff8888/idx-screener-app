"""Convert a raw per-holder KSEI CSV into the aggregated workbook the KSEI
pipeline consumes, then (optionally) run export_ksei_ownership.

The public KSEI "saham" export is one row per (issuer, investor):
    Kode, Emiten, Investor, Tipe, Lokal/Asing, Nasionalitas,
    Lembar Saham, Persentase, HHI, Sektor, Industri

export_ksei_ownership expects one row per ISSUER with a multiline "Investors"
column plus aggregate metrics. This script builds that workbook. Every
aggregate is DERIVED from the holder rows (verified to reproduce the existing
snapshots exactly), never fabricated:

  Free Float               = 100 - sum(reported holder %)
  Classic HHI              = sum(holder %^2)           (matches existing hhi)
  CR1 / CR3                = top-1 / top-3 holder %
  Holder                   = count of reported holders
  CCS                      = the CSV "HHI" column      (== existing ccs)
  Ownership Type           = f(cr1, cr3)   [rule below, 100% match on 2026-06-14]
  CCS Category             = f(ccs)         [rule below, 100% match]

Two schema fields the CSV cannot supply come from elsewhere: IDX Sector is joined
by ticker from the newest fundamentals snapshot (the CSV's Yahoo-style "Sektor"
cannot express IDXTRANS, so deriving from it would misclassify), and IDX Sector
Weight (a market-cap weight) is left blank -> null, per the no-fabrication rule.

An "Investor Changes" sheet is produced by diffing holder percentages against
the previous snapshot, so the dashboard's "KSEI Latest Δ" and the swing
engine's ownership footprint light up with real month-over-month deltas.

Usage:
    python scripts/import_ksei_csv.py <csv> [--as-of YYYY-MM-DD] [--no-export]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.sector_normalization import normalize_idx_sector

SOURCE_DIR = ROOT / "data_sources" / "ksei"
KSEI_DIR = ROOT / "docs" / "data" / "ksei"


def parse_pct(value) -> float:
    """Indonesian decimals: '41,10' -> 41.10; '1.234,5' -> 1234.5."""
    s = str(value or "").strip()
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def classify_ownership_type(cr1: float, cr3: float) -> str:
    if cr1 >= 50:
        return "Mayoritas"
    if cr3 <= 40:
        return "Tersebar"
    if cr3 <= 60:
        return "Moderat"
    if cr3 <= 70:
        return "Oligopoli"
    return "Terkonsentrasi"


def classify_ccs_category(ccs: float) -> str:
    if ccs <= 25:
        return "Rendah"
    if ccs <= 55:
        return "Sedang"
    return "Tinggi"


def norm_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().upper())


def load_idx_sectors() -> dict[str, str]:
    """Authoritative per-ticker IDX sector code from the newest fundamentals snapshot.

    The KSEI CSV carries no "IDX Sector" column, only a Yahoo-style "Sektor".
    Deriving the IDX code from that cannot express IDXTRANS (Yahoo files those
    issuers under Industrials), so it silently inflates IDXINDUST and drops a
    whole sector. Join the real value instead; tickers absent from fundamentals
    stay blank -> Others, per the no-fabrication rule.
    """
    dates_dir = ROOT / "docs" / "data" / "dates"
    if not dates_dir.exists():
        return {}
    for day in sorted((p for p in dates_dir.iterdir() if p.is_dir()), reverse=True):
        payload_path = day / "fundamental.json"
        if not payload_path.exists():
            continue
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        rows = next(
            (v for v in payload.values() if isinstance(v, list) and v and isinstance(v[0], dict)),
            [],
        )
        mapping = {
            str(row.get("Ticker", "")).strip().upper(): row.get("IDX Sector")
            for row in rows
            if str(row.get("Ticker", "")).strip()
        }
        if mapping:
            return mapping
    return {}


def aggregate(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, dtype=str, encoding="utf-8-sig").fillna("")
    idx_sectors = load_idx_sectors()
    df.columns = [c.strip() for c in df.columns]
    issuers: dict[str, dict] = {}
    for _, row in df.iterrows():
        code = str(row.get("Kode", "")).strip().upper()
        if not code:
            continue
        it = issuers.setdefault(code, {
            "Emiten": str(row.get("Emiten", "")).strip(),
            "Sektor": str(row.get("Sektor", "")).strip(),
            "Industri": str(row.get("Industri", "")).strip(),
            "HHI": str(row.get("HHI", "")).strip(),
            "holders": [],
        })
        it["holders"].append({
            "name": str(row.get("Investor", "")).strip(),
            "type": str(row.get("Tipe", "")).strip(),
            "pct": parse_pct(row.get("Persentase")),
        })

    records = []
    for code, it in issuers.items():
        holders = sorted(it["holders"], key=lambda h: h["pct"], reverse=True)
        pcts = [h["pct"] for h in holders]
        total = sum(pcts)
        cr1 = pcts[0] if pcts else 0.0
        cr3 = sum(pcts[:3])
        classic_hhi = round(sum(p * p for p in pcts))
        ccs = parse_pct(it["HHI"]) if it["HHI"] else round(classic_hhi / 49)
        lines = [f"{i+1}. {h['name']} - {h['type']} - {h['pct']:.2f}%" for i, h in enumerate(holders)]
        records.append({
            "Kode": code,
            "Emiten": it["Emiten"],
            "Sektor": it["Sektor"],
            "Industri": it["Industri"],
            "IDX Sector": normalize_idx_sector(idx_sectors.get(code)),
            "Investors": "\n".join(lines),
            "Free Float": round(max(0.0, 100 - total), 2),
            "Classic HHI": classic_hhi,
            "Concentration Ratio Top 1 (CR1)": round(cr1, 2),
            "Concentration Ratio Top 3 (CR3)": round(cr3, 2),
            "Holder": len(holders),
            "CCS": round(ccs),
            "Ownership Type": classify_ownership_type(cr1, cr3),
            "CCS Category": classify_ccs_category(ccs),
            "IDX Sector Weight": "",
        })
    return pd.DataFrame(records).sort_values("Kode").reset_index(drop=True)


def previous_snapshot(as_of: str) -> dict | None:
    dates_dir = KSEI_DIR / "dates"
    if not dates_dir.exists():
        return None
    prior = sorted(p.name for p in dates_dir.iterdir() if p.is_dir() and p.name < as_of)
    if not prior:
        return None
    return json.loads((dates_dir / prior[-1] / "ownership.json").read_text(encoding="utf-8"))


def build_changes(frame: pd.DataFrame, prev: dict | None) -> pd.DataFrame:
    """Diff holder percentages against the previous snapshot -> change rows."""
    if not prev:
        return pd.DataFrame()
    old = {r["ticker"]: r for r in prev["records"]}
    rows = []
    for _, cur in frame.iterrows():
        code = cur["Kode"]
        po = old.get(code)
        if not po:
            continue
        old_h = {norm_name(h["name"]): h for h in po["investors"]}
        cur_h = {}
        for i, line in enumerate(str(cur["Investors"]).splitlines()):
            m = re.match(r"^\s*\d+\.\s*(?P<name>.+?)\s+-\s+(?P<type>.+?)\s+-\s+(?P<pct>[0-9.]+)%\s*$", line)
            if m:
                cur_h[norm_name(m["name"])] = {"name": m["name"].strip(), "type": m["type"].strip(), "percentage": float(m["pct"])}
        for key, ch in cur_h.items():
            oh = old_h.get(key)
            old_pct = oh["percentage"] if oh else None
            if oh is None or abs((old_pct or 0) - ch["percentage"]) >= 0.01:
                rows.append({
                    "Kode": code, "Emiten": cur["Emiten"], "Investor": ch["name"],
                    "Change Type": "New" if oh is None else "Changed",
                    "Old Tipe": oh["type"] if oh else "", "New Tipe": ch["type"],
                    "Old Persentase": old_pct if old_pct is not None else "",
                    "New Persentase": ch["percentage"],
                    "Old Classic HHI": po.get("hhi", ""), "New Classic HHI": cur["Classic HHI"],
                    "Old Holder": po.get("holderCount", ""), "New Holder": cur["Holder"],
                    "Old CCS": po.get("ccs", ""), "New CCS": cur["CCS"],
                    "Notes": "Persentase changed" if oh else "New reported holder",
                })
    # keep the report focused: the largest moves, like the source workbook
    rows.sort(key=lambda r: abs((r["New Persentase"] or 0) - (r["Old Persentase"] or 0)), reverse=True)
    return pd.DataFrame(rows[:60])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="path to the raw per-holder KSEI CSV")
    ap.add_argument("--as-of", default=None, help="snapshot date YYYY-MM-DD (default: from filename digits)")
    ap.add_argument("--no-export", action="store_true", help="write the workbook only; skip running the exporter")
    args = ap.parse_args()

    csv_path = Path(args.csv)
    as_of = args.as_of
    if not as_of:
        m = re.search(r"(\d{4})[-_]?(\d{2})[-_]?(\d{2})", csv_path.name)
        if not m:
            raise SystemExit("could not infer --as-of from filename; pass --as-of YYYY-MM-DD")
        as_of = f"{m[1]}-{m[2]}-{m[3]}"

    frame = aggregate(csv_path)
    changes = build_changes(frame, previous_snapshot(as_of))
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    out_xlsx = SOURCE_DIR / f"{as_of}.xlsx"
    with pd.ExcelWriter(out_xlsx, engine="openpyxl") as xl:
        frame.to_excel(xl, sheet_name="KSEI Data", index=False)
        if not changes.empty:
            changes.to_excel(xl, sheet_name="Investor Changes", index=False)
    print(f"workbook -> {out_xlsx}  ({len(frame)} issuers, {len(changes)} changes vs previous)")

    if not args.no_export:
        import export_ksei_ownership  # noqa: E402  (script in same dir)
        result = export_ksei_ownership.build()
        print(f"published KSEI snapshots: {result['availableDates']} · latest {result['latestAsOf']}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
