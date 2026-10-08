# Neuro Glove Rehabilitation Project (Cleaned Distribution)

This folder is a streamlined, self-contained distribution of the **Neuro** glove rehabilitation platform. All redundant SDK duplicates, legacy packages, and temporary build caches have been removed.

## Directory Structure

- `Run-Neuro.cmd` — Double-click to launch the application locally in standalone desktop window mode.
- `Run-Neuro.sh` — Single-click launcher for macOS.
- `Create-Desktop-Shortcut.ps1` — Creates a 1-click "Neuro Rehabilitation" shortcut on your Windows Desktop.
- `Setup-Neuro.ps1` — First-time setup script (creates virtual environment and installs dependencies).
- `Stop-Neuro.cmd` — Gracefully stops the local backend and XR Game processes.
- `TEST_ACCESS.txt` — Synthetic credentials and license key for testing.
- `glove-dashboard/` — Main application workspace:
  - `backend/` — FastAPI service, exercise detection engine, local clinical store, vendored StretchSense Reality Python SDK.
  - `desktop_bundle/` — Precompiled production web assets and built Night Relay runner game.
  - `hand_models/` — StretchSense 3D hand models (`LeftHandAnims.FBX`, `RightHandAnims.FBX`).
  - `hand_textures/` — StretchSense glove textures (`RealityL.png`, `RealityR.png`).
  - `app/` & `components/` — React 19 / Three.js UI source code.
- `XR Game 0.4.2-BETA/` — StretchSense Unity runtime driver (owns BLE hardware connection and provides official calibration animation data).
- `night-relay-main/` — Source code for the 3D runner game (TypeScript / Vite / Three.js).
- `doc/` — Complete technical documentation (TRD, PRD, UI flow, runbook).

## Quick Start (StretchSense Glove Connection)

1. Run `Run-Neuro.cmd` (or `Run-Neuro.sh` on macOS).
2. The workstation launches directly in standalone desktop mode.
3. Click **Skip / Continue to Home →** (or enter any test key).
4. Click **Continue as Demo Doctor →**.
5. Select a patient (e.g. **Eleanor Vance**).
6. Click **Connect gloves** to launch the background XR Game driver.
7. Power on your StretchSense gloves. Neuro will automatically detect the live BLE stream and unlock the clinical exercise workspace.
8. Follow the guided 3D calibration, then begin rehabilitation exercises with real-time biometric tracking.

---

## Clinical Neuro-Rehabilitation Gaming Suite

The workstation integrates an enterprise 5-game therapeutic gaming suite mapped to specific rehabilitation protocols:

| Clinical Game | Starting Template | Therapeutic Target | Mechanics & Biofeedback |
| :--- | :--- | :--- | :--- |
| **Balloon Pop** | *Shoot The Balloon* | Grasp & Squeeze / Reflex speed / Range of Motion | Floating balloons, laser reticle, popping particles, WebAudio acoustic pops. Controlled by glove fist squeeze or Space / Click. |
| **Virtual Piano** | *Instruments for Kids* | Finger Independence & Isolated Flexion | Polyphonic acoustic piano synthesizer, 8 keys, falling note waterfall (*Ode to Joy*, *Twinkle Star*), harmonic ripples, live 5-finger channel flexion meters. |
| **Fruit Slasher** | *Fruit Slasher / Fruit game* | Forearm Pronation & Supination / Dynamic Active ROM | Centrifugal fruit physics (Watermelons, Apples, Oranges, Bananas), slice juice splatters, dynamic wrist pronation dial (-85° to +85°), blade swipe trail. |
| **Finger Sequence** | *Memory Master / Casino Cards Memory* | Neuro-Cognitive Sequencing & Motor Retraining | Progressive Simon-Says memory pattern generator, reaction latency counter (ms), motor accuracy (%), acoustic frequency chimes (440Hz–880Hz), 4 glowing clinical pads. |
| **Night Relay** | *3D Obstacle Runner* | Sustained Motor Endurance & Steering Control | 3D cyberpunk highway obstacle course, lane-switching, speed escalation, real-time tare calibration. |

During any active exercise session, clinicians or patients can freely switch between all 5 games using the top tab bar without restarting the session!

---

## Enterprise & Clinical Upgrades

1. **Clinical Patient Workspace**: Pre-loaded with neurological patient profiles (Post-Stroke Hemiparesis, Radial Nerve Recovery, Carpal Tunnel) with DOB, diagnosis tags, and clinical notes.
2. **Medical Aesthetic & Design System**: Navy/slate clinical color palette, high-contrast biometric badges, Geist typography, and FDA Class II / HIPAA sandbox security architecture.
3. **Multi-Modal Biofeedback**: WebAudio sound generation, live flexion meters, pronation dials, and real-time millisecond latency tracking.
4. **Dual PiP Tele-Rehabilitation Feeds**: Floating Live Patient Camera feed in bottom-left and live 3D Biometric Hand Twin in bottom-right.

