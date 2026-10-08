# Product requirements document — Neuro glove rehabilitation

| Field | Value |
|---|---|
| Product | Neuro — gloves-based rehabilitation |
| Document status | Current implementation baseline plus explicitly marked future scope |
| Baseline date | 29 September 2026 |
| Deployment | Windows-local clinical prototype |
| Primary users | Doctor/therapist and patient |

## 1. Product summary

Neuro is a local rehabilitation application that turns processed StretchSense glove motion into guided exercises, a live 3D hand visualization, repetition counts, game controls and patient reports. It gives a doctor a patient-management and reporting workspace, then establishes an explicit patient session before starting glove services or exposing live sensor data.

The current product depends on StretchSense XR Game for Bluetooth pairing and its processed glove stream. The Neuro Python service starts XR Game, receives OSC data, runs exercise detectors, serves the browser application and stores local records. Direct browser-to-glove Bluetooth is not in the current scope.

## 2. Problem statement

Hand and wrist rehabilitation needs clear movement coaching, repeatable detection and understandable progress records. The stock glove tooling exposes rich data but does not provide Neuro's doctor/patient workflow, local authorization, exercise-specific guidance, game interaction or date-organized clinical reports. Neuro combines those functions into one local workflow while preserving the vendor's glove processing and calibration behavior.

## 3. Goals and success indicators

### Goals

1. Get a licensed doctor from launch to a selected patient with minimal setup.
2. Connect the glove using the existing XR Game processing path and reflect real packet health accurately.
3. Require calibration only when clinically relevant: after an exercise is selected.
4. Show an anatomically understandable live hand and a separate exercise guidance loop.
5. Count confirmed exercise movements and use the same confirmed event to control gameplay.
6. Store useful, date-level patient reports without saving empty sessions.
7. Keep the application, credentials, camera preview and clinical data local for this release.

### Success indicators

- A new operator can start the packaged application by following the runbook.
- A disconnected glove is never displayed as live for longer than the configured packet timeout.
- Calibration completion is based on streamed SDK state, not animation time.
- Only the selected hand and exercise affect the current session.
- Every saved report identifies patient, exercise, date/time, duration and confirmed counts.
- Doctor report review does not launch XR Game or enter a patient session.

## 4. Non-goals for the current release

- Replacing XR Game's Bluetooth, firmware, ML or proprietary preprocessing pipeline.
- Cloud accounts, server licensing, remote synchronization or multi-site tenancy.
- Automated medical diagnosis, treatment recommendations or regulatory claims.
- Camera recording, pose estimation or video upload.
- A production-grade installer that requires no Python runtime; this handoff uses a source launcher and setup script.
- Automatic acceptance of XR Game consent or permission dialogs.
- Full parity for every HandState channel or every possible rehabilitation exercise.

## 5. Personas

### Doctor/therapist

Creates and selects patients, explains exercises, supervises glove sessions and reviews progress. Needs clear state, low setup friction and reports that distinguish actual repetitions from empty attempts.

### Patient

Performs a selected movement while watching a live hand, guidance loop, camera and game. Needs large readable controls, immediate feedback and no access to another patient's data.

### Local administrator/developer

Installs dependencies, maintains license/account JSON, validates the XR Game path, troubleshoots ports and preserves data. This is an operational persona, not an in-app role.

## 6. User stories and acceptance criteria

