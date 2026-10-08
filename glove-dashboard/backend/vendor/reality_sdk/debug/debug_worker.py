import threading
import time
from pathlib import Path

from core.shared_state import SharedState
from debug.kinematic_raw_snapshot import append_raw_kinematic_snapshot


def _load_keyboard():
    try:
        import keyboard  # type: ignore[import-not-found]
    except Exception:
        return None
    return keyboard


def get_debug_help_suffix() -> str:
    keyboard = _load_keyboard()
    if keyboard is None:
        return " Debug key worker selected, but key capture is unavailable on this platform."
    return " Press shift+space to capture raw kinematic snapshot to file."


'''
Debug worker that listens for a specific key combinations to trigger actions.
E.g. shift+space to capture raw kinematic snapshot and append to a file.
'''
def debug_loop(
    shared: SharedState,
    stop_event: threading.Event,
    init_complete_event: threading.Event,
    raw_snapshot_path: Path | None = None,
    poll_interval_s: float = 0.05,
):
    keyboard = _load_keyboard()
    snapshot_path = raw_snapshot_path or Path("kinematic_raw_snapshots.jsonl")

    if keyboard is None:
        print("[DEBUG] Key capture unavailable; debug worker is idle on this platform.")
        init_complete_event.set()
        return

    print(f"[DEBUG] Key worker started.")
    init_complete_event.set()
    was_shift_space_down = False

    while not stop_event.is_set():
        space_down = keyboard.is_pressed("shift+space")

        if space_down and not was_shift_space_down:
            append_raw_kinematic_snapshot(shared, snapshot_path)

        was_shift_space_down = space_down
        time.sleep(poll_interval_s)

    print("[DEBUG] Key worker stopped")
