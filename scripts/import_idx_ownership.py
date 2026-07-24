"""Import IDX ownership files -> combined KSEI ownership JSON.

Reads the two monthly IDX files from data_sources/idx-ownership/<folder>/:
  - a >1% shareholders file  (name contains "1%", "satu", or "persen")
  - an investor-classification file (name contains "class" or "klas")

Reuses the existing pipeline math (import_ksei_csv.aggregate +
export_ksei_ownership record/summary helpers) so concentration numbers are
identical to the KSEI path, and enriches each record with investor composition
(retail = Individual share).

Safety:
  * --dry-run (default) writes only to a scratch dir and prints a summary.
  * --commit writes docs/data/ksei/dates/<asOf>/ownership.json (archive) and
    updates latest.json ONLY when <asOf> is newer than the current latest, so a
    stale file can never move the live site backwards.
  * asOf comes from the file's own DATE column, never guessed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import importlib.util


def _mod(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


imp = _mod("imp_ksei", "scripts/import_ksei_csv.py")
exp = _mod("exp_ksei", "scripts/export_ksei_ownership.py")

OWNERSHIP_DIR = ROOT / "data_sources" / "idx-ownership"
KSEI_DIR = ROOT / "docs" / "data" / "ksei"

RETAIL = ["INDIVIDUAL (ID)"]
INSTITUTIONAL = [
    "MUTUAL FUNDS (MF)", "INSURANCE (IS)", "PENSION FUNDS (PF)", "FINANCIAL INSTITUTIONAL (IB)",
    "INVESTMENT MANAGER", "HEDGE FUND", "SOVEREIGN WEALTH FUND", "BANK", "SECURITIES COMPANY (SC)",
    "PRIVATE EQUITY", "VENTURE CAPITAL", "TRUSTEE BANK", "PRIVATE BANK", "EXCHANGE TRADED FUNDS",
]


def find_file(folder: Path, *needles: str) -> Path | None:
    for p in folder.iterdir():
        if p.suffix.lower() == ".xlsx" and any(n in p.name.lower() for n in needles):
            return p
    return None


def read_holders(path: Path) -> tuple[pd.DataFrame, str]:
    df = pd.read_excel(path, header=5, dtype=str).dropna(how="all")
    as_of = str(df["DATE"].dropna().iloc[0])[:10]
    csv = pd.DataFrame({
        "Kode": df["SHARE_CODE"].str.strip().str.upper(),
        "Emiten": df["ISSUER_NAME"],
        "Investor": df["INVESTOR_NAME"],
        "Tipe": df["INVESTOR_CLASSIFICATION"],
        # parse_pct expects Indonesian decimals (comma); IDX gives dot-decimal.
        # Percentages are <100 with no thousands separator, so . -> , is exact.
        "Persentase": df["PERCENTAGE"].str.strip().str.replace(".", ",", regex=False),
        "Sektor": "", "Industri": "", "HHI": "",
    })
    return csv, as_of


def read_composition(path: Path) -> dict:
    k = pd.read_excel(path, header=5, dtype=str).dropna(how="all")
    code_col, total_col = k.columns[1], k.columns[-1]
    for c in k.columns[3:]:
        k[c] = pd.to_numeric(k[c], errors="coerce").fillna(0)
    out = {}
    for _, row in k.iterrows():
        code = str(row[code_col]).strip().upper()
        total = row[total_col] or 0
        if total <= 0:
            continue
        indiv = sum(row[c] for c in RETAIL if c in k.columns)
        inst = sum(row[c] for c in INSTITUTIONAL if c in k.columns)
        corp = row["CORPORATE"] if "CORPORATE" in k.columns else 0
        other = max(total - indiv - inst - corp, 0)
        out[code] = {
            "retailPct": round(100 * indiv / total, 1),
            "institutionalPct": round(100 * inst / total, 1),
            "corporatePct": round(100 * corp / total, 1),
            "otherPct": round(100 * other / total, 1),
            "totalScripless": int(total),
            "retailShares": int(indiv),
        }
    return out


def build(folder: Path) -> dict:
    one_pct = find_file(folder, "1%", "satu", "persen")
    klas = find_file(folder, "class", "klas")
    if not one_pct:
        raise SystemExit(f"No >1% shareholders file in {folder} (looked for 1%/satu/persen)")
    if not klas:
        raise SystemExit(f"No classification file in {folder} (looked for class/klas)")

    csv, as_of = read_holders(one_pct)
    tmp = folder / "_holders_normalized.csv"
    csv.to_csv(tmp, index=False, encoding="utf-8")
    try:
        frame = exp.normalize_frame(imp.aggregate(tmp))
        records = [exp.record_from_row(row, as_of) for _, row in frame.iterrows()]
    finally:
        tmp.unlink(missing_ok=True)

    comp = read_composition(klas)
    matched = 0
    for r in records:
        c = comp.get(r["ticker"])
        r["composition"] = c
        matched += bool(c)

    return {
        "asOf": as_of,
        "matched": matched,
        "payload": {
            "schemaVersion": 3,
            "dataType": "ksei-ownership+composition",
            "asOf": as_of,
            "source": "IDX data-kepemilikan-saham (1% holders + investor classification)",
            "summary": exp.summary(records),
            "records": records,
            "investorChanges": [],
            "investorDirectory": exp.investor_directory(records),
            "composition": {"matchedTickers": matched, "retailProxy": "INDIVIDUAL (ID)"},
        },
    }


def current_latest_asof() -> str | None:
    latest = KSEI_DIR / "latest.json"
    if latest.exists():
        return json.loads(latest.read_text(encoding="utf-8")).get("asOf")
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="folder name under data_sources/idx-ownership/, e.g. 30-06-2026")
    ap.add_argument("--commit", action="store_true", help="write into docs/data/ksei (default: dry-run to scratch)")
    ap.add_argument("--scratch", default=None, help="dry-run output dir")
    args = ap.parse_args()

    folder = OWNERSHIP_DIR / args.folder
    if not folder.is_dir():
        raise SystemExit(f"Folder not found: {folder}")

    result = build(folder)
    payload, as_of, matched = result["payload"], result["asOf"], result["matched"]
    s = payload["summary"]
    print(f"asOf {as_of} | records {s['totalIssuers']} | composition matched {matched} "
          f"| avgFreeFloat {s.get('averageFreeFloat')}")

    if not args.commit:
        out_dir = Path(args.scratch) if args.scratch else (ROOT / "_dryrun_ksei")
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"ownership_{as_of}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"DRY-RUN -> {out_dir / f'ownership_{as_of}.json'}  (nothing in docs/data touched)")
        return

    # committed path
    arch = KSEI_DIR / "dates" / as_of
    arch.mkdir(parents=True, exist_ok=True)
    (arch / "ownership.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    latest_asof = current_latest_asof()
    if latest_asof is None or as_of >= latest_asof:
        (KSEI_DIR / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"committed archive + updated latest.json (was {latest_asof})")
    else:
        print(f"committed archive only; latest.json kept at {latest_asof} (newer than {as_of}) — no backwards move")


if __name__ == "__main__":
    main()
