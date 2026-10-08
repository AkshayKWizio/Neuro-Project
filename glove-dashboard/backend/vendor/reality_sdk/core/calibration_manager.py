"""
Calibration Commands Module

Mirrors the Haptics module: a manager with a queue, update(), and a loop that
fires on keyboard triggers (or anything else you plug in later).
"""

import threading, time, keyboard
from dataclasses import dataclass
from typing import Literal, get_args, Any

from core.config import HANDEDNESS
from core.shared_state import SharedState
from core.osc_sender import OscSender

CommandsMode = Literal["left", "right", "left_right", "disabled"]
VALID_COMMANDS_MODES = get_args(CommandsMode)

@dataclass(frozen=True)
class CalibCmd:
    # name must match a send_* method in OscSender below (see _dispatch)
    name: str
    handedness: int | Literal["left","right","both","unknown"]
    params: dict[str, Any] | None = None

def _normalize_hand(h):
    if isinstance(h, int):
        return h
    h = str(h).lower()
    if h == "left": return HANDEDNESS.LEFT
    if h == "right": return HANDEDNESS.RIGHT
    if h == "both": return 3
    return 0  # unknown

@dataclass
class CalibrationCommandsManager:
    shared_state: SharedState
    profile: dict
    osc_sender: OscSender

    def __post_init__(self):
        mode = self.profile.get("mode", "disabled")
        if mode not in VALID_COMMANDS_MODES:
            print(f"[CalibCommands] Invalid mode: {mode}. Options: {VALID_COMMANDS_MODES}")
            mode = "disabled"
        self.mode: CommandsMode = mode

        self.send_mode = self.profile.get("send_mode", "oneshot")
        if self.send_mode not in {"oneshot", "continuous"}:
            self.send_mode = "oneshot"

        # triggers: key -> list of commands
        self.triggers: dict[str, list[CalibCmd]] = {}
        raw = self.profile.get("triggers", {}) or {}
        for key, specs in raw.items():
            specs = specs if isinstance(specs, list) else [specs]
            self.triggers[key] = [
                CalibCmd(
                    name=s["name"],
                    handedness=_normalize_hand(s.get("handedness", "both")),
                    params=s.get("params", None),
                ) for s in specs
            ]

        self._pending: list[CalibCmd] = []
        self._lock = threading.Lock()

    def _mode_allows(self, hand: int) -> bool:
        return (
            self.mode == "left_right" or
            (self.mode == "left" and hand == HANDEDNESS.LEFT) or
            (self.mode == "right" and hand == HANDEDNESS.RIGHT)
        )

    def queue_command(self, cmd: CalibCmd):
        with self._lock:
            if self.mode == "disabled":
                return
            if cmd.handedness in (HANDEDNESS.LEFT, HANDEDNESS.RIGHT):
                if self._mode_allows(cmd.handedness):
                    self._pending.append(cmd)
            else:
                # BOTH/UNKNOWN → expand to both hands
                for h in (HANDEDNESS.LEFT, HANDEDNESS.RIGHT):
                    if self._mode_allows(h):
                        self._pending.append(CalibCmd(cmd.name, h, cmd.params))

    def _consume(self) -> list[CalibCmd]:
        with self._lock:
            out, self._pending = self._pending, []
        return out

    def _dispatch(self, cmd: CalibCmd):
        p = cmd.params or {}
        h = cmd.handedness

        # Map command name -> OscSender method + param marshalling
        if cmd.name == "gesture_add":
            self.osc_sender.send_calib_gesture_add(h, int(p["mapping"]))
        elif cmd.name == "gesture_delete":
            self.osc_sender.send_calib_gesture_delete(h, int(p["mapping"]))
        elif cmd.name == "articulation_add":
            self.osc_sender.send_calib_articulation_add(h, str(p["label"]))
        elif cmd.name == "articulation_delete":
            self.osc_sender.send_calib_articulation_delete(h, str(p.get("label", "")))
        elif cmd.name == "joystick_add":
            self.osc_sender.send_calib_joystick_add(h, int(p["path"]))
        elif cmd.name == "joystick_delete":
            self.osc_sender.send_calib_joystick_delete(h)
        elif cmd.name == "dpad_add":
            self.osc_sender.send_calib_dpad_add(h, int(p["direction"]))
        elif cmd.name == "dpad_delete":
            self.osc_sender.send_calib_dpad_delete(h)
        else:
            print(f"[CalibCommands] Unknown command: {cmd.name}")

    def update(self):
        for cmd in self._consume():
            try:
                self._dispatch(cmd)
            except KeyError as e:
                print(f"[CalibCommands] Missing param {e} for {cmd.name}")

    def calibration_commands_loop(shared: SharedState, osc_sender: OscSender,
                                stop_event: threading.Event, init_complete_event: threading.Event,
                                update_hz: float = 60.0):
        from pathlib import Path
        import yaml

        profile_path = Path(__file__).parent / "calibration_profile.yaml"
        if not profile_path.exists():
            print(f"[CalibCommands] Profile not found: {profile_path}")
            return

        try:
            profile = yaml.safe_load(profile_path.read_text())
        except Exception as e:
            print(f"[CalibCommands] Failed to load profile: {e}")
            return

        if profile.get("mode") == "disabled":
            print("[CalibCommands] Mode is disabled.")
            return

        mgr = CalibrationCommandsManager(shared, profile, osc_sender)
        interval = 1.0 / update_hz
        oneshot = profile.get("send_mode", "oneshot") == "oneshot"

        print("[CalibCommands] Loop started")
        init_complete_event.set()

        all_keys = list(mgr.triggers.keys())
        prev = {k: False for k in all_keys}

        try:
            while not stop_event.is_set():
                for k in all_keys:
                    down = keyboard.is_pressed(k)
                    if oneshot:
                        if down and not prev[k]:
                            for cmd in mgr.triggers.get(k, []):
                                mgr.queue_command(cmd)
                    else:
                        if down:
                            for cmd in mgr.triggers.get(k, []):
                                mgr.queue_command(cmd)
                    prev[k] = down

                mgr.update()
                time.sleep(interval)
        except KeyboardInterrupt:
            print("[CalibCommands] Interrupted.")
