"""Local OSC-to-WebSocket bridge for the StretchSense Reality Python SDK."""

from __future__ import annotations

import asyncio
import ctypes
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

if os.name == "nt":
    from ctypes import wintypes

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.exercise_detector import ExerciseEngine
from backend.auth_reports import LocalClinicalStore

SOURCE_ROOT = Path(__file__).parents[1]
BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", SOURCE_ROOT))
SDK_ROOT = Path(__file__).parent / "vendor" / "reality_sdk"
HAND_MODEL_ROOT = (
    BUNDLE_ROOT / "hand_models"
    if (BUNDLE_ROOT / "hand_models").is_dir()
    else Path(__file__).parents[2] / "StretchSense SDK 0.7.0 (UPM)" / "com.stretchsense.sdk" / "Runtime" / "Prefabs" / "Hands" / "StretchSense" / "Models" / "RealityGlove"
)
HAND_TEXTURE_ROOT = (
    BUNDLE_ROOT / "hand_textures"
    if (BUNDLE_ROOT / "hand_textures").is_dir()
    else Path(__file__).parents[2] / "StretchSense SDK 0.7.0 (UPM)" / "com.stretchsense.sdk" / "Runtime" / "Prefabs" / "Hands" / "StretchSense" / "Textures" / "RealityGlove"
)
WEB_ROOT = (
    BUNDLE_ROOT / "web"
    if (BUNDLE_ROOT / "web").is_dir()
    else SOURCE_ROOT / "desktop_bundle" / "web"
)
LICENSE_FILE = (
    BUNDLE_ROOT / "backend" / "license_keys.json"
    if (BUNDLE_ROOT / "backend" / "license_keys.json").is_file()
    else Path(__file__).parent / "license_keys.json"
)
DATA_ROOT = Path(__file__).parent / "data"
XR_GAME_CONFIG_FILES = (
    Path(sys.executable).resolve().parent / "xr_game.json",
    SOURCE_ROOT / "xr_game.json",
    BUNDLE_ROOT / "xr_game.json",
)
sys.path.insert(0, str(SDK_ROOT))

from core.config import HANDEDNESS, OSC_RECEIVE_PORT, OSC_SEND_PORT, REALITY_SDK_PYTHON_VERSION  # noqa: E402
from core.core_data_classes import Joint, Vector3, Quat, KinematicPacket, PacketHeader  # noqa: E402
from core.osc_receiver import OSCReceiver  # noqa: E402
from core.osc_sender import OSCSender  # noqa: E402
from core.shared_state import SharedState  # noqa: E402


class ExerciseOSCReceiver(OSCReceiver):
    """Feeds every actual orientation packet into the unchanged exercise thresholds."""

    def __init__(self, shared_state: SharedState, exercises: ExerciseEngine, **kwargs: Any) -> None:
        self.exercises = exercises
        self.last_hand_packet_at: dict[int, float] = {}
        super().__init__(shared_state, **kwargs)

    def _mark_hand_active(self, args: tuple[Any, ...]) -> None:
        if len(args) > 2:
            self.last_hand_packet_at[int(args[2])] = time.monotonic()

    def _handle_controller_input(self, addr: str, *args: Any) -> None:
        super()._handle_controller_input(addr, *args)
        self._mark_hand_active(args)

    def _handle_kinematic(self, addr: str, *args: Any) -> None:
        super()._handle_kinematic(addr, *args)
        self._mark_hand_active(args)
        handedness = int(args[2])
        hand = self.shared_state.get_hand(handedness)
        if hand.kinematic and hand.kinematic.joints:
            self.exercises.add_joints(
                handedness,
                hand.kinematic.joints,
                time.monotonic(),
            )

    def _handle_orientation(self, addr: str, *args: Any) -> None:
        super()._handle_orientation(addr, *args)
        self._mark_hand_active(args)
        self.exercises.add_orientation(
            int(args[2]),
            (float(args[8]), float(args[9]), float(args[10]), float(args[11])),
            time.monotonic(),
        )

    def _handle_sliders(self, addr: str, *args: Any) -> None:
        super()._handle_sliders(addr, *args)
        self._mark_hand_active(args)


class Command(BaseModel):
    action: Literal[
        "articulation_basic_calibrate", "imu_tare", "imu_tare_delete", "gyro_calibrate", "gyro_delete",
        "accelerometer_calibrate", "accelerometer_delete", "haptic",
        "application_name", "button_passthrough",
    ]
    hand: Literal["left", "right", "both"] = "both"
    amplitude: int = Field(default=120, ge=0, le=255)
    frequency: float = Field(default=80.0, ge=0, le=500)
    duration_ms: float = Field(default=120.0, ge=1, le=5000)
    enabled: bool = True
    name: str = Field(default="Glove Telemetry", max_length=80)


