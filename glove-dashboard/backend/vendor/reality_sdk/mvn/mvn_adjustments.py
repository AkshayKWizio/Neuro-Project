"""Quaternion adjustment helpers for Unity -> MVN hand retargeting."""

import json
import math
from pathlib import Path

from mvn import mvn_datagram as mvn_datagram
from mvn.mvn_maps import THUMB_PACKET_INDICES, OPENXR_JOINT_TO_PACKET_INDEX

_SQRT2_OVER_2 = math.sqrt(2.0) / 2.0

# Extra X-axis twist (degrees) applied to proximal splay joints at fist, on top of the
# data-coupled endQuat1 correction. Tune these if the data-coupled formula under- or
# over-corrects a specific finger.
_EXTRA_FIST_TWIST_DEG_LEFT = {"IndexProximal": 0.0, "MiddleProximal": 5.0, "RingProximal": 12.5, "PinkyProximal": 5.0}
_EXTRA_FIST_TWIST_DEG_RIGHT = {"IndexProximal": 0.0, "MiddleProximal": -5.0, "RingProximal": -12.5, "PinkyProximal": -5.0}

_FINGER_METACARPAL_SUFFIXES = {"IndexMetacarpal", "MiddleMetacarpal", "RingMetacarpal", "PinkyMetacarpal"}
_SPLAY_SLIDER_NAMES = {"INDEXSPLAY", "MIDDLESPLAY", "RINGSPLAY", "PINKYSPLAY"}

_UNITY_TO_MVN_ROT_LEFT = (0.0, 0.0, _SQRT2_OVER_2, _SQRT2_OVER_2)
_UNITY_TO_MVN_ROT_RIGHT = (0.0, 0.0, -_SQRT2_OVER_2, _SQRT2_OVER_2)
_UNITY_TO_MVN_ROT_THUMB_LEFT = (0.658811, 0.31764, 0.048767, 0.680216)
_UNITY_TO_MVN_ROT_THUMB_RIGHT = (-0.658811, 0.31764, -0.048767, 0.680216)

# Fixed thumb CMC twist (degrees) applied after Y/Z remap.
# Positive is +Z local rotation; signs are hand-specific to produce clockwise visual twist.
_THUMB_CMC_TWIST_DEG_LEFT = -45
_THUMB_CMC_TWIST_DEG_RIGHT = 20.0
_THUMB_DISTAL_PACKET_INDICES = (2, 3)  # thumb_mcp, thumb_dip
_THUMB_CMC_AXIS_REMAP_LEFT = (0.0, -_SQRT2_OVER_2, 0.0, _SQRT2_OVER_2)
_THUMB_CMC_AXIS_REMAP_RIGHT = (0.0, _SQRT2_OVER_2, 0.0, _SQRT2_OVER_2)
_THUMB_DISTAL_AXIS_REMAP_LEFT = (0.0, -_SQRT2_OVER_2, 0.0, _SQRT2_OVER_2)
_THUMB_DISTAL_AXIS_REMAP_RIGHT = (0.0, _SQRT2_OVER_2, 0.0, _SQRT2_OVER_2)

def _quat_conjugate_entry(q):
    return (-q[0], -q[1], -q[2], q[3])


def _quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def _quat_normalize(quaternion):
    x, y, z, w = quaternion
    magnitude_squared = x * x + y * y + z * z + w * w
    if magnitude_squared <= 1e-12:
        return (0.0, 0.0, 0.0, 1.0)
    inv_magnitude = 1.0 / (magnitude_squared ** 0.5)
    return (x * inv_magnitude, y * inv_magnitude, z * inv_magnitude, w * inv_magnitude)


def _mirror_thumb_quaternion_in_palm_plane(q):
    """Mirror thumb ROM in palm plane by flipping the in-plane Y component."""
    x, y, z, w = q
    return (x, -y, z, w)


def _invert_splay_sliders(slider_values: dict) -> dict:
    """Negate splay slider values to correct Unity->MVN splay direction inversion."""
    return {k: (-v if k in _SPLAY_SLIDER_NAMES else v) for k, v in slider_values.items()}


def preprocess_entries_for_mvn(entries, hand_label):
    """Apply fist-position convergence correction to proximal splay joints."""
    prefix = "Left" if hand_label == "left" else "Right"
    middle_key = f"{prefix}MiddleProximal"

    entry_by_name = {e.get("jointName", ""): e for e in entries if isinstance(e, dict)}
    middle_entry = entry_by_name.get(middle_key)
    if middle_entry is None:
        return entries

    q_middle_eq1 = tuple(middle_entry.get("endQuat1", [0.0, 0.0, 0.0, 1.0]))
    splay_proximal_joints = [
        f"{prefix}IndexProximal",
        f"{prefix}MiddleProximal",
        f"{prefix}RingProximal",
        f"{prefix}PinkyProximal",
    ]

    for joint_key in splay_proximal_joints:
        entry = entry_by_name.get(joint_key)
        if entry is None:
            continue
        if not entry.get("splayDriver") or entry.get("splayDriver") == "NONE":
            continue

        eq1 = tuple(entry.get("endQuat1", [0.0, 0.0, 0.0, 1.0]))
        eq1_inv = _quat_conjugate_entry(eq1)
        correction = _quat_normalize(_quat_mul(eq1_inv, q_middle_eq1))
        correction_inv = _quat_conjugate_entry(correction)

        suffix = joint_key[len(prefix):]
        extra_deg = _EXTRA_FIST_TWIST_DEG_LEFT.get(suffix, 0.0) if hand_label == "left" else _EXTRA_FIST_TWIST_DEG_RIGHT.get(suffix, 0.0)
        if abs(extra_deg) > 1e-6:
            half_rad = math.radians(extra_deg) / 2.0
            extra_rx = (math.sin(half_rad), 0.0, 0.0, math.cos(half_rad))
            correction_inv = _quat_normalize(_quat_mul(correction_inv, extra_rx))

        for field in ("endQuat1", "endQuat2"):
            q = entry.get(field)
            if isinstance(q, list) and len(q) == 4:
                corrected = _quat_normalize(_quat_mul(tuple(q), correction_inv))
                entry[field] = list(corrected)

    return entries


