"""Regressions for SDK/Unity frame parity and ambiguous palm-normal direction."""
import math
from unittest.mock import patch
from backend.exercise_detector import WristPronationSupinationDetector, HandExerciseState, sdk_to_unity_orientation


def rotation_y(angle):
    radians = math.radians(angle) / 2
    return 0.0, math.sin(radians), 0.0, math.cos(radians)


def motion(start, end, flip_sign=False):
    results = []
    detector = WristPronationSupinationDetector(lambda movement, _: results.append(movement))
    timestamp = 0.0
    detector.add_orientation_sample(rotation_y(start), timestamp)
    for index in range(1, 13):
        timestamp += 0.05
        value = rotation_y(start + (end - start) * index / 12)
        if flip_sign and index % 2:
            value = tuple(-component for component in value)
        detector.add_orientation_sample(value, timestamp)
    for _ in range(20):
        timestamp += 0.05
        detector.add_orientation_sample(rotation_y(end), timestamp)
    return results


# Palm-normal change is zero about local Y: fallback must distinguish directions.
assert motion(0, 60) == ['supination']
assert motion(60, 0) == ['pronation']
assert motion(0, 60, flip_sign=True) == ['supination']
assert motion(60, 0, flip_sign=True) == ['pronation']

# Exact component mapping from Unity StretchSenseOSCReceiver.OnOrientation.
assert sdk_to_unity_orientation((0.1, 0.2, 0.3, 0.4)) == (-0.2, -0.3, 0.1, 0.4)
for angle in (0, 30, 60):
    expected = rotation_y(angle)
    raw_sdk = (expected[2], -expected[0], -expected[1], expected[3])
    assert sdk_to_unity_orientation(raw_sdk) == expected

events = []
detector = WristPronationSupinationDetector(lambda movement, _: events.append(movement))
detector.add_orientation_sample(rotation_y(0), 0.0)
detector.add_orientation_sample(rotation_y(10), 0.05)
previous = detector.previous_orientation
detector.add_orientation_sample(rotation_y(80), 0.05)  # Duplicate timestamp.
assert detector.previous_orientation == previous
detector.add_orientation_sample((float('nan'), 0, 0, 1), 0.1)
assert detector.previous_orientation == previous
detector.add_orientation_sample(rotation_y(90), 3.0)  # Reconnect, not a movement.
assert detector.state == 'idle'
assert detector.buffer == []
assert events == []

# Separate transitions in the same wall-clock millisecond remain distinct.
state = HandExerciseState()
with patch('backend.exercise_detector.time.time', return_value=123.0):
    state._record('pronation', 1.0)
    first = dict(state.latest)
    state._record('supination', 1.01)
    second = dict(state.latest)
assert second['event_id'] == first['event_id'] + 1
assert second['timestamp_ms'] > first['timestamp_ms']

print('Pronation stream/frame/sign regressions passed')
