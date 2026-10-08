"""Alternative thumb retarget pipeline sourced from kinematic local joints."""

from __future__ import annotations

import math

from mvn import mvn_datagram as mvn_datagram
from mvn.mvn_bone_pipeline import convert_local_quaternions_to_global, get_selected_bones_from_kinematic
from mvn.mvn_adjustments import _quat_mul, _quat_normalize
from mvn.mvn_maps import PACKET_INDEX_BY_JOINT_NAME


_WRIST_PACKET_INDEX = PACKET_INDEX_BY_JOINT_NAME["wrist"]
_THUMB_CMC_PACKET_INDEX = PACKET_INDEX_BY_JOINT_NAME["thumb_cmc"]
_THUMB_MCP_PACKET_INDEX = PACKET_INDEX_BY_JOINT_NAME["thumb_mcp"]
_THUMB_DIP_PACKET_INDEX = PACKET_INDEX_BY_JOINT_NAME["thumb_dip"]
_THUMB_PACKET_INDICES = (_THUMB_CMC_PACKET_INDEX, _THUMB_MCP_PACKET_INDEX, _THUMB_DIP_PACKET_INDEX)


def _quat_conjugate(quaternion: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3])


def _axis_angle_degrees_to_quaternion(axis: str, degrees: float) -> tuple[float, float, float, float]:
    axis = str(axis).strip().lower()
    if axis not in {"x", "y", "z"}:
        raise ValueError("axis must be one of x, y, z")
    half_radians = math.radians(float(degrees)) * 0.5
    sin_half = math.sin(half_radians)
    cos_half = math.cos(half_radians)
    if axis == "x":
        return (sin_half, 0.0, 0.0, cos_half)
    if axis == "y":
        return (0.0, sin_half, 0.0, cos_half)
    return (0.0, 0.0, sin_half, cos_half)


def _global_axis_to_xyz_and_sign(axis_name: str) -> tuple[str, float]:
    name = str(axis_name).strip().lower()
    if name in {"x", "front", "+x", "+front"}:
        return "x", 1.0
    if name in {"-x", "back", "backward"}:
        return "x", -1.0
    if name in {"y", "left", "+y", "+left"}:
        return "y", 1.0
    if name in {"-y", "right", "+right"}:
        return "y", -1.0
    if name in {"z", "up", "+z", "+up"}:
        return "z", 1.0
    if name in {"-z", "down", "+down"}:
        return "z", -1.0
    raise ValueError(
        "Global thumb axis must be one of: "
        "x/front/back, y/left/right, z/up/down (or signed +/-x/y/z)"
    )


def _swizzle_quaternion(
    quaternion: tuple[float, float, float, float],
    order: str = "xyzw",
    signs: tuple[int, int, int, int] = (1, 1, 1, 1),
) -> tuple[float, float, float, float]:
    order = str(order).strip().lower()
    if len(order) != 4 or set(order) != {"x", "y", "z", "w"}:
        raise ValueError("Quaternion swizzle order must be a permutation of 'xyzw'")
    if len(signs) != 4:
        raise ValueError("Quaternion swizzle signs must contain 4 entries")
    components = {
        "x": float(quaternion[0]),
        "y": float(quaternion[1]),
        "z": float(quaternion[2]),
        "w": float(quaternion[3]),
    }
    out = []
    for idx, axis in enumerate(order):
        sign = -1.0 if int(signs[idx]) < 0 else 1.0
        out.append(sign * components[axis])
    return _quat_normalize((out[0], out[1], out[2], out[3]))


def _mirror_thumb_quaternion_in_plane(
    quaternion: tuple[float, float, float, float],
    normal_axis: str = "y",
) -> tuple[float, float, float, float]:
    """
    Approximate plane-mirror operation by flipping the quaternion component
    associated with the selected plane normal axis.
    """
    axis = str(normal_axis).strip().lower()
    x, y, z, w = quaternion
    if axis == "x":
        return _quat_normalize((-x, y, z, w))
    if axis == "y":
        return _quat_normalize((x, -y, z, w))
    if axis == "z":
        return _quat_normalize((x, y, -z, w))
    raise ValueError("local_mirror_plane_axis must be one of: x, y, z")


