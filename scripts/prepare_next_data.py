from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def copytree(source: Path, target: Path) -> None:
    if not source.exists():
        return
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    copytree(ROOT / "docs" / "data", PUBLIC / "data")
    copytree(ROOT / "docs" / "assets", PUBLIC / "assets")
    market_context = ROOT / "data_sources" / "market-context.json"
    if market_context.exists():
        shutil.copy2(market_context, PUBLIC / "data" / "market-context.json")


if __name__ == "__main__":
    main()
