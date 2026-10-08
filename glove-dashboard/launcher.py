"""Self-contained Windows launcher for Glove Telemetry."""

from __future__ import annotations

import socket
import threading
import time
import urllib.request
import webbrowser

import uvicorn

from backend.server import app


APP_PORT = 3000
APP_URL = f"http://127.0.0.1:{APP_PORT}/"


def _port_is_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.4)
        return probe.connect_ex(("127.0.0.1", APP_PORT)) == 0


def _open_when_ready() -> None:
    for _ in range(120):
        try:
            with urllib.request.urlopen(f"{APP_URL}api/health", timeout=0.5) as response:
                if response.status == 200:
                    webbrowser.open(APP_URL, new=2)
                    return
        except Exception:
            time.sleep(0.25)


def main() -> None:
    if _port_is_open():
        webbrowser.open(APP_URL, new=2)
        return

    threading.Thread(target=_open_when_ready, daemon=True).start()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=APP_PORT,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
