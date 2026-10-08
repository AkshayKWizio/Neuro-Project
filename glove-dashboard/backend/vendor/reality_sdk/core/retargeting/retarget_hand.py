from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.core_data_classes import HandData
from core.retargeting import retarget_helper
from core.retargeting.retarget_helper import JointPose
from core.retargeting.target_transform import JointType, SliderName, TargetTransform


def _pick(payload: dict, *keys: str, default=None):
    for key in keys:
        if key in payload:
            return payload[key]
    return default


def _normalize_joint_type(value: Any) -> JointType:
    if isinstance(value, JointType):
        return value
    if isinstance(value, int):
        return JointType(int(value))
    if isinstance(value, str):
        normalized = value.strip().upper().replace("-", "_")
        aliases = {
            "BENDSPLAY": "BEND_SPLAY",
            "BEND_SPLAY": "BEND_SPLAY",
            "BENDSPLAYTWIST": "BEND_SPLAY_TWIST",
            "BEND_SPLAY_TWIST": "BEND_SPLAY_TWIST",
        }
        if normalized in aliases:
            normalized = aliases[normalized]
        return JointType[normalized]
    raise ValueError(f"Invalid joint_type value: {value!r}")


def _normalize_slider_name(value: Any) -> SliderName:
    if isinstance(value, SliderName):
        return value
    if isinstance(value, int):
        return SliderName(int(value))
    if isinstance(value, str):
        normalized = value.strip().upper()
        return SliderName[normalized]
    raise ValueError(f"Invalid slider value: {value!r}")


def _infer_joint_type_from_drivers(entry: dict) -> JointType:
    try:
        twist = _normalize_slider_name(_pick(entry, "twist_driver", "twistDriver", default=SliderName.NONE.value))
        splay = _normalize_slider_name(_pick(entry, "splay_driver", "splayDriver", default=SliderName.NONE.value))
    except (ValueError, KeyError):
        return JointType.BEND
    if twist != SliderName.NONE:
        return JointType.BEND_SPLAY_TWIST
    if splay != SliderName.NONE:
        return JointType.BEND_SPLAY
    return JointType.BEND


def _parse_target_transform_entry(entry: dict, target_lookup: dict[str, Any] | None = None) -> TargetTransform:
    if not isinstance(entry, dict):
        raise ValueError("Each target transform entry must be an object.")

    target_name = _pick(entry, "target_name", "targetName", "jointName", "target")
    target_object = target_name
    if isinstance(target_name, str):
        if target_lookup and target_name in target_lookup:
            target_object = target_lookup[target_name]
        else:
            target_object = {"name": target_name}

    joint_type_raw = _pick(entry, "joint_type", "jointType", default=None)
    joint_type = _infer_joint_type_from_drivers(entry) if joint_type_raw is None else _normalize_joint_type(joint_type_raw)
    bend_driver = _normalize_slider_name(_pick(entry, "bend_driver", "bendDriver", default=SliderName.NONE.value))
    splay_driver = _normalize_slider_name(_pick(entry, "splay_driver", "splayDriver", default=SliderName.NONE.value))
    twist_driver = _normalize_slider_name(_pick(entry, "twist_driver", "twistDriver", default=SliderName.NONE.value))

    return TargetTransform(
        joint_type=joint_type,
        target=target_object,
        bend_driver=bend_driver,
        bend_start=float(_pick(entry, "bend_start", "bendStart", default=0.0)),
        bend_end=float(_pick(entry, "bend_end", "bendEnd", default=1.0)),
        start_quat_1=_pick(entry, "start_quat_1", "startQuat1"),
        end_quat_1=_pick(entry, "end_quat_1", "endQuat1"),
        start_quat_2=_pick(entry, "start_quat_2", "startQuat2"),
        end_quat_2=_pick(entry, "end_quat_2", "endQuat2"),
        splay_driver=splay_driver,
        start_quat_3=_pick(entry, "start_quat_3", "startQuat3"),
        end_quat_3=_pick(entry, "end_quat_3", "endQuat3"),
        twist_driver=twist_driver,
        zero_quat=_pick(entry, "zero_quat", "zeroQuat"),
    )


