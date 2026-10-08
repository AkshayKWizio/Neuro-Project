# Local setup, launch and troubleshooting runbook

## 1. Package contents

The teammate handoff is intended to preserve this sibling-directory layout:

```text
Neuro_Glove_Rehabilitation_Handoff_2026-09-29/
  README_FIRST.md
  Setup-Neuro.ps1
  Run-Neuro.cmd
  Stop-Neuro.cmd
  doc/
  glove-dashboard/
  night-relay-main/
  XR Game 0.4.2-BETA/
  StretchSense SDK 0.7.0 (UPM)/
  StretchSense Python SDK v0.4.1/
  StretchSense Unity SDK v0.6.6/
  NeuroGloveCore/
  NeuroGloveCoreTest/
  Gloves.Exercise.cs
```

Keep these directories together. `glove-dashboard/xr_game.json` resolves XR Game by its relative sibling path.

## 2. Supported local environment

- Windows 10 or 11, x64.
- Current Google Chrome.
- Python 3.12 for the source runtime.
- A compatible StretchSense glove and Bluetooth environment.
- Local ports TCP `3000`, UDP `9002` and UDP `9003` available.
- Node.js 22.13+ only when rebuilding the main web UI or game; it is not required to run the supplied compiled web bundle.

This handoff is not yet a no-install `.exe`. The setup script creates an isolated Python virtual environment and installs the four pinned backend requirements. A PyInstaller release should be made only after moving writable clinical data outside the frozen application bundle and completing clean-machine validation.

## 3. First-time setup

1. Extract the entire ZIP to a writable local directory. Do not run directly inside the ZIP viewer.
2. Install Python 3.12 from the approved organizational source if it is not present. During installation, enable the Python launcher (`py`).
3. Right-click PowerShell if required by policy, navigate to the extracted folder, and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Setup-Neuro.ps1
```

4. Keep the included test credentials only for local verification. Replace them before real patient use.
5. Confirm that `XR Game 0.4.2-BETA\XR Game 0.4.2-BETA\XR Game.exe` exists.

The setup script does not install Node or rebuild frontend assets. It creates `glove-dashboard/backend/.venv` and installs `glove-dashboard/backend/requirements.txt`.

## 4. Run and stop

Double-click `Run-Neuro.cmd`, or run it from a terminal. It stops a previously recorded Neuro backend, starts FastAPI on port `3000`, waits for health readiness and opens Chrome.

Open manually if needed:

```text
http://127.0.0.1:3000/
```

Use **End patient** before leaving a patient session so the managed XR process and patient context close cleanly. Use `Stop-Neuro.cmd` to stop the local service.

## 5. First glove connection

1. Validate the included test license, then log in as the test doctor and choose the test patient.
2. Power the glove and keep it in Bluetooth range.
3. Neuro calls the XR Game executable. The XR Game window may appear on first use.
4. If the vendor Early Access or usage-permission screen appears, make the required choice and click Continue/Accept in that real window. Neuro does not automate consent.
5. XR Game is minimized after startup. Wait for **Gloves live** based on incoming packets.
6. If two gloves stream, select the intended side.
7. Select an exercise. If BASIC calibration is incomplete, follow the modal animation and click Calibrate.

## 6. Calibration and tare operation

- Calibration is prompted only after an exercise is selected.
- Follow the looped vendor BASIC motion and wait for the streamed completion status.
- Do not infer completion from the animation reaching its end.
- Use Tare only while the selected wrist is held in the intended neutral pose.
- Tare is explicit and can be used from the active session panel.

## 7. Test credentials in the sanitized handoff

The handoff creates synthetic local accounts:

```text
Doctor username: doctor
Doctor password: doctor
Patient username: patient
Patient password: patient
```

The included demo license key and its validity are listed in `TEST_ACCESS.txt` inside the package. These credentials are not suitable for production.

## 8. Logs and health checks

Launcher logs are written to:

```text
glove-dashboard/.logs/backend.log
glove-dashboard/.logs/backend-error.log
glove-dashboard/.logs/processes.json
```

Basic health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Confirm the browser, XR Game and backend refer to the same Windows machine. This build is not designed for a browser on another computer.

## 9. Troubleshooting

### “The local glove bridge is unavailable”

- Run `Stop-Neuro.cmd`, then `Run-Neuro.cmd`.
- Read `glove-dashboard/.logs/backend-error.log`.
- Check whether another process owns port 3000:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

### XR Game process exists but the glove is not connected

- Process presence is not connection proof. Check that the glove is powered and paired.
- Bring XR Game to the foreground once and complete any first-run permission/acceptance screens.
- Check local firewall rules for UDP 9002/9003.
- Confirm no second XR/SDK process is competing for the OSC ports.
- Use the connection retry after the permission screen is complete.

### Wrong XR Game opens

Check `glove-dashboard/xr_game.json`. It must point to:

```text
../XR Game 0.4.2-BETA/XR Game 0.4.2-BETA/XR Game.exe
```

For a custom location, set `NEURO_XR_GAME_PATH` to the exact executable before launching.

### Glove remains shown as connected after power-off

This is a defect if it persists beyond the packet freshness window. Capture `/api/state`, the time of the last packet and the UI status; do not use the XR process indicator as a workaround.

### Calibration animation works but progress does not

The animation and device progress are intentionally independent. Verify that OSC calibration-state packets arrive from XR Game and that the selected glove serial/side matches the modal.

### Camera is blank or clipped

- Grant camera permission to `http://127.0.0.1:3000` in Chrome.
- Close other applications holding the camera.
- Camera failure should not stop glove tracking; refresh only after finishing or discarding the current session.

### Game is blank

Open `http://127.0.0.1:3000/night-relay/index.html` directly. If it fails, rebuild/copy Night Relay and then rebuild the dashboard. Exercise tracking and report creation should still operate.

## 10. Rebuild from source

### Rebuild Night Relay

```powershell
Set-Location night-relay-main
npm ci
npm test
npm run build
```

Copy the generated static game into the dashboard's `public/night-relay` directory, preserving `index.html` and assets.

### Rebuild dashboard

```powershell
Set-Location glove-dashboard
npm ci
npm run lint
npm run build
```

Regenerate `desktop_bundle/web` with the project's preparation script/workflow, then restart Neuro. Never assume the development server output is the same as the FastAPI static bundle.

### Backend verification

```powershell
Set-Location glove-dashboard
.\backend\.venv\Scripts\python.exe -m backend.tests.exercise_detector_test
.\backend\.venv\Scripts\python.exe -m backend.tests.smoke_test
```

The OSC smoke test may require ports to be free and should not run while a clinical session is active.

## 11. Back up and migrate local data

Stop Neuro before copying `glove-dashboard/backend/data`. Back up the complete directory together so patient IDs, assignments and reports remain consistent. Do not share this directory with developers or teammates unless it contains only synthetic data and sharing is authorized.

Local JSON is the prototype storage format. Before production, migrate to transactional, encrypted storage with audit, backup and role controls.

## 12. Handoff verification

After extraction on a clean test account:

1. Run `Verify-Package.ps1`.
2. Complete setup and launch.
3. Validate the demo license and accounts.
4. Confirm doctor report navigation does not launch XR Game.
5. Select the demo patient and test XR first-run permission.
6. Verify live/disconnected status, calibration, tare and one completed session.
7. Verify a non-empty report is saved and a zero-repetition attempt is not.

Check `PACKAGE_MANIFEST.md` and the SHA-256 distributed with the ZIP before sharing further.
