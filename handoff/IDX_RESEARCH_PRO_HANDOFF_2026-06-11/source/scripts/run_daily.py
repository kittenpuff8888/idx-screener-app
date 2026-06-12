from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    args = []
    if os.environ.get("MARKET_DATE"):
        args = ["--date", os.environ["MARKET_DATE"]]
    else:
        args = ["--days", "1"]
    subprocess.run([sys.executable, str(ROOT / "scripts" / "run_backfill.py"), *args], cwd=ROOT, check=True)
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build_historical_snapshots.py")],
        cwd=ROOT,
        check=True,
    )


if __name__ == "__main__":
    main()
