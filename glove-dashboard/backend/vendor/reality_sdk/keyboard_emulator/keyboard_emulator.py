import threading
import time
import yaml
from dataclasses import dataclass, field
from typing import Optional, Literal, get_args
from pathlib import Path

from core.core_data_classes import ControllerPacket
from core.config import HANDEDNESS
from core.runtime_profiles import resolve_editable_profile
from core.shared_state import SharedState

from keyboard_emulator.key_press import KeyPress
from keyboard_emulator.key_wrapper import KeyWrapper
from keyboard_emulator.key_wrapper_hints import KeyWrapperHints
key: KeyWrapperHints = KeyWrapper  # For IDE hinting

# ──────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────
ControllerMode = Literal["left", "right", "merged_or", "merged_preferred", "independent", "disabled"]
CONTROLLER_MODES = list(get_args(ControllerMode))

# ──────────────────────────────────────────────────────────────
# Keyboard Manager
# ──────────────────────────────────────────────────────────────
@dataclass
class KeyboardManager:
    """
    Maps controller inputs to keyboard keypress functions based on a YAML mapping profile.

    This manager continuously monitors shared controller input data and translates
    analog/digital inputs into discrete keyboard key events. The translation is driven
    by a configurable YAML mapping that specifies what controller input fields map to
    which key combinations and under what threshold conditions.
    """
    shared_state: SharedState
    profile: dict[str, any]
    held_keys: set[str] = field(default_factory=set)

    def __post_init__(self):
        """Initializes the keyboard manager, validates the profile, and releases any pre-held keys."""
        requested_mode = self.profile.get("mode", "disabled")
        if requested_mode not in CONTROLLER_MODES:
            print(f"[KeyboardManager] Invalid mode: {requested_mode}. Defaulting to 'disabled'.")
            requested_mode = "disabled"

        self.mode: ControllerMode = requested_mode
        self.mapping: dict = self.profile

        # Initialize dynamic key functions and release any held keys
        KeyWrapper.initialize_key_functions()
        KeyPress.release_all()

        # Validate key names against KeyWrapper
        invalid_keys = []
        def collect_keys(mapping):
            for val in mapping.values():
                if isinstance(val, str):
                    yield val
                elif isinstance(val, dict):
                    yield val.get("key")

        for section in CONTROLLER_MODES:
            mapping = self.profile.get(section, {})
            if isinstance(mapping, dict):
                invalid_keys.extend([
                    key for key in collect_keys(mapping)
                    if key and not hasattr(KeyWrapper, key)
                ])

        if invalid_keys:
            print("[KeyboardManager] Warning: Invalid keys found in profile:")
            for key in set(invalid_keys):
                print(f"  - {key}")

    def resolve_inputs(self, left: Optional[ControllerPacket], right: Optional[ControllerPacket]) -> set[str]:
        """
        Resolves all active keys based on current controller state and YAML mapping.

        Args:
            left (Optional[ControllerPacket]): Left-hand controller data.
            right (Optional[ControllerPacket]): Right-hand controller data.

        Returns:
            set[str]: A set of function names (e.g., "hold_up", "hold_ctrl_a") that represent
                      keys that should be active.
        """
        result: set[str] = set()

        def resolve_source(source: Optional[ControllerPacket], mapping: dict) -> set[str]:
            keys = set()
            for field, target in mapping.items():
                threshold = 0.5
                real_field = field
                if "_negative" in field:
                    threshold = -0.5
                    real_field = field.replace("_negative", "")
                elif "_positive" in field:
                    threshold = 0.5
                    real_field = field.replace("_positive", "")
                elif isinstance(target, dict) and "threshold" in target:
                    threshold = target["threshold"]

                val = getattr(source.inputs, real_field, 0) if source else 0
                key_name = target if isinstance(target, str) else target.get("key")

                if key_name and (
                    (threshold > 0 and val > threshold) or
                    (threshold < 0 and val < threshold) or
                    (threshold == 0 and val != 0)
                ):
                    keys.add(key_name)
            return keys

        if self.mode in ("left", "right"):
            src = left if self.mode == "left" else right
            result = resolve_source(src, self.mapping.get(self.mode, {}))

        elif self.mode == "merged_or":
            result = resolve_source(left, self.mapping.get("merged_or", {})) | \
                     resolve_source(right, self.mapping.get("merged_or", {}))

        elif self.mode == "merged_preferred":
            for field, cfg in self.mapping.get("merged_preferred", {}).items():
                src = left if cfg.get("source") == "left" else right
                real_field = field
                threshold = cfg.get("threshold", 0.5)
                if "_negative" in field:
                    threshold = -abs(threshold)
                    real_field = field.replace("_negative", "")
                elif "_positive" in field:
                    threshold = abs(threshold)
                    real_field = field.replace("_positive", "")
                val = getattr(src.inputs, real_field, 0) if src else 0
                key_name = cfg.get("key")
                if key_name and (
                    (threshold > 0 and val > threshold) or
                    (threshold < 0 and val < threshold) or
                    (threshold == 0 and val != 0)
                ):
                    result.add(key_name)

        return result

    def update(self):
        """
        Updates the keyboard state based on active controller input.

        This method holds newly active keys and releases previously held keys that
        are no longer triggered by controller inputs.
        """
        if self.mode == "disabled":
            return

        left = self.shared_state.get_hand(HANDEDNESS.LEFT)
        right = self.shared_state.get_hand(HANDEDNESS.RIGHT)
        active_keys = self.resolve_inputs(left.controller, right.controller)

        for hold_fn_name in self.held_keys - active_keys:
            if hold_fn_name.startswith("hold_"):
                base = hold_fn_name.replace("hold_", "", 1)
                release_fn = getattr(KeyWrapper, f"release_{base}", None)
                if release_fn:
                    release_fn()

        for hold_fn_name in active_keys - self.held_keys:
            hold_fn = getattr(KeyWrapper, hold_fn_name, None)
            if hold_fn:
                hold_fn()

        self.held_keys = active_keys

