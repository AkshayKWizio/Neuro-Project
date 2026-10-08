from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable

from core.core_data_classes import HandData, Quat
from core.retargeting.target_transform import JointType, SliderName, TargetTransform


QuatTuple = tuple[float, float, float, float]
IDENTITY_QUAT: QuatTuple = (0.0, 0.0, 0.0, 1.0)


class PathType(Enum):
    BEND = 0
    SPLAY = 1
    TWIST = 2


@dataclass
class JointPose:
    joint: Any
    quat: QuatTuple


def _to_tuple(quaternion: Quat | Iterable[float]) -> QuatTuple:
    if isinstance(quaternion, Quat):
        return (
            float(quaternion.x),
            float(quaternion.y),
            float(quaternion.z),
            float(quaternion.w),
        )
    x, y, z, w = quaternion
    return float(x), float(y), float(z), float(w)


def _dot(left: QuatTuple, right: QuatTuple) -> float:
    return (
        left[0] * right[0]
        + left[1] * right[1]
        + left[2] * right[2]
        + left[3] * right[3]
    )


def _normalize(quaternion: QuatTuple) -> QuatTuple:
    norm_sq = _dot(quaternion, quaternion)
    if norm_sq <= 1e-12:
        return IDENTITY_QUAT
    inv_norm = 1.0 / (norm_sq ** 0.5)
    return (
        quaternion[0] * inv_norm,
        quaternion[1] * inv_norm,
        quaternion[2] * inv_norm,
        quaternion[3] * inv_norm,
    )


def _mul(left: QuatTuple, right: QuatTuple) -> QuatTuple:
    ax, ay, az, aw = left
    bx, by, bz, bw = right
    return _normalize(
        (
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        )
    )


def _inverse(quaternion: QuatTuple) -> QuatTuple:
    x, y, z, w = _normalize(quaternion)
    return (-x, -y, -z, w)


def _slerp(start: QuatTuple, end: QuatTuple, t: float) -> QuatTuple:
    t = max(0.0, min(1.0, float(t)))
    q0 = _normalize(start)
    q1 = _normalize(end)

    cos_omega = _dot(q0, q1)
    if cos_omega < 0.0:
        q1 = (-q1[0], -q1[1], -q1[2], -q1[3])
        cos_omega = -cos_omega

    cos_omega = max(-1.0, min(1.0, cos_omega))
    if cos_omega > 1.0 - 1e-8:
        return _normalize(
            (
                q0[0] + t * (q1[0] - q0[0]),
                q0[1] + t * (q1[1] - q0[1]),
                q0[2] + t * (q1[2] - q0[2]),
                q0[3] + t * (q1[3] - q0[3]),
            )
        )

    import math

    omega = math.acos(cos_omega)
    sin_omega = math.sin(omega)
    s0 = math.sin((1.0 - t) * omega) / sin_omega
    s1 = math.sin(t * omega) / sin_omega
    return _normalize(
        (
            s0 * q0[0] + s1 * q1[0],
            s0 * q0[1] + s1 * q1[1],
            s0 * q0[2] + s1 * q1[2],
            s0 * q0[3] + s1 * q1[3],
        )
    )


def _get_slider_value(slider_values: dict[str, float], slider: SliderName) -> float:
    if slider == SliderName.NONE:
        return 0.0
    return float(slider_values.get(slider.name, 0.0))


def get_bend_output(
    target_transform: TargetTransform,
    path: PathType,
    input_bend: float,
    input_bend_negative: bool,
) -> QuatTuple:
    if path == PathType.BEND:
        output = _slerp(
            _to_tuple(target_transform.start_quat_1),
            _to_tuple(target_transform.end_quat_1),
            input_bend,
        )
    elif path == PathType.SPLAY:
        output = _slerp(
            _to_tuple(target_transform.start_quat_2),
            _to_tuple(target_transform.end_quat_2),
            input_bend,
        )
    else:
        output = IDENTITY_QUAT

    if input_bend_negative:
        zero_quat = _to_tuple(target_transform.zero_quat)
        quat_diff = _mul(zero_quat, _inverse(output))
        doubled_quat_diff = _mul(quat_diff, quat_diff)
        output = _mul(doubled_quat_diff, output)

    return output


