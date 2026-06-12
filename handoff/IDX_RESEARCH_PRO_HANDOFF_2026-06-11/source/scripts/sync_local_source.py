from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_VWAP_DIR = Path.home() / "OneDrive" / "Documents" / "VWAP Screener"
SCRIPT_SOURCE = LOCAL_VWAP_DIR / "IDX_Screener.py"
SCRIPT_TARGET = ROOT / "rebuild_backend" / "IDX_Screener.py"
SCRIPT_INCOMING = ROOT / "rebuild_backend" / "incoming" / "IDX_Screener.py"
RAW_SOURCE_DIR = LOCAL_VWAP_DIR / "Raw"

MARKET_DATE_LINE = 'MARKET_DATE = os.environ.get("MARKET_DATE", datetime.now().strftime("%Y-%m-%d"))'
PROJECT_BASE_LINE = "BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))"


def patch_market_date(script_path: Path) -> None:
    text = script_path.read_text(encoding="utf-8", errors="replace")
    text = re.sub(
        r'^MARKET_DATE\s*=\s*["\'][^"\']+["\']\s*$',
        MARKET_DATE_LINE,
        text,
        count=1,
        flags=re.MULTILINE,
    )
    text = re.sub(
        r"^BACKTEST_MODE\s*=\s*(True|False)\s*$",
        "BACKTEST_MODE = False",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    text = re.sub(
        r"^USE_CUSTOM_TICKERS_ONLY\s*=\s*(True|False)\s*$",
        "USE_CUSTOM_TICKERS_ONLY = False",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    text = re.sub(
        r"^BASE_DIR\s*=\s*os\.path\.dirname\(os\.path\.abspath\(__file__\)\)\s*$",
        PROJECT_BASE_LINE,
        text,
        count=1,
        flags=re.MULTILINE,
    )
    script_path.write_text(text, encoding="utf-8")


def sync_script(replace: bool = False) -> None:
    if not SCRIPT_SOURCE.exists():
        raise FileNotFoundError(f"Cannot find {SCRIPT_SOURCE}")
    destination = SCRIPT_TARGET if replace else SCRIPT_INCOMING
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCRIPT_SOURCE, destination)
    patch_market_date(destination)
    print(f"Synced script: {SCRIPT_SOURCE} -> {destination}")
    if not replace:
        print("Review and merge the incoming copy so website integration and audited fixes are preserved.")


def sync_raw() -> None:
    if not RAW_SOURCE_DIR.exists():
        print(f"Raw folder not found, skipped: {RAW_SOURCE_DIR}")
        return
    target_dir = ROOT / "Raw"
    target_dir.mkdir(exist_ok=True)
    for source in RAW_SOURCE_DIR.glob("*"):
        if source.is_file() and source.suffix.lower() in {".xlsx", ".csv"}:
            shutil.copy2(source, target_dir / source.name)
            print(f"Synced raw file: {source.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace rebuild_backend/IDX_Screener.py after explicitly reviewing the incoming source.",
    )
    args = parser.parse_args()
    sync_script(replace=args.replace)
    sync_raw()


if __name__ == "__main__":
    main()