def compute_cmc_fan_from_json(json_path: Path, hand_label: str) -> dict:
    """Compute CMC fan quaternions from Unity source data."""
    with open(json_path, "r", encoding="utf-8-sig") as file_handle:
        payload = json.load(file_handle)

    prefix = "Left" if hand_label == "left" else "Right"
    entries = payload.get(prefix, [])
    middle_key = f"{prefix}MiddleMetacarpal"

    middle_entry = next((e for e in entries if e.get("jointName") == middle_key), None)
    if middle_entry is None:
        return {}

    q_middle = tuple(middle_entry["startQuat1"])
    fan = {}
    for entry in entries:
        joint_name = entry.get("jointName", "")
        suffix = joint_name[len(prefix):]
        if suffix not in _FINGER_METACARPAL_SUFFIXES:
            continue
        packet_index = OPENXR_JOINT_TO_PACKET_INDEX.get(joint_name)
        if packet_index is None:
            continue
        sq1_inv = _quat_conjugate_entry(tuple(entry["startQuat1"]))
        fan[packet_index] = _quat_normalize(_quat_mul(sq1_inv, q_middle))

    return fan


def _apply_cmc_fan(bones: list, fan_quaternions: dict) -> list:
    """Apply dynamic CMC fan quaternions directly to CMC bones post-pipeline."""
    for packet_index, quat in fan_quaternions.items():
        # Safety guard: fan corrections are for non-thumb metacarpals only.
        if packet_index in THUMB_PACKET_INDICES:
            continue
        if packet_index < len(bones):
            bones[packet_index] = mvn_datagram.Bone(
                translation=bones[packet_index].translation,
                quaternion=quat,
            )
    return bones


def adjust_thumb_cmc_plane(bones: list, hand_label: str) -> list:
    """Remap thumb CMC motion axis so slider-driven motion bends instead of twists."""
    thumb_cmc_index = 1
    if thumb_cmc_index < 0 or thumb_cmc_index >= len(bones):
        return bones

    bone = bones[thumb_cmc_index]
    if hand_label == "left":
        remap = _THUMB_CMC_AXIS_REMAP_LEFT
        twist_deg = _THUMB_CMC_TWIST_DEG_LEFT
    else:
        remap = _THUMB_CMC_AXIS_REMAP_RIGHT
        twist_deg = _THUMB_CMC_TWIST_DEG_RIGHT
    remap_inv = _quat_conjugate_entry(remap)

    # Axis remap: convert CMC local driver axis into bend-dominant axis.
    remapped = _quat_normalize(_quat_mul(remap_inv, _quat_mul(bone.quaternion, remap)))

    # Apply a fixed local Z-axis twist (roll) to tune thumb CMC rest orientation.
    half_rad = math.radians(twist_deg) / 2.0
    twist_q = (0.0, 0.0, math.sin(half_rad), math.cos(half_rad))
    remapped = _quat_mul(remapped, twist_q)

    bones[thumb_cmc_index] = mvn_datagram.Bone(
        translation=bone.translation,
        quaternion=_quat_normalize(remapped),
    )
    return bones


def adjust_thumb_distal_bend_direction(bones: list, hand_label: str) -> list:
    """Remap thumb MCP/DIP local axes so flexion bends forward instead of twisting."""
    remap = _THUMB_DISTAL_AXIS_REMAP_LEFT if hand_label == "left" else _THUMB_DISTAL_AXIS_REMAP_RIGHT
    remap_inv = _quat_conjugate_entry(remap)

    for packet_index in _THUMB_DISTAL_PACKET_INDICES:
        if packet_index < 0 or packet_index >= len(bones):
            continue
        bone = bones[packet_index]
        corrected = _quat_normalize(_quat_mul(remap_inv, _quat_mul(bone.quaternion, remap)))
        corrected = _mirror_thumb_quaternion_in_palm_plane(corrected)
        bones[packet_index] = mvn_datagram.Bone(
            translation=bone.translation,
            quaternion=corrected,
        )

    return bones


def convert_unity_global_quaternions_to_mvn_global(bones, hand_label: str):
    """Convert packet-order global Unity quaternions to global MVN quaternions."""
    if not bones:
        return bones

    corrected = [mvn_datagram.Bone(translation=bone.translation, quaternion=bone.quaternion) for bone in bones]
    default_rot = _UNITY_TO_MVN_ROT_LEFT if hand_label == "left" else _UNITY_TO_MVN_ROT_RIGHT
    thumb_rot = _UNITY_TO_MVN_ROT_THUMB_LEFT if hand_label == "left" else _UNITY_TO_MVN_ROT_THUMB_RIGHT

    for packet_index in range(len(corrected)):
        rotation = thumb_rot if packet_index in THUMB_PACKET_INDICES else default_rot
        rotation_inv = _quat_conjugate_entry(rotation)
        # Frame-basis conversion (opposite convention): q_mvn = R^-1 * q_unity * R
        corrected_quaternion = _quat_normalize(
            _quat_mul(rotation_inv, _quat_mul(corrected[packet_index].quaternion, rotation))
        )
        corrected[packet_index] = mvn_datagram.Bone(
            translation=corrected[packet_index].translation,
            quaternion=corrected_quaternion,
        )

    return corrected
