"""Shared mapping constants for MVN hand packet/joint conversions."""

# MVN packet-local index -> joint name (20 joints, no tips).
PACKET_JOINT_NAME_BY_INDEX = {
    0: "wrist",
    1: "thumb_cmc",
    2: "thumb_mcp",
    3: "thumb_dip",
    4: "index_cmc",
    5: "index_mcp",
    6: "index_pip",
    7: "index_dip",
    8: "middle_cmc",
    9: "middle_mcp",
    10: "middle_pip",
    11: "middle_dip",
    12: "ring_cmc",
    13: "ring_mcp",
    14: "ring_pip",
    15: "ring_dip",
    16: "pinky_cmc",
    17: "pinky_mcp",
    18: "pinky_pip",
    19: "pinky_dip",
}

# Joint name -> kinematic packet index (XR joints without tips).
KINEMATIC_INDEX_BY_JOINT_NAME = {
    "wrist": 1,
    "thumb_cmc": 2,
    "thumb_mcp": 3,
    "thumb_dip": 4,
    "index_cmc": 6,
    "index_mcp": 7,
    "index_pip": 8,
    "index_dip": 9,
    "middle_cmc": 11,
    "middle_mcp": 12,
    "middle_pip": 13,
    "middle_dip": 14,
    "ring_cmc": 16,
    "ring_mcp": 17,
    "ring_pip": 18,
    "ring_dip": 19,
    "pinky_cmc": 21,
    "pinky_mcp": 22,
    "pinky_pip": 23,
    "pinky_dip": 24,
}

PACKET_INDEX_BY_JOINT_NAME = {
    joint_name: packet_index
    for packet_index, joint_name in PACKET_JOINT_NAME_BY_INDEX.items()
}

THUMB_PACKET_INDICES = [
    packet_index
    for packet_index, joint_name in PACKET_JOINT_NAME_BY_INDEX.items()
    if joint_name.startswith("thumb_")
]

NON_THUMB_FINGER_PACKET_INDICES = [
    packet_index
    for packet_index, joint_name in PACKET_JOINT_NAME_BY_INDEX.items()
    if joint_name.startswith("index_")
    or joint_name.startswith("middle_")
    or joint_name.startswith("ring_")
    or joint_name.startswith("pinky_")
]

KINEMATIC_INDEX_BY_PACKET_INDEX = {
    packet_index: KINEMATIC_INDEX_BY_JOINT_NAME[joint_name]
    for packet_index, joint_name in PACKET_JOINT_NAME_BY_INDEX.items()
}

# Packet-local parent map for converting local rotations to global rotations.
PACKET_PARENT_INDEX_BY_PACKET_INDEX = {
    0: -1,  # wrist
    1: 0, 2: 1, 3: 2,              # thumb
    4: 0, 5: 4, 6: 5, 7: 6,        # index
    8: 0, 9: 8, 10: 9, 11: 10,     # middle
    12: 0, 13: 12, 14: 13, 15: 14, # ring
    16: 0, 17: 16, 18: 17, 19: 18, # pinky
}

# Maps Unity-style bone name suffixes (as used in mo_simple_reality.json jointName field)
# to MVN packet joint names. Prefixed with "Left"/"Right" to form the full jointName key.
_OPENXR_BONE_SUFFIX_TO_MVN: dict[str, str] = {
    "ThumbMetacarpal": "thumb_cmc",
    "ThumbProximal": "thumb_mcp",
    "ThumbDistal": "thumb_dip",
    "IndexMetacarpal": "index_cmc",
    "IndexProximal": "index_mcp",
    "IndexIntermediate": "index_pip",
    "IndexDistal": "index_dip",
    "MiddleMetacarpal": "middle_cmc",
    "MiddleProximal": "middle_mcp",
    "MiddleIntermediate": "middle_pip",
    "MiddleDistal": "middle_dip",
    "RingMetacarpal": "ring_cmc",
    "RingProximal": "ring_mcp",
    "RingIntermediate": "ring_pip",
    "RingDistal": "ring_dip",
    "PinkyMetacarpal": "pinky_cmc",
    "PinkyProximal": "pinky_mcp",
    "PinkyIntermediate": "pinky_pip",
    "PinkyDistal": "pinky_dip",
}

# Full jointName (e.g. "LeftIndexProximal") -> MVN packet index used as TargetTransform.target.
OPENXR_JOINT_TO_PACKET_INDEX: dict[str, int] = {
    f"{prefix}{suffix}": PACKET_INDEX_BY_JOINT_NAME[mvn_name]
    for prefix in ("Left", "Right")
    for suffix, mvn_name in _OPENXR_BONE_SUFFIX_TO_MVN.items()
}
