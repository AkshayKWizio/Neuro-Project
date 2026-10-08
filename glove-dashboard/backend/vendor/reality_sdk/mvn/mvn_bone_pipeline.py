"""Bone pipeline helpers used by mvn_manager."""

import json
from pathlib import Path

from core.retargeting.retarget_helper import update_joint_table_from_slider_values
from mvn import mvn_datagram as mvn_datagram
from mvn.mvn_adjustments import _quat_mul, _quat_normalize
from mvn.mvn_maps import (
    KINEMATIC_INDEX_BY_PACKET_INDEX,
    PACKET_INDEX_BY_JOINT_NAME,
    PACKET_JOINT_NAME_BY_INDEX,
    PACKET_PARENT_INDEX_BY_PACKET_INDEX,
)


def apply_target_transforms_to_bones(target_transforms, slider_values: dict, bones: list) -> None:
    """Evaluate target transforms and write resulting quaternions into bones in-place."""
    if not target_transforms or not slider_values:
        return
    for jp in update_joint_table_from_slider_values(target_transforms, slider_values):
        packet_index = jp.joint
        if isinstance(packet_index, int) and 0 <= packet_index < len(bones):
            bones[packet_index] = mvn_datagram.Bone(
                translation=bones[packet_index].translation,
                quaternion=jp.quat,
            )


def get_selected_bones_from_kinematic(kinematic, default_bones, selected_packet_indices):
    """Overlay selected packet-index joints from kinematic onto default bones."""
    bones = [mvn_datagram.Bone(translation=bone.translation, quaternion=bone.quaternion) for bone in default_bones]
    if not kinematic:
        return bones

    max_count = len(bones)
    for packet_index in sorted(selected_packet_indices):
        if packet_index < 0 or packet_index >= max_count:
            continue
        if packet_index not in KINEMATIC_INDEX_BY_PACKET_INDEX:
            continue

        kinematic_joint_index = KINEMATIC_INDEX_BY_PACKET_INDEX[packet_index]
        if kinematic_joint_index < 0 or kinematic_joint_index >= len(kinematic.joints):
            continue

        joint = kinematic.joints[kinematic_joint_index]
        position = joint.position
        orientation = joint.orientation
        bones[packet_index] = mvn_datagram.Bone(
            translation=(position.x, position.y, position.z),
            quaternion=(orientation.x, orientation.y, orientation.z, orientation.w),
        )
    return bones


def resolve_selected_packet_indices(joint_names_from_profile, num_items_per_hand: int):
    if not joint_names_from_profile:
        return set(range(min(num_items_per_hand, len(PACKET_JOINT_NAME_BY_INDEX))))

    normalized_names = [str(name).strip().lower() for name in joint_names_from_profile]
    if "all" in normalized_names:
        return set(range(min(num_items_per_hand, len(PACKET_JOINT_NAME_BY_INDEX))))

    selected_indices = set()
    invalid_names = []
    for joint_name in normalized_names:
        packet_index = PACKET_INDEX_BY_JOINT_NAME.get(joint_name)
        if packet_index is None:
            invalid_names.append(joint_name)
            continue
        if packet_index < num_items_per_hand:
            selected_indices.add(packet_index)

    if invalid_names:
        valid_names = ", ".join(sorted(PACKET_INDEX_BY_JOINT_NAME.keys()))
        raise ValueError(
            f"Invalid replace_with_kinematic_joint_names: {invalid_names}. Valid names: {valid_names}, all"
        )
    return selected_indices


