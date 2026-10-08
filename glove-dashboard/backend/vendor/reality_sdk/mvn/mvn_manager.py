"""MVN loop using direct Unity-local to MVN-global conversion path."""

import socket
import threading
import time
import math
from pathlib import Path

from core.config import HANDEDNESS
from core.retargeting.retarget_hand import load_target_transforms_by_hand
from core.runtime_profiles import resolve_editable_profile
from core.shared_state import SharedState
from mvn import mvn_datagram as mvn_datagram
from mvn.mvn_bone_pipeline import (
    apply_target_transforms_to_bones,
    convert_local_quaternions_to_global,
    get_selected_bones_from_kinematic,
    load_default_bones_from_simple_json,
    resolve_selected_packet_indices,
)
from mvn.mvn_adjustments import (
    _quat_mul,
    _quat_normalize,
    convert_unity_global_quaternions_to_mvn_global,
)
from mvn.mvn_maps import PACKET_INDEX_BY_JOINT_NAME, OPENXR_JOINT_TO_PACKET_INDEX
from mvn.mvn_thumb_kinematic_pipeline import (
    apply_thumb_global_overrides,
    build_thumb_globals_from_kinematic_local,
)

UNITY_LEFT_WRIST_REFERENCE_LOCAL = (
    -0.707033098,
    0.707180381,
    0.000000692903427,
    0.000249177014,
)
UNITY_RIGHT_WRIST_REFERENCE_LOCAL = (
    0.707106829,
    0.707106829,
    0.0,
    0.0,
)


def _quat_conjugate(quaternion: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3])


def _normalize_unity_globals_by_wrist_reference(
    bones,
    wrist_reference_local: tuple[float, float, float, float],
):
    """
    Re-express Unity global quaternions relative to a known Unity wrist reference frame.
    q_out = inverse(q_wrist_ref) * q_global
    """
    if not bones:
        return bones
    q_ref = _quat_normalize(wrist_reference_local)
    q_ref_inv = _quat_conjugate(q_ref)
    out = [mvn_datagram.Bone(translation=bone.translation, quaternion=bone.quaternion) for bone in bones]
    for packet_index, bone in enumerate(out):
        q = _quat_normalize(bone.quaternion)
        q_rel = _quat_normalize(_quat_mul(q_ref_inv, q))
        out[packet_index] = mvn_datagram.Bone(
            translation=bone.translation,
            quaternion=q_rel,
        )
    return out


def _axis_angle_degrees_to_quaternion(axis: str, degrees: float) -> tuple[float, float, float, float]:
    axis = str(axis).strip().lower()
    if axis not in {"x", "y", "z"}:
        raise ValueError("finger_skin_twist_axis must be one of: x, y, z")
    half_radians = math.radians(float(degrees)) * 0.5
    sin_half = math.sin(half_radians)
    cos_half = math.cos(half_radians)
    if axis == "x":
        return (sin_half, 0.0, 0.0, cos_half)
    if axis == "y":
        return (0.0, sin_half, 0.0, cos_half)
    return (0.0, 0.0, sin_half, cos_half)


def _quat_to_matrix3(q: tuple[float, float, float, float]):
    x, y, z, w = _quat_normalize(q)
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return (
        (1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)),
        (2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)),
        (2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)),
    )


def _matrix3_to_quat(m):
    m00, m01, m02 = m[0]
    m10, m11, m12 = m[1]
    m20, m21, m22 = m[2]
    trace = m00 + m11 + m22
    if trace > 0.0:
        s = (trace + 1.0) ** 0.5 * 2.0
        w = 0.25 * s
        x = (m21 - m12) / s
        y = (m02 - m20) / s
        z = (m10 - m01) / s
    elif m00 > m11 and m00 > m22:
        s = (1.0 + m00 - m11 - m22) ** 0.5 * 2.0
        w = (m21 - m12) / s
        x = 0.25 * s
        y = (m01 + m10) / s
        z = (m02 + m20) / s
    elif m11 > m22:
        s = (1.0 + m11 - m00 - m22) ** 0.5 * 2.0
        w = (m02 - m20) / s
        x = (m01 + m10) / s
        y = 0.25 * s
        z = (m12 + m21) / s
    else:
        s = (1.0 + m22 - m00 - m11) ** 0.5 * 2.0
        w = (m10 - m01) / s
        x = (m02 + m20) / s
        y = (m12 + m21) / s
        z = 0.25 * s
    return _quat_normalize((x, y, z, w))


