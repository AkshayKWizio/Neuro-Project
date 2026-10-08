"""
OSCManager: Handles incoming and outgoing OSC communication using the python-osc library.

- Receives OSC messages for controller input, orientation, kinematic data, and configuration commands.
- Sends OSC messages for haptics and application configuration.
- Uses AsyncIOOSCUDPServer for asynchronous input and SimpleUDPClient for outbound messages.
"""

import asyncio
from pythonosc.dispatcher import Dispatcher
from pythonosc.osc_server import AsyncIOOSCUDPServer
from pythonosc import udp_client

from core.core_data_classes import *
from core.osc_addresses import OSCKey, OSC_ADDRESSES
from core.shared_state import SharedState  # Thread-safe wrapper


class OSCSender:
    """
    Handles OSC input/output communication with support for customizable message dispatching and sending.

    Args:
        shared_state: A thread-safe object representing system-wide hand/controller state.
        input_ip: IP address to bind the OSC server to for incoming messages.
        input_port: Port to listen on for incoming OSC messages.
        output_ip: IP address to send OSC messages to.
        output_port: Port to send OSC messages to.
        debug_keys: Set of OSCKey entries to log when messages are received.
    """
    def __init__(self,
                 shared_state: SharedState,
                 input_ip="127.0.0.1", input_port=9002,
                 output_ip="127.0.0.1", output_port=9003,
                 debug_keys: set[OSCKey] = None):

        self.shared_state = shared_state
        self.input_ip = input_ip
        self.input_port = input_port
        self.output_ip = output_ip
        self.output_port = output_port
        self.debug_keys = debug_keys or set()
        self.running = False
        self._stop_event = asyncio.Event()
        self.loop = None  # Set during `start_and_run_forever`

        self.client = udp_client.SimpleUDPClient(output_ip, output_port)
        self.dispatcher = Dispatcher()
        self._setup_handlers()

    def _setup_handlers(self):
        """
        Registers OSC address handlers with the dispatcher.
        """
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.CONTROLLER], self._handle_controller_input)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.ORIENTATION], self._handle_orientation)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.KINEMATIC], self._handle_kinematic)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.TRACKER_OFFSET_CALIBRATION], self._handle_tracker_offset_calibration)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_OFFSET], self._handle_set_tracker_offset)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_SOURCE], self._handle_set_tracker_source)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.SET_TRACKER_LOCATION], self._handle_set_tracker_location)
        self.dispatcher.map(OSC_ADDRESSES[OSCKey.ENABLE_BUTTON_PASSTHROUGH], self._handle_enable_button_passthrough)
        self.dispatcher.set_default_handler(self._default_handler)

    async def start_and_run_forever(self):
        """
        Starts the async OSC server and blocks until stop is requested.
        """
        self.loop = asyncio.get_running_loop()
        self.server = AsyncIOOSCUDPServer((self.input_ip, self.input_port), self.dispatcher, self.loop)
        self.transport, _ = await self.server.create_serve_endpoint()
        print(f"[OSCManager] Listening on {self.input_ip}:{self.input_port}")
        self.running = True
        await self._stop_event.wait()
        print("[OSCManager] Stop event received. Cleaning up...")
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
                    print("[OSCManager] Warning: Could not set stop event (loop may already be closed)")

    def _debug(self, key: OSCKey, msg: str):
        """
        Prints debug message if key is in self.debug_keys.
        """
        if key in self.debug_keys:
            print(msg)

    # ──────────────────────────────────────────────────────────────
    # Handlers for Incoming OSC Messages
    # ──────────────────────────────────────────────────────────────

    def _handle_controller_input(self, addr, *args):
        """Handles controller input messages."""
        header = PacketHeader(*args[:5])
        inputs = ControllerInputs(*args[5:15])
        inputs.denoise()
        packet = ControllerPacket(header, inputs)
        hand = self.shared_state.get_hand(header.handedness)
        if hand.controller and hand.controller.inputs and inputs != hand.controller.inputs:
            self._debug(OSCKey.CONTROLLER, f"[Controller Input] {packet}")
        hand.controller = packet
        self.shared_state.set_hand(header.handedness, hand)

    def _handle_kinematic(self, addr, *args):
        """Handles kinematic pose updates."""
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
        self._debug(OSCKey.KINEMATIC, f"[Kinematic Input] {packet}")

    def _handle_orientation(self, addr, *args):
        """Handles IMU orientation and acceleration data."""
        header = PacketHeader(*args[:5])
        acc = Vector3(*args[5:8])
        ori = Quat(*args[8:12])
        packet = OrientationPacket(header=header, accelerometer=acc, orientation=ori)
        hand = self.shared_state.get_hand(header.handedness)
        hand.orientation = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.ORIENTATION, f"[Orientation Input] {packet}")

    def _handle_tracker_offset_calibration(self, addr, *args):
        """Handles tracker offset calibration toggle commands."""
        header = PacketHeader(*args[:5])
        packet = TrackerOffsetCalibrationPacket(header=header, pause_tracker=bool(args[5]))
        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_offset_calibration = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.TRACKER_OFFSET_CALIBRATION, f"[Tracker Offset Calibration Input] {packet}")

    def _handle_set_tracker_offset(self, addr, *args):
        """Handles manual setting of tracker offset position and orientation."""
        header = PacketHeader(*args[:5])
        pos = Vector3(*args[5:8])
        ori = Quat(*args[8:12])
        packet = SetTrackerOffsetPacket(header=header, offset_position=pos, offset_orientation=ori)
        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_offset = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.SET_TRACKER_OFFSET, f"[Set Tracker Offset Input] {packet}")

    def _handle_set_tracker_source(self, addr, *args):
        """Handles tracker source setting updates."""
        header = PacketHeader(*args[:5])
        packet = TrackerSourcePacket(header=header, tracker_source=int(args[5]))
        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_source = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.SET_TRACKER_SOURCE, f"[Set Tracker Source Input] {packet}")

    def _handle_set_tracker_location(self, addr, *args):
        """Handles tracker location string update."""
        header = PacketHeader(*args[:5])
        packet = TrackerLocationPacket(header=header, tracker_location=args[5])
        hand = self.shared_state.get_hand(header.handedness)
        hand.tracker_location = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.SET_TRACKER_LOCATION, f"[Set Tracker Location Input] {packet}")

    def _handle_enable_button_passthrough(self, addr, *args):
        """Handles enable/disable passthrough button feature."""
        header = PacketHeader(*args[:5])
        packet = ButtonPassthroughPacket(header=header, enable_passthrough=bool(args[5]))
        hand = self.shared_state.get_hand(header.handedness)
        hand.button_passthrough = packet
        self.shared_state.set_hand(header.handedness, hand)
        self._debug(OSCKey.ENABLE_BUTTON_PASSTHROUGH, f"[Enable Button Passthrough Input] {packet}")

    def _default_handler(self, addr, *args):
        """Default handler for unknown OSC addresses."""
        print(f"[Unhandled] {addr} {args}")

    # ──────────────────────────────────────────────────────────────
    # Output Methods
    # ──────────────────────────────────────────────────────────────

    def send_application_name(self, application_name: str):
        """
        Sends the application name string to the OSC receiver.
        """
        self.client.send_message(OSC_ADDRESSES[OSCKey.APPLICATION_NAME], application_name)

    def send_haptic(self, handedness: int, amplitude: int, frequency: float, duration_ms: float):
        """
        Sends a haptic effect command.

        Args:
            handedness: int, one of HANDEDNESS.LEFT or HANDEDNESS.RIGHT
            amplitude: 0–255
            frequency: Frequency in Hz (optional, may be ignored)
            duration_ms: Duration of haptic pulse in milliseconds
        """
        msg = [handedness, amplitude, frequency, duration_ms]
        if handedness in [HANDEDNESS.LEFT, HANDEDNESS.RIGHT]:
            self.client.send_message(OSC_ADDRESSES[OSCKey.HAPTICS], msg)
        else:
            for h in [HANDEDNESS.LEFT, HANDEDNESS.RIGHT]:
                self.client.send_message(OSC_ADDRESSES[OSCKey.HAPTICS], msg)

    def send_calibrated_tracker_offset(self, handedness: int, position_offset: tuple, orientation_offset: tuple):
        """
        Sends a calibrated tracker offset (position + orientation) to the OSC receiver.

        Args:
            handedness: int, one of HANDEDNESS.LEFT or HANDEDNESS.RIGHT
            position_offset: Tuple of 3 floats (x, y, z)
            orientation_offset: Tuple of 4 floats (x, y, z, w)
        """
        msg = [handedness, *position_offset, *orientation_offset]
        self.client.send_message(OSC_ADDRESSES[OSCKey.TRACKER_OFFSET_CALIBRATION], msg)
