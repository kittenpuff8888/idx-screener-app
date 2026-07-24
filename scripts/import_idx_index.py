"""Import IDX index-evaluation files -> per-ticker index membership JSON.

Reads the three quarterly IDX files from data_sources/idx-index/<folder>/:
  - ihsg.xlsx      (COMPOSITE / IHSG constituents)
  - sektor/sector.xlsx (11 sector indices, one sheet each)
  - primbank.xlsx  (PRIMBANK10)

Produces docs/data/idx-index/latest.json: for every constituent ticker, its
index memberships, official (index) free float, index weight, and the
rebalance signal (Tetap/Naik/Turun/Baru — "Baru" = newly included, a catalyst).

This is ADDITIVE context, not a replacement for the pipeline's computed fields.
Safety mirrors the ownership adapter: --dry-run is default; --commit is explicit
and only advances latest.json when the effective quarter is newer.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INDEX_DIR = ROOT / "data_sources" / "idx-index"
OUT_DIR = ROOT / "docs" / "data" / "idx-index"


def find_file(folder: Path, *needles: str) -> Path | None:
    for p in folder.iterdir():
        if p.suffix.lower() == ".xlsx" and any(n in p.name.lower() for n in needles):
            return p
    return None


def scan_meta(raw: pd.DataFrame, label: str) -> str:
    """Value following a metadata label like 'Nama Indeks' in the header block."""
    for i in range(min(8, len(raw))):
        row = [str(v) for v in raw.iloc[i].tolist()]
        for j, cell in enumerate(row):
            if label.lower() in cell.lower():
                for v in row[j + 1:]:
                    # the value cell often carries the separator, e.g. ":  IDXFINANCE"
                    v = v.strip().lstrip(":").strip()
                    if v and v.lower() != "nan":
                        return v
    return ""


def parse_sheet(raw: pd.DataFrame) -> tuple[str, str, list[dict]]:
    index_name = scan_meta(raw, "Nama Indeks")
    effective = scan_meta(raw, "Periode Efektif Konstituen")
    ncol = raw.shape[1]
    rows = []
    for i in range(len(raw)):
        code = str(raw.iloc[i, 2]).strip()
        if len(code) == 4 and code.isupper() and code.isalpha():
            ff = raw.iloc[i, 3]
            weight = raw.iloc[i, 8] if ncol > 8 else None       # Bobot Pasca Evaluasi
            signal = str(raw.iloc[i, ncol - 1]).strip()          # weight-change keterangan
            rows.append({
                "ticker": code,
                "freeFloat": _num(ff),
                "weight": _num(weight),
                "signal": signal if signal in ("Tetap", "Naik", "Turun", "Baru") else None,
            })
    return index_name, effective, rows


def _num(v):
    try:
        return round(float(str(v)), 6)
    except (ValueError, TypeError):
        return None


def build(folder: Path) -> dict:
    ihsg_f = find_file(folder, "ihsg", "composite")
    sektor_f = find_file(folder, "sektor", "sector")
    prime_f = find_file(folder, "primbank", "prime", "prim")
    if not (ihsg_f and sektor_f and prime_f):
        raise SystemExit(f"Need ihsg/sektor/primbank files in {folder}; found "
                         f"ihsg={bool(ihsg_f)} sektor={bool(sektor_f)} primbank={bool(prime_f)}")

    tickers: dict[str, dict] = {}

    def ensure(t):
        return tickers.setdefault(t, {"ticker": t, "memberships": [], "officialFreeFloat": None,
                                      "ihsg": None, "sector": None, "primbank": False})

    # IHSG (single sheet)
    raw = pd.read_excel(ihsg_f, sheet_name=0, header=None, dtype=str)
    name, eff, rows = parse_sheet(raw)
    for r in rows:
        rec = ensure(r["ticker"])
        rec["memberships"].append("IHSG")
        rec["officialFreeFloat"] = r["freeFloat"]
        rec["ihsg"] = {"weight": r["weight"], "signal": r["signal"]}
    effective = eff

    # Sector indices (11 sheets)
    xl = pd.ExcelFile(sektor_f)
    for sheet in xl.sheet_names:
        raw = pd.read_excel(sektor_f, sheet_name=sheet, header=None, dtype=str)
        idx_name, _, rows = parse_sheet(raw)
        idx_name = idx_name or sheet
        for r in rows:
            rec = ensure(r["ticker"])
            rec["memberships"].append(idx_name)
            rec["sector"] = {"index": idx_name, "weight": r["weight"], "signal": r["signal"]}
            if rec["officialFreeFloat"] is None:
                rec["officialFreeFloat"] = r["freeFloat"]

    # PRIMBANK10 (single sheet)
    raw = pd.read_excel(prime_f, sheet_name=0, header=None, dtype=str)
    _, _, rows = parse_sheet(raw)
    for r in rows:
        rec = ensure(r["ticker"])
        rec["memberships"].append("PRIMBANK10")
        rec["primbank"] = True

    new_inclusions = sorted(t for t, r in tickers.items()
                            if (r.get("sector") or {}).get("signal") == "Baru"
                            or (r.get("ihsg") or {}).get("signal") == "Baru")

    return {
        "schemaVersion": 1,
        "dataType": "idx-index-membership",
        "effective": effective,
        "source": "IDX index evaluation (IHSG + 11 sector indices + PRIMBANK10)",
        "constituentCount": len(tickers),
        "newInclusions": new_inclusions,
        "records": {t: r for t, r in sorted(tickers.items())},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="folder under data_sources/idx-index/, e.g. 'Q2 2026'")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--scratch", default=None)
    args = ap.parse_args()

    folder = INDEX_DIR / args.folder
    if not folder.is_dir():
        raise SystemExit(f"Folder not found: {folder}")

    payload = build(folder)
    print(f"effective {payload['effective'][:40]!r} | constituents {payload['constituentCount']} "
          f"| new inclusions {len(payload['newInclusions'])}")

    if not args.commit:
        out = Path(args.scratch) if args.scratch else (ROOT / "_dryrun_index")
        out.mkdir(parents=True, exist_ok=True)
        (out / "idx_index.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"DRY-RUN -> {out / 'idx_index.json'}  (nothing in docs/data touched)")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"committed docs/data/idx-index/latest.json ({payload['constituentCount']} constituents)")


if __name__ == "__main__":
    main()
