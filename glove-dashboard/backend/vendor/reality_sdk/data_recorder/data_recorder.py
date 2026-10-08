import csv
import datetime
import os
import sys
import threading
from dataclasses import asdict, is_dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from core.config import HANDEDNESS
from core.osc_addresses import OSCKey
from core.runtime_profiles import resolve_editable_profile
from core.shared_state import SharedState


class DataRecorder:
    """
    Records flattened SharedState snapshots to CSV.
    """
    EXCLUDED_COLUMN_PREFIXES = (
        "controller.header.",
        "kinematic.header.",
        "orientation.header.",
        "kinematic.joints[",
    )
    EXCLUDED_COLUMN_SUFFIXES = (
        ".name",
    )
    JOINT_COLUMN_PREFIX = "kinematic.joint."
    JOINT_ORDER = {
        "hand": -2,
        "palm": -1,
        "thumb_cmc": 0,
        "thumb_mcp": 1,
        "thumb_pip": 2,
        "thumb_dip": 3,
        "thumb_tip": 4,
        "index_cmc": 10,
        "index_mcp": 11,
        "index_pip": 12,
        "index_dip": 13,
        "index_tip": 14,
        "middle_cmc": 20,
        "middle_mcp": 21,
        "middle_pip": 22,
        "middle_dip": 23,
        "middle_tip": 24,
        "ring_cmc": 30,
        "ring_mcp": 31,
        "ring_pip": 32,
        "ring_dip": 33,
        "ring_tip": 34,
        "pinky_cmc": 40,
        "pinky_mcp": 41,
        "pinky_pip": 42,
        "pinky_dip": 43,
        "pinky_tip": 44,
    }
    JOINT_VALUE_ORDER = {
        "orientation.w": 0,
        "orientation.x": 1,
        "orientation.y": 2,
        "orientation.z": 3,
        "position.x": 4,
        "position.y": 5,
        "position.z": 6,
    }

    def __init__(
        self,
        home_directory: str,
        sub_directory: str = "",
        filename_prefix: str = "",
        significant_figures: int | None = 6,
        include_joint_position: bool = True,
        include_joint_rotation: bool = True,
        include_sliders: bool = True,
        include_orientation: bool = True,
        include_controller_output: bool = True,
        include_received_openxr_configuration: bool = True,
    ):
        self.home_directory = home_directory
        self.sub_directory = sub_directory
        self.significant_figures = significant_figures if significant_figures and significant_figures > 0 else None
        self.include_joint_position = include_joint_position
        self.include_joint_rotation = include_joint_rotation
        self.include_sliders = include_sliders
        self.include_orientation = include_orientation
        self.include_controller_output = include_controller_output
        self.include_received_openxr_configuration = include_received_openxr_configuration
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')
        self.filename = f"{filename_prefix}_{timestamp}" if str(filename_prefix).strip() else timestamp
        self.csv_file_paths: dict[int, str] = {}
        self.csv_files: dict[int, Any] = {}
        self.csv_writers: dict[int, Any] = {}
        self.value_columns_by_hand: dict[int, list[str]] = {}
        self.open_log_file()

    def open_log_file(self):
        if getattr(sys, "frozen", False):
            self.home_directory = os.path.dirname(sys.executable)
        elif not str(self.home_directory).strip():
            self.home_directory = os.getcwd()

        csv_dir = os.path.join(self.home_directory, self.sub_directory)
        os.makedirs(csv_dir, exist_ok=True)

        for handedness, suffix in (
            (HANDEDNESS.LEFT, "left"),
            (HANDEDNESS.RIGHT, "right"),
        ):
            path = os.path.join(csv_dir, f"{self.filename}_{suffix}.csv")
            self.csv_file_paths[handedness] = path
            csv_file = open(path, "w", newline="", encoding="utf-8")
            self.csv_files[handedness] = csv_file
            self.csv_writers[handedness] = csv.writer(csv_file)
            self.value_columns_by_hand[handedness] = []

    def close_log_file(self):
        for handedness in (HANDEDNESS.LEFT, HANDEDNESS.RIGHT):
            csv_file = self.csv_files.get(handedness)
            if csv_file:
                csv_file.close()
        self.csv_files.clear()
        self.csv_writers.clear()
        self.value_columns_by_hand.clear()

    def log_hand_snapshot(self, packet_key: str, handedness: int, hand_data: Any):
        csv_writer = self.csv_writers.get(handedness)
        if not csv_writer:
            return

        serialized = self._to_jsonable(hand_data)
        flattened: dict[str, Any] = {}
        self._flatten("", serialized, flattened)
        flattened = self._filter_flattened_columns(flattened)
        flattened = self._normalize_column_names(flattened)
        flattened = self._apply_include_filters(flattened)

        columns = self.value_columns_by_hand.get(handedness, [])
        if not columns:
            columns = sorted(flattened.keys(), key=self._column_sort_key)
            self.value_columns_by_hand[handedness] = columns
            csv_writer.writerow(["timestamp", "packet_key", "handedness"] + columns)

        row = [
            datetime.datetime.now().isoformat(),
            packet_key,
            handedness,
        ] + [self._format_value(flattened.get(column, "")) for column in columns]
        csv_writer.writerow(row)

    def _to_jsonable(self, value: Any):
        if isinstance(value, Enum):
            return value.value
        if is_dataclass(value):
            return self._to_jsonable(asdict(value))
        if isinstance(value, dict):
            return {str(key): self._to_jsonable(inner) for key, inner in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._to_jsonable(inner) for inner in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

    def _flatten(self, prefix: str, value: Any, out: dict[str, Any]):
        if isinstance(value, dict):
            for key, inner_value in value.items():
                next_prefix = f"{prefix}.{key}" if prefix else str(key)
                self._flatten(next_prefix, inner_value, out)
            return
        if isinstance(value, list):
            for index, inner_value in enumerate(value):
                next_prefix = f"{prefix}[{index}]"
                self._flatten(next_prefix, inner_value, out)
            return
        out[prefix] = value

    def _filter_flattened_columns(self, flattened: dict[str, Any]) -> dict[str, Any]:
        return {
            column: value
            for column, value in flattened.items()
            if self._should_keep_column(column)
        }

    def _should_keep_column(self, column: str) -> bool:
        for prefix in self.EXCLUDED_COLUMN_PREFIXES:
            if column.startswith(prefix):
                return False
        for suffix in self.EXCLUDED_COLUMN_SUFFIXES:
            if column.endswith(suffix):
                return False
        return True

    def _normalize_column_names(self, flattened: dict[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for column, value in flattened.items():
            normalized_column = (
                column[len(self.JOINT_COLUMN_PREFIX):]
                if column.startswith(self.JOINT_COLUMN_PREFIX)
                else column
            )
            normalized[normalized_column] = value
        return normalized

    def _column_sort_key(self, column: str) -> tuple[int, int, int, str]:
        joint_name, sep, joint_field = column.partition(".")
        joint_index = self.JOINT_ORDER.get(joint_name)
        if sep and joint_index is not None:
            value_index = self.JOINT_VALUE_ORDER.get(joint_field, 999)
            return (0, joint_index, value_index, column)
        return (1, 0, 0, column)

    def _format_value(self, value: Any) -> Any:
        if (
            self.significant_figures is not None
            and isinstance(value, float)
            and not isinstance(value, bool)
        ):
            return format(value, f".{self.significant_figures}g")
        return value

    def _apply_include_filters(self, flattened: dict[str, Any]) -> dict[str, Any]:
        if (
            self.include_joint_position
            and self.include_joint_rotation
            and self.include_sliders
            and self.include_orientation
            and self.include_controller_output
            and self.include_received_openxr_configuration
        ):
            return flattened

        filtered: dict[str, Any] = {}
        for column, value in flattened.items():
            if not self.include_sliders and self._column_matches_group(column, "sliders"):
                continue
            if not self.include_orientation and self._column_matches_group(column, "orientation"):
                continue
            if not self.include_controller_output and (
                self._column_matches_group(column, "controller")
                or self._column_matches_group(column, "controller.inputs")
            ):
                continue
            if not self.include_received_openxr_configuration and (
                self._column_matches_group(column, "tracker_offset")
                or self._column_matches_group(column, "tracker_offset_calibration")
                or self._column_matches_group(column, "tracker_location")
                or self._column_matches_group(column, "tracker_source")
                or self._column_matches_group(column, "button_passthrough")
            ):
                continue

            joint_column = (
                column[len(self.JOINT_COLUMN_PREFIX):]
                if column.startswith(self.JOINT_COLUMN_PREFIX)
                else column
            )
            joint_name, sep, joint_field = joint_column.partition(".")
            if sep and (
                joint_name in self.JOINT_ORDER
                or column.startswith(self.JOINT_COLUMN_PREFIX)
            ):
                if not self.include_joint_position and joint_field.startswith("position."):
                    continue
                if not self.include_joint_rotation and joint_field.startswith("orientation."):
                    continue

            filtered[column] = value

        return filtered

    def _column_matches_group(self, column: str, group: str) -> bool:
        return column == group or column.startswith(f"{group}.")


def load_data_recorder_profile(path: str) -> Optional[dict]:
    import yaml

    default_path = Path(__file__).parent / path
    resolved_path = resolve_editable_profile(default_path, path, "DataRecorder")
    if resolved_path is None:
        print(f"[DataRecorder] Profile not found: {default_path}")
        return None
    try:
        with open(resolved_path, "r", encoding="utf-8") as file_handle:
            return yaml.safe_load(file_handle) or {}
    except Exception as error:
        print(f"[DataRecorder] Failed to load profile: {error}")
        return None


def _parse_profile_bool(profile: dict, keys: list[str], default: bool) -> bool:
    for key in keys:
        if key not in profile:
            continue
        value = profile.get(key)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on"}:
                return True
            if normalized in {"false", "0", "no", "off"}:
                return False
        if isinstance(value, (int, float)):
            return bool(value)
    return default


def data_recorder_loop(
    shared: SharedState,
    stop_event: threading.Event,
    init_complete_event: threading.Event,
    profile: Optional[dict] = None,
):
    if profile is None:
        profile = load_data_recorder_profile("data_recorder_profile.yaml")
        if profile is None:
            return

    home_directory_value = profile.get("home_directory", "")
    home_directory = "" if home_directory_value is None else str(home_directory_value)

    sub_directory_value = profile.get("sub_directory", "recordings")
    sub_directory = "recordings" if sub_directory_value is None else str(sub_directory_value)

    filename_prefix_value = profile.get("filename_prefix", "")
    filename_prefix = "" if filename_prefix_value is None else str(filename_prefix_value)

    significant_figures_value = profile.get("significant_figures", 6)
    if significant_figures_value is None:
        significant_figures = None
    else:
        try:
            parsed_sig_figs = int(significant_figures_value)
            significant_figures = parsed_sig_figs if parsed_sig_figs > 0 else None
        except (TypeError, ValueError):
            significant_figures = 6

    include_controller_output = _parse_profile_bool(profile, ["include_controller_output"], True)
    include_joint_position = _parse_profile_bool(profile, ["include_joint_position"], True)
    include_joint_rotation = _parse_profile_bool(profile, ["include_joint_rotation"], True)
    include_orientation = _parse_profile_bool(profile, ["include_orientation"], True)
    include_sliders = _parse_profile_bool(profile, ["include_sliders"], True)
    include_received_openxr_configuration = _parse_profile_bool(profile, ["include_openxr_configuration"], True)

    recorder = DataRecorder(
        home_directory=home_directory,
        sub_directory=sub_directory,
        filename_prefix=filename_prefix,
        significant_figures=significant_figures,
        include_joint_position=include_joint_position,
        include_joint_rotation=include_joint_rotation,
        include_sliders=include_sliders,
        include_orientation=include_orientation,
        include_controller_output=include_controller_output,
        include_received_openxr_configuration=include_received_openxr_configuration,
    )
    left_path = recorder.csv_file_paths.get(HANDEDNESS.LEFT, "")
    right_path = recorder.csv_file_paths.get(HANDEDNESS.RIGHT, "")
    print(f"[DataRecorder] Loop started. Writing to {left_path} and {right_path}")
    init_complete_event.set()

    try:
        while not stop_event.is_set():
            packet_event = shared.get_next_packet_event(timeout_s=0.25)
            if packet_event is None:
                continue
            packet_key, handedness = packet_event
            if packet_key != OSCKey.KINEMATIC:
                continue
            hand = shared.get_hand(handedness)
            recorder.log_hand_snapshot(packet_key, handedness, hand)
    finally:
        recorder.close_log_file()
        print("[DataRecorder] Loop stopped")
