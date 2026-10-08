"""
Gamepad Emulator Module

This module emulates one or more Xbox 360 controllers using vgamepad and maps
controller input fields from a YAML configuration profile.

Supported modes:
  - left
  - right
  - merged_or
  - merged_preferred
  - independent
  - disabled
"""

import threading
import time
import yaml
import platform

from dataclasses import field, replace, dataclass
from typing import Any, Callable, Optional, Literal, get_args
from pathlib import Path

try:
    import vgamepad as vg
    _VGAMEPAD_IMPORT_ERROR = None
except Exception as exc:
    vg = None
    _VGAMEPAD_IMPORT_ERROR = exc

from core.core_data_classes import ControllerPacket
from core.config import HANDEDNESS
from core.runtime_profiles import resolve_editable_profile
from core.shared_state import SharedState

try:
    import winreg
except ImportError:
    winreg = None


def get_vgamepad_import_blocker() -> str | None:
    if vg is not None:
        return None

    if _VGAMEPAD_IMPORT_ERROR is not None:
        return f"unable to import 'vgamepad': {_VGAMEPAD_IMPORT_ERROR}"

    return "unable to import 'vgamepad'."


def get_gamepad_startup_blocker() -> str | None:
    if platform.system() != "Windows":
        return "vgamepad is supported on Windows only."

    import_blocker = get_vgamepad_import_blocker()
    if import_blocker is not None:
        return import_blocker

    if winreg is None:
        return "Windows registry API is unavailable; cannot verify ViGEmBus driver."

    key_path = r"SYSTEM\CurrentControlSet\Services\ViGEmBus"
    access_modes = [winreg.KEY_READ]

    key64 = getattr(winreg, "KEY_WOW64_64KEY", 0)
    key32 = getattr(winreg, "KEY_WOW64_32KEY", 0)
    if key64:
        access_modes.append(winreg.KEY_READ | key64)
    if key32:
        access_modes.append(winreg.KEY_READ | key32)

    for access in access_modes:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, access):
                return None
        except FileNotFoundError:
            continue
        except OSError as exc:
            return f"Unable to check ViGEmBus driver registry key: {exc}"

    return (
        "ViGEmBus driver is not installed. Install it from "
        "https://github.com/ViGEm/ViGEmBus/releases"
    )

# ──────────────────────────────────────────────────────────────
# Controller Constants
# ──────────────────────────────────────────────────────────────

#: Valid output targets for button inputs
BUTTON_FIELDS = {
    "XUSB_GAMEPAD_A", "XUSB_GAMEPAD_B", "XUSB_GAMEPAD_X", "XUSB_GAMEPAD_Y",
    "XUSB_GAMEPAD_LEFT_SHOULDER", "XUSB_GAMEPAD_RIGHT_SHOULDER",
    "XUSB_GAMEPAD_BACK", "XUSB_GAMEPAD_START", "XUSB_GAMEPAD_GUIDE",
    "XUSB_GAMEPAD_DPAD_UP", "XUSB_GAMEPAD_DPAD_DOWN", 
    "XUSB_GAMEPAD_DPAD_LEFT", "XUSB_GAMEPAD_DPAD_RIGHT",
    "XUSB_GAMEPAD_LEFT_THUMB", "XUSB_GAMEPAD_RIGHT_THUMB"
}

#: Valid output targets for triggers
TRIGGER_FIELDS = {
    "left_trigger",        # Integer value (0–255)
    "left_trigger_float",  # Float value (0.0–1.0)
    "right_trigger",
    "right_trigger_float"
}

#: Valid output targets for joystick axes
JOYSTICK_AXES = {
    "left_joystick_x",
    "left_joystick_y",
    "right_joystick_x",
    "right_joystick_y"
}

#: All valid target output strings
VALID_INPUTS = BUTTON_FIELDS | TRIGGER_FIELDS | JOYSTICK_AXES

#: Allowed controller modes
CONTROLLER_MODES = [
    "left", 
    "right", 
    "merged_or", 
    "merged_preferred", 
    "independent", 
    "disabled"
]

ControllerMode = Literal[
    "left", 
    "right", 
    "merged_or", 
    "merged_preferred", 
    "independent", 
    "disabled"
]

# ──────────────────────────────────────────────────────────────
# Controller Manager Class
# ──────────────────────────────────────────────────────────────