def build_thumb_globals_from_kinematic_local(
    kinematic,
    default_bones: list[mvn_datagram.Bone],
    local_swizzle_enabled: bool = False,
    local_swizzle_order: str = "xyzw",
    local_swizzle_signs: tuple[int, int, int, int] = (1, 1, 1, 1),
    local_mirror_palm_plane: bool = False,
    local_mirror_plane_axis: str = "y",
    local_frame_remap_axis: str = "",
    local_frame_remap_deg: float = 0.0,
    cmc_rest_offset_deg_x: float = 0.0,
    cmc_rest_offset_deg_y: float = 0.0,
    cmc_rest_offset_deg_z: float = 0.0,
) -> tuple[dict[int, tuple[float, float, float, float]], tuple[float, float, float, float] | None]:
    """
    Build thumb global quaternions from kinematic local quaternions only.

    Steps:
      1) Overlay wrist+thumb local joints from kinematic onto default packet-order local bones.
      2) Convert full packet-order locals to globals via hierarchy.
      3) Return global quaternions for thumb joints (CMC/MCP/DIP).
    """
    if not kinematic:
        return {}, None
    selected_packet_indices = {_WRIST_PACKET_INDEX, *_THUMB_PACKET_INDICES}
    local_bones = get_selected_bones_from_kinematic(
        kinematic,
        default_bones,
        selected_packet_indices,
    )
    if local_swizzle_enabled:
        for packet_index in _THUMB_PACKET_INDICES:
            if packet_index < 0 or packet_index >= len(local_bones):
                continue
            q = local_bones[packet_index].quaternion
            q_swizzled = _swizzle_quaternion(q, local_swizzle_order, local_swizzle_signs)
            local_bones[packet_index] = mvn_datagram.Bone(
                translation=local_bones[packet_index].translation,
                quaternion=q_swizzled,
            )
    if local_mirror_palm_plane:
        for packet_index in _THUMB_PACKET_INDICES:
            if packet_index < 0 or packet_index >= len(local_bones):
                continue
            q = local_bones[packet_index].quaternion
            q_mirrored = _mirror_thumb_quaternion_in_plane(q, local_mirror_plane_axis)
            local_bones[packet_index] = mvn_datagram.Bone(
                translation=local_bones[packet_index].translation,
                quaternion=q_mirrored,
            )
    if local_frame_remap_axis and abs(float(local_frame_remap_deg)) > 1e-6:
        q_remap = _axis_angle_degrees_to_quaternion(local_frame_remap_axis, float(local_frame_remap_deg))
        q_remap_inv = _quat_conjugate(q_remap)
        for packet_index in _THUMB_PACKET_INDICES:
            if packet_index < 0 or packet_index >= len(local_bones):
                continue
            q = local_bones[packet_index].quaternion
            q_remapped = _quat_normalize(_quat_mul(q_remap, _quat_mul(q, q_remap_inv)))
            local_bones[packet_index] = mvn_datagram.Bone(
                translation=local_bones[packet_index].translation,
                quaternion=q_remapped,
            )

    global_bones = convert_local_quaternions_to_global(local_bones)
    thumb_globals = {
        packet_index: global_bones[packet_index].quaternion
        for packet_index in _THUMB_PACKET_INDICES
        if packet_index < len(global_bones)
    }

    if any(abs(d) > 1e-6 for d in (cmc_rest_offset_deg_x, cmc_rest_offset_deg_y, cmc_rest_offset_deg_z)):
        q_post = _quat_normalize(_quat_mul(
            _quat_mul(
                _axis_angle_degrees_to_quaternion("y", cmc_rest_offset_deg_y),
                _axis_angle_degrees_to_quaternion("x", cmc_rest_offset_deg_x),
            ),
            _axis_angle_degrees_to_quaternion("z", cmc_rest_offset_deg_z),
        ))
        thumb_globals = {
            idx: _quat_normalize(_quat_mul(q_post, q))
            for idx, q in thumb_globals.items()
        }
    wrist_global = None
    if _WRIST_PACKET_INDEX < len(global_bones):
        wrist_global = global_bones[_WRIST_PACKET_INDEX].quaternion
    return thumb_globals, wrist_global


