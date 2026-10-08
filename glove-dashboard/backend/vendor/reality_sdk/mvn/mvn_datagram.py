from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import List, Tuple

Vec3 = Tuple[float, float, float]
Quat = Tuple[float, float, float, float]  # (x, y, z, w)


@dataclass
class Bone:
    translation: Vec3
    quaternion: Quat


def make_identity_bones(bone_count: int) -> List[Bone]:
    return [Bone(translation=(0.0, 0.0, 0.0), quaternion=(0.0, 0.0, 0.0, 1.0)) for _ in range(bone_count)]


def _pack_u32(value: int) -> bytes:
    return struct.pack(">I", value & 0xFFFFFFFF)


def _pack_i32(value: int) -> bytes:
    return struct.pack(">i", int(value))


def _pack_u16(value: int) -> bytes:
    return struct.pack(">H", value & 0xFFFF)


def _pack_u8(value: int) -> bytes:
    return struct.pack(">B", value & 0xFF)


def _pack_f32(value: float) -> bytes:
    return struct.pack(">f", float(value))


def quat_reorder(quaternion_xyzw: Quat, order: str) -> Tuple[float, float, float, float]:
    x, y, z, w = quaternion_xyzw
    if order == "xyzw":
        return (x, y, z, w)
    if order == "wxyz":
        return (w, x, y, z)
    if order == "wzxy":
        return (w, z, x, y)
    raise ValueError(f"Unsupported quaternion order: {order}")


def build_mvn_datagram(
    *,
    id_string: bytes,
    sample_counter: int,
    datagram_counter: int,
    num_items: int,
    time_code_ms: int,
    character_id: int,
    body_segments: int,
    props: int,
    finger_segments: int,
    reserved_u16: int,
    segment_id_base: int,
    left_bones: List[Bone],
    right_bones: List[Bone],
    handedness: str,
    quat_order: str,
) -> bytes:
    if len(id_string) != 6:
        raise ValueError("ID string must be exactly 6 bytes.")
    if num_items <= 0 or (num_items % 2) != 0:
        raise ValueError(f"num_items must be a positive even number, got {num_items}.")

    items_per_hand = num_items // 2

    def fit_hand_bones(hand_bones: List[Bone]) -> List[Bone]:
        fitted = list(hand_bones or [])
        if len(fitted) < items_per_hand:
            fitted += make_identity_bones(items_per_hand - len(fitted))
        elif len(fitted) > items_per_hand:
            fitted = fitted[:items_per_hand]
        return fitted

    bones = fit_hand_bones(left_bones) + fit_hand_bones(right_bones)

    payload_parts: List[bytes] = []
    segment_id = segment_id_base

    for bone in bones:
        payload_parts.append(_pack_i32(segment_id))
        payload_parts.append(_pack_f32(bone.translation[0]))
        payload_parts.append(_pack_f32(bone.translation[1]))
        payload_parts.append(_pack_f32(bone.translation[2]))

        reordered_quaternion = quat_reorder(bone.quaternion, quat_order)
        for component in reordered_quaternion:
            payload_parts.append(_pack_f32(component))

        segment_id += 1

    payload = b"".join(payload_parts)

    header = b"".join([
        id_string,
        _pack_u32(sample_counter),
        _pack_u8(datagram_counter),
        _pack_u8(num_items),
        _pack_u32(time_code_ms),
        _pack_u8(character_id),
        _pack_u8(body_segments),
        _pack_u8(props),
        _pack_u8(finger_segments),
        _pack_u16(reserved_u16),
        _pack_u16(len(payload)),
    ])

    if len(header) != 24:
        raise RuntimeError(f"Header must be 24 bytes; got {len(header)}")

    return header + payload