| ID | User story | Acceptance criteria |
|---|---|---|
| US-001 | As a licensed user, I want the app to validate my key before exposing the workspace. | Invalid/expired keys are blocked; a valid key advances to doctor login; expiry is displayed meaningfully. |
| US-002 | As a doctor, I want to authenticate and return to my doctor workspace after reopening. | Correct credentials create a bounded session; doctor context can restore; patient context never auto-restores. |
| US-003 | As a doctor, I want to see my patient list immediately. | The first doctor landing render loads assigned patients without requiring tab navigation. |
| US-004 | As a doctor, I want to add a patient from my landing page. | Required fields are validated, duplicate usernames fail safely, and the new patient appears immediately. |
| US-005 | As a doctor, I want to preview exercises without connecting gloves. | Exercise cards and guidance are available in doctor mode and do not launch XR Game. |
| US-006 | As a doctor, I want to review any assigned patient's reports without activating a patient session. | Reports select a patient in read-only context; no connection or calibration dialog appears. |
| US-007 | As a doctor or patient, I want an explicit patient selection/login before live features. | Active patient identity is visible and all live data/report writes are scoped to that patient. |
| US-008 | As a patient, I want the application to help connect my gloves. | The backend launches/adopts the configured XR Game; UI waits for fresh packets and gives actionable errors. |
| US-009 | As a patient, I want connection status to reflect the actual glove. | Stale/missing packets show disconnected even if XR Game remains running. |
| US-010 | As a patient with two gloves, I want to choose which hand controls the session. | Calibration, tare, live rig and detector all use the same selected hand. |
| US-011 | As a patient, I want calibration prompted only when I start an exercise that needs it. | Selection checks BASIC state; incomplete state opens the modal; browsing does not. |
| US-012 | As a patient, I want the calibration animation to match the vendor motion. | Modal uses the selected side's original XR Basic JSON and loops while real status/progress updates separately. |
| US-013 | As a patient, I want to tare my wrist deliberately. | Tare occurs only after the button is clicked and targets the selected hand. |
| US-014 | As a patient, I want to see my actual hand and a separate ideal motion. | Live rig follows HandState; guidance is visibly separate and cannot alter detection input. |
| US-015 | As a patient, I want one selected exercise to count reliably. | Only one detector runs; confirmed directional events increment once; changing exercise resets transient state. |
| US-016 | As a patient, I want confirmed motion to operate the game. | The detector event updates counts and posts the mapped game action; raw noise does not control the game. |
| US-017 | As a patient, I want the game, guide and camera visible without scrolling. | Active session uses a full-screen layout with game priority and a compact aligned side column. |
| US-018 | As a doctor, I want meaningful reports. | Reports group by date and show exercise, counts, duration and charts/totals where data exists; no arbitrary 100-point clinical score is implied. |
| US-019 | As a doctor, I do not want empty attempts to pollute reports. | Finishing with zero confirmed reps does not persist a session. |
| US-020 | As a doctor, I want End patient to release the glove and return to the doctor workspace. | Managed XR Game stops, patient context clears, live features close, doctor session remains. |