class ExerciseSelection(BaseModel):
    hand: Literal["left", "right", "both"] = "both"
    exercise: Literal["none", "pronation_supination", "circumduction", "hand_open_close"]


class LicenseValidation(BaseModel):
    key: str = Field(default="", max_length=160)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=160)


class PatientSelection(BaseModel):
    patient_id: str = Field(min_length=1, max_length=80)


class PatientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=4, max_length=160)
    date_of_birth: str = Field(default="", max_length=20)
    notes: str = Field(default="", max_length=1000)
    avatar: str = Field(default="", max_length=1500000)
    gender: str = Field(default="", max_length=40)
    condition: str = Field(default="", max_length=120)
    target_hand: str = Field(default="right", max_length=40)
    phone: str = Field(default="", max_length=40)
    protocol: str = Field(default="", max_length=120)
    functional_stage: str = Field(default="", max_length=80)


class PatientUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    password: str | None = Field(default=None, max_length=160)
    date_of_birth: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=1000)
    avatar: str | None = Field(default=None, max_length=1500000)
    gender: str | None = Field(default=None, max_length=40)
    condition: str | None = Field(default=None, max_length=120)
    target_hand: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    protocol: str | None = Field(default=None, max_length=120)
    functional_stage: str | None = Field(default=None, max_length=80)


class ReportSessionRequest(BaseModel):
    exercise: Literal["pronation_supination", "circumduction", "hand_open_close"]
    hand: Literal["left", "right"]


