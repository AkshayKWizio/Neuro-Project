"""
OscReceiver: AsyncIO-based OSC UDP server using python-osc.

- Owns the Dispatcher and all inbound handlers (moved from OSCManager).
- Updates SharedState.
"""

import asyncio
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import AsyncIOOSCUDPServer

from core.core_data_classes import *
from core.osc_addresses import OSCKey, OSC_ADDRESSES
from core.shared_state import SharedState


class OSCReceiver:
    def __init__(
        self,
        shared_state: SharedState,
        input_ip: str = "127.0.0.1",
        input_port: int = 9002,
        debug_keys: set[OSCKey] | None = None,
    ):
        self.shared_state = shared_state
        self.input_ip = input_ip
        self.input_port = input_port
        self.debug_keys = debug_keys or set()

        self._stop_event = asyncio.Event()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.transport = None
        self.server = None

        self.dispatcher = Dispatcher()
        self._setup_handlers()

    # ───────────────────────── Handlers setup ─────────────────────────
    def _setup_handlers(self):
        d = self.dispatcher
        d.map(OSC_ADDRESSES[OSCKey.CONTROLLER], self._handle_controller_input)
        d.map(OSC_ADDRESSES[OSCKey.ORIENTATION], self._handle_orientation)
        d.map(OSC_ADDRESSES[OSCKey.KINEMATIC], self._handle_kinematic)
        d.map(OSC_ADDRESSES[OSCKey.SLIDERS], self._handle_sliders)
        d.map(OSC_ADDRESSES[OSCKey.TIPS], self._handle_tips)
        d.map(OSC_ADDRESSES[OSCKey.CALIB_GESTURE_STATE], self._handle_calibration_gesture_state)
        d.map(OSC_ADDRESSES[OSCKey.CALIB_ARTICULATION_STATE], self._handle_calibration_articulation_state)
        d.map(OSC_ADDRESSES[OSCKey.TRACKER_OFFSET_CALIBRATION], self._handle_tracker_offset_calibration)
        d.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_OFFSET], self._handle_set_tracker_offset)
        d.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_SOURCE], self._handle_set_tracker_source)
        d.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_LOCATION], self._handle_set_tracker_location)
        d.map(OSC_ADDRESSES[OSCKey.ENABLE_BUTTON_PASSTHROUGH], self._handle_enable_button_passthrough)
        d.set_default_handler(self._default_handler)

    def _debug(self, key: OSCKey, msg: str):
        if key in self.debug_keys:
            print(msg)

    # ───────────────────────── Lifecycle ─────────────────────────
    async def start_and_run_forever(self):
        """
        Starts the async OSC server and blocks until stop is requested.
        """
        self.loop = asyncio.get_running_loop()
        self.server = AsyncIOOSCUDPServer((self.input_ip, self.input_port), self.dispatcher, self.loop)
        self.transport, _ = await self.server.create_serve_endpoint()
        print(f"[OscReceiver] Listening on {self.input_ip}:{self.input_port}")
        await self._stop_event.wait()
        print("[OscReceiver] Stop event received. Cleaning up...")
        if self.transport:
            self.transport.close()

    def stop(self):
        """
        Thread-safe shutdown trigger for the OSC loop.
        """
        if self.loop and not self._stop_event.is_set():
            if self.loop.is_running():
                self.loop.call_soon_threadsafe(self._stop_event.set)
            else:
                try:
                    self._stop_event.set()
                except RuntimeError:
                    pass

    # ───────────────────────── Inbound handlers ─────────────────────────
    def _handle_controller_input(self, addr, *args):
        header = PacketHeader(*args[:5])
        inputs = ControllerInputs(*args[5:15])
        inputs.denoise()
        packet = ControllerPacket(header, inputs)

        hand = self.shared_state.get_hand(header.handedness)
        if hand.controller and hand.controller.inputs and inputs != hand.controller.inputs:
            self._debug(OSCKey.CONTROLLER, f"[Controller Input] {packet}")
        hand.controller = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.CONTROLLER, header.handedness)

    def _handle_kinematic(self, addr, *args):
        header = PacketHeader(*args[:5])
        payload = args[5:]
        joints = []
        for i in range(len(payload) // 7):
            pos = Vector3(*payload[i*7:i*7+3])
            ori = Quat(*payload[i*7+3:i*7+7])
            name = JOINT_NAMES[i] if i < len(JOINT_NAMES) else f"Joint_{i}"
            joints.append(Joint(name, pos, ori))
        packet = KinematicPacket(header=header, joints=joints)

        hand = self.shared_state.get_hand(header.handedness)
        hand.kinematic = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.KINEMATIC, header.handedness)
        self._debug(OSCKey.KINEMATIC, f"[Kinematic Input] {packet}")

    def _handle_orientation(self, addr, *args):
        header = PacketHeader(*args[:5])
        acc = Vector3(*args[5:8])
        ori = Quat(*args[8:12])
        packet = OrientationPacket(header=header, accelerometer=acc, orientation=ori)

        hand = self.shared_state.get_hand(header.handedness)
        hand.orientation = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.ORIENTATION, header.handedness)
        self._debug(OSCKey.ORIENTATION, f"[Orientation Input] {packet}")

    def _handle_sliders(self, addr, *args):
        header = PacketHeader(*args[:5])
        payload = args[5:]
        expected_slider_count = len(SLIDER_NAMES)
        if len(payload) < expected_slider_count:
            print(
                f"[Sliders Input] Expected {expected_slider_count} values, received {len(payload)}; packet ignored."
            )
            return
        if len(payload) > expected_slider_count:
            print(
                f"[Sliders Input] Expected {expected_slider_count} values, received {len(payload)}; extra values ignored."
            )

        slider_values = [float(payload[index]) for index in range(expected_slider_count)]
        sliders_by_name = self.shared_state.update_sliders_from_array(
            header.handedness,
            slider_values,
        )
        self.shared_state.notify_packet(OSCKey.SLIDERS, header.handedness)
        if OSCKey.SLIDERS in self.debug_keys:
            packet = SliderPacket(
                header=header,
                values=slider_values,
                sliders=sliders_by_name,
            )
            self._debug(OSCKey.SLIDERS, f"[Sliders Input] {packet}")

    def _handle_tips(self, addr, *args):
        pass

    def _handle_calibration_gesture_state(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = CalibrationGestureStatePacket(header=header, gesture=args[5], status=args[6], progress=args[7])
        hand = self.shared_state.get_hand(header.handedness)
        hand.gesture_state = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.CALIB_GESTURE_STATE, header.handedness)
        self._debug(OSCKey.CALIB_GESTURE_STATE, f"[Calibration Gesture State Input] {packet}")

    def _handle_calibration_articulation_state(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = CalibrationArticulationStatePacket(header=header, label=args[5], status=args[6], progress=args[7])
        hand = self.shared_state.get_hand(header.handedness)
        hand.articulation_state = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.CALIB_ARTICULATION_STATE, header.handedness)
        self._debug(OSCKey.CALIB_ARTICULATION_STATE, f"[Calibration Articulation State Input] {packet}")

    def _handle_tracker_offset_calibration(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = TrackerOffsetCalibrationPacket(header=header, pause_tracker=bool(args[5]))

        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_offset_calibration = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.TRACKER_OFFSET_CALIBRATION, header.handedness)
        self._debug(OSCKey.TRACKER_OFFSET_CALIBRATION, f"[Tracker Offset Calibration Input] {packet}")

    def _handle_set_tracker_offset(self, addr, *args):
        header = PacketHeader(*args[:5])
        pos = Vector3(*args[5:8])
        ori = Quat(*args[8:12])
        packet = SetTrackerOffsetPacket(header=header, offset_position=pos, offset_orientation=ori)

        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_offset = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.SET_TRACKER_OFFSET, header.handedness)
        self._debug(OSCKey.SET_TRACKER_OFFSET, f"[Set Tracker Offset Input] {packet}")

    def _handle_set_tracker_source(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = TrackerSourcePacket(header=header, tracker_source=int(args[5]))

        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_source = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.SET_TRACKER_SOURCE, header.handedness)
        self._debug(OSCKey.SET_TRACKER_SOURCE, f"[Set Tracker Source Input] {packet}")

    def _handle_set_tracker_location(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = TrackerLocationPacket(header=header, tracker_location=args[5])

        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_location = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.SET_TRACKER_LOCATION, header.handedness)
        self._debug(OSCKey.SET_TRACKER_LOCATION, f"[Set Tracker Location Input] {packet}")

    def _handle_enable_button_passthrough(self, addr, *args):
        header = PacketHeader(*args[:5])
        packet = ButtonPassthroughPacket(header=header, enable_passthrough=bool(args[5]))

        hand = self.shared_state.get_hand(header.handedness)
        hand.button_passthrough = packet
        self.shared_state.set_hand(header.handedness, hand)
        self.shared_state.notify_packet(OSCKey.ENABLE_BUTTON_PASSTHROUGH, header.handedness)
        self._debug(OSCKey.ENABLE_BUTTON_PASSTHROUGH, f"[Enable Button Passthrough Input] {packet}")

    def _default_handler(self, addr, *args):
        print(f"[Unhandled] {addr} {args}")