def apply_cmc_kinematic_correction(
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
    wrist_global_quaternion: tuple[float, float, float, float] | None,
    cmc_rest_local_reference: tuple[float, float, float, float] | None = None,
    invert_cmc_motion_direction: bool = False,
    invert_cmc_motion_axis: str = "z",
    invert_cmc_twist_direction: bool = True,
    invert_cmc_bend_direction: bool = False,
    invert_cmc_bend_axis: str = "z",
    cmc_rest_offset_deg_x: float = 0.0,
    cmc_rest_offset_deg_y: float = 0.0,
    cmc_rest_offset_deg_z: float = 0.0,
    cmc_local_frame_remap_axis: str = "",
    cmc_local_frame_remap_deg: float = 0.0,
) -> dict[int, tuple[float, float, float, float]]:
    """
    Correct thumb CMC in wrist-local space, then propagate that global delta to MCP/DIP.

    - Optional local frame remap: conjugation by an axis-angle rotation applied first, to
      map the source bend axis onto MVN's expected bend axis (fixes twist-instead-of-bend).
    - Optional motion inversion is applied to the delta from a captured rest-local reference.
      This preserves rest orientation while flipping motion direction.
    - Twist inversion uses conjugation by local Rx(180), which flips local Y/Z rotational
      directions while preserving local X bend direction.
    - Optional CMC bend inversion by conjugation with 180 deg around configured axis.
    - Optional local rest offsets are then applied in X -> Y -> Z order.
    """
    if not thumb_globals_by_packet_index or wrist_global_quaternion is None:
        return thumb_globals_by_packet_index
    q_cmc_global = thumb_globals_by_packet_index.get(_THUMB_CMC_PACKET_INDEX)
    if q_cmc_global is None:
        return thumb_globals_by_packet_index

    q_wrist = _quat_normalize(wrist_global_quaternion)
    q_wrist_inv = _quat_conjugate(q_wrist)
    q_cmc_global = _quat_normalize(q_cmc_global)
    q_cmc_local = _quat_normalize(_quat_mul(q_wrist_inv, q_cmc_global))

    if cmc_local_frame_remap_axis and abs(float(cmc_local_frame_remap_deg)) > 1e-6 and cmc_rest_local_reference is not None:
        q_remap = _axis_angle_degrees_to_quaternion(cmc_local_frame_remap_axis, float(cmc_local_frame_remap_deg))
        q_remap_inv = _quat_conjugate(q_remap)
        q_rest_ref = _quat_normalize(cmc_rest_local_reference)
        q_motion = _quat_normalize(_quat_mul(_quat_conjugate(q_rest_ref), q_cmc_local))
        q_motion_remapped = _quat_normalize(_quat_mul(q_remap, _quat_mul(q_motion, q_remap_inv)))
        q_cmc_local = _quat_normalize(_quat_mul(q_rest_ref, q_motion_remapped))

    if invert_cmc_motion_direction and cmc_rest_local_reference is not None:
        q_rest = _quat_normalize(cmc_rest_local_reference)
        q_motion = _quat_normalize(_quat_mul(_quat_conjugate(q_rest), q_cmc_local))
        q_flip_motion = _axis_angle_degrees_to_quaternion(invert_cmc_motion_axis, 180.0)
        q_flip_motion_inv = _quat_conjugate(q_flip_motion)
        q_motion = _quat_normalize(_quat_mul(q_flip_motion, _quat_mul(q_motion, q_flip_motion_inv)))
        q_cmc_local = _quat_normalize(_quat_mul(q_rest, q_motion))

    if invert_cmc_twist_direction:
        q_flip_local = _axis_angle_degrees_to_quaternion("x", 180.0)
        q_flip_local_inv = _quat_conjugate(q_flip_local)
        q_cmc_local = _quat_normalize(_quat_mul(q_flip_local, _quat_mul(q_cmc_local, q_flip_local_inv)))

    if invert_cmc_bend_direction:
        q_flip_bend = _axis_angle_degrees_to_quaternion(invert_cmc_bend_axis, 180.0)
        q_flip_bend_inv = _quat_conjugate(q_flip_bend)
        q_cmc_local = _quat_normalize(_quat_mul(q_flip_bend, _quat_mul(q_cmc_local, q_flip_bend_inv)))

    q_offset_x = _axis_angle_degrees_to_quaternion("x", cmc_rest_offset_deg_x)
    q_offset_y = _axis_angle_degrees_to_quaternion("y", cmc_rest_offset_deg_y)
    q_offset_z = _axis_angle_degrees_to_quaternion("z", cmc_rest_offset_deg_z)
    q_offset = _quat_normalize(_quat_mul(_quat_mul(q_offset_x, q_offset_y), q_offset_z))
    q_cmc_local_new = _quat_normalize(_quat_mul(q_cmc_local, q_offset))
    q_cmc_global_new = _quat_normalize(_quat_mul(q_wrist, q_cmc_local_new))

    q_delta_global = _quat_normalize(_quat_mul(q_cmc_global_new, _quat_conjugate(q_cmc_global)))
    corrected = dict(thumb_globals_by_packet_index)
    corrected[_THUMB_CMC_PACKET_INDEX] = q_cmc_global_new
    for child_index in (_THUMB_MCP_PACKET_INDEX, _THUMB_DIP_PACKET_INDEX):
        q_child = corrected.get(child_index)
        if q_child is None:
            continue
        corrected[child_index] = _quat_normalize(_quat_mul(q_delta_global, _quat_normalize(q_child)))
    return corrected


