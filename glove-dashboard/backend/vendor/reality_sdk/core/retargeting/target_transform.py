from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, IntEnum
from typing import Any

from core.core_data_classes import Quat

IDENTITY_QUAT = (0.0, 0.0, 0.0, 1.0)


class JointType(Enum):
    BEND = 0
    BEND_SPLAY = 1
    BEND_SPLAY_TWIST = 2


@dataclass
class Slider:
    name: "SliderName" = None
    value: float = 0.0

    def __post_init__(self):
        if self.name is None:
            self.name = SliderName.NONE


class SliderName(IntEnum):
    NONE = -1
    THUMBSPLAY = 0
    THUMBBEND1 = 1
    THUMBBEND2 = 2
    THUMBBEND3 = 3
    INDEXSPLAY = 4
    INDEXTWIST = 5
    INDEXBEND1 = 6
    INDEXBEND2 = 7
    INDEXBEND3 = 8
    MIDDLESPLAY = 9
    MIDDLETWIST = 10
    MIDDLEBEND1 = 11
    MIDDLEBEND2 = 12
    MIDDLEBEND3 = 13
    RINGSPLAY = 14
    RINGTWIST = 15
    RINGBEND1 = 16
    RINGBEND2 = 17
    RINGBEND3 = 18
    PINKYSPLAY = 19
    PINKYTWIST = 20
    PINKYBEND1 = 21
    PINKYBEND2 = 22
    PINKYBEND3 = 23
    GLOBALSPLAY = 24



def _as_quat(value: Quat | tuple[float, float, float, float] | None) -> Quat:
    if value is None:
        return Quat(*IDENTITY_QUAT)
    if isinstance(value, Quat):
        return value
    x, y, z, w = value
    return Quat(float(x), float(y), float(z), float(w))


def _as_rig_control_name(value: int | SliderName, field_name: str) -> SliderName:
    try:
        return SliderName(int(value))
    except ValueError as exc:
        valid_indices = ", ".join(str(control.value) for control in SliderName)
        raise ValueError(f"{field_name} must be one of RigControlName values: {valid_indices}") from exc


@dataclass(init=False)
class TargetTransform:
    # Python equivalent of the Unity C# TargetTransform container.
    joint_type: JointType
    target: Any
    bend_driver: SliderName
    bend_start: float
    bend_end: float
    start_quat_1: Quat
    end_quat_1: Quat
    start_quat_2: Quat
    end_quat_2: Quat
    splay_driver: SliderName
    start_quat_3: Quat
    end_quat_3: Quat
    twist_driver: SliderName
    zero_quat: Quat

    def __init__(
        self,
        joint_type: JointType = JointType.BEND,
        target: Any = None,
        bend_driver: int | SliderName = SliderName.NONE,
        bend_start: float = 0.0,
        bend_end: float = 1.0,
        start_quat_1: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        end_quat_1: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        start_quat_2: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        end_quat_2: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        splay_driver: int | SliderName = SliderName.NONE,
        start_quat_3: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        end_quat_3: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
        twist_driver: int | SliderName = SliderName.NONE,
        zero_quat: Quat | tuple[float, float, float, float] | None = IDENTITY_QUAT,
    ):
        self.joint_type = joint_type
        self.target = target
        self.bend_driver = _as_rig_control_name(bend_driver, "bend_driver")
        self.bend_start = float(bend_start)
        self.bend_end = float(bend_end)
        self.start_quat_1 = _as_quat(start_quat_1)
        self.end_quat_1 = _as_quat(end_quat_1)
        self.start_quat_2 = _as_quat(start_quat_2)
        self.end_quat_2 = _as_quat(end_quat_2)
        self.splay_driver = _as_rig_control_name(splay_driver, "splay_driver")
        self.start_quat_3 = _as_quat(start_quat_3)
        self.end_quat_3 = _as_quat(end_quat_3)
        self.twist_driver = _as_rig_control_name(twist_driver, "twist_driver")
        self.zero_quat = _as_quat(zero_quat)
