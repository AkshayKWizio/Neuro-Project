# Agent context: Neuro glove rehabilitation

## Purpose

Neuro is a Windows-local rehabilitation prototype that combines StretchSense gloves, XR Game, a Python OSC bridge, a React clinical workspace, a live 3D hand rig, exercise detectors, local patient reports, and an embedded Three.js game.

## Runtime path

```text
StretchSense glove
  -> Bluetooth managed by XR Game 0.4.2-BETA
  -> OSC v1 output to 127.0.0.1:9002
  -> Python Reality SDK / FastAPI bridge
  -> WebSocket /ws at about 30 snapshots per second
  -> React UI and Three.js hand rig
  -> confirmed exercise event
  -> postMessage to embedded Night Relay iframe
```

Commands such as BASIC articulation calibration and IMU tare travel in the reverse direction through OSC port `9003`.

## Primary source locations

| Concern | Location |
|---|---|
| Main UI and workflow | `glove-dashboard/app/page.tsx` |
| Full-screen exercise/game layout | `glove-dashboard/components/exercise-session.tsx` |
| Live and guidance hand animation | `glove-dashboard/components/live-hand-rig.tsx` |
| HandState engineering inspector | `glove-dashboard/components/handstate-inspector.tsx` |
| Local API, XR process and OSC bridge | `glove-dashboard/backend/server.py` |
| Exercise detectors | `glove-dashboard/backend/exercise_detector.py` |
| Doctor/patient/report storage | `glove-dashboard/backend/auth_reports.py` |
| Vendored Python SDK | `glove-dashboard/backend/vendor/reality_sdk` |
| Night Relay source | `night-relay-main` |
| Original detector reference | `Gloves.Exercise.cs` |
| Hand-rig invariants | `glove-dashboard/HAND_RIG_REFERENCE.md` |
| Known bugs | `glove-dashboard/BUGS.md` |

## Invariants: do not change casually

1. The web application does not connect to Bluetooth directly. XR Game is the current glove transport and preprocessing dependency.
2. The live hand rig applies the SDK's 26 absolute local joint transforms directly. Do not multiply them into the FBX bind pose or invent coordinate remapping without re-validating against the Unity SDK.
3. Guidance animation and live sensor animation are separate paths. Guidance may author motion; the live path must remain a direct representation of streamed joints.
4. Calibration is user-triggered. The server sends articulation delete followed by articulation add for label `BASIC`, matching the Unity SDK behavior.
5. Calibration gating occurs only after a patient selects an exercise. Do not show it in the doctor-only workspace.
6. Doctor authentication can persist for twelve hours, but active patient context is intentionally cleared when the app is reopened/refreshed.
7. Only the selected exercise detector should run for the selected hand. Selecting a different exercise resets detector state and counts.
8. Empty sessions are not saved as reports.
9. The integrated Night Relay game is two-lane and currently accepts only `move_left` and `move_right` from pronation/supination.
10. The left-glove game direction mapping is a deferred known bug; see `glove-dashboard/BUGS.md`.

## State gates

The UI is governed by four sequential gates:

1. Local license valid.
2. Doctor authenticated.
3. Patient selected or logged in.
4. At least one glove streaming; then selected glove calibrated before an exercise starts.

Do not bypass later gates by changing the visibility of earlier screens. Keep doctor reports usable without starting XR Game or connecting gloves.

## Persistence and privacy

- License key: browser local storage plus local JSON validation.
- Doctor session: in-memory server token stored in an HTTP-only, SameSite Strict cookie.
- Doctor, patient and assignment records: local JSON.
- Reports: `backend/data/reports/YYYY-MM-DD/PAT-xxxx/<session>.json`.
- Camera: browser-local preview; it is not uploaded or recorded.
- Packaging must not include real patient records, local logs, cookies or copied browser state.

## Verification after changes

At minimum:

1. Run the dashboard production build.
2. Run backend detector tests.
3. Run Night Relay build and tests when game code changes.
4. Start on port 3000 and verify `/api/health`, `/`, `/ws`, hand assets and `/night-relay/index.html`.
5. Re-check doctor-only and patient-active navigation separately.
6. For rig changes, read and follow `HAND_RIG_REFERENCE.md` first.

## Current known limitations

- XR Game is still required for Bluetooth connection and processed glove output.
- License and clinical records are local prototypes, not server-managed production identity.
- The heuristic exercise detectors are not medical-device validated.
- Continuous circumduction counting needs further refinement.
- Handedness-aware game direction mapping is deferred.
- The existing PyInstaller prototype needs a durable external data directory before it should be treated as the final distributable.