def apply_thumb_global_post_rotation(
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
    axis_name: str,
    degrees: float,
) -> dict[int, tuple[float, float, float, float]]:
    """Rotate all thumb globals by a single global axis-angle delta."""
    if not thumb_globals_by_packet_index:
        return thumb_globals_by_packet_index
    if abs(float(degrees)) <= 1e-6:
        return thumb_globals_by_packet_index
    axis, sign = _global_axis_to_xyz_and_sign(axis_name)
    q_global_delta = _axis_angle_degrees_to_quaternion(axis, float(degrees) * sign)
    corrected = dict(thumb_globals_by_packet_index)
    for packet_index, q in corrected.items():
        corrected[packet_index] = _quat_normalize(_quat_mul(q_global_delta, _quat_normalize(q)))
    return corrected


def apply_thumb_local_skin_twist(
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
    axis_name: str,
    degrees: float,
) -> dict[int, tuple[float, float, float, float]]:
    """
    Apply the same local-axis twist to thumb globals.

    Because thumb quaternions are global, post-multiplication applies a local-space delta.
    """
    if not thumb_globals_by_packet_index:
        return thumb_globals_by_packet_index
    if abs(float(degrees)) <= 1e-6:
        return thumb_globals_by_packet_index
    axis, sign = _global_axis_to_xyz_and_sign(axis_name)
    q_local_twist = _axis_angle_degrees_to_quaternion(axis, float(degrees) * sign)
    corrected = dict(thumb_globals_by_packet_index)
    for packet_index, q in corrected.items():
        corrected[packet_index] = _quat_normalize(_quat_mul(_quat_normalize(q), q_local_twist))
    return corrected