@dataclass
class ControllerManager:
    """
    Manages gamepad emulation based on a YAML profile.

    Args:
        shared_state: A thread-safe container for hand/controller input.
        profile: A dictionary loaded from a YAML file specifying the control mappings.
    """
    shared_state: SharedState
    profile: dict[str, any]

    def __post_init__(self):
        """
        Initializes gamepad(s) and validates the loaded profile.
        """
        valid_modes = get_args(ControllerMode)
        requested_mode = self.profile.get("mode", "disabled")

        if requested_mode not in valid_modes:
            print(f"[ControllerManager] Invalid mode: {requested_mode}. Valid options are: {CONTROLLER_MODES}")
            print(f"[ControllerManager] Defaulting to 'disabled'.")
            requested_mode = "disabled"

        self.mode: ControllerMode = requested_mode
        self.button_mapping: dict = self.profile
        self.gamepads: list[Any] = []

        match self.mode:
            case "left" | "right" | "merged_or" | "merged_preferred":
                self.gamepads.append(vg.VX360Gamepad())
            case "independent":
                self.gamepads.append(vg.VX360Gamepad())
                self.gamepads.append(vg.VX360Gamepad())
        
        # Validate mappings
        invalid_targets = []

        def collect_targets(mapping):
            if isinstance(mapping, dict):
                for val in mapping.values():
                    if isinstance(val, str):
                        yield val
                    elif isinstance(val, dict):  # merged_preferred
                        yield val.get("target")

        for section_key in CONTROLLER_MODES:
            mapping = self.profile.get(section_key)
            if mapping:
                invalid_targets.extend(
                    target for target in collect_targets(mapping)
                    if target and target not in VALID_INPUTS
                )

        if invalid_targets:
            print(f"[ControllerManager] Invalid target mappings found in profile:")
            for target in set(invalid_targets):
                print(f"  - {target}")

    def resolve_gamepad_inputs(self, left: Optional[ControllerPacket], right: Optional[ControllerPacket]) -> dict[str, float | int | bool]:
        """
        Translates left/right ControllerPackets into a flattened input dict
        using the strategy defined in the YAML profile.

        Returns:
            A dictionary mapping controller output targets to values.
        """
        result = {}

        def get_val(source: Optional[ControllerPacket], field: str):
            return getattr(source.inputs, field, 0) if source and source.inputs else 0

        if self.mode in ("left", "right"):
            src = left if self.mode == "left" else right
            if src and src.inputs:
                mapping = self.profile.get(self.mode, {})
                for input_field, target in mapping.items():
                    result[target] = get_val(src, input_field)

        elif self.mode == "merged_or":
            mapping = self.profile.get("merged_or", {})
            if left and right:
                merged = merge_controller_packets(left, right)
            elif left:
                merged = left
            elif right:
                merged = right
            else:
                return {}
            for input_field, target in mapping.items():
                result[target] = getattr(merged.inputs, input_field, 0)

        elif self.mode == "merged_preferred":
            mapping = self.profile.get("merged_preferred", {})
            for input_field, cfg in mapping.items():
                src = left if cfg["source"] == "left" else right
                result[cfg["target"]] = get_val(src, input_field)

        return result

    def update(self):
        """
        Evaluates the current state and drives the virtual gamepad accordingly.
        """
        if self.mode == "disabled":
            return

        left = self.shared_state.get_hand(HANDEDNESS.LEFT)
        right = self.shared_state.get_hand(HANDEDNESS.RIGHT)

        if self.mode == "independent":
            for i, (hand, key) in enumerate([(left, "left"), (right, "right")]):
                if hand.controller:
                    mapping = self.button_mapping.get(key, {})
                    resolved = {
                        target: getattr(hand.controller.inputs, field)
                        for field, target in mapping.items()
                    }
                    drive_virtual_gamepad(self.gamepads[i], resolved)
            return

        resolved = self.resolve_gamepad_inputs(left.controller, right.controller)
        if resolved:
            drive_virtual_gamepad(self.gamepads[0], resolved)


# ──────────────────────────────────────────────────────────────
# Utility Functions
# ──────────────────────────────────────────────────────────────

