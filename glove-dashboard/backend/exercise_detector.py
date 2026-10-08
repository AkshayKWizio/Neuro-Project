"""Exercise detectors for the local glove dashboard.

The two wrist-orientation detectors are ported from Gloves.Exercise.cs without
retuning. Hand open/close uses EMA/windowed motion of four MCP quaternion X values.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable

Vector3 = tuple[float, float, float]
Quaternion = tuple[float, float, float, float]


def _add(a: Vector3, b: Vector3) -> Vector3:
    return a[0] + b[0], a[1] + b[1], a[2] + b[2]


def _scale(value: Vector3, factor: float) -> Vector3:
    return value[0] * factor, value[1] * factor, value[2] * factor


def _dot(a: Vector3, b: Vector3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _magnitude(value: Vector3) -> float:
    return math.sqrt(_dot(value, value))


def _normalize_vector(value: Vector3) -> Vector3:
    magnitude = _magnitude(value)
    return (0.0, 0.0, 0.0) if magnitude < 1e-6 else _scale(value, 1.0 / magnitude)


def _normalize_quaternion(value: Quaternion) -> Quaternion:
    magnitude = math.sqrt(sum(component * component for component in value))
    return (0.0, 0.0, 0.0, 1.0) if magnitude < 1e-6 else tuple(component / magnitude for component in value)  # type: ignore[return-value]


def _quaternion_inverse(value: Quaternion) -> Quaternion:
    norm = sum(component * component for component in value)
    if norm < 1e-6:
        return 0.0, 0.0, 0.0, 1.0
    return -value[0] / norm, -value[1] / norm, -value[2] / norm, value[3] / norm


def _quaternion_multiply(a: Quaternion, b: Quaternion) -> Quaternion:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def _rotate_vector(rotation: Quaternion, value: Vector3) -> Vector3:
    vector_quaternion = value[0], value[1], value[2], 0.0
    rotated = _quaternion_multiply(
        _quaternion_multiply(rotation, vector_quaternion),
        _quaternion_inverse(rotation),
    )
    return rotated[0], rotated[1], rotated[2]


def _to_angle_axis(rotation: Quaternion) -> tuple[float, Vector3]:
    x, y, z, w = _normalize_quaternion(rotation)
    angle = math.degrees(2.0 * math.acos(max(-1.0, min(1.0, w))))
    denominator = math.sqrt(max(0.0, 1.0 - w * w))
    axis = (0.0, 0.0, 0.0) if denominator < 1e-6 else (x / denominator, y / denominator, z / denominator)
    if _magnitude(axis) < 1e-6 or math.isclose(angle, 0.0):
        return 0.0, (0.0, 0.0, 0.0)
    axis = _normalize_vector(axis)
    if angle > 180.0:
        angle -= 360.0
        axis = _scale(axis, -1.0)
    return angle, axis


@dataclass
class RotationSample:
    signed_rotation_degrees: Vector3
    timestamp: float
    orientation: Quaternion


class WristPronationSupinationDetector:
    """Exact active quaternion-delta path from WristPronationSupinationDetector."""

    window_seconds = 1.0
    velocity_ema_alpha = 0.2
    movement_start_velocity_deg_per_sec = 40.0
    stabilization_velocity_deg_per_sec = 20.0
    stabilization_duration = 0.12
    min_accumulated_rotation_deg = 40.0
    direction_consistency_required = 0.50
    palm_local_normal: Vector3 = (0.0, 1.0, 0.0)
    palm_dot_change_threshold = 0.08

    def __init__(self, on_detected: Callable[[str, float], None], invert_pronation_sign: bool = False) -> None:
        self.on_detected = on_detected
        self.invert_pronation_sign = invert_pronation_sign
        self.buffer: list[RotationSample] = []
        self.smoothed_angular_velocity = 0.0
        self.previous_orientation: Quaternion | None = None
        self.previous_timestamp = 0.0
        self.state = "idle"
        self.stabilization_timer = 0.0
        self.movement_start_time = 0.0
        self.projected_net = 0.0
        self.consistency = 0.0
        self.palm_dot_change = 0.0

    def add_orientation_sample(self, orientation: Quaternion, timestamp: float) -> None:
        if self.previous_orientation is None:
            self.previous_orientation = orientation
            self.previous_timestamp = timestamp
            return

        dt = max(1e-6, timestamp - self.previous_timestamp)
        delta = _quaternion_multiply(_quaternion_inverse(self.previous_orientation), orientation)
        angle_degrees, axis = _to_angle_axis(delta)
        signed_rotation = _scale(axis, angle_degrees)
        self.buffer.append(RotationSample(signed_rotation, timestamp, orientation))
        cutoff = timestamp - self.window_seconds
        self.buffer = [sample for sample in self.buffer if sample.timestamp >= cutoff]

        instant_velocity = abs(angle_degrees) / dt
        self.smoothed_angular_velocity = (
            self.velocity_ema_alpha * instant_velocity
            + (1.0 - self.velocity_ema_alpha) * self.smoothed_angular_velocity
        )
        self.previous_orientation = orientation
        self.previous_timestamp = timestamp
        self._update_state_machine(timestamp, dt)

    def _update_state_machine(self, now: float, dt: float) -> None:
        net_rotation = (0.0, 0.0, 0.0)
        for sample in self.buffer:
            net_rotation = _add(net_rotation, sample.signed_rotation_degrees)
        dominant_axis = _normalize_vector(net_rotation)

        positive_sum = 0.0
        negative_sum = 0.0
        for sample in self.buffer:
            projection = _dot(sample.signed_rotation_degrees, dominant_axis)
            if projection >= 0.0:
                positive_sum += projection
            else:
                negative_sum += -projection

        self.projected_net = positive_sum - negative_sum
        total_absolute = positive_sum + negative_sum
        self.consistency = max(positive_sum, negative_sum) / total_absolute if total_absolute > 0.0 else 0.0

        if self.state == "idle":
            if self.smoothed_angular_velocity >= self.movement_start_velocity_deg_per_sec:
                self.state = "moving"
                self.movement_start_time = now
                self.stabilization_timer = 0.0
        elif self.smoothed_angular_velocity <= self.stabilization_velocity_deg_per_sec:
            self.stabilization_timer += dt
            if self.stabilization_timer >= self.stabilization_duration:
                self._evaluate_and_reset(now)
        else:
            self.stabilization_timer = 0.0
            if now - self.movement_start_time > self.window_seconds * 2.0:
                self._evaluate_and_reset(now)

    def _evaluate_and_reset(self, now: float) -> None:
        enough_rotation = abs(self.projected_net) >= self.min_accumulated_rotation_deg
        consistent_direction = self.consistency >= self.direction_consistency_required
        if not (enough_rotation and consistent_direction):
            self._clear_and_reset_state()
            return

        start_palm = (0.0, 0.0, 0.0)
        end_palm = (0.0, 0.0, 0.0)
        count = len(self.buffer)
        if count >= 2:
            quarter = max(1, count // 4)
            for sample in self.buffer[:quarter]:
                start_palm = _add(start_palm, _rotate_vector(sample.orientation, self.palm_local_normal))
            start_palm = _scale(start_palm, 1.0 / quarter)
            for sample in self.buffer[-quarter:]:
                end_palm = _add(end_palm, _rotate_vector(sample.orientation, self.palm_local_normal))
            end_palm = _scale(end_palm, 1.0 / quarter)

        start_dot_up = _dot(_normalize_vector(start_palm), (0.0, 1.0, 0.0))
        end_dot_up = _dot(_normalize_vector(end_palm), (0.0, 1.0, 0.0))
        self.palm_dot_change = end_dot_up - start_dot_up

        if abs(self.palm_dot_change) >= self.palm_dot_change_threshold:
            # This mapping deliberately matches the source code, including its sign convention.
            result = "pronation" if self.palm_dot_change > 0.0 else "supination"
        elif self.invert_pronation_sign:
            result = "pronation" if self.projected_net > 0.0 else "supination"
        else:
            result = "supination" if self.projected_net > 0.0 else "pronation"

        self.on_detected(result, now)
        self._clear_and_reset_state()

    def _clear_and_reset_state(self) -> None:
        self.buffer.clear()
        self.previous_orientation = None
        self.smoothed_angular_velocity = 0.0
        self.state = "idle"
        self.stabilization_timer = 0.0

    def snapshot(self) -> dict[str, float | str]:
        return {
            "state": self.state,
            "angular_velocity": round(self.smoothed_angular_velocity, 2),
            "projected_rotation": round(self.projected_net, 2),
            "direction_consistency": round(self.consistency, 3),
            "palm_dot_change": round(self.palm_dot_change, 4),
        }


@dataclass
class CircumductionSample:
    axis_angle: Vector3
    velocity: float
    timestamp: float


class WristCircumductionProbabilistic:
    """Exact score, hysteresis, and XZ signed-area path from the Unity source."""

    window_seconds = 0.5
    score_ema_alpha = 0.25
    enter_threshold = 0.75
    exit_threshold = 0.50
    min_angular_velocity = 20.0
    min_loop_strength = 0.6  # Retained exactly; the source declares but does not use it.
    smoothing_alpha = 0.2

    def __init__(self, on_detected: Callable[[str, float], None]) -> None:
        self.on_detected = on_detected
        self.buffer: list[CircumductionSample] = []
        self.previous_rotation: Quaternion | None = None
        self.previous_timestamp = 0.0
        self.smoothed_rotation: Quaternion | None = None
        self.smoothed_score = 0.0
        self.state = "idle"
        self.loop_strength = 0.0
        self.average_velocity = 0.0
        self.signed_area = 0.0

    def _smoothed_quaternion(self, current: Quaternion) -> Quaternion:
        if self.smoothed_rotation is None:
            self.smoothed_rotation = current
            return current
        self.smoothed_rotation = _normalize_quaternion(tuple(
            self.smoothing_alpha * current[index]
            + (1.0 - self.smoothing_alpha) * self.smoothed_rotation[index]
            for index in range(4)
        ))  # type: ignore[arg-type]
        return self.smoothed_rotation

    def add_orientation(self, wrist_rotation: Quaternion, timestamp: float) -> None:
        if self.previous_rotation is None:
            self.previous_rotation = wrist_rotation
            self.previous_timestamp = timestamp
            return

        wrist_rotation = self._smoothed_quaternion(wrist_rotation)
        dt = max(0.0001, timestamp - self.previous_timestamp)
        delta = _quaternion_multiply(_quaternion_inverse(self.previous_rotation), wrist_rotation)
        angle, axis = _to_angle_axis(delta)
        axis_angle = _scale(axis, angle)
        velocity = abs(angle) / dt
        self.previous_rotation = wrist_rotation
        self.previous_timestamp = timestamp

        self.buffer.append(CircumductionSample(axis_angle, velocity, timestamp))
        cutoff = timestamp - self.window_seconds
        self.buffer = [sample for sample in self.buffer if sample.timestamp >= cutoff]

        score = self._compute_score()
        self.smoothed_score = self.score_ema_alpha * score + (1.0 - self.score_ema_alpha) * self.smoothed_score
        self._update_state(timestamp)

    def _compute_score(self) -> float:
        if len(self.buffer) < 5:
            self.loop_strength = 0.0
            self.average_velocity = 0.0
            return 0.0
        axis_sum = (0.0, 0.0, 0.0)
        total_velocity = 0.0
        for sample in self.buffer:
            axis_sum = _add(axis_sum, sample.axis_angle)
            total_velocity += sample.velocity
        mean = _scale(axis_sum, 1.0 / len(self.buffer))
        self.loop_strength = _magnitude(mean)
        self.average_velocity = total_velocity / len(self.buffer)
        velocity_factor = 0.0 if self.average_velocity < self.min_angular_velocity else 1.0
        return max(0.0, min(1.0, self.loop_strength / 1.0)) * velocity_factor

    def _update_state(self, timestamp: float) -> None:
        if self.state == "idle":
            if self.smoothed_score >= self.enter_threshold:
                self.state = "active"
        elif self.smoothed_score <= self.exit_threshold:
            self.state = "idle"
            result = self._evaluate_final_direction()
            self.on_detected(result, timestamp)
            self.buffer.clear()

    def _evaluate_final_direction(self) -> str:
        if len(self.buffer) < 10:
            self.signed_area = 0.0
            return "none"
        self.signed_area = 0.0
        for index in range(1, len(self.buffer)):
            previous = self.buffer[index - 1].axis_angle
            current = self.buffer[index].axis_angle
            self.signed_area += previous[0] * current[2] - current[0] * previous[2]
        if abs(self.signed_area) < 0.01:
            return "none"
        return "clockwise" if self.signed_area > 0.0 else "anticlockwise"

    def snapshot(self) -> dict[str, float | str]:
        return {
            "state": self.state,
            "score": round(self.smoothed_score, 3),
            "loop_strength": round(self.loop_strength, 3),
            "average_velocity": round(self.average_velocity, 2),
            "signed_area": round(self.signed_area, 3),
        }


class HandOpenCloseDetector:
    """EMA/windowed MCP motion with a persistent endpoint reference.

    Absolute thresholds establish only the initial pose. Subsequent transitions
    require 0.30 relative travel, not a particular destination value.
    """

    mcp_names = frozenset(f"{finger}_mcp" for finger in ("index", "middle", "ring", "pinky"))
    open_threshold = 0.25
    close_threshold = 0.40
    minimum_travel = 0.30
    window_seconds = 1.0
    ema_time_constant = 0.15  # Approximately alpha=0.20 at 30 Hz.
    consistency_required = 0.65

    def __init__(self, on_detected: Callable[[str, float], None]) -> None:
        self.on_detected = on_detected
        self.raw_flexion = 0.0
        self.smoothed_flexion: float | None = None
        self.mcp_sum = 0.0
        self.mcp_count = 0
        self.mcp_values: dict[str, float] = {}
        self.state = "unknown"
        self.confidence = 0.0
        self.reference: float | None = None
        self.previous_timestamp: float | None = None
        self.window: deque[tuple[float, float]] = deque()
        self.velocity = 0.0
        self.travel = 0.0
        self.consistency = 0.0
        self.motion = "waiting"

    def add_joints(self, joints: list, timestamp: float) -> None:
        values = {}
        for joint in joints:
            name = joint.name.lower()
            if name not in self.mcp_names:
                continue
            value = float(joint.orientation.x)
            if not math.isfinite(value):
                return
            values[name] = value
        self.mcp_count = len(values)
        if self.mcp_count != 4 or not math.isfinite(timestamp):
            return
        if self.previous_timestamp is not None and timestamp <= self.previous_timestamp:
            return
        self.mcp_values = values
        self.mcp_sum = sum(values.values())
        self.raw_flexion = self.mcp_sum / self.mcp_count
        dt = timestamp - self.previous_timestamp if self.previous_timestamp is not None else 0.0
        # Do not infer a movement across a disconnected/stale stream.
        if dt > 1.5:
            self.smoothed_flexion = None
            self.state = "unknown"
            self.reference = None
            self.window.clear()
            self.travel = self.velocity = self.consistency = self.confidence = 0.0
        if self.smoothed_flexion is None:
            self.smoothed_flexion = self.raw_flexion
        else:
            alpha = 1.0 - math.exp(-dt / self.ema_time_constant)
            self.smoothed_flexion += alpha * (self.raw_flexion - self.smoothed_flexion)
        self.previous_timestamp = timestamp
        filtered = self.smoothed_flexion
        self.window.append((timestamp, filtered))
        while len(self.window) > 1 and self.window[0][0] < timestamp - self.window_seconds:
            self.window.popleft()
        duration = timestamp - self.window[0][0]
        self.velocity = (filtered - self.window[0][1]) / duration if duration > 0 else 0.0

        if self.state == "unknown":
            if filtered < self.open_threshold:
                self.state = "open"
            elif filtered > self.close_threshold:
                self.state = "closed"
            else:
                self.motion = "waiting"
                return
            self.reference = filtered
            self.motion = "idle"
            return

        # Preserve the endpoint outside the short window: slow movements count.
        closing = self.state == "open"
        self.reference = min(self.reference, filtered) if closing else max(self.reference, filtered)
        self.travel = (filtered - self.reference) if closing else (self.reference - filtered)
        samples = list(self.window)
        changes = [samples[i][1] - samples[i - 1][1] for i in range(1, len(samples))]
        total = sum(abs(change) for change in changes)
        expected = sum(max(0.0, change if closing else -change) for change in changes)
        self.consistency = expected / total if total > 1e-8 else 0.0
        self.confidence = min(1.0, self.travel / self.minimum_travel) * self.consistency
        self.motion = ("closing" if closing else "opening") if self.travel > 0.01 and self.consistency >= self.consistency_required else "idle"
        # Small tolerance allows an exact 0.30 endpoint despite EMA asymptote.
        if self.travel < self.minimum_travel - 0.0001 or self.consistency < self.consistency_required:
            return
        self.state = "closed" if closing else "open"
        self.on_detected("wrist_close" if closing else "wrist_open", timestamp)
        self.reference = filtered
        self.travel = 0.0
        self.motion = "idle"
        self.window.clear()
        self.window.append((timestamp, filtered))

    def snapshot(self) -> dict:
        return {
            "state": self.state,
            "raw_flexion": round(self.raw_flexion, 4),
            "smoothed_flexion": round(self.smoothed_flexion or 0.0, 4),
            "mcp_sum": round(self.mcp_sum, 4),
            "mcp_count": self.mcp_count,
            "mcp_values": dict(self.mcp_values),
            "confidence": round(self.confidence, 3),
            "open_threshold": self.open_threshold,
            "close_threshold": self.close_threshold,
            "minimum_travel": self.minimum_travel,
            "reference": round(self.reference, 4) if self.reference is not None else None,
            "travel": round(self.travel, 4),
            "velocity": round(self.velocity, 4),
            "direction_consistency": round(self.consistency, 3),
            "motion": self.motion,
            "window_seconds": self.window_seconds,
            "channels": "MCP quaternion X, four fingers (thumb excluded)",
        }


class HandExerciseState:
    def __init__(self) -> None:
        self.selected = "none"
        self.events: deque[dict[str, object]] = deque(maxlen=12)
        self.counts = {"pronation": 0, "supination": 0, "clockwise": 0, "anticlockwise": 0, "wrist_open": 0, "wrist_close": 0}
        self.latest: dict[str, object] | None = None
        self.pronation_supination = WristPronationSupinationDetector(self._record)
        self.circumduction = WristCircumductionProbabilistic(self._record)
        self.hand_open_close = HandOpenCloseDetector(self._record)

    def select(self, exercise: str) -> None:
        if exercise == self.selected:
            return
        self.selected = exercise
        self.events.clear()
        self.latest = None
        self.counts = {"pronation": 0, "supination": 0, "clockwise": 0, "anticlockwise": 0, "wrist_open": 0, "wrist_close": 0}
        # Start every selection from a clean sample window without changing any
        # of the detector thresholds or classification logic. Counts and events
        # are session-scoped, so every newly selected exercise starts at zero.
        self.pronation_supination = WristPronationSupinationDetector(self._record)
        self.circumduction = WristCircumductionProbabilistic(self._record)
        self.hand_open_close = HandOpenCloseDetector(self._record)

    def _record(self, movement: str, timestamp: float) -> None:
        if movement == "none":
            return
        event = {"movement": movement, "timestamp_ms": round(time.time() * 1000)}
        self.latest = event
        self.events.appendleft(event)
        self.counts[movement] += 1

    def add_orientation(self, orientation: Quaternion, timestamp: float) -> None:
        if self.selected == "pronation_supination":
            self.pronation_supination.add_orientation_sample(orientation, timestamp)
        elif self.selected == "circumduction":
            self.circumduction.add_orientation(orientation, timestamp)

    def add_joints(self, joints: list, timestamp: float) -> None:
        if self.selected == "hand_open_close":
            self.hand_open_close.add_joints(joints, timestamp)

    def snapshot(self) -> dict[str, object]:
        if self.hand_open_close.state in ("open", "closed") and self.selected == "hand_open_close":
            activity = f"hand_{self.hand_open_close.state}"
        elif self.circumduction.state == "active":
            activity = "circumduction"
        elif self.pronation_supination.state == "moving":
            activity = "wrist_rotation"
        else:
            activity = "idle"
        return {
            "selected": self.selected,
            "activity": activity,
            "latest": self.latest,
            "counts": dict(self.counts),
            "events": list(self.events),
            "pronation_supination": self.pronation_supination.snapshot(),
            "circumduction": self.circumduction.snapshot(),
            "hand_open_close": self.hand_open_close.snapshot(),
        }


class ExerciseEngine:
    def __init__(self) -> None:
        self.hands = {"left": HandExerciseState(), "right": HandExerciseState()}

    def add_orientation(self, handedness: int, orientation: Quaternion, timestamp: float | None = None) -> None:
        side = "left" if handedness == 1 else "right" if handedness == 2 else None
        if side is not None:
            self.hands[side].add_orientation(orientation, time.monotonic() if timestamp is None else timestamp)

    def add_joints(self, handedness: int, joints: list, timestamp: float | None = None) -> None:
        side = "left" if handedness == 1 else "right" if handedness == 2 else None
        if side is not None:
            self.hands[side].add_joints(joints, time.monotonic() if timestamp is None else timestamp)

    def select(self, side: str, exercise: str) -> None:
        if side == "both":
            for state in self.hands.values():
                state.select(exercise)
        else:
            self.hands[side].select(exercise)

    def snapshot(self) -> dict[str, object]:
        return {side: state.snapshot() for side, state in self.hands.items()}
