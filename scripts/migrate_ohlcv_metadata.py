from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "docs" / "data" / "ohlcv"


def enrich(path: Path) -> bool:
    payload = json.loads(path.read_text(encoding="utf-8"))
    changed = False
    defaults = {
        "schemaVersion": 1,
        "source": "yfinance",
        "adjusted": False,
        "timezone": "Asia/Jakarta",
        "session": "IDX regular daily session",
        "formulaVersion": "ohlcv-series-v1",
    }
    for key, value in defaults.items():
        if key not in payload:
            payload[key] = value
            changed = True
    for row in payload.get("rows") or []:
        for key in ("source", "adjusted", "timezone", "session"):
            if key not in row:
                row[key] = payload[key]
                changed = True
    if changed:
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    changed = sum(enrich(path) for path in args.root.rglob("*.json"))
    print(f"Enriched {changed} OHLCV files under {args.root}")


if __name__ == "__main__":
    main()