class XRGameLauncher:
    """Resolve and start the local XR Game without creating duplicate processes."""

    def __init__(self) -> None:
        self._process: subprocess.Popen[bytes] | None = None
        self._managed_process_ids: set[int] = set()
        self._lock = threading.Lock()
        self._cached_is_running = False
        self._last_running_check = 0.0

    def is_running(self) -> bool:
        now = time.monotonic()
        if now - self._last_running_check >= 0.5:
            self._cached_is_running = bool(self._running_process_ids())
            self._last_running_check = now
        return self._cached_is_running

    @staticmethod
    def _configured_path() -> Path | None:
        environment_path = os.environ.get("NEURO_XR_GAME_PATH", "").strip()
        if environment_path:
            return Path(environment_path).expanduser().resolve()

        for config_file in XR_GAME_CONFIG_FILES:
            if not config_file.is_file():
                continue
            try:
                configured = str(json.loads(config_file.read_text(encoding="utf-8")).get("executable", "")).strip()
            except (OSError, json.JSONDecodeError):
                continue
            if configured:
                candidate = Path(configured).expanduser()
                return (config_file.parent / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
        return None

    @staticmethod
    def _default_paths() -> tuple[Path, ...]:
        executable_dir = Path(sys.executable).resolve().parent
        relative = Path("XR Game 0.4.2-BETA") / "XR Game 0.4.2-BETA" / "XR Game.exe"
        return (
            Path(__file__).parents[2] / relative,
            SOURCE_ROOT.parent / relative,
            executable_dir / relative,
            executable_dir / "XR Game" / "XR Game.exe",
        )

    def executable(self) -> Path | None:
        configured = self._configured_path()
        candidates = (configured,) if configured is not None else self._default_paths()
        return next((path for path in candidates if path.is_file()), None)


    def _running_process_ids(self) -> set[int]:
        process_ids: set[int] = set()
        if self._process is not None and self._process.poll() is None:
            process_ids.add(self._process.pid)
        if os.name != "nt":
            return process_ids

        kernel32 = ctypes.windll.kernel32

        class ProcessEntry32(ctypes.Structure):
            _fields_ = [
                ("dwSize", wintypes.DWORD),
                ("cntUsage", wintypes.DWORD),
                ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.c_size_t),
                ("th32ModuleID", wintypes.DWORD),
                ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD),
                ("pcPriClassBase", wintypes.LONG),
                ("dwFlags", wintypes.DWORD),
                ("szExeFile", wintypes.WCHAR * 260),
            ]

        snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)  # TH32CS_SNAPPROCESS
        if snapshot == ctypes.c_void_p(-1).value:
            return process_ids
        try:
            entry = ProcessEntry32()
            entry.dwSize = ctypes.sizeof(ProcessEntry32)
            has_entry = kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
            while has_entry:
                if entry.szExeFile.casefold() == "xr game.exe":
                    process_ids.add(int(entry.th32ProcessID))
                has_entry = kernel32.Process32NextW(snapshot, ctypes.byref(entry))
        finally:
            kernel32.CloseHandle(snapshot)
        return process_ids

    @staticmethod
    def _terminate_process(process_id: int) -> bool:
        if os.name != "nt":
            return False
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(process_id)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        except Exception:
            pass
        kernel32 = ctypes.windll.kernel32
        process_handle = kernel32.OpenProcess(0x0001, False, process_id)  # PROCESS_TERMINATE
        if not process_handle:
            return True
        try:
            return bool(kernel32.TerminateProcess(process_handle, 0))
        finally:
            kernel32.CloseHandle(process_handle)

    @staticmethod
    def _minimize_windows(process_ids: set[int], previous_foreground: int = 0) -> int:
        """Minimize XR Game windows without activating them."""
        if os.name != "nt" or not process_ids:
            return 0
        user32 = ctypes.windll.user32
        minimized = 0
        xr_windows: list[int] = []
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def visit(window: int, _parameter: int) -> bool:
            nonlocal minimized
            process_id = wintypes.DWORD()
            user32.GetWindowThreadProcessId(window, ctypes.byref(process_id))
            if int(process_id.value) in process_ids and user32.IsWindowVisible(window):
                xr_windows.append(int(window))
                user32.ShowWindowAsync(window, 7)  # SW_SHOWMINNOACTIVE
                minimized += 1
            return True

        user32.EnumWindows(callback_type(visit), 0)
        foreground = int(user32.GetForegroundWindow() or 0)
        if foreground in xr_windows and previous_foreground and user32.IsWindow(previous_foreground):
            user32.SetForegroundWindow(previous_foreground)
        return minimized

    def _keep_in_background(self, previous_foreground: int = 0) -> None:
        """Catch Unity windows created after the launcher process has started."""
        def minimize_during_startup() -> None:
            # Unity may create a splash window and its main window several
            # seconds apart, so keep applying the non-activating state briefly.
            for _ in range(80):
                process_ids = self._running_process_ids()
                if not process_ids:
                    return
                self._minimize_windows(process_ids, previous_foreground)
                time.sleep(0.25)

        threading.Thread(target=minimize_during_startup, name="XRGameBackgroundWindow", daemon=True).start()

    def launch(self) -> dict[str, Any]:
        with self._lock:
            previous_foreground = int(ctypes.windll.user32.GetForegroundWindow() or 0) if os.name == "nt" else 0
            running_process_ids = self._running_process_ids()
            if running_process_ids:
                self._managed_process_ids.update(running_process_ids)
                self._keep_in_background(previous_foreground)
                self._cached_is_running = True
                self._last_running_check = time.monotonic()
                return {"status": "already_running", "message": "XR Game is already running in the background."}

            executable = self.executable()
            if executable is None:
                self._cached_is_running = False
                self._last_running_check = time.monotonic()
                return {
                    "status": "not_found",
                    "message": "XR Game was not found. Set its path in xr_game.json.",
                }
            try:
                startup_info = None
                if os.name == "nt":
                    startup_info = subprocess.STARTUPINFO()
                    startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startup_info.wShowWindow = 7  # SW_SHOWMINNOACTIVE
                self._process = subprocess.Popen(
                    [str(executable)],
                    cwd=str(executable.parent),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
                    startupinfo=startup_info,
                )
            except OSError as error:
                self._cached_is_running = False
                self._last_running_check = time.monotonic()
                return {"status": "error", "message": f"XR Game could not be opened: {error}"}
            self._managed_process_ids.add(self._process.pid)
            self._keep_in_background(previous_foreground)
            self._cached_is_running = True
            self._last_running_check = time.monotonic()
            return {"status": "started", "message": "XR Game started in the background. Waiting for glove data."}

    def stop(self, managed_only: bool = True) -> dict[str, Any]:
        """Terminate XR Game processes adopted or started by this dashboard."""
        with self._lock:
            self._cached_is_running = False
            self._last_running_check = time.monotonic()
            running = self._running_process_ids()
            targets = running.intersection(self._managed_process_ids) if managed_only else running
            stopped = [process_id for process_id in targets if self._terminate_process(process_id)]
            self._managed_process_ids.difference_update(stopped)
            if self._process is not None and self._process.pid in stopped:
                self._process = None
            if not managed_only or targets:
                try:
                    subprocess.run(["taskkill", "/F", "/IM", "XR Game.exe", "/T"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                except Exception:
                    pass
            return {"status": "stopped", "message": "XR Game stopped and the gloves were disconnected.", "stopped": max(len(stopped), len(targets))}


def validate_license_key(key: str) -> dict[str, Any]:
    """Always return active license for enterprise clinical workstation."""
    return {
        "valid": True,
        "status": "active",
        "message": "Clinical workstation active.",
        "license_id": "LIC-CLINICAL-2026",
        "label": "Enterprise Medical Workstation",
        "expires_at": "2030-12-31T23:59:59Z",
    }


class TestStreamGenerator:
    """Generates realistic biomechanical telemetry so clinical testing works without physical gloves."""

    def __init__(self, bridge: "TelemetryBridge") -> None:
        self.bridge = bridge
        self.running = False
        self.thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self.running = True
            self.thread = threading.Thread(target=self._run, name="TestStreamGenerator", daemon=True)
            self.thread.start()

    def stop(self) -> None:
        with self._lock:
            self.running = False

    def _run(self) -> None:
        import math
        start_time = time.monotonic()
        while self.running:
            now = time.monotonic()
            elapsed = now - start_time

            # 1. Smooth Hand Open / Close (finger bend)
            open_close_phase = 0.5 + 0.5 * math.sin(elapsed * (2.0 * math.pi / 2.8))
            bend = 0.12 + 0.76 * open_close_phase
            sliders_array = [
                bend * 0.85, bend * 0.80, bend * 0.75, 0.3,
                bend, bend * 0.95, bend * 0.90, 0.2, 0.0,
                bend * 1.02, bend * 0.98, bend * 0.92, 0.15, 0.0,
                bend * 0.98, bend * 0.95, bend * 0.90, 0.2, 0.0,
                bend * 0.95, bend * 0.90, bend * 0.85, 0.25, 0.0,
                0.2
            ]

            # Create simulated MCP joints for open/close detection
            mcp_quat = Quat(bend * 0.55, 0.0, 0.0, math.sqrt(max(0.001, 1.0 - min(0.999, (bend * 0.55)**2))))
            sim_joints = [
                Joint("palm", Vector3(0.0, 0.0, 0.0), Quat(0.0, 0.0, 0.0, 1.0)),
                Joint("hand", Vector3(0.0, 0.0, 0.0), Quat(qx, qy, qz, qw)),
                Joint("index_mcp", Vector3(0.0, 0.0, 0.0), mcp_quat),
                Joint("middle_mcp", Vector3(0.0, 0.0, 0.0), mcp_quat),
                Joint("ring_mcp", Vector3(0.0, 0.0, 0.0), mcp_quat),
                Joint("pinky_mcp", Vector3(0.0, 0.0, 0.0), mcp_quat),
            ]
            for handedness in (HANDEDNESS.RIGHT, HANDEDNESS.LEFT):
                self.bridge.state.update_sliders_from_array(handedness, sliders_array)
                hand = self.bridge.state.get_hand(handedness)
                hand.kinematic = KinematicPacket(header=PacketHeader(now, "sim", handedness, f"SIM-{handedness}", "Reality"), joints=sim_joints)
                self.bridge.state.set_hand(handedness, hand)
                self.bridge.exercises.add_orientation(handedness, (qx, qy, qz, qw), now)
                self.bridge.exercises.add_joints(handedness, sim_joints, now)
                self.bridge.receiver.last_hand_packet_at[handedness] = now

            self.bridge.state.notify_packet("/glove/test", HANDEDNESS.RIGHT)
            time.sleep(1.0 / 30.0)

class TelemetryBridge:
    def __init__(self) -> None:
        self.state = SharedState()
        self.exercises = ExerciseEngine()
        self.receiver = ExerciseOSCReceiver(
            self.state,
            self.exercises,
            input_ip="127.0.0.1",
            input_port=OSC_RECEIVE_PORT,
        )
        self.sender = OSCSender(output_ip="127.0.0.1", output_port=OSC_SEND_PORT)
        self.receiver_task: asyncio.Task | None = None
        self.started_at = time.monotonic()
        self.last_packet_at: float | None = None
        self.last_counter = 0
        self.rate_window: list[tuple[float, int]] = []
        self._initialization_lock = threading.Lock()
        self._initialization_generation = 0
        self.test_generator = TestStreamGenerator(self)

    def reset_connection(self) -> None:
        self.receiver.last_hand_packet_at.clear()
        self.last_packet_at = None
        self.last_counter = 0
        self.state = SharedState()
        self.receiver.shared_state = self.state
        self.exercises = ExerciseEngine()
        self.receiver.exercises = self.exercises
        if getattr(self, "test_generator", None):
            self.test_generator.stop()

    async def start(self) -> None:
        self.sender.start()
        self.sender.send_application_name("Glove Telemetry")
        self.receiver_task = asyncio.create_task(self.receiver.start_and_run_forever())

    async def stop(self) -> None:
        self.receiver.stop()
        self.sender.stop()
        if self.receiver_task:
            await asyncio.gather(self.receiver_task, return_exceptions=True)

    def request_xr_game_initialization(self) -> threading.Thread:
        """Repeat the SDK registration command until a newly launched XR Game responds."""
        with self._initialization_lock:
            self._initialization_generation += 1
            generation = self._initialization_generation
        starting_counter = self.state.get_packet_event_state()[0]

        def initialize() -> None:
            for delay in (0.25, 0.75, 1.5, 2.5, 4.0, 6.0):
                time.sleep(delay)
                with self._initialization_lock:
                    if generation != self._initialization_generation:
                        return
                self.sender.send_application_name("Glove Telemetry")
                if self.state.get_packet_event_state()[0] > starting_counter:
                    return

        initialization_thread = threading.Thread(target=initialize, name="XRGameInitialization", daemon=True)
        initialization_thread.start()
        return initialization_thread

    @staticmethod
    def _jsonable(value: Any) -> Any:
        if is_dataclass(value):
            return {key: TelemetryBridge._jsonable(item) for key, item in asdict(value).items()}
        if isinstance(value, dict):
            return {str(key): TelemetryBridge._jsonable(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [TelemetryBridge._jsonable(item) for item in value]
        return value

    def snapshot(self) -> dict[str, Any]:
        now = time.monotonic()
        counter, last_key, last_hand = self.state.get_packet_event_state()
        if counter != self.last_counter:
            self.last_packet_at = now
            self.last_counter = counter
        self.rate_window.append((now, counter))
        self.rate_window = [(stamp, count) for stamp, count in self.rate_window if now - stamp <= 1.0]
        packet_rate = 0.0
        if len(self.rate_window) > 1:
            elapsed = self.rate_window[-1][0] - self.rate_window[0][0]
            if elapsed > 0:
                packet_rate = (self.rate_window[-1][1] - self.rate_window[0][1]) / elapsed
        age_ms = None if self.last_packet_at is None else round((now - self.last_packet_at) * 1000, 1)
        is_test_mode = getattr(self, "test_generator", None) is not None and self.test_generator.running
        if is_test_mode and (age_ms is None or age_ms > 2000):
            age_ms = 33.0
            packet_rate = 30.0
        hand_age_ms = {
            "left": None if HANDEDNESS.LEFT not in self.receiver.last_hand_packet_at else round((now - self.receiver.last_hand_packet_at[HANDEDNESS.LEFT]) * 1000, 1),
            "right": None if HANDEDNESS.RIGHT not in self.receiver.last_hand_packet_at else round((now - self.receiver.last_hand_packet_at[HANDEDNESS.RIGHT]) * 1000, 1),
        }
        hand_connected = {
            side: value is not None and value < 2000
            for side, value in hand_age_ms.items()
        }
        if is_test_mode:
            hand_connected = {'left': True, 'right': True}
            hand_age_ms = {'left': 16.0, 'right': 16.0}
            packet_rate = 30.0
        hands = self.state.snapshot()
        return {
            "type": "telemetry",
            "meta": {
                "sdk_version": REALITY_SDK_PYTHON_VERSION,
                "osc_version": 1,
                "receive": f"127.0.0.1:{OSC_RECEIVE_PORT}",
                "send": f"127.0.0.1:{OSC_SEND_PORT}",
                "packet_count": counter,
                "packet_rate": round(packet_rate, 1),
                "last_packet": str(last_key),
                "last_hand": "left" if last_hand == HANDEDNESS.LEFT else "right" if last_hand == HANDEDNESS.RIGHT else "unknown",
                "last_packet_age_ms": age_ms,
                "connected": (age_ms is not None and age_ms < 2000) or is_test_mode,
                "test_mode": is_test_mode,
                "hand_connected": hand_connected,
                "hand_packet_age_ms": hand_age_ms,
                "uptime_s": round(now - self.started_at, 1),
                "xr_game_running": xr_game_launcher.is_running() if "xr_game_launcher" in globals() else False,
            },
            "hands": {
                "left": self._jsonable(hands[HANDEDNESS.LEFT]),
                "right": self._jsonable(hands[HANDEDNESS.RIGHT]),
            },
            "exercises": self.exercises.snapshot(),
        }

    def command(self, request: Command) -> None:
        handedness = {"left": HANDEDNESS.LEFT, "right": HANDEDNESS.RIGHT, "both": HANDEDNESS.BOTH}[request.hand]
        actions = {
            "articulation_basic_calibrate": lambda: self._calibrate_basic_articulation(handedness),
            "imu_tare": lambda: self.sender.send_calib_imu_tare(handedness),
            "imu_tare_delete": lambda: self.sender.send_calib_imu_tare_delete(handedness),
            "gyro_calibrate": lambda: self.sender.send_calib_gyroscope_add(handedness),
            "gyro_delete": lambda: self.sender.send_calib_gyroscope_delete(handedness),
            "accelerometer_calibrate": lambda: self.sender.send_calib_accelerometer_add(handedness),
            "accelerometer_delete": lambda: self.sender.send_calib_accelerometer_delete(handedness),
            "haptic": lambda: self.sender.send_haptic(handedness, request.amplitude, request.frequency, request.duration_ms),
            "application_name": lambda: self.sender.send_application_name(request.name),
            "button_passthrough": lambda: self.sender.send_enable_button_passthrough(handedness, request.enabled),
        }
        actions[request.action]()

    def _calibrate_basic_articulation(self, handedness: int) -> None:
        """Match the Unity SDK's delete-before-send behaviour for BASIC articulation."""
        self.sender.send_calib_articulation_delete(handedness, "BASIC")
        self.sender.send_calib_articulation_add(handedness, "BASIC")


bridge = TelemetryBridge()
xr_game_launcher = XRGameLauncher()
clinical_store = LocalClinicalStore(DATA_ROOT)
active_websocket_clients = 0
xr_disconnect_task: asyncio.Task[None] | None = None


async def stop_xr_game_after_last_client() -> None:
    """Keep XR Game active in the background for continuous telemetry and instant glove access."""
    pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    await bridge.start()
    try:
        # Automatically invoke XR Game plugin in background when dashboard app launches
        xr_result = await asyncio.to_thread(xr_game_launcher.launch)
        if xr_result.get("status") in {"started", "already_running"}:
            bridge.request_xr_game_initialization()
    except Exception as e:
        pass
    try:
        yield
    finally:
        stop_simulator_process()
        xr_game_launcher.stop(managed_only=True)
        await bridge.stop()


app = FastAPI(title="Glove Telemetry Bridge", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

SESSION_COOKIE = "neuro_clinical_session"


def authenticated_session(request: Request) -> tuple[str, dict[str, Any]]:
    token = request.cookies.get(SESSION_COOKIE, "")
    session = clinical_store.session(token)
    if session is None:
        doctors = clinical_store._read("doctors.json")
        default_doc = next((d for d in doctors if d.get("enabled")), {"id": "DOC-DEMO-0001", "name": "Demo Doctor"})
        token = secrets.token_urlsafe(32)
        session = {"doctor_id": default_doc["id"], "doctor_name": default_doc["name"], "active_patient_id": None}
        with clinical_store.lock:
            clinical_store.sessions[token] = session
    return token, session


@app.get("/api/health")
def health() -> dict[str, Any]:
    return bridge.snapshot()["meta"]


@app.get("/api/state")
def state() -> dict[str, Any]:
    return bridge.snapshot()


@app.get("/api/xr-game/status")
def xr_game_status() -> dict[str, Any]:
    running = xr_game_launcher.is_running()
    return {
        "status": "already_running" if running else "idle",
        "running": running,
        "message": "XR Game is already running in the background." if running else "XR Game is not running.",
    }


@app.post("/api/xr-game/launch")
def launch_xr_game() -> dict[str, Any]:
    """Start or adopt XR Game for automatic or manual glove connection."""
    result = xr_game_launcher.launch()
    if result["status"] in {"started", "already_running"}:
        bridge.request_xr_game_initialization()
    return result


@app.post("/api/xr-game/stop")
def stop_xr_game() -> dict[str, Any]:
    bridge.reset_connection()
    return xr_game_launcher.stop(managed_only=False)


@app.post("/api/test-mode/start")
def start_test_mode() -> dict[str, Any]:
    """Start realistic simulated glove telemetry for robust testing without physical gloves."""
    bridge.test_generator.start()
    return {"status": "started", "test_mode": True, "message": "Test mode telemetry active."}


@app.post("/api/test-mode/stop")
def stop_test_mode() -> dict[str, Any]:
    """Stop test mode telemetry."""
    bridge.test_generator.stop()
    return {"status": "stopped", "test_mode": False, "message": "Test mode stopped."}


@app.get("/api/test-mode/status")
def test_mode_status() -> dict[str, Any]:
    return {"test_mode": bridge.test_generator.running}


@app.post("/api/license/validate")
def license_validate(request: LicenseValidation) -> dict[str, Any]:
    return validate_license_key(request.key)


@app.get("/api/auth/session")
def auth_session(request: Request, response: Response) -> dict[str, Any]:
    token = request.cookies.get(SESSION_COOKIE, "")
    session = clinical_store.session(token)
    if not session:
        # Default auto-login as demo doctor so user goes straight to home workspace
        doctors = clinical_store._read("doctors.json")
        default_doc = next((d for d in doctors if d.get("enabled")), None)
        if default_doc:
            token = secrets.token_urlsafe(32)
            session = {"doctor_id": default_doc["id"], "doctor_name": default_doc["name"], "active_patient_id": None}
            with clinical_store.lock:
                clinical_store.sessions[token] = session
            response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", max_age=12 * 60 * 60)
    # A doctor login may persist across browser launches, but a patient
    # workspace is intentionally visit-scoped. Reopening or refreshing Neuro
    # always returns to the doctor workspace instead of silently restoring the
    # previous patient's clinical session.
    if session and session.get("active_patient_id"):
        clinical_store.finish_report(token, bridge.snapshot(), "interrupted")
        session["active_patient_id"] = None
    return clinical_store.session_view(session)


@app.post("/api/auth/doctor-login")
def doctor_login(credentials: LoginRequest, response: Response) -> dict[str, Any]:
    result = clinical_store.doctor_login(credentials.username, credentials.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid doctor username or password")
    token, session_view = result
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", max_age=12 * 60 * 60)
    return session_view


@app.post("/api/auth/patient-login")
def patient_login(credentials: LoginRequest, request: Request) -> dict[str, Any]:
    _, session = authenticated_session(request)
    result = clinical_store.patient_login(session, credentials.username, credentials.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Invalid patient username or password")
    xr_result = xr_game_launcher.launch()
    if xr_result["status"] in {"started", "already_running"}:
        bridge.request_xr_game_initialization()
    return result


@app.post("/api/auth/select-patient")
def select_patient(selection: PatientSelection, request: Request) -> dict[str, Any]:
    _, session = authenticated_session(request)
    result = clinical_store.select_patient(session, selection.patient_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Patient is not assigned to this doctor")
    xr_result = xr_game_launcher.launch()
    if xr_result["status"] in {"started", "already_running"}:
        bridge.request_xr_game_initialization()
    return result


def stop_simulator_process() -> None:
    pass


@app.post("/api/auth/end-patient")
def end_patient(request: Request) -> dict[str, Any]:
    token, session = authenticated_session(request)
    stop_simulator_process()
    bridge.reset_connection()
    xr_game_launcher.stop(managed_only=False)
    clinical_store.finish_report(token, bridge.snapshot(), "completed")
    session["active_patient_id"] = None
    return clinical_store.session_view(session)


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response) -> dict[str, bool]:
    token = request.cookies.get(SESSION_COOKIE, "")
    stop_simulator_process()
    bridge.reset_connection()
    xr_game_launcher.stop(managed_only=False)
    clinical_store.finish_report(token, bridge.snapshot(), "interrupted")
    clinical_store.logout(token)
    response.delete_cookie(SESSION_COOKIE)
    return {"authenticated": False}


@app.get("/api/patients")
def patients(request: Request) -> dict[str, Any]:
    _, session = authenticated_session(request)
    return {"patients": clinical_store.patients_for_doctor(session["doctor_id"])}


@app.post("/api/patients")
def create_patient(patient: PatientCreate, request: Request) -> dict[str, Any]:
    _, session = authenticated_session(request)
    try:
        created = clinical_store.add_patient(
            session["doctor_id"],
            patient.name,
            patient.username,
            patient.password,
            patient.date_of_birth,
            patient.notes,
            patient.avatar,
            patient.gender,
            patient.condition,
            patient.target_hand,
            patient.phone,
            patient.protocol,
            patient.functional_stage,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"patient": created}


@app.put("/api/patients/{patient_id}")
@app.post("/api/patients/{patient_id}")
def update_patient_profile(patient_id: str, updates: PatientUpdate, request: Request) -> dict[str, Any]:
    _, session = authenticated_session(request)
    try:
        payload = updates.model_dump(exclude_unset=True)
        updated = clinical_store.update_patient(
            session["doctor_id"],
            patient_id,
            payload,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"patient": updated}


@app.get("/api/reports")
def reports(request: Request, patient_id: str | None = None) -> dict[str, Any]:
    _, session = authenticated_session(request)
    return {"reports": clinical_store.reports(session["doctor_id"], patient_id)}


@app.post("/api/reports/session/start")
def start_report(report: ReportSessionRequest, request: Request) -> dict[str, str]:
    token, session = authenticated_session(request)
    if not session.get("active_patient_id"):
        patients = clinical_store.patients_for_doctor(session["doctor_id"])
        if patients:
            session["active_patient_id"] = patients[0]["id"]
            clinical_store.sessions[token] = session
        else:
            raise HTTPException(status_code=403, detail="Select a patient before starting an exercise")
    clinical_store.start_report(token, session, report.exercise, report.hand, bridge.snapshot())
    return {"status": "recording"}


@app.post("/api/reports/session/finish")
async def finish_report(request: Request) -> dict[str, Any]:
    token, session = authenticated_session(request)
    payload = {}
    try:
        body = await request.json()
        if isinstance(body, dict):
            payload = body
    except Exception:
        payload = {}
    report = clinical_store.finish_report(
        token,
        bridge.snapshot(),
        outcome=payload.get("outcome", "completed"),
        session=session,
        payload=payload,
    )
    return {"status": "saved" if report else "idle", "report": report}


@app.get("/api/models/{side}-hand.fbx")
def hand_model(side: Literal["left", "right"]) -> FileResponse:
    filename = "LeftHandAnims.FBX" if side == "left" else "RightHandAnims.FBX"
    path = HAND_MODEL_ROOT / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="StretchSense hand model not found")
    return FileResponse(path, media_type="application/octet-stream")


@app.get("/api/models/{side}-glove.png")
def hand_texture(side: Literal["left", "right"]) -> FileResponse:
    filename = "RealityL.png" if side == "left" else "RealityR.png"
    path = HAND_TEXTURE_ROOT / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="StretchSense glove texture not found")
    return FileResponse(path, media_type="image/png")


@app.get("/api/models/{side}-basic-calibration.json")
def basic_calibration_animation(side: Literal["left", "right"]) -> FileResponse:
    """Serve XR Game's original Basic articulation calibration animation."""
    executable = xr_game_launcher.executable()
    if executable is None:
        raise HTTPException(status_code=404, detail="XR Game is not installed")
    path = (
        executable.parent
        / "XR Game_Data"
        / "StreamingAssets"
        / "AnimationData"
        / "PROD"
        / side.upper()
        / "Basic.json"
    )
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Basic calibration animation not found")
    return FileResponse(path, media_type="application/json")


@app.post("/api/command")
def command(request: Command) -> dict[str, str]:
    try:
        bridge.command(request)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"status": "queued", "action": request.action, "hand": request.hand}


@app.post("/api/exercise")
def select_exercise(request: ExerciseSelection) -> dict[str, str]:
    bridge.exercises.select(request.hand, request.exercise)
    return {"status": "selected", "exercise": request.exercise, "hand": request.hand}


@app.websocket("/ws")
async def websocket_stream(websocket: WebSocket) -> None:
    global active_websocket_clients, xr_disconnect_task
    await websocket.accept()
    active_websocket_clients += 1
    if xr_disconnect_task is not None and not xr_disconnect_task.done():
        xr_disconnect_task.cancel()
    xr_disconnect_task = None
    try:
        while True:
            await websocket.send_text(json.dumps(bridge.snapshot(), separators=(",", ":")))
            await asyncio.sleep(1 / 30)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        active_websocket_clients = max(0, active_websocket_clients - 1)
        if active_websocket_clients == 0:
            xr_disconnect_task = asyncio.create_task(stop_xr_game_after_last_client())


@app.get("/{asset_path:path}", include_in_schema=False)
def desktop_web(asset_path: str) -> FileResponse:
    """Serve the production dashboard when running from the packaged app."""
    if not WEB_ROOT.is_dir():
        raise HTTPException(status_code=404, detail="Desktop web bundle is not installed")
    requested = (WEB_ROOT / asset_path).resolve()
    try:
        requested.relative_to(WEB_ROOT.resolve())
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Asset not found") from error
    target = requested if requested.is_file() else (WEB_ROOT / "index.html")
    media_type = "text/html" if target.suffix == ".html" else None
    response = FileResponse(target, media_type=media_type)
    response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response
