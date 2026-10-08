# Glove Telemetry

A fully local real-time dashboard for StretchSense XR gloves. The supplied
Reality Python SDK 0.4.1 receives OSC v1 packets, stores them in its `HandData`
/ `SharedState` model, and publishes local WebSocket snapshots to the browser.

> **Hand-rig maintenance:** Before changing the 3D hand, joint mapping,
> transforms, finger spacing, materials, or camera, read
> [`HAND_RIG_REFERENCE.md`](./HAND_RIG_REFERENCE.md). It records the verified
> Unity SDK behaviour and the web implementation invariants.

## Start

From PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

For the normal Windows desktop workflow, double-click `Launch-Neuro.cmd`. This
starts the local bridge from the logged-in desktop session, opens the dashboard,
and allows the disconnected-gloves popup to launch XR Game and its permission
dialog on the same visible desktop.

Stop it with:

```powershell
powershell -ExecutionPolicy Bypass -File .\stop-local.ps1
```

## XR Train / Core Driver OSC settings

- OSC version: **v1**
- Output/destination IP: **127.0.0.1**
- Output/destination port: **9002**
- Input/command IP: **127.0.0.1**
- Input/command port: **9003**

The local dashboard is `http://127.0.0.1:3000`. The Python API binds only to
`127.0.0.1:8765`; it is not exposed to the internet or local network.

## Glove connection process

After license validation, the disconnected-gloves popup waits for the user to
click **Connect gloves**. The local Python bridge then starts the configured XR
Game executable in the background. An existing process is reused, and the
dashboard never changes or interacts with XR Game's own interface. **Disconnect
gloves** stops the XR Game process managed by the dashboard. Closing the last
dashboard tab also stops it after a five-second reload grace period.

The executable location is configured in [`xr_game.json`](./xr_game.json). For
a different installation, edit that file or set `NEURO_XR_GAME_PATH` before
starting the bridge.

## Data shown

- Packet header: timestamp, profile, handedness, serial, and glove type
- Controller: grab, trigger, buttons, menu, joystick, and idle state
- IMU: accelerometer vector and fused quaternion orientation
- Kinematics: position and quaternion for all 26 hand joints
- A live articulated hand rig that directly applies all 26 absolute local
  transforms from the kinematic sensor stream, matching the Unity SDK visualiser
- All 25 bend, splay, twist, and global-splay sliders
- Gesture/articulation calibration state and progress
- Tracker offset calibration, pose, source, and location
- Button-passthrough state and complete raw `HandData` JSON

Device commands are intentionally user-triggered: IMU tare, gyro calibration,
accelerometer calibration, and a haptic test.

The dashboard contains no generated demonstration telemetry. **Live data** shows
only values received by the local Python bridge. **Exercise demo** applies the
existing `Gloves.Exercise.cs` pronation, supination, and clockwise/anticlockwise
circumduction logic to the live orientation packets and reports completed movements.