# ──────────────────────────────────────────────────────────────
# YAML Loader
# ──────────────────────────────────────────────────────────────
def load_keyboard_profile(path: str) -> Optional[dict]:
    """
    Loads keyboard YAML configuration from disk.

    Args:
        path (str): Relative path to the YAML configuration file.

    Returns:
        Optional[dict]: Parsed YAML configuration or None on failure.
    """
    default_path = Path(__file__).parent / path
    resolved_path = resolve_editable_profile(default_path, path, "Keyboard")
    if resolved_path is None:
        print(f"[Keyboard] Profile not found: {default_path}")
        return None
    try:
        with open(resolved_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"[Keyboard] Failed to load profile: {e}")
        return None

# ──────────────────────────────────────────────────────────────
# Main Loop
# ──────────────────────────────────────────────────────────────
def keyboard_loop(shared: SharedState, stop_event: threading.Event, init_complete_event: threading.Event, update_hz: float = 60.0):
    """
    Starts the keyboard emulation loop using the provided profile and shared state.

    This loop continuously evaluates controller inputs and maps them to keyboard
    events. It runs until the provided `stop_event` is set.

    Args:
        shared (SharedState): Shared state containing controller input.
        stop_event (threading.Event): Event that signals loop termination.
        init_complete_event (threading.Event): Event to set once initialization is done.
        update_hz (float): Frequency in Hz to update keyboard state (default 60Hz).
    """
    profile = load_keyboard_profile("keyboard_mapping.yaml")

    if not profile or profile.get("mode") == "disabled":
        print("[Keyboard] Disabled or no profile.")
        return

    manager = KeyboardManager(shared_state=shared, profile=profile)

    interval = 1.0 / update_hz
    print("[Keyboard] Loop started. See/Edit keyboard_mapping.yaml to configure Reality Glove outputs to keypresses.")
    init_complete_event.set()

    try:
        while not stop_event.is_set():
            manager.update()
            time.sleep(interval)
    except KeyboardInterrupt:
        print("[Keyboard] Interrupted.")
