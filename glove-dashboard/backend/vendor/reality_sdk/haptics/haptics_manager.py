"""
Haptics Handler Module

This module runs a thread at ~60Hz that sends OSC haptic commands
on keypress triggers ('l' for left hand, 'r' for right hand).
"""

import threading
import time
import keyboard

from dataclasses import dataclass
from typing import Literal, get_args, Optional
from pathlib import Path

from core.config import HANDEDNESS
from core.runtime_profiles import resolve_editable_profile
from core.shared_state import SharedState
from core.osc_sender import OSCSender


# ──────────────────────────────────────────────────────────────
# Haptics Constants
# ──────────────────────────────────────────────────────────────

HapticsMode = Literal["left", "right", "left_right", "disabled"]
VALID_HAPTICS_MODES = get_args(HapticsMode)


# ──────────────────────────────────────────────────────────────
# Haptics Manager Class
# ──────────────────────────────────────────────────────────────

@dataclass
class HapticsManager:
    shared_state: SharedState
    profile: dict
    osc_sender: OSCSender

    def __post_init__(self):
        requested_mode = self.profile.get("mode", "disabled")

        if requested_mode not in VALID_HAPTICS_MODES:
            print(f"[HapticsManager] Invalid mode: {requested_mode}. Valid options: {VALID_HAPTICS_MODES}")
            requested_mode = "disabled"
        self.mode: HapticsMode = requested_mode

        self.send_mode = self.profile.get("send_mode", "continuous")
        if self.send_mode not in {"oneshot", "continuous"}:
            print(f"[HapticsManager] Invalid send_mode: {self.send_mode}. Defaulting to 'continuous'.")
            self.send_mode = "continuous"

        # Set default keys
        triggers = self.profile.get("triggers", {})
        self.left_key = triggers.get("left", "l")
        self.right_key = triggers.get("right", "r")

        self.pending_haptic_effects: dict[str, tuple[int, float, float]] = {}  # keyed by handedness
        self.lock = threading.Lock()

    def queue_haptic_effect(self, handedness: int, amplitude: int = 255, frequency: float = 1.0, duration_ms: float = 500.0):
        """
        Queues a haptic effect for the specified hand. If a haptic effect is already queued for that hand, the new effect will be discarded

        Args:
            handedness: "left" or "right"
            amplitude: 0–255
            frequency: Hz (NOT IN USE: This value is required but does not affect the haptic effect)
            duration_ms: duration in milliseconds
        """
        amp = max(0, min(amplitude, 255))
        with self.lock:
            if self.mode == "disabled":
                return
            if self.mode == "left_right" or handedness == self.mode:
                if handedness not in self.pending_haptic_effects:
                    self.pending_haptic_effects[handedness] = (amp, frequency, duration_ms)


    def _consume_pulses(self) -> list[tuple[str, int, float, float]]:
        """
        Consumes and clears all currently queued haptic effects.

        Returns:
            A list of (handedness, amplitude, frequency, duration_ms) tuples.
        """
        with self.lock:
            pulses = [
                (handedness, *effect)
                for handedness, effect in self.pending_haptic_effects.items()
            ]
            self.pending_haptic_effects.clear()
        return pulses


    def update(self):
        """
        Sends all queued haptic effects via the OSC sender.
        """
        if self.mode == "disabled":
            return

        for handedness, amplitude, frequency, duration_ms in self._consume_pulses():
            self.osc_sender.send_haptic(
                handedness=handedness,
                amplitude=amplitude,
                frequency=frequency,
                duration_ms=duration_ms
            )


# ──────────────────────────────────────────────────────────────
# Haptics Loop
# ──────────────────────────────────────────────────────────────

def haptics_loop(shared: SharedState, osc_sender: OSCSender, stop_event: threading.Event, init_complete_event: threading.Event, update_hz: float = 60.0):
    """
    Main loop for sending haptic commands on keypress triggers.

    Args:
        shared: Shared state container.
        osc_manager: Reference to OSC manager with send_haptics method.
        stop_event: Threading event to terminate the loop.
        update_hz: Loop frequency.
    """
    import yaml

    default_profile_path = Path(__file__).parent / "haptics_profile.yaml"
    profile_path = resolve_editable_profile(default_profile_path, "haptics_profile.yaml", "Haptics")
    if profile_path is None:
        print(f"[Haptics] Profile not found: {default_profile_path}")
        return

    try:
        with open(profile_path, "r", encoding="utf-8") as f:
            profile = yaml.safe_load(f)
    except Exception as e:
        print(f"[Haptics] Failed to load profile: {e}")
        return

    if profile.get("mode") == "disabled":
        print("[Haptics] Mode is disabled.")
        return

    manager = HapticsManager(shared_state=shared, profile=profile, osc_sender=osc_sender)
    interval = 1.0 / update_hz

    print("[Haptics] Loop started. Press \"l\" key for left haptic, \"r\" key for right haptic.")
    init_complete_event.set()

    # Read in haptics trigger configuration from yaml or use default values if not specified
    oneshot = profile.get("send_mode", "continuous") == "oneshot"
    left_key = profile.get("triggers", {}).get("left", "l")
    right_key = profile.get("triggers", {}).get("right", "r")
    prev_keys = {left_key: False, right_key: False}

    try:
        while not stop_event.is_set():
            l_down = keyboard.is_pressed(left_key)
            r_down = keyboard.is_pressed(right_key)

            if oneshot: # Only fire once per key press
                if l_down and not prev_keys[left_key]:
                    manager.queue_haptic_effect(handedness=HANDEDNESS.LEFT, amplitude=255, frequency=1.0, duration_ms=500.0)
                if r_down and not prev_keys[right_key]:
                    manager.queue_haptic_effect(handedness=HANDEDNESS.RIGHT, amplitude=255, frequency=1.0, duration_ms=500.0)
            else:   # Fire haptics event once per frame while trigger key is down
                if l_down:
                    manager.queue_haptic_effect(handedness=HANDEDNESS.LEFT, amplitude=255, frequency=1.0, duration_ms=500.0)
                if r_down:
                    manager.queue_haptic_effect(handedness=HANDEDNESS.RIGHT, amplitude=255, frequency=1.0, duration_ms=500.0)

            prev_keys[left_key] = l_down
            prev_keys[right_key] = r_down

            manager.update()
            time.sleep(interval)
    except KeyboardInterrupt:
        print("[Haptics] Interrupted.")
    
        # while not stop_event.is_set():
        #     if keyboard.is_pressed("l"):
        #         manager.queue_haptic_effect(handedness=HANDEDNESS.LEFT, amplitude=255, frequency=0, duration_ms=500.0)
        #     if keyboard.is_pressed("r"):
        #         manager.queue_haptic_effect(handedness=HANDEDNESS.RIGHT, amplitude=255, frequency=0, duration_ms=500.0)

        #     manager.update()
        #     time.sleep(interval)

