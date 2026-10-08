"""Deterministic checks for the Gloves.Exercise.cs detector port."""

from __future__ import annotations

import math
from dataclasses import dataclass

from backend.exercise_detector import (
    CircumductionSample,
    HandExerciseState,
    HandOpenCloseDetector,
    WristCircumductionProbabilistic,
    WristPronationSupinationDetector,
)


def quaternion_x(degrees: float) -> tuple[float, float, float, float]:
    radians = math.radians(degrees) / 2.0
    return math.sin(radians), 0.0, 0.0, math.cos(radians)


def classify_rotation(start_degrees: float, final_degrees: float) -> list[str]:
    results: list[str] = []
    detector = WristPronationSupinationDetector(lambda movement, _: results.append(movement))
    timestamp = 0.0
    detector.add_orientation_sample(quaternion_x(start_degrees), timestamp)
    for step in range(1, 13):
        timestamp += 0.05
        angle = start_degrees + (final_degrees - start_degrees) * step / 12
        detector.add_orientation_sample(quaternion_x(angle), timestamp)
    for _ in range(20):
        timestamp += 0.05
        detector.add_orientation_sample(quaternion_x(final_degrees), timestamp)
    return results


assert classify_rotation(0.0, 60.0) == ["supination"]
assert classify_rotation(60.0, 0.0) == ["pronation"]

directions: list[str] = []
circumduction = WristCircumductionProbabilistic(lambda movement, _: directions.append(movement))
circumduction.buffer = [
    CircumductionSample((math.cos(angle), 0.0, math.sin(angle)), 60.0, index * 0.02)
    for index, angle in enumerate([step * math.pi / 8 for step in range(17)])
]
assert circumduction._evaluate_final_direction() == "clockwise"
circumduction.buffer.reverse()
assert circumduction._evaluate_final_direction() == "anticlockwise"

selection = HandExerciseState()
selection.select("pronation_supination")
selection.add_orientation(quaternion_x(0.0), 0.0)
assert selection.pronation_supination.previous_orientation is not None
assert selection.circumduction.previous_rotation is None
selection.select("circumduction")
selection.add_orientation(quaternion_x(0.0), 0.1)
assert selection.pronation_supination.previous_orientation is None
assert selection.circumduction.previous_rotation is not None


@dataclass
class DummyQuat:
    x: float
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0


@dataclass
class DummyJoint:
    name: str
    orientation: DummyQuat


FINGERS = ("index_mcp", "middle_mcp", "ring_mcp", "pinky_mcp")


def hand_joints(value: float) -> list[DummyJoint]:
    return [DummyJoint(name=f, orientation=DummyQuat(x=value)) for f in FINGERS]


open_close_events: list[str] = []
open_close = HandOpenCloseDetector(lambda movement, _: open_close_events.append(movement))
timestamp = 0.0

# Establishing initial open pose does not create false repetition
for _ in range(15):
    timestamp += 0.03
    open_close.add_joints(hand_joints(0.12), timestamp)
assert open_close.state == "open"
assert open_close_events == []

# Smooth close: travel 0.12 -> 0.52 >= 0.30
for i in range(25):
    timestamp += 0.03
    val = 0.12 + (0.52 - 0.12) * (i / 24)
    open_close.add_joints(hand_joints(val), timestamp)

for _ in range(15):
    timestamp += 0.03
    open_close.add_joints(hand_joints(0.52), timestamp)

assert open_close.state == "closed"
assert open_close_events == ["wrist_close"]

# Smooth reopen: travel 0.52 -> 0.12 >= 0.30
for i in range(25):
    timestamp += 0.03
    val = 0.52 - (0.52 - 0.12) * (i / 24)
    open_close.add_joints(hand_joints(val), timestamp)

for _ in range(15):
    timestamp += 0.03
    open_close.add_joints(hand_joints(0.12), timestamp)

assert open_close.state == "open"
assert open_close_events == ["wrist_close", "wrist_open"]

print("Exercise detector parity checks passed")