def load_default_bones_from_simple_json(json_path: Path, left_default_bones, right_default_bones):
    """
    Expected JSON shape:
    {
      "leftHand": {"wrist": {"position": [x,y,z], "quaternion": [x,y,z,w]}, ...},
      "rightHand": {"wrist": {"position": [x,y,z], "quaternion": [x,y,z,w]}, ...}
    }
    """
    if not json_path.exists():
        raise FileNotFoundError(f"Default bones JSON not found: {json_path}")

    with open(json_path, "r", encoding="utf-8-sig") as file_handle:
        data = json.load(file_handle)

    left_data = data.get("leftHand", {})
    right_data = data.get("rightHand", {})
    if not isinstance(left_data, dict) or not isinstance(right_data, dict):
        raise ValueError("Expected top-level leftHand/rightHand objects in default bones JSON.")

    def overlay_from_hand_data(base_bones, hand_data, hand_label):
        overlaid_bones = [mvn_datagram.Bone(bone.translation, bone.quaternion) for bone in base_bones]
        for joint_name, joint_payload in hand_data.items():
            if not isinstance(joint_payload, dict):
                continue
            normalized_joint_name = str(joint_name).strip().lower()
            packet_index = PACKET_INDEX_BY_JOINT_NAME.get(normalized_joint_name)
            if packet_index is None or packet_index >= len(overlaid_bones):
                continue

            default_bone = overlaid_bones[packet_index]
            translation = default_bone.translation
            quaternion = default_bone.quaternion

            if "position" in joint_payload:
                position = joint_payload["position"]
                if isinstance(position, (list, tuple)) and len(position) == 3:
                    translation = (float(position[0]), float(position[1]), float(position[2]))
                else:
                    raise ValueError(
                        f"Invalid position for {hand_label}.{normalized_joint_name}; expected 3 numbers."
                    )
            if "quaternion" in joint_payload:
                quat = joint_payload["quaternion"]
                if isinstance(quat, (list, tuple)) and len(quat) == 4:
                    quaternion = (float(quat[0]), float(quat[1]), float(quat[2]), float(quat[3]))
                else:
                    raise ValueError(
                        f"Invalid quaternion for {hand_label}.{normalized_joint_name}; expected 4 numbers."
                    )

            overlaid_bones[packet_index] = mvn_datagram.Bone(translation=translation, quaternion=quaternion)
        return overlaid_bones

    return (
        overlay_from_hand_data(left_default_bones, left_data, "leftHand"),
        overlay_from_hand_data(right_default_bones, right_data, "rightHand"),
    )


def convert_local_quaternions_to_global(bones):
    """Convert packet-order local quaternions to global quaternions using hand hierarchy."""
    if not bones:
        return bones

    global_quaternions = []
    converted_bones = []
    for packet_index in range(len(bones)):
        local_quaternion = _quat_normalize(bones[packet_index].quaternion)
        parent_index = PACKET_PARENT_INDEX_BY_PACKET_INDEX.get(packet_index, -1)

        if parent_index < 0:
            global_quaternion = local_quaternion
        elif parent_index >= len(global_quaternions):
            global_quaternion = local_quaternion
        else:
            global_quaternion = _quat_normalize(_quat_mul(global_quaternions[parent_index], local_quaternion))

        global_quaternions.append(global_quaternion)
        converted_bones.append(
            mvn_datagram.Bone(
                translation=bones[packet_index].translation,
                quaternion=global_quaternion,
            )
        )
    return converted_bones


def manual_thumb_overrides_to_packet_map(
    cmc_quat: tuple[float, float, float, float] | None,
    mcp_quat: tuple[float, float, float, float] | None,
    dip_quat: tuple[float, float, float, float] | None,
) -> dict[int, tuple[float, float, float, float]]:
    output: dict[int, tuple[float, float, float, float]] = {}
    cmc_index = PACKET_INDEX_BY_JOINT_NAME.get("thumb_cmc")
    mcp_index = PACKET_INDEX_BY_JOINT_NAME.get("thumb_mcp")
    dip_index = PACKET_INDEX_BY_JOINT_NAME.get("thumb_dip")
    if cmc_index is not None and cmc_quat is not None:
        output[cmc_index] = tuple(float(v) for v in cmc_quat)
    if mcp_index is not None and mcp_quat is not None:
        output[mcp_index] = tuple(float(v) for v in mcp_quat)
    if dip_index is not None and dip_quat is not None:
        output[dip_index] = tuple(float(v) for v in dip_quat)
    return output