def load_target_transforms_from_json(
    json_path: str | Path,
    target_lookup: dict[str, Any] | None = None,
) -> list[TargetTransform]:
    path = Path(json_path)
    with open(path, "r", encoding="utf-8-sig") as file_handle:
        payload = json.load(file_handle)

    entries = payload
    if isinstance(payload, dict):
        entries = _pick(payload, "target_transforms", "targetTransforms", default=[])

    if not isinstance(entries, list):
        raise ValueError(
            "Expected JSON array or object containing target_transforms/targetTransforms array."
        )

    target_transforms: list[TargetTransform] = []
    for entry in entries:
        target_transforms.append(_parse_target_transform_entry(entry, target_lookup=target_lookup))
    return target_transforms


def load_target_transforms_by_hand(
    json_path: str | Path,
    target_lookup: dict[str, Any] | None = None,
    preprocess_entries=None,
) -> dict[str, list[TargetTransform]]:
    """
    Load target transforms from a JSON file that organises entries by hand.

    Expected structure::

        {
            "Left":  [{"jointName": "...", "bendDriver": "...", ...}, ...],
            "Right": [...]
        }

    ``jointName`` is used as the target identifier (resolved via ``target_lookup``
    when provided). ``joint_type`` is inferred from splay/twist driver fields if
    not explicitly present in the entry.

    If ``preprocess_entries`` is provided it is called as
    ``preprocess_entries(entries, hand_label)`` on the raw list of entry dicts
    before any parsing takes place. It may modify entries in-place or return a
    replacement list.

    Returns ``{"left": [...], "right": [...]}``.
    """
    path = Path(json_path)
    with open(path, "r", encoding="utf-8-sig") as file_handle:
        payload = json.load(file_handle)

    if not isinstance(payload, dict):
        raise ValueError(f"{path.name} must be a JSON object with 'Left' and 'Right' keys.")

    result: dict[str, list[TargetTransform]] = {"left": [], "right": []}
    for hand_label, json_key in (("left", "Left"), ("right", "Right")):
        entries = payload.get(json_key, [])
        if not isinstance(entries, list):
            raise ValueError(f"Expected '{json_key}' to be a JSON array in {path.name}.")
        if preprocess_entries is not None:
            entries = preprocess_entries(entries, hand_label) or entries
        for entry in entries:
            result[hand_label].append(_parse_target_transform_entry(entry, target_lookup=target_lookup))
    return result


@dataclass
class RetargetHand:
    """
    Python equivalent of RetargetHand.cs focused on per-frame retarget execution.
    """

    enable_hand_animation: bool = True
    target_transforms: list[TargetTransform] = field(default_factory=list)
    joint_pose_table: list[JointPose] = field(default_factory=list)

    def set_target_transforms(self, target_transforms: list[TargetTransform]) -> None:
        self.target_transforms = target_transforms or []

    def load_target_transforms(
        self,
        json_path: str | Path,
        target_lookup: dict[str, Any] | None = None,
    ) -> list[TargetTransform]:
        self.target_transforms = load_target_transforms_from_json(
            json_path,
            target_lookup=target_lookup,
        )
        return self.target_transforms

    def load_target_transforms_by_hand(
        self,
        json_path: str | Path,
        hand_label: str,
        target_lookup: dict[str, Any] | None = None,
    ) -> list[TargetTransform]:
        """Load from a Left/Right-keyed JSON and store transforms for one hand."""
        result = load_target_transforms_by_hand(json_path, target_lookup=target_lookup)
        self.target_transforms = result.get(hand_label.lower(), [])
        return self.target_transforms

    def do_retarget(
        self,
        hand_data: HandData,
        target_transforms: list[TargetTransform] | None = None,
    ) -> list[JointPose]:
        """
        Calculate target joint rotations from the provided sliders and target transforms.
        """
        active_target_transforms = self.target_transforms if target_transforms is None else (target_transforms or [])
        if not active_target_transforms:
            self.joint_pose_table = []
            return self.joint_pose_table

        self.joint_pose_table = retarget_helper.update_joint_table(active_target_transforms, hand_data)

        if self.enable_hand_animation:
            retarget_helper.update_joint_rotations(self.joint_pose_table)

        return self.joint_pose_table