## 7. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | The system shall validate a local license key, enabled state, start date and expiry before doctor login. | Must |
| FR-002 | The system shall show renewal guidance when a key is expired and shall not unlock protected features. | Must |
| FR-003 | The system shall authenticate doctors against salted password hashes and issue a bounded secure session cookie. | Must |
| FR-004 | The system shall restore a valid doctor session but shall clear active patient context after browser/app reopen. | Must |
| FR-005 | The doctor landing page shall load the doctor's assigned patients on its first render. | Must |
| FR-006 | A doctor shall be able to create a patient and have the assignment reflected immediately. | Must |
| FR-007 | A doctor shall be able to select a patient, and a patient shall be able to log in under the doctor. | Must |
| FR-008 | The doctor workspace shall provide exercise education and report review without a glove connection. | Must |
| FR-009 | Doctor report patient selection shall remain read-only and shall not activate glove workflows. | Must |
| FR-010 | The patient workspace shall open the telemetry WebSocket and trigger the connection workflow when no hand is live. | Must |
| FR-011 | The backend shall launch or adopt the configured XR Game process and avoid intentionally focusing its window. | Must |
| FR-012 | The system shall determine glove connectivity from recent OSC packets, independently for left and right hands. | Must |
| FR-013 | The system shall make first-run XR permission requirements visible and shall not fake or automate user consent. | Must |
| FR-014 | The patient shall be able to choose a live left or right glove as the active hand. | Must |
| FR-015 | The live hand rig shall render the 26 streamed local bone transforms for each live glove. | Must |
| FR-016 | The UI shall provide pronation/supination, circumduction and open-close exercise selection. | Must |
| FR-017 | Selecting an exercise shall check BASIC articulation state for the selected glove serial. | Must |
| FR-018 | Incomplete calibration shall open a blocking modal with the vendor BASIC animation for the selected side. | Must |
| FR-019 | Calibration shall begin only after an explicit click and shall send delete then add BASIC commands. | Must |
| FR-020 | Calibration progress and completion shall be based on streamed state, not the animation clock. | Must |
| FR-021 | The selected exercise alone shall receive selected-hand samples and emit repetition events. | Must |
| FR-022 | The active session shall show game, exercise guidance, local camera and live repetition status in a no-page-scroll layout. | Must |
| FR-023 | Confirmed detector events shall update repetition counts and the exercise-to-game control bridge. | Must |
| FR-024 | The session shall expose an explicit IMU tare button targeting the selected hand. | Must |
| FR-025 | The camera feed shall remain browser-local and the exercise shall continue if camera permission is denied. | Must |
| FR-026 | Finishing a non-empty session shall persist patient, hand, exercise, timestamps, duration, counts and available metrics. | Must |
| FR-027 | A zero-repetition session shall not be saved. | Must |
| FR-028 | Doctor and patient report views shall group sessions by date and provide understandable totals and charts. | Must |
| FR-029 | End patient shall stop the managed XR Game, clear patient context and preserve doctor authentication. | Must |
| FR-030 | Logout shall invalidate doctor authentication and remove access to protected local records. | Must |
| FR-031 | The app shall serve UI, APIs, hand assets, game and WebSocket from `127.0.0.1:3000`. | Must |
| FR-032 | The game shall be treated as secondary feedback; detector counting and report creation shall continue if it is unavailable. | Should |
| FR-033 | Live Data shall be visible only in an active patient context and shall clearly indicate stale/unavailable data. | Must |
| FR-034 | The packaged handoff shall include documentation, sanitized test data, launch/setup instructions, source, XR Game and supplied SDK references. | Must |

## 8. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-001 Security | Passwords shall never be stored in plaintext; session cookies shall be HTTP-only and SameSite Strict. | PBKDF2-HMAC-SHA256, unique salt, 200,000 iterations; max session 12 h |
| NFR-002 Privacy | Clinical data and camera shall remain local in this release. | No camera recording/upload; no cloud API required |
| NFR-003 Isolation | Doctor report browsing shall not mutate active patient or glove process state. | Zero glove process calls from read-only report navigation |
| NFR-004 Connectivity accuracy | A hand shall become disconnected when its packet stream is stale. | Current implementation target: less than 2 s freshness |
| NFR-005 Responsiveness | Visual telemetry should feel continuous while preserving browser stability. | WebSocket snapshots approximately 30 Hz; UI controls acknowledge promptly |
| NFR-006 Exercise integrity | One physical movement should create no more than one confirmed event per detector cycle. | Hysteresis/dwell/refractory logic; replay and live validation |
| NFR-007 Recoverability | Failure of XR Game, OSC, WebSocket, camera or game shall produce an actionable state and permit retry. | No silent permanent loading state |
| NFR-008 Data integrity | Local JSON writes shall not expose one patient's records to another and shall not save empty sessions. | Patient/date-scoped storage and validation |
| NFR-009 Usability | Core session content shall be readable without page scrolling on a typical clinical desktop. | Full-screen session; game primary; guide/camera aligned |
| NFR-010 Accessibility | Status shall not rely on color alone and controls shall have readable labels/focus behavior. | Text/icon status, keyboard-accessible controls, adequate contrast |
| NFR-011 Compatibility | Supported runtime shall operate on the documented Windows and Chrome versions with local ports available. | Windows 10/11 x64, current Chrome, Python 3.12 source runtime |
| NFR-012 Maintainability | Glove transport, detector, UI, hand rendering and game shall remain separable modules. | Documented ownership and stable API boundaries |
| NFR-013 Traceability | Product requirements shall map to source components and a verification method. | See `REQUIREMENTS_TRACEABILITY.md` |
| NFR-014 Observability | Operators shall be able to distinguish process, OSC, glove, calibration and WebSocket failures. | Local logs/health endpoint and specific UI messages |
| NFR-015 Packaging privacy | Shared packages shall not contain actual patients, reports, logs, cookies or private browser state. | Sanitized demo JSON only |
| NFR-016 Medical safety | The product shall not present prototype counts or game scores as diagnostic/validated medical outcomes. | Clear prototype labeling and clinician interpretation |

