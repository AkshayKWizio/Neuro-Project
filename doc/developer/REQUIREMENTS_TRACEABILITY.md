# Requirements traceability matrix

This matrix connects the PRD requirements to the current implementation and a practical verification method. “Inspection” means source/config review; “manual” means an end-to-end browser/hardware check.

## Functional requirements

| Requirement | Primary implementation | Verification |
|---|---|---|
| FR-001–002 License validity/expiry | `backend/server.py`, `backend/license_keys.json`, `app/page.tsx` | Test valid, disabled, future and expired synthetic keys |
| FR-003 Doctor authentication | `backend/auth_reports.py`, `/api/auth/doctor-login` | Hash inspection; positive/negative login; cookie flags |
| FR-004 Doctor restore/patient reset | `/api/auth/session`, `app/page.tsx` | Refresh/reopen with doctor and active patient |
| FR-005 Initial patient directory | `app/page.tsx`, `/api/patients` | First-login UI manual check |
| FR-006 Add patient | `app/page.tsx`, `LocalClinicalStore.add_patient` | Create, duplicate username and immediate list refresh |
| FR-007 Patient login/selection | Auth endpoints and UI dialogs/cards | Assigned/unassigned and credential tests |
| FR-008–009 Doctor-only preview/reports | Doctor workspace state in `app/page.tsx` | Navigate reports; assert no XR launch/patient activation |
| FR-010 Patient telemetry workflow | Patient state effects in `app/page.tsx`, `/ws` | Select patient and observe WS/connection modal |
| FR-011 XR process lifecycle | `XRGameLauncher`, `start-local.ps1` | Missing/running/new process checks; focus/minimize manual check |
| FR-012 Accurate per-hand state | `ExerciseOSCReceiver.last_hand_packet_at`, bridge snapshot, UI freshness | Live stream, power-off and stale-time test |
| FR-013 First-run permission | Connection dialog/runbook | Clean XR preferences manual test |
| FR-014 Selected hand | `app/page.tsx`, `/api/exercise`, `/api/command` | Two-glove selection/calibration/tare check |
| FR-015 Live 26-joint rig | `components/live-hand-rig.tsx` | SDK replay and real-glove comparison |
| FR-016 Exercise choices | UI exercise metadata, `ExerciseSelection` model | Inspect cards and endpoint validation |
| FR-017–020 Calibration gate | `app/page.tsx`, model route, `/api/command`, OSC state | Incomplete/complete selected-side hardware test |
| FR-021 Single selected detector | `backend/exercise_detector.py`, `/api/exercise` | `backend/tests/exercise_detector_test.py`; switching test |
| FR-022 Full-screen layout | `components/exercise-session.tsx`, clinical CSS | 1366×768 and 1920×1080 browser checks |
| FR-023 Game control bridge | Exercise event state, `exercise-session.tsx`, `night-relay-main/src/main.ts` | PostMessage integration and game input test |
| FR-024 Explicit tare | Session/live-rig controls, `/api/command` | Assert no command before click; selected side after click |
| FR-025 Local camera/degrade | `exercise-session.tsx` | Permit/deny browser camera tests; network inspection |
| FR-026–027 Reports/non-empty rule | `backend/auth_reports.py`, report endpoints | Finish with zero and non-zero counts; inspect JSON |
| FR-028 Report aggregation | Report UI in `app/page.tsx`, Recharts | Multi-date fixture and no-report state |
| FR-029 End patient | UI action, auth endpoint, XR stop endpoint | Active session → End patient lifecycle test |
| FR-030 Logout | `/api/auth/logout`, UI action | Cookie/session invalidation test |
| FR-031 Unified port 3000 | `start-local.ps1`, FastAPI static catch-all | Health/UI/WS/assets/game smoke test |
| FR-032 Game graceful failure | Session/game component boundary | Block game asset and complete an exercise report |
| FR-033 Live Data gate | Tab rules in `app/page.tsx` | Doctor vs active/fresh/stale patient checks |
| FR-034 Handoff package | `doc`, root run scripts, ZIP manifest | Extract on clean test location and verify contents |

## Non-functional requirements

| Requirement | Design evidence | Verification |
|---|---|---|
| NFR-001 Security | PBKDF2 and cookie flags in auth code | Source inspection and browser storage check |
| NFR-002 Privacy | Loopback service; camera only in browser | Network inspection; search report data for media |
| NFR-003 Doctor/report isolation | Separate report patient filter and active patient state | Navigate reports while monitoring process/API calls |
| NFR-004 Connectivity accuracy | Packet timestamp/freshness model | Stop glove stream and measure status transition |
| NFR-005 Responsiveness | 30 Hz WS loop | Browser performance trace under dual-hand load |
| NFR-006 Exercise integrity | EMA/window/hysteresis/refractory detector state | Unit/replay/live repeated movement tests |
| NFR-007 Recoverability | Explicit UI/error paths and health endpoint | Fault-injection matrix from TRD section 16 |
| NFR-008 Data integrity | Assignment checks, patient/date storage, temp-replace writes | Cross-patient authorization and interrupted write test |
| NFR-009 Usability | Full-screen game-first session layout | Target-resolution visual QA without page scroll |
| NFR-010 Accessibility | Semantic buttons, labels, status text | Keyboard, focus and contrast audit |
| NFR-011 Compatibility | Runbook-pinned Windows/Chrome/Python | Clean supported-machine smoke test |
| NFR-012 Maintainability | Documented source ownership and API boundaries | Architecture/source review |
| NFR-013 Traceability | This document | Review each release |
| NFR-014 Observability | Health metadata, launcher/backend logs, explicit states | Failure test and log usefulness review |
| NFR-015 Packaging privacy | Sanitized package process | Scan archive for source data/log/cookie paths |
| NFR-016 Medical safety | PRD non-goals and report separation | Content review; ensure no undefined score language |

## Release evidence to retain

- Build logs for dashboard and Night Relay.
- Python test output.
- `/api/health` smoke result and tested versions.
- Screenshots of doctor landing, connection dialog, calibration, active session and reports.
- Detector replay fixture/version and expected counts where available.
- ZIP file name, size and SHA-256.
- Third-party redistribution approval for the bundled vendor components.
