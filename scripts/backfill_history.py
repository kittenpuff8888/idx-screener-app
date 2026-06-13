from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.archive_v5 import DEFAULT_END, DEFAULT_SOURCE_DATE, DEFAULT_START, build_archive


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the schema-v5 historical IDX archive.")
    parser.add_argument("--start", default=DEFAULT_START)
    parser.add_argument("--end", default=DEFAULT_END)
    parser.add_argument("--source-date", default=DEFAULT_SOURCE_DATE)
    args = parser.parse_args()
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "fetch_market_context.py"),
            "--start",
            args.start,
            "--end",
            args.end,
        ],
        cwd=ROOT,
        check=True,
    )
    manifest = build_archive(start=args.start, end=args.end, source_date=args.source_date)
    print(
        f"Published {len(manifest['dates'])} real market sessions from "
        f"{manifest['availableMarketDates'][0]} through {manifest['latestMarketDate']}."
    )


if __name__ == "__main__":
    main()
