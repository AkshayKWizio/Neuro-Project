"""Regression checks for the MCP joint-based wrist open/close detector."""

from dataclasses import dataclass
from backend.exercise_detector import HandOpenCloseDetector


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


def make_joints(value: float, *, outlier: float | None = None) -> list[DummyJoint]:
    joints = []
    for finger in FINGERS:
        val = outlier if finger == "index_mcp" and outlier is not None else value
        joints.append(DummyJoint(name=finger, orientation=DummyQuat(x=val)))
    return joints


def feed(detector: HandOpenCloseDetector, value: float, start: float, frames: int = 18, *, outlier: float | None = None) -> float:
    timestamp = start
    for _ in range(frames):
        detector.add_joints(make_joints(value, outlier=outlier), timestamp)
        timestamp += 1.0 / 30.0
    return timestamp


def test_modest_range_counts_first_close_and_reopen() -> None:
    events: list[str] = []
    detector = HandOpenCloseDetector(lambda movement, _: events.append(movement))
    # Start open (value < 0.25)
    timestamp = feed(detector, 0.15, 0.0, 15)
    assert detector.state == "open"
    assert events == []

    # Close hand (travel >= 0.30, e.g. 0.55)
    for i in range(25):
        val = 0.15 + (0.55 - 0.15) * (i / 24)
        detector.add_joints(make_joints(val), timestamp)
        timestamp += 1.0 / 30.0

    # Hold closed
    timestamp = feed(detector, 0.55, timestamp, 20)
    assert detector.state == "closed"
    assert events == ["wrist_close"]

    # Reopen hand (travel back down by >= 0.30, to 0.15)
    for i in range(25):
        val = 0.55 - (0.55 - 0.15) * (i / 24)
        detector.add_joints(make_joints(val), timestamp)
        timestamp += 1.0 / 30.0

    timestamp = feed(detector, 0.15, timestamp, 20)
    assert detector.state == "open"
    assert events == ["wrist_close", "wrist_open"]


def test_outlier_or_incomplete_joints_are_ignored() -> None:
    events: list[str] = []
    detector = HandOpenCloseDetector(lambda movement, _: events.append(movement))
    timestamp = feed(detector, 0.15, 0.0, 15)

    # Incomplete joints (only 3 joints)
    detector.add_joints([DummyJoint(name="index_mcp", orientation=DummyQuat(x=0.9))], timestamp)
    assert detector.mcp_count != 4

    # Outlier: one finger moves, others don't
    feed(detector, 0.15, timestamp + 0.1, 10, outlier=0.95)
    assert events == []


if __name__ == "__main__":
    test_modest_range_counts_first_close_and_reopen()
    test_outlier_or_incomplete_joints_are_ignored()
    print("Adaptive hand open/close detector tests passed")
