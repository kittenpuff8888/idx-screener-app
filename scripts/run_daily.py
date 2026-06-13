from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    args = ["--timezone", "Asia/Jakarta", "--market-close-time", "16:30"]
    if os.environ.get("MARKET_DATE"):
        args.extend(["--market-date", os.environ["MARKET_DATE"]])
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "update_daily.py"), *args],
        cwd=ROOT,
        check=True,
    )


if __name__ == "__main__":
    main()
