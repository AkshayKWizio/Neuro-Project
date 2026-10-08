"""
Core Data Classes for Reality OSC Bridge

Defines structured data containers for all OSC input packet types and internal
representations of hand tracking state, including controller input, orientation,
kinematics, and tracker configuration data.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.config import *


# =========[ Core Types ]=========

@dataclass
class PacketHeader:
    """Metadata header attached to all incoming OSC messages."""
    time: float
    profile_id: str
    handedness: int
    serial: str
    glove_type: str

    def __call__(self) -> tuple:
        return (self.time, self.profile_id, self.handedness, self.serial, self.glove_type)


# =========[ Vector Types ]=========

@dataclass
class Vector3:
    """3D vector representing position or acceleration."""
    x: float
    y: float
    z: float

    def __call__(self) -> tuple:
        return (self.x, self.y, self.z)

@dataclass
class Quat:
    """Quaternion representing orientation."""
    x: float
    y: float
    z: float
    w: float

    def __call__(self) -> tuple:
        return (self.x, self.y, self.z, self.w)


# =========[ Controller Packet ]=========

@dataclass
class ControllerInputs:
    """Raw controller input fields from the glove."""
    idle: int
    grab_pressed: int
    grab_value: float
    button1: int
    button2: int
    trigger_pressed: int
    trigger_value: float
    menu_pressed: int
    joystick_x: float
    joystick_y: float

    def __call__(self) -> tuple:
        return (
            self.idle, self.grab_pressed, self.grab_value,
            self.button1, self.button2,
            self.trigger_pressed, self.trigger_value,
            self.menu_pressed, self.joystick_x, self.joystick_y
        )

    def denoise(self, threshold: float = FLOAT_DENOISE_THRESHOLD):
        """Zeroes out small float values below a threshold to reduce jitter."""
        for field in self.__dataclass_fields__:
            val = getattr(self, field)
            if isinstance(val, float) and abs(val) < threshold:
                setattr(self, field, 0.0)

@dataclass
class ControllerPacket:
    """Controller input packet including header and raw inputs."""
    header: PacketHeader
    inputs: ControllerInputs

    def __call__(self) -> tuple:
        return self.header() + self.inputs()


# =========[ Orientation Packet ]=========

@dataclass
class OrientationPacket:
    """Packet containing IMU orientation and acceleration data."""
    header: PacketHeader
    accelerometer: Vector3
    orientation: Quat

    def __call__(self) -> tuple:
        return self.header() + self.accelerometer() + self.orientation()


# =========[ Calibration State Packets ]=========

@dataclass
class CalibrationGestureStatePacket:
    """Packet indicating the current calibration gesture state."""
    header: PacketHeader
    gesture: int
    status: int
    progress: float

    def __call__(self) -> tuple:
        return self.header() + (self.gesture, self.status, self.progress)

@dataclass
class CalibrationArticulationStatePacket:
    """Packet indicating the current calibration articulation state."""
    header: PacketHeader
    label: str
    status: int
    progress: float

    def __call__(self) -> tuple:
        return self.header() + (self.label, self.status, self.progress)


# =========[ Kinematic Packet ]=========

@dataclass
class Joint:
    """Single skeletal joint with position and orientation."""
    name: str
    position: Vector3
    orientation: Quat

    def __call__(self) -> tuple:
        return (self.name,) + self.position() + self.orientation()

@dataclass
class Slider:
    """Single slider value."""
    name: str
    value: float

    def __call__(self) -> tuple:
        return (self.name, self.value)
    
@dataclass
class SliderNamespace:
    """Lookup container for all sliders by name."""
    sliders: dict[str, Slider] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Slider:
        if key in self.sliders:
            return self.sliders[key]
        raise KeyError(f"Slider '{key}' not found.")

    def get(self, key: str) -> Optional[Slider]:
        return self.sliders.get(key)

@dataclass
class JointNamespace:
    """Lookup container for all joints by name."""
    palm: Optional[Joint] = None
    hand: Optional[Joint] = None

    thumb_cmc: Optional[Joint] = None
    thumb_mcp: Optional[Joint] = None
    thumb_dip: Optional[Joint] = None
    thumb_tip: Optional[Joint] = None

    index_cmc: Optional[Joint] = None
    index_mcp: Optional[Joint] = None
    index_pip: Optional[Joint] = None
    index_dip: Optional[Joint] = None
    index_tip: Optional[Joint] = None

    middle_cmc: Optional[Joint] = None
    middle_mcp: Optional[Joint] = None
    middle_pip: Optional[Joint] = None
    middle_dip: Optional[Joint] = None
    middle_tip: Optional[Joint] = None

    ring_cmc: Optional[Joint] = None
    ring_mcp: Optional[Joint] = None
    ring_pip: Optional[Joint] = None
    ring_dip: Optional[Joint] = None
    ring_tip: Optional[Joint] = None

    pinky_cmc: Optional[Joint] = None
    pinky_mcp: Optional[Joint] = None
    pinky_pip: Optional[Joint] = None
    pinky_dip: Optional[Joint] = None
    pinky_tip: Optional[Joint] = None

    def __init__(self, joints: List[Joint]):
        for joint in joints:
            if hasattr(self, joint.name):
                setattr(self, joint.name, joint)
            else:
                print(f"[JointNamespace] Warning: Unrecognized joint name '{joint.name}'")

    def __getitem__(self, key: str) -> Joint:
        if hasattr(self, key):
            value = getattr(self, key)
            if value is not None:
                return value
        raise KeyError(f"Joint '{key}' not found.")

    def get(self, key: str) -> Optional[Joint]:
        return getattr(self, key, None)

@dataclass
class KinematicPacket:
    """Full hand kinematics: list of joints and mapped namespace."""
    header: PacketHeader
    joints: List[Joint]
    joint: JointNamespace = field(init=False)

    def __post_init__(self):
        self.joint = JointNamespace(self.joints)

    def __call__(self) -> tuple:
        return self.header() + tuple(val for joint in self.joints for val in joint())

@dataclass
class SliderPacket:
    """Full hand slider values (fixed-order array + name-keyed lookup)."""
    header: PacketHeader
    values: List[float]
    sliders: Dict[str, float]

    def __call__(self) -> tuple:
        return self.header() + tuple(self.values)


SLIDER_NAMES: List[str] = [
    "THUMBBEND1",
    "THUMBBEND2",
    "THUMBBEND3",
    "THUMBSPLAY",
    "INDEXBEND1",
    "INDEXBEND2",
    "INDEXBEND3",
    "INDEXSPLAY",
    "INDEXTWIST",
    "MIDDLEBEND1",
    "MIDDLEBEND2",
    "MIDDLEBEND3",
    "MIDDLESPLAY",
    "MIDDLETWIST",
    "RINGBEND1",
    "RINGBEND2",
    "RINGBEND3",
    "RINGSPLAY",
    "RINGTWIST",
    "PINKYBEND1",
    "PINKYBEND2",
    "PINKYBEND3",
    "PINKYSPLAY",
    "PINKYTWIST",
    "GLOBALSPLAY",
]


def _default_slider_values() -> Dict[str, float]:
    return {name: 0.0 for name in SLIDER_NAMES}


# =========[ Other Packets ]=========

@dataclass
class TrackerOffsetCalibrationPacket:
    """Packet indicating whether to pause for tracker offset calibration."""
    header: PacketHeader
    pause_tracker: bool

    def __call__(self) -> tuple:
        return self.header() + (self.pause_tracker,)

@dataclass
class SetTrackerOffsetPacket:
    """Packet containing positional and rotational tracker offset."""
    header: PacketHeader
    offset_position: Vector3
    offset_orientation: Quat

    def __call__(self) -> tuple:
        return self.header() + self.offset_position() + self.offset_orientation()

@dataclass
class TrackerLocationPacket:
    """Packet with string-based tracker location identifier."""
    header: PacketHeader
    tracker_location: str

    def __call__(self) -> tuple:
        return self.header() + (self.tracker_location,)

@dataclass
class ButtonPassthroughPacket:
    """Packet to enable or disable passthrough button behavior."""
    header: PacketHeader
    enable_passthrough: bool

    def __call__(self) -> tuple:
        return self.header() + (self.enable_passthrough,)

@dataclass
class TrackerSourcePacket:
    """Packet specifying the source index for tracker data."""
    header: PacketHeader
    tracker_source: int

    def __call__(self) -> tuple:
        return self.header() + (self.tracker_source,)


# =========[ Master Container ]=========

@dataclass
class HandData:
    """Aggregate container for all data streams associated with one hand."""
    controller: Optional[ControllerPacket] = None
    orientation: Optional[OrientationPacket] = None
    kinematic: Optional[KinematicPacket] = None
    gesture_state: Optional[CalibrationGestureStatePacket] = None
    articulation_state: Optional[CalibrationArticulationStatePacket] = None
    tracker_offset_calibration: Optional[TrackerOffsetCalibrationPacket] = None
    tracker_offset: Optional[SetTrackerOffsetPacket] = None
    tracker_location: Optional[TrackerLocationPacket] = None
    tracker_source: Optional[TrackerSourcePacket] = None
    button_passthrough: Optional[ButtonPassthroughPacket] = None
    sliders: Dict[str, float] = field(default_factory=_default_slider_values)
    reverse_sliders: Dict[str, float] = field(default_factory=dict)
    mvn_output_bones: Dict[str, dict] = field(default_factory=dict)

    def __call__(self) -> tuple:
        return (
            *(self.controller() if self.controller else ()),
            *(self.orientation() if self.orientation else ()),
            *(self.kinematic() if self.kinematic else ()),
            *(self.gesture_state() if self.gesture_state else ()),
            *(self.articulation_state() if self.articulation_state else ()),
            *(self.tracker_offset_calibration() if self.tracker_offset_calibration else ()),
            *(self.tracker_offset() if self.tracker_offset else ()),
            *(self.tracker_location() if self.tracker_location else ()),
            *(self.tracker_source() if self.tracker_source else ()),
            *(self.button_passthrough() if self.button_passthrough else ()),
        )