def get_splay_output(
    target_transform: TargetTransform,
    bend_output_1: QuatTuple,
    bend_output_2: QuatTuple,
    input_bend_negative: bool,
    input_splay: float,
    input_splay_negative: bool,
) -> QuatTuple:
    _ = target_transform
    output = _slerp(bend_output_1, bend_output_2, input_splay)
    if input_bend_negative == input_splay_negative:
        return output

    intermediate_output = _mul(bend_output_1, _inverse(output))
    doubled_intermediate_output = _mul(intermediate_output, intermediate_output)
    return _mul(doubled_intermediate_output, output)


def get_twist_output(target_transform: TargetTransform, input_twist: float) -> QuatTuple:
    twist_quaternion = _mul(
        _to_tuple(target_transform.end_quat_3),
        _inverse(_to_tuple(target_transform.start_quat_3)),
    )
    return _slerp(IDENTITY_QUAT, twist_quaternion, input_twist)


def add_joint_pose(
    joint_pose_table: list[JointPose],
    slider_values: dict[str, float],
    target_transform: TargetTransform,
) -> list[JointPose]:
    input_bend = _get_slider_value(slider_values, target_transform.bend_driver)
    input_bend_negative = input_bend < 0.0
    if input_bend_negative:
        input_bend = abs(input_bend)

    if input_bend < target_transform.bend_start or input_bend > target_transform.bend_end:
        return joint_pose_table

    bend_span = target_transform.bend_end - target_transform.bend_start
    if abs(bend_span) <= 1e-9:
        return joint_pose_table
    input_bend = (input_bend - target_transform.bend_start) / bend_span

    bend_output_1 = get_bend_output(
        target_transform,
        PathType.BEND,
        input_bend,
        input_bend_negative,
    )

    if target_transform.joint_type == JointType.BEND:
        joint_pose_table.append(JointPose(joint=target_transform.target, quat=bend_output_1))
        return joint_pose_table

    bend_output_2 = get_bend_output(
        target_transform,
        PathType.SPLAY,
        input_bend,
        input_bend_negative,
    )

    input_splay = _get_slider_value(slider_values, target_transform.splay_driver)
    input_splay_negative = input_splay < 0.0
    if input_splay_negative:
        input_splay = abs(input_splay)

    splay_output = get_splay_output(
        target_transform,
        bend_output_1,
        bend_output_2,
        input_bend_negative,
        input_splay,
        input_splay_negative,
    )

    if target_transform.joint_type == JointType.BEND_SPLAY:
        joint_pose_table.append(JointPose(joint=target_transform.target, quat=splay_output))
        return joint_pose_table

    input_twist = _get_slider_value(slider_values, target_transform.twist_driver)
    input_twist = max(0.0, min(1.0, input_twist))
    twist_output = get_twist_output(target_transform, input_twist)
    joint_pose_table.append(
        JointPose(
            joint=target_transform.target,
            quat=_mul(splay_output, twist_output),
        )
    )
    return joint_pose_table


def update_joint_table(
    target_transforms: list[TargetTransform],
    hand_data: HandData,
) -> list[JointPose]:
    joint_pose_table: list[JointPose] = []
    if not hand_data or not hand_data.sliders:
        return joint_pose_table

    slider_values = hand_data.sliders
    for target_transform in target_transforms:
        add_joint_pose(joint_pose_table, slider_values, target_transform)
    return joint_pose_table


def update_joint_table_from_slider_values(
    target_transforms: list[TargetTransform],
    slider_values: dict[str, float],
) -> list[JointPose]:
    """
    Backwards-compatible helper when a raw slider dictionary is already available.
    """
    temp_hand = HandData()
    temp_hand.sliders.update(slider_values)
    return update_joint_table(target_transforms, temp_hand)


def update_joint_rotations(joint_pose_table: list[JointPose]):
    """
    Applies calculated quaternions onto target objects.
    Supports either:
    - dict-like targets: target["local_rotation"] = quat
    - object attributes: target.local_rotation = quat
    """
    for joint_pose in joint_pose_table:
        joint = joint_pose.joint
        if joint is None:
            continue
        if isinstance(joint, dict):
            joint["local_rotation"] = joint_pose.quat
        else:
            setattr(joint, "local_rotation", joint_pose.quat)