def load_gamepad_profile(path: str) -> Optional[dict]:
    """
    Loads a YAML gamepad configuration profile from disk.

    Args:
        path: Relative path to the YAML file.

    Returns:
        Parsed dictionary if successful, or None on failure.
    """
    default_path = Path(__file__).parent / path
    resolved_path = resolve_editable_profile(default_path, path, "Gamepad")

    if resolved_path is None:
        print(f"[ERROR] Gamepad profile not found at: {default_path}")
        return None

    try:
        with open(resolved_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"[ERROR] Failed to load gamepad profile: {e}")
        return None


def merge_controller_packets(a: ControllerPacket, b: ControllerPacket) -> ControllerPacket:
    """
    Merges two controller packets, combining their inputs using
    OR logic for buttons and strongest-magnitude logic for floats.

    Args:
        a: First controller packet.
        b: Second controller packet.

    Returns:
        A merged ControllerPacket.
    """
    merged_inputs = {}
    for field in a.inputs.__dataclass_fields__:
        va = getattr(a.inputs, field)
        vb = getattr(b.inputs, field)

        if field == "idle":
            merged_inputs["idle"] = 1 if va and vb else 0
        elif isinstance(va, (bool, int)) and isinstance(vb, (bool, int)):
            merged_inputs[field] = va or vb
        elif isinstance(va, float) and isinstance(vb, float):
            merged_inputs[field] = va if abs(va) >= abs(vb) else vb
        else:
            merged_inputs[field] = va

    return ControllerPacket(header=a.header, inputs=replace(a.inputs, **merged_inputs))


def drive_virtual_gamepad(gp: Any, input_data: dict[str, float | int | bool]):
    """
    Applies a dictionary of control values to a vgamepad instance.

    Args:
        gp: The vgamepad instance to control.
        input_data: Mapping of control target names to values.
    """
    for target, value in input_data.items():
        if target.startswith("XUSB_GAMEPAD_"):
            button_enum = getattr(vg.XUSB_BUTTON, target)
            gp.press_button(button_enum) if value else gp.release_button(button_enum)
        elif target == "left_trigger":
            gp.left_trigger(int(value * 255))
        elif target == "left_trigger_float":
            gp.left_trigger_float(value)
        elif target == "right_trigger":
            gp.right_trigger(int(value * 255))
        elif target == "right_trigger_float":
            gp.right_trigger_float(value)
        elif target in ["left_joystick_x", "left_joystick_y", "right_joystick_x", "right_joystick_y"]:
            if not hasattr(gp, "_axis_state"):
                gp._axis_state = {k: 0 for k in JOYSTICK_AXES}
            gp._axis_state[target] = int(value * 32767)

    if hasattr(gp, "_axis_state"):
        gp.left_joystick(
            x_value=gp._axis_state["left_joystick_x"],
            y_value=gp._axis_state["left_joystick_y"]
        )
        gp.right_joystick(
            x_value=gp._axis_state["right_joystick_x"],
            y_value=gp._axis_state["right_joystick_y"]
        )

    gp.update()


def gamepad_loop(shared: SharedState, stop_event: threading.Event, init_complete_event: threading.Event, update_hz: float = 60.0):
    """
    Main loop for running the gamepad emulator.

    Args:
        shared: SharedState instance containing controller inputs.
        stop_event: A threading.Event used to signal shutdown.
        update_hz: Update frequency in Hz.
    """
    import_blocker = get_vgamepad_import_blocker()
    if import_blocker:
        print(f"[Gamepad] Not starting gamepad loop: {import_blocker}")
        return

    profile = load_gamepad_profile("button_mapping.yaml")

    if not profile:
        print("[Gamepad] No valid profile loaded. Exiting gamepad loop.")
        return

    valid_modes = set(get_args(ControllerMode))
    mode = profile.get("mode")

    if mode not in valid_modes:
        print(f"[Gamepad] Invalid or unsupported mode in profile: {mode}. Valid options are: {valid_modes}")
        return

    if profile.get("mode") == "disabled":
        print(f"[Gamepad] Disabled")
        return

    controller = ControllerManager(shared_state=shared, profile=profile)

    interval = 1.0 / update_hz
    print("[Gamepad] Loop started. See/Edit button_mapping.yaml to configure Reality Glove outputs to keypresses.")
    init_complete_event.set()

    try:
        while not stop_event.is_set():
            controller.update()
            time.sleep(interval)
    except KeyboardInterrupt:
        print("[Gamepad] Loop interrupted.")
