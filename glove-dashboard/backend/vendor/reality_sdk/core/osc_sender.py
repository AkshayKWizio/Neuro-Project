"""
OscSender: Threaded, queued OSC sender (python-osc SimpleUDPClient).

- Owns an internal queue and worker thread for outbound messages.
- Public "send_*" methods enqueue work; the worker does the actual socket send.
- Thread-safe; callers can invoke from any thread.
"""

import threading
import queue
from dataclasses import dataclass
import time
from typing import Sequence

from pythonosc import udp_client
from core.osc_addresses import OSCKey, OSC_ADDRESSES
from core.core_data_classes import HANDEDNESS


@dataclass(frozen=True)
class _OutboundMsg:
    address: str
    args: Sequence


class OSCSender:
    def __init__(self, output_ip: str = "127.0.0.1", output_port: int = 9003, queue_size: int = 4096):
        self.output_ip = output_ip
        self.output_port = output_port
        self.client = udp_client.SimpleUDPClient(output_ip, output_port)

        self._q: queue.Queue[_OutboundMsg] = queue.Queue(maxsize=queue_size)
        self._stop = threading.Event()
        self._closing = threading.Event()
        self._worker: threading.Thread | None = None

    # ───────────────────────── Lifecycle ─────────────────────────
    def start(self):
        if self._worker and self._worker.is_alive():
            return
        self._stop.clear()
        self._closing.clear()
        self._worker = threading.Thread(target=self._run, name="OscSenderWorker", daemon=True)
        self._worker.start()
        print(f"[OscSender] Started worker -> {self.output_ip}:{self.output_port}")

    def stop(self, drain: bool = True, timeout: float = 2.0):
        self._closing.set()          # stop accepting new messages
        if drain:
            # Give the worker time to drain the queue
            t_end = time.time() + timeout
            while not self._q.empty() and time.time() < t_end:
                time.sleep(0.01)
        self._stop.set()
        if self._worker:
            self._worker.join(timeout=2.0)
            self._worker = None
        # No explicit socket close needed for python-osc client.

    def _run(self):
        while True:
            # Exit only when stop is set AND the queue is empty (drain behavior)
            if self._stop.is_set() and self._q.empty():
                break
            try:
                msg = self._q.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                self.client.send_message(msg.address, msg.args)
            except Exception as e:
                print(f"[OscSender] Send error on {msg.address}: {e}")

    def _enqueue(self, address: str, args: Sequence):
        if self._closing.is_set():
            return
        try:
            self._q.put_nowait(_OutboundMsg(address, args))
        except queue.Full:
            print("[OscSender] WARNING: outbound queue full - dropping message")

    def _send_for_hands(self, address_key, handedness, make_args):
        """
        Helper: expands Unknown/Both into per-hand messages.
        make_args(hand:int) -> list/tuple of args.
        """
        addr = OSC_ADDRESSES[address_key]
        if handedness in (HANDEDNESS.LEFT, HANDEDNESS.RIGHT):
            self._enqueue(addr, make_args(handedness))
        else:
            # Treat BOTH and UNKNOWN as "send to both"
            for h in (HANDEDNESS.LEFT, HANDEDNESS.RIGHT):
                self._enqueue(addr, make_args(h))


    # ───────────────────────── Public API (moved from OSCManager) ─────────────────────────
    def send_application_name(self, application_name: str):
        self._enqueue(OSC_ADDRESSES[OSCKey.APPLICATION_NAME], application_name)

    def send_haptic(self, handedness: int, amplitude: int, frequency: float, duration_ms: float):
        msg = [handedness, amplitude, frequency, duration_ms]
        if handedness in [HANDEDNESS.LEFT, HANDEDNESS.RIGHT]:
            self._enqueue(OSC_ADDRESSES[OSCKey.HAPTICS], msg)
        else:
            for h in [HANDEDNESS.LEFT, HANDEDNESS.RIGHT]:
                self._enqueue(OSC_ADDRESSES[OSCKey.HAPTICS], [h, amplitude, frequency, duration_ms])

    def send_calibrated_tracker_offset(self, handedness: int, position_offset: tuple, orientation_offset: tuple):
        msg = [handedness, *position_offset, *orientation_offset]
        self._enqueue(OSC_ADDRESSES[OSCKey.TRACKER_OFFSET_CALIBRATION], msg)

    def send_set_tracker_offset(self, handedness: int, position_offset: tuple, orientation_offset: tuple):
        msg = [handedness, *position_offset, *orientation_offset]
        self._enqueue(OSC_ADDRESSES[OSCKey.SET_TRACKER_OFFSET], msg)

    def send_set_tracker_source(self, handedness: int, source: int):
        msg = [handedness, source]
        self._enqueue(OSC_ADDRESSES[OSCKey.SET_TRACKER_SOURCE], msg)

    def send_set_tracker_location(self, handedness: int, location: str):
        msg = [handedness, location]
        self._enqueue(OSC_ADDRESSES[OSCKey.SET_TRACKER_LOCATION], msg)

    def send_enable_button_passthrough(self, handedness: int, enable: bool):
        msg = [handedness, bool(enable)]
        self._enqueue(OSC_ADDRESSES[OSCKey.ENABLE_BUTTON_PASSTHROUGH], msg)

    def send_tracker_offset_calibration(self, handedness: int, pause: bool):
        # Mirrors the receiver's TRACKER_OFFSET_CALIBRATION input, but from the sender side
        msg = [handedness, bool(pause)]
        self._enqueue(OSC_ADDRESSES[OSCKey.TRACKER_OFFSET_CALIBRATION], msg)


    def send_calib_gesture_add(self, handedness: int, mapping: int):
        # args: int handedness, int mapping
        self._send_for_hands(OSCKey.CALIB_GESTURE_ADD, handedness,
                            lambda h: [h, int(mapping)])

    def send_calib_gesture_delete(self, handedness: int, mapping: int):
        self._send_for_hands(OSCKey.CALIB_GESTURE_DELETE, handedness,
                            lambda h: [h, int(mapping)])

    def send_calib_articulation_add(self, handedness: int, label: str):
        # args: int handedness, string label
        self._send_for_hands(OSCKey.CALIB_ARTICULATION_ADD, handedness,
                            lambda h: [h, str(label)])

    def send_calib_articulation_delete(self, handedness: int, label: str):
        self._send_for_hands(OSCKey.CALIB_ARTICULATION_DELETE, handedness,
                            lambda h: [h, str(label)])

    # Not yet supported by receiver, harmless to send
    def send_calib_joystick_add(self, handedness: int, path: int):
        self._send_for_hands(OSCKey.CALIB_JOYSTICK_ADD, handedness,
                            lambda h: [h, int(path)])

    def send_calib_joystick_delete(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_JOYSTICK_DELETE, handedness,
                            lambda h: [h])

    def send_calib_dpad_add(self, handedness: int, direction: int):
        self._send_for_hands(OSCKey.CALIB_DPAD_ADD, handedness,
                            lambda h: [h, int(direction)])

    def send_calib_dpad_delete(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_DPAD_DELETE, handedness,
                            lambda h: [h])

    # IMU calibration commands
    def send_calib_imu_tare(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_IMU_TARE, handedness,
                            lambda h: [h])

    def send_calib_imu_tare_delete(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_IMU_TARE_DELETE, handedness,
                            lambda h: [h])

    def send_calib_gyroscope_add(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_GYROSCOPE_ADD, handedness,
                            lambda h: [h])

    def send_calib_gyroscope_delete(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_GYROSCOPE_DELETE, handedness,
                            lambda h: [h])

    def send_calib_accelerometer_add(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_ACCELEROMETER_ADD, handedness,
                            lambda h: [h])

    def send_calib_accelerometer_delete(self, handedness: int):
        self._send_for_hands(OSCKey.CALIB_ACCELEROMETER_DELETE, handedness,
                            lambda h: [h])
