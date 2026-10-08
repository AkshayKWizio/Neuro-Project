"""
CLI command sender for the Reality OSC Bridge.

This module sends outbound OSC commands to the remote receiver using the same
address and payload conventions used by the Unity SDK and this Python project.
"""

from __future__ import annotations

import argparse
import time
from typing import Callable, Sequence

from core.config import HANDEDNESS
from core.osc_sender import OSCSender


def _parse_hand(value: str) -> int:
    v = value.strip().lower()
    if v in {"left", "l"}:
        return HANDEDNESS.LEFT
    if v in {"right", "r"}:
        return HANDEDNESS.RIGHT
    if v in {"both", "b", "all", "unknown", "u"}:
        return HANDEDNESS.BOTH
    raise argparse.ArgumentTypeError(
        f"Invalid handedness '{value}'. Use: left, right, or both."
    )


def _parse_bool(value: str) -> bool:
    v = value.strip().lower()
    if v in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if v in {"0", "false", "f", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(
        f"Invalid boolean '{value}'. Use true/false, yes/no, on/off, or 1/0."
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Send OSC commands to a remote Reality OSC Bridge receiver."
    )

    parser.add_argument("--host", default="127.0.0.1", help="Remote OSC host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9003, help="Remote OSC port (default: 9003)")
    parser.add_argument(
        "--drain-ms",
        type=int,
        default=100,
        help="Milliseconds to allow queued messages to flush before exit (default: 100)",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("application-name", help="Set application name")
    p.add_argument("name")

    p = sub.add_parser("haptic", help="Send haptics pulse")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("amplitude", type=int, help="0..255")
    p.add_argument("frequency", type=float)
    p.add_argument("duration_ms", type=float)

    p = sub.add_parser("tracker-offset-calibration", help="Toggle tracker-offset calibration")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("pause", type=_parse_bool, help="true|false")

    p = sub.add_parser("set-tracker-offset", help="Set tracker offset pose")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("px", type=float)
    p.add_argument("py", type=float)
    p.add_argument("pz", type=float)
    p.add_argument("qx", type=float)
    p.add_argument("qy", type=float)
    p.add_argument("qz", type=float)
    p.add_argument("qw", type=float)

    p = sub.add_parser("set-tracker-source", help="Set tracker source")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("source", type=int)

    p = sub.add_parser("set-tracker-location", help="Set tracker location label")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("location")

    p = sub.add_parser("enable-button-passthrough", help="Enable or disable button passthrough")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("enable", type=_parse_bool, help="true|false")

    p = sub.add_parser("calib-gesture-add", help="Calibration gesture add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("mapping", type=int)

    p = sub.add_parser("calib-gesture-delete", help="Calibration gesture delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("mapping", type=int)

    p = sub.add_parser("calib-articulation-add", help="Calibration articulation add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("label")

    p = sub.add_parser("calib-articulation-delete", help="Calibration articulation delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("label")

    p = sub.add_parser("calib-joystick-add", help="Calibration joystick add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("path", type=int)

    p = sub.add_parser("calib-joystick-delete", help="Calibration joystick delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("calib-dpad-add", help="Calibration dpad add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")
    p.add_argument("direction", type=int)

    p = sub.add_parser("calib-dpad-delete", help="Calibration dpad delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-tare-add", help="IMU tare add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-tare-delete", help="IMU tare delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-gyro-add", help="IMU gyroscope add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-gyro-delete", help="IMU gyroscope delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-accelerometer-add", help="IMU accelerometer add")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    p = sub.add_parser("imu-accelerometer-delete", help="IMU accelerometer delete")
    p.add_argument("hand", type=_parse_hand, help="left | right | both")

    return parser


def _run(args: argparse.Namespace, sender: OSCSender) -> None:
    dispatch: dict[str, Callable[[argparse.Namespace], None]] = {
        "application-name": lambda a: sender.send_application_name(a.name),
        "haptic": lambda a: sender.send_haptic(a.hand, a.amplitude, a.frequency, a.duration_ms),
        "tracker-offset-calibration": lambda a: sender.send_tracker_offset_calibration(a.hand, a.pause),
        "set-tracker-offset": lambda a: sender.send_set_tracker_offset(
            a.hand,
            (a.px, a.py, a.pz),
            (a.qx, a.qy, a.qz, a.qw),
        ),
        "set-tracker-source": lambda a: sender.send_set_tracker_source(a.hand, a.source),
        "set-tracker-location": lambda a: sender.send_set_tracker_location(a.hand, a.location),
        "enable-button-passthrough": lambda a: sender.send_enable_button_passthrough(a.hand, a.enable),
        "calib-gesture-add": lambda a: sender.send_calib_gesture_add(a.hand, a.mapping),
        "calib-gesture-delete": lambda a: sender.send_calib_gesture_delete(a.hand, a.mapping),
        "calib-articulation-add": lambda a: sender.send_calib_articulation_add(a.hand, a.label),
        "calib-articulation-delete": lambda a: sender.send_calib_articulation_delete(a.hand, a.label),
        "calib-joystick-add": lambda a: sender.send_calib_joystick_add(a.hand, a.path),
        "calib-joystick-delete": lambda a: sender.send_calib_joystick_delete(a.hand),
        "calib-dpad-add": lambda a: sender.send_calib_dpad_add(a.hand, a.direction),
        "calib-dpad-delete": lambda a: sender.send_calib_dpad_delete(a.hand),
        "imu-tare-add": lambda a: sender.send_calib_imu_tare(a.hand),
        "imu-tare-delete": lambda a: sender.send_calib_imu_tare_delete(a.hand),
        "imu-gyro-add": lambda a: sender.send_calib_gyroscope_add(a.hand),
        "imu-gyro-delete": lambda a: sender.send_calib_gyroscope_delete(a.hand),
        "imu-accelerometer-add": lambda a: sender.send_calib_accelerometer_add(a.hand),
        "imu-accelerometer-delete": lambda a: sender.send_calib_accelerometer_delete(a.hand),
    }

    fn = dispatch.get(args.command)
    if fn is None:
        raise ValueError(f"Unsupported command: {args.command}")
    fn(args)


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    sender = OSCSender(output_ip=args.host, output_port=args.port)
    sender.start()
    try:
        _run(args, sender)
        if args.drain_ms > 0:
            time.sleep(args.drain_ms / 1000.0)
    finally:
        sender.stop(drain=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