def apply_thumb_distal_local_bend_inversion(
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
    invert_axis: str = "z",
) -> dict[int, tuple[float, float, float, float]]:
    """
    Invert MCP/DIP bend direction in thumb-local chain space.

    - MCP local is defined relative to CMC global.
    - DIP local is defined relative to MCP global.
    """
    if not thumb_globals_by_packet_index:
        return thumb_globals_by_packet_index
    q_cmc = thumb_globals_by_packet_index.get(_THUMB_CMC_PACKET_INDEX)
    q_mcp = thumb_globals_by_packet_index.get(_THUMB_MCP_PACKET_INDEX)
    q_dip = thumb_globals_by_packet_index.get(_THUMB_DIP_PACKET_INDEX)
    if q_cmc is None or q_mcp is None or q_dip is None:
        return thumb_globals_by_packet_index

    q_cmc = _quat_normalize(q_cmc)
    q_mcp = _quat_normalize(q_mcp)
    q_dip = _quat_normalize(q_dip)

    q_mcp_local = _quat_normalize(_quat_mul(_quat_conjugate(q_cmc), q_mcp))
    q_dip_local = _quat_normalize(_quat_mul(_quat_conjugate(q_mcp), q_dip))

    q_flip = _axis_angle_degrees_to_quaternion(invert_axis, 180.0)
    q_flip_inv = _quat_conjugate(q_flip)
    q_mcp_local_inv = _quat_normalize(_quat_mul(q_flip, _quat_mul(q_mcp_local, q_flip_inv)))
    q_dip_local_inv = _quat_normalize(_quat_mul(q_flip, _quat_mul(q_dip_local, q_flip_inv)))

    q_mcp_new = _quat_normalize(_quat_mul(q_cmc, q_mcp_local_inv))
    q_dip_new = _quat_normalize(_quat_mul(q_mcp_new, q_dip_local_inv))

    corrected = dict(thumb_globals_by_packet_index)
    corrected[_THUMB_MCP_PACKET_INDEX] = q_mcp_new
    corrected[_THUMB_DIP_PACKET_INDEX] = q_dip_new
    return corrected


def apply_thumb_dip_local_offset(
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
    offset_deg_x: float = 0.0,
    offset_deg_y: float = 0.0,
    offset_deg_z: float = 0.0,
) -> dict[int, tuple[float, float, float, float]]:
    """Apply a DIP-only local rotation offset (relative to MCP) and rebuild DIP global."""
    if not thumb_globals_by_packet_index:
        return thumb_globals_by_packet_index
    q_mcp = thumb_globals_by_packet_index.get(_THUMB_MCP_PACKET_INDEX)
    q_dip = thumb_globals_by_packet_index.get(_THUMB_DIP_PACKET_INDEX)
    if q_mcp is None or q_dip is None:
        return thumb_globals_by_packet_index
    if abs(float(offset_deg_x)) <= 1e-6 and abs(float(offset_deg_y)) <= 1e-6 and abs(float(offset_deg_z)) <= 1e-6:
        return thumb_globals_by_packet_index

    q_mcp = _quat_normalize(q_mcp)
    q_dip = _quat_normalize(q_dip)
    q_dip_local = _quat_normalize(_quat_mul(_quat_conjugate(q_mcp), q_dip))
    q_offset_x = _axis_angle_degrees_to_quaternion("x", offset_deg_x)
    q_offset_y = _axis_angle_degrees_to_quaternion("y", offset_deg_y)
    q_offset_z = _axis_angle_degrees_to_quaternion("z", offset_deg_z)
    q_offset = _quat_normalize(_quat_mul(_quat_mul(q_offset_x, q_offset_y), q_offset_z))
    q_dip_local_new = _quat_normalize(_quat_mul(q_dip_local, q_offset))
    q_dip_new = _quat_normalize(_quat_mul(q_mcp, q_dip_local_new))

    corrected = dict(thumb_globals_by_packet_index)
    corrected[_THUMB_DIP_PACKET_INDEX] = q_dip_new
    return corrected


def apply_thumb_global_overrides(
    bones: list[mvn_datagram.Bone],
    thumb_globals_by_packet_index: dict[int, tuple[float, float, float, float]],
) -> list[mvn_datagram.Bone]:
    """Apply thumb global quaternion overrides onto packet-order bones in-place."""
    for packet_index, quat in thumb_globals_by_packet_index.items():
        if packet_index < 0 or packet_index >= len(bones):
            continue
        bones[packet_index] = mvn_datagram.Bone(
            translation=bones[packet_index].translation,
            quaternion=quat,
        )
    return bones
