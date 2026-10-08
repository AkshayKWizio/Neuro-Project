"""Capture raw kinematic quaternions (pre-swizzle) and their global equivalents."""

import json
import time
from pathlib import Path

from core.config import HANDEDNESS
from core.shared_state import SharedState
from mvn.mvn_maps import (
    KINEMATIC_INDEX_BY_PACKET_INDEX,
    PACKET_JOINT_NAME_BY_INDEX,
    PACKET_PARENT_INDEX_BY_PACKET_INDEX,
)

_capture_counter = 0


def _quat_normalize(q):
    x, y, z, w = q
    mag_sq = x * x + y * y + z * z + w * w
    if mag_sq <= 1e-12:
        return (0.0, 0.0, 0.0, 1.0)
    inv = 1.0 / (mag_sq ** 0.5)
    return (x * inv, y * inv, z * inv, w * inv)


def _quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def _build_hand_record(kinematic, sliders: dict) -> dict:
    """
    Build per-joint local and global quaternion records from raw (unswizzled) kinematic data.

    Local quaternions are taken directly from the kinematic packet joints.
    Global quaternions are computed by chaining through the packet-order parent hierarchy.
    """
    num_joints = len(PACKET_JOINT_NAME_BY_INDEX)
    identity_q = (0.0, 0.0, 0.0, 1.0)

    local_quats = [identity_q] * num_joints
    if kinematic:
        for packet_index in range(num_joints):
            kin_index = KINEMATIC_INDEX_BY_PACKET_INDEX.get(packet_index)
            if kin_index is None or kin_index >= len(kinematic.joints):
                continue
            o = kinematic.joints[kin_index].orientation
            local_quats[packet_index] = _quat_normalize((o.x, o.y, o.z, o.w))

    global_quats = [identity_q] * num_joints
    for packet_index in range(num_joints):
        parent_index = PACKET_PARENT_INDEX_BY_PACKET_INDEX.get(packet_index, -1)
        if parent_index < 0:
            global_quats[packet_index] = local_quats[packet_index]
        else:
            global_quats[packet_index] = _quat_normalize(
                _quat_mul(global_quats[parent_index], local_quats[packet_index])
            )

    joints = []
    for packet_index in range(num_joints):
        name = PACKET_JOINT_NAME_BY_INDEX[packet_index]
        lq = local_quats[packet_index]
        gq = global_quats[packet_index]
        joints.append({
            "name": name,
            "local": [round(lq[0], 6), round(lq[1], 6), round(lq[2], 6), round(lq[3], 6)],
            "global": [round(gq[0], 6), round(gq[1], 6), round(gq[2], 6), round(gq[3], 6)],
        })

    return {
        "joints": joints,
        "sliders": {k: round(float(v), 4) for k, v in sliders.items()},
    }


def append_raw_kinematic_snapshot(shared: SharedState, output_path: Path) -> None:
    """
    Capture one frame of raw kinematic data from both hands and append it as a JSON line.

    Each record contains:
      - timestamp and incrementing capture_number
      - For each hand: per-joint name, local quaternion, global quaternion (from hierarchy)
      - For each hand: current slider values
    """
    global _capture_counter
    _capture_counter += 1

    snapshot = shared.snapshot()

    record = {
        "timestamp": round(time.time(), 3),
        "capture_number": _capture_counter,
    }

    for hand_label, handedness in (("left", HANDEDNESS.LEFT), ("right", HANDEDNESS.RIGHT)):
        hand_data = snapshot.get(handedness)
        kinematic = hand_data.kinematic if hand_data else None
        sliders = hand_data.sliders if hand_data else {}
        record[hand_label] = _build_hand_record(kinematic, sliders)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")

    print(f"[DEBUG] Raw kinematic snapshot #{_capture_counter} -> {output_path}")
