"""
SharedState: A thread-safe container for storing and updating left/right hand tracking data.

This class wraps a dictionary of HandData objects behind a reentrant lock to safely share
mutable state across multiple threads (e.g., OSC input, emulation output, etc.).
"""

from copy import deepcopy
from queue import Empty, Queue
from threading import RLock
from typing import Dict, Optional, Tuple
from core.core_data_classes import HandData, SLIDER_NAMES
from core.config import HANDEDNESS


class SharedState:
    """
    Thread-safe access to left and right HandData instances using a reentrant lock.

    Used to synchronize read/write operations from multiple concurrent modules (e.g., OSC handlers,
    gamepad emulator, keyboard emulator).
    """

    def __init__(self):
        """
        Initializes the shared state with default HandData instances for left and right hands.
        """
        self._lock = RLock()
        self.hands: Dict[int, HandData] = {
            HANDEDNESS.LEFT: HandData(),
            HANDEDNESS.RIGHT: HandData()
        }
        self._mvn_out_capture_request: Optional[Tuple[str, str]] = None
        self._packet_counter: int = 0
        self._last_packet_key: str = ""
        self._last_packet_handedness: int = HANDEDNESS.UNKNOWN
        self._packet_events: Queue[Tuple[str, int]] = Queue()

    def get_hand(self, handedness: int) -> HandData:
        """
        Thread-safe retrieval of a hand's data.

        Args:
            handedness: Integer constant (e.g., HANDEDNESS.LEFT or HANDEDNESS.RIGHT)

        Returns:
            HandData instance corresponding to the given handedness.
        """
        with self._lock:
            return self.hands[handedness]

    def set_hand(self, handedness: int, data: HandData):
        """
        Thread-safe update of a hand's data.

        Args:
            handedness: Integer constant (e.g., HANDEDNESS.LEFT or HANDEDNESS.RIGHT)
            data: New HandData to assign.
        """
        with self._lock:
            self.hands[handedness] = data

    def copy(self) -> Dict[int, HandData]:
        """
        Creates a shallow copy of the current hand data dictionary.

        Returns:
            A dictionary mapping handedness to HandData (thread-safe snapshot).
        """
        with self._lock:
            return self.hands.copy()

    def snapshot(self) -> Dict[int, HandData]:
        """
        Creates a deep-copy snapshot safe for logging outside the lock.
        """
        with self._lock:
            return deepcopy(self.hands)

    def update_sliders_from_array(self, handedness: int, values) -> Dict[str, float]:
        """
        Atomically update a hand's slider dictionary from fixed-order slider array values.

        Args:
            handedness: Integer constant (e.g., HANDEDNESS.LEFT or HANDEDNESS.RIGHT)
            values: Ordered slider float values aligned with SLIDER_NAMES.

        Returns:
            A copy of the updated slider dictionary.
        """
        with self._lock:
            hand = self.hands[handedness]
            if len(hand.sliders) != len(SLIDER_NAMES):
                hand.sliders = {name: 0.0 for name in SLIDER_NAMES}
            for index, slider_name in enumerate(SLIDER_NAMES):
                hand.sliders[slider_name] = float(values[index])
            return dict(hand.sliders)

    def get_sliders_copy(self, handedness: int) -> Dict[str, float]:
        """
        Atomically read a copy of a hand's slider dictionary.
        """
        with self._lock:
            return dict(self.hands[handedness].sliders)

    def notify_packet(self, packet_key: str, handedness: int):
        """
        Marks that a new packet has been ingested.
        """
        with self._lock:
            self._packet_counter += 1
            self._last_packet_key = packet_key
            self._last_packet_handedness = handedness
        self._packet_events.put((packet_key, handedness))

    def get_packet_event_state(self) -> Tuple[int, str, int]:
        """
        Returns (packet_counter, packet_key, handedness).
        """
        with self._lock:
            return (
                self._packet_counter,
                self._last_packet_key,
                self._last_packet_handedness,
            )

    def get_next_packet_event(self, timeout_s: float | None = None) -> Optional[Tuple[str, int]]:
        """
        Blocks until a packet event is available or timeout expires.
        Returns (packet_key, handedness) or None on timeout.
        """
        try:
            return self._packet_events.get(timeout=timeout_s)
        except Empty:
            return None

    def request_mvn_out_capture(self, output_path: str, label: str):
        """
        Queue a one-shot MVN out capture request consumed by mvn_loop.
        """
        with self._lock:
            self._mvn_out_capture_request = (output_path, label)

    def consume_mvn_out_capture_request(self) -> Optional[Tuple[str, str]]:
        """
        Atomically consume and clear the pending MVN out capture request.
        """
        with self._lock:
            request = self._mvn_out_capture_request
            self._mvn_out_capture_request = None
            return request