## 9. Report product requirements

Every persisted session should contain enough information to answer: who performed what, when, for how long, with which hand, and how many confirmed movements occurred. The UI should aggregate data at the date level first, with session drill-down.

Minimum report fields:

- report/session ID and schema version;
- patient and doctor IDs;
- exercise and selected hand;
- start/end timestamps and duration;
- total repetitions and movement-specific counts;
- available angle/rotation/range metrics and calibration snapshot;
- completion status and notes when available.

Charts may show counts, duration and direction balance over time. A normalized percentage or score must not be presented unless its clinical formula and interpretation are defined. Game points are entertainment feedback and must remain separate from rehabilitation outcomes.

## 10. Dependencies and assumptions

- Compatible StretchSense glove hardware is charged, paired and supported by XR Game 0.4.2-BETA.
- Vendor processing, firmware behavior and calibration semantics are treated as authoritative.
- Ports `3000`, `9002` and `9003` are available locally and permitted by firewall policy.
- The user may need to accept XR Game's first-run Early Access/telemetry permission in the real XR window.
- Current local JSON is appropriate for a controlled prototype, not concurrent multi-machine deployment.
- The supplied third-party SDKs and game retain their original licenses; redistribution must be checked by the sharing organization.

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| XR Game changes its OSC or calibration behavior | Connection/detection failure | Pin known version, preserve SDK references, add smoke tests |
| Running process is mistaken for connected glove | False clinical readiness | Use packet freshness as the connection truth |
| Local JSON is edited/corrupted | Authentication/report loss | Validate schemas, back up data, move to transactional storage before production |
| Left-glove game direction differs from right glove | Reversed controls | Known deferred bug; add handedness mapping test before left-hand rollout |
| Detector thresholds do not generalize | Missed/false repetitions | Record anonymized validation traces with consent; calibrate adaptive logic per exercise |
| Camera permission is denied | Reduced coaching feedback | Degrade gracefully; keep glove tracking available |
| Packaged vendor assets cannot be redistributed | Legal/commercial issue | Confirm StretchSense license before external sharing |

## 12. Release acceptance checklist

- License valid/invalid/expired paths pass.
- Doctor first login immediately displays patient list and Add patient.
- Doctor Reports remains read-only and does not launch XR Game.
- Patient selection opens connection workflow and accurate per-hand state.
- XR Game starts minimized; first-use consent is documented.
- Disconnect is reflected when packets become stale.
- Calibration opens only after exercise selection and uses the selected side's original BASIC animation.
- Calibration button, progress and completion are independently verified.
- Live rig is palm-facing and matches streamed sensor transforms.
- All three detectors are smoke-tested with the selected-hand gate.
- Game receives only confirmed mapped events; exercise reporting survives game failure.
- Zero-repetition sessions are absent; non-empty sessions appear under the correct date and patient.
- End patient stops managed glove services and returns to doctor state.
- Sanitized handoff ZIP passes manifest and launch/runbook checks.

## 13. Planned or deferred work

- Add flexion/extension, grasp and individual-finger exercises after detector validation.
- Improve continuous circumduction validation and open-close clinical testing.
- Correct handedness-aware game mapping for left gloves.
- Add games only where the exercise has an unambiguous, tested control mapping.
- Replace local license/account storage with a secured service if remote deployment is approved.
- Evaluate a fully frontend deployment only after confirming how XR Game process control, OSC UDP and local assets will be provided outside Python.
- Create a signed installer or PyInstaller distribution after persistence paths are made freeze-safe and release testing is complete.
