"""Snapshot the production-rendered page and copy its immutable client assets."""

from __future__ import annotations

import shutil
import urllib.request
from pathlib import Path


ROOT = Path(__file__).parents[1]
OUTPUT = ROOT / "desktop_bundle" / "web"
CLIENT = ROOT / "dist" / "client"


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(CLIENT, OUTPUT)
    with urllib.request.urlopen("http://127.0.0.1:3001/", timeout=10) as response:
        html = response.read()
    (OUTPUT / "index.html").write_bytes(html)
    print(f"Prepared desktop web bundle: {OUTPUT}")


if __name__ == "__main__":
    main()