def _reflect_rotation_in_front_left_plane(q: tuple[float, float, float, float]):
    """
    Reflect orientation in MVN front-left plane (XY): Z -> -Z.
    R' = S * R * S where S = diag(1, 1, -1)
    """
    r = _quat_to_matrix3(q)
    rm = (
        (r[0][0], r[0][1], -r[0][2]),
        (r[1][0], r[1][1], -r[1][2]),
        (-r[2][0], -r[2][1], r[2][2]),
    )
    return _matrix3_to_quat(rm)


def _apply_cmc_and_finger_orientation_corrections(
    bones,
    finger_skin_twist_quaternion: tuple[float, float, float, float] | None = None,
    invert_non_thumb_cmc_bend_direction: bool = False,
):
    """
    - Rotate CMC joints 180 deg about their local long axis (local Y post-rotation).
    - Reflect finger joints (MCP/PIP/DIP) in the front-left (XY) plane.
    """
    if not bones:
        return bones

    cmc_joint_names = ("index_cmc", "middle_cmc", "ring_cmc", "pinky_cmc")
    finger_joint_names = (
        "index_mcp", "index_pip", "index_dip",
        "middle_mcp", "middle_pip", "middle_dip",
        "ring_mcp", "ring_pip", "ring_dip",
        "pinky_mcp", "pinky_pip", "pinky_dip",
    )
    q_spin_local_y_180 = (0.0, 1.0, 0.0, 0.0)
    out = [mvn_datagram.Bone(translation=bone.translation, quaternion=bone.quaternion) for bone in bones]

    for joint_name in cmc_joint_names:
        idx = PACKET_INDEX_BY_JOINT_NAME.get(joint_name)
        if idx is None or idx >= len(out):
            continue
        q = _quat_normalize(out[idx].quaternion)
        q_new = _quat_normalize(_quat_mul(q, q_spin_local_y_180))
        if invert_non_thumb_cmc_bend_direction:
            # Invert CMC bend direction by conjugation with Rz(180):
            # q' = Rz(180) * q * Rz(180)^-1.
            # This inverts Y-axis bend direction without adding an arbitrary offset.
            q_flip_z_180 = (0.0, 0.0, 1.0, 0.0)
            q_new = _quat_normalize(
                _quat_mul(q_flip_z_180, _quat_mul(q_new, _quat_conjugate(q_flip_z_180)))
            )
        out[idx] = mvn_datagram.Bone(translation=out[idx].translation, quaternion=q_new)

    for joint_name in finger_joint_names:
        idx = PACKET_INDEX_BY_JOINT_NAME.get(joint_name)
        if idx is None or idx >= len(out):
            continue
        q = _quat_normalize(out[idx].quaternion)
        q_new = _reflect_rotation_in_front_left_plane(q)
        if finger_skin_twist_quaternion is not None:
            # Extra local twist for mesh-skin orientation correction (no hierarchy changes).
            q_new = _quat_normalize(_quat_mul(q_new, finger_skin_twist_quaternion))
        out[idx] = mvn_datagram.Bone(translation=out[idx].translation, quaternion=q_new)

    return out


def _load_profile() -> dict:
    import yaml
    default_profile_path = Path(__file__).parent / "mvn_profile.yaml"
    profile_path = resolve_editable_profile(default_profile_path, "mvn_profile.yaml", "MVN")
    if profile_path and profile_path.exists():
        try:
            with open(profile_path, "r", encoding="utf-8") as fh:
                return yaml.safe_load(fh) or {}
        except Exception as error:
            print(f"[MVN] Failed to load profile: {error}")
    return {}


