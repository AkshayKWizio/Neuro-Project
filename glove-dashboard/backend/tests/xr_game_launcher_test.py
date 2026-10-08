"""XR Game path resolution and duplicate-launch behaviour."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.server import XRGameLauncher


launcher = XRGameLauncher()
resolved = launcher.executable()
assert resolved is not None
assert resolved.name == "XR Game.exe"
assert resolved.is_file()

with patch.object(launcher, "_running_process_ids", return_value={1234}), patch("backend.server.subprocess.Popen") as popen:
    result = launcher.launch()
    assert result["status"] == "already_running"
    assert launcher._managed_process_ids == {1234}
    popen.assert_not_called()

launcher = XRGameLauncher()
fake_executable = Path("C:/XR Game/XR Game.exe")
process = MagicMock()
process.pid = 4321
with patch.object(launcher, "_running_process_ids", return_value=set()), patch.object(launcher, "executable", return_value=fake_executable), patch("backend.server.subprocess.Popen", return_value=process) as popen:
    result = launcher.launch()
    assert result["status"] == "started"
    popen.assert_called_once()
    assert launcher._managed_process_ids == {4321}

with patch.object(launcher, "_running_process_ids", return_value={4321}), patch.object(launcher, "_terminate_process", return_value=True) as terminate:
    result = launcher.stop()
    assert result["status"] == "stopped"
    assert result["stopped"] == 1
    terminate.assert_called_once_with(4321)

print("XR Game launcher checks passed")