def mvn_loop(
    shared: SharedState,
    stop_event: threading.Event,
    init_complete_event: threading.Event,
    profile: dict | None = None,
):
    if profile is None:
        profile = _load_profile()

    # Configuration
    rate_hz = float(profile.get("rate_hz", 60.0))
    host = str(profile.get("host", "255.255.255.255"))
    port = int(profile.get("port", 6940))
    broadcast = bool(profile.get("broadcast", True))
    num_items_per_hand = int(profile.get("num_items_per_hand", 20))
    character_id = int(profile.get("character_id", 0))
    output_quaternion_order = str(profile.get("output_quaternion_order", "wxyz")).lower()
    if output_quaternion_order not in {"xyzw", "wxyz", "wzxy"}:
        raise ValueError("output_quaternion_order must be one of: xyzw, wxyz, wzxy")
    replace_with_kinematic_joint_names = profile.get("replace_with_kinematic_joint_names", ["all"])
    default_bones_json_path = str(profile.get("default_bones_json_path", "mvn_hand_defaults_simple.json"))
    target_transforms_json_path = str(profile.get("target_transforms_json_path", "mo_simple_reality.json"))
    finger_skin_twist_axis = str(profile.get("finger_skin_twist_axis", "y")).lower()
    finger_skin_twist_deg = float(profile.get("finger_skin_twist_deg", 0.0))
    invert_non_thumb_cmc_bend_direction = bool(profile.get("invert_non_thumb_cmc_bend_direction", False))

    def _profile_hand_value(base_key: str, hand_label: str, default_value):
        return profile.get(f"{base_key}_{hand_label}", profile.get(base_key, default_value))

    # Thumb kinematic settings per hand
    thumb_kinematic_settings = {}
    for hand_label in ("left", "right"):
        local_swizzle_enabled = bool(_profile_hand_value("thumb_kinematic_local_swizzle_enabled", hand_label, False))
        local_swizzle_order = str(_profile_hand_value("thumb_kinematic_local_swizzle_order", hand_label, "xyzw")).strip().lower()
        if local_swizzle_enabled:
            if len(local_swizzle_order) != 4 or set(local_swizzle_order) != {"x", "y", "z", "w"}:
                raise ValueError("thumb_kinematic_local_swizzle_order must be a permutation of xyzw")
            local_swizzle_signs_raw = _profile_hand_value("thumb_kinematic_local_swizzle_signs", hand_label, [1, 1, 1, 1])
            if not isinstance(local_swizzle_signs_raw, (list, tuple)) or len(local_swizzle_signs_raw) != 4:
                raise ValueError("thumb_kinematic_local_swizzle_signs must be a 4-item list/tuple")
            local_swizzle_signs = tuple(-1 if float(v) < 0.0 else 1 for v in local_swizzle_signs_raw)
        else:
            local_swizzle_signs = (1, 1, 1, 1)
        thumb_kinematic_settings[hand_label] = {
            "local_swizzle_enabled": local_swizzle_enabled,
            "local_swizzle_order": local_swizzle_order,
            "local_swizzle_signs": local_swizzle_signs,
            "local_frame_remap_axis": str(_profile_hand_value("thumb_kinematic_local_frame_remap_axis", hand_label, "")).strip().lower(),
            "local_frame_remap_deg": float(_profile_hand_value("thumb_kinematic_local_frame_remap_deg", hand_label, 0.0)),
            "cmc_rest_offset_deg_x": float(_profile_hand_value("thumb_kinematic_cmc_rest_offset_deg_x", hand_label, 0.0)),
            "cmc_rest_offset_deg_y": float(_profile_hand_value("thumb_kinematic_cmc_rest_offset_deg_y", hand_label, 0.0)),
            "cmc_rest_offset_deg_z": float(_profile_hand_value("thumb_kinematic_cmc_rest_offset_deg_z", hand_label, 0.0)),
        }

    finger_skin_twist_quaternion = None
    if abs(finger_skin_twist_deg) > 1e-6:
        finger_skin_twist_quaternion = _axis_angle_degrees_to_quaternion(
            finger_skin_twist_axis,
            finger_skin_twist_deg,
        )

    selected_packet_indices = resolve_selected_packet_indices(
        replace_with_kinematic_joint_names,
        num_items_per_hand,
    )

    left_target_transforms = []
    right_target_transforms = []
    tt_path = Path(target_transforms_json_path)
    if not tt_path.is_absolute():
        tt_path = Path(__file__).parent / tt_path
    try:
        tt_by_hand = load_target_transforms_by_hand(tt_path, target_lookup=OPENXR_JOINT_TO_PACKET_INDEX)
        left_target_transforms = tt_by_hand["left"]
        right_target_transforms = tt_by_hand["right"]
        print(
            f"[MVN] Loaded {len(left_target_transforms)} left + "
            f"{len(right_target_transforms)} right target transforms from {tt_path.name}"
        )
    except Exception as error:
        print(f"[MVN] Failed to load target transforms: {error}")

    defaults_path = Path(default_bones_json_path)
    if not defaults_path.is_absolute():
        defaults_path = Path(__file__).parent / defaults_path
    left_default_bones = mvn_datagram.make_identity_bones(num_items_per_hand)
    right_default_bones = mvn_datagram.make_identity_bones(num_items_per_hand)
    left_default_bones, right_default_bones = load_default_bones_from_simple_json(
        defaults_path, left_default_bones, right_default_bones,
    )

    socket_handle = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    if broadcast or host == "255.255.255.255":
        socket_handle.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    sample_counter = 0
    period_seconds = 1.0 / max(1e-6, rate_hz)
    total_items = num_items_per_hand * 2

    print(f"[MVN] Loop started (rate={rate_hz} Hz, host={host}:{port}).\n")
    init_complete_event.set()

    try:
        while not stop_event.is_set():
            sample_counter = (sample_counter + 1) & 0xFFFFFFFF

            snapshot = shared.copy()
            left_state = snapshot.get(HANDEDNESS.LEFT)
            right_state = snapshot.get(HANDEDNESS.RIGHT)
            left_kinematic = left_state.kinematic
            right_kinematic = right_state.kinematic

            left_local_bones = get_selected_bones_from_kinematic(left_kinematic, left_default_bones, selected_packet_indices)
            right_local_bones = get_selected_bones_from_kinematic(right_kinematic, right_default_bones, selected_packet_indices)

            apply_target_transforms_to_bones(left_target_transforms, left_state.sliders, left_local_bones)
            apply_target_transforms_to_bones(right_target_transforms, right_state.sliders, right_local_bones)

            left_unity_global_bones = _normalize_unity_globals_by_wrist_reference(
                convert_local_quaternions_to_global(left_local_bones), UNITY_LEFT_WRIST_REFERENCE_LOCAL,
            )
            right_unity_global_bones = _normalize_unity_globals_by_wrist_reference(
                convert_local_quaternions_to_global(right_local_bones), UNITY_RIGHT_WRIST_REFERENCE_LOCAL,
            )

            left_bones = _apply_cmc_and_finger_orientation_corrections(
                convert_unity_global_quaternions_to_mvn_global(left_unity_global_bones, "left"),
                finger_skin_twist_quaternion, invert_non_thumb_cmc_bend_direction,
            )
            right_bones = _apply_cmc_and_finger_orientation_corrections(
                convert_unity_global_quaternions_to_mvn_global(right_unity_global_bones, "right"),
                finger_skin_twist_quaternion, invert_non_thumb_cmc_bend_direction,
            )

            for hand_label, kinematic, default_bones, bones in (
                ("left", left_kinematic, left_default_bones, left_bones),
                ("right", right_kinematic, right_default_bones, right_bones),
            ):
                thumb_globals, _ = build_thumb_globals_from_kinematic_local(
                    kinematic, default_bones, **thumb_kinematic_settings[hand_label],
                )
                apply_thumb_global_overrides(bones, thumb_globals)

            packet_bytes = mvn_datagram.build_mvn_datagram(
                id_string=b"MXTP02",
                sample_counter=sample_counter,
                datagram_counter=0x80,
                num_items=total_items,
                time_code_ms=0,
                character_id=character_id,
                body_segments=0,
                props=0,
                finger_segments=total_items,
                reserved_u16=0,
                segment_id_base=23,
                left_bones=left_bones,
                right_bones=right_bones,
                handedness="none",
                quat_order=output_quaternion_order,
            )
            socket_handle.sendto(packet_bytes, (host, port))
            time.sleep(period_seconds)
    finally:
        socket_handle.close()
        print("[MVN] Loop stopped")
