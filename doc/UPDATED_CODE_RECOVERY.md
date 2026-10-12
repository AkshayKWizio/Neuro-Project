# Updated team pull: launcher and exercise/game recovery

Date: 12 October 2026.

Configuration follow-up: local paths/ports now come from root `neuro.local.json`.
See [LOCAL_CONFIG.md](LOCAL_CONFIG.md) for the current single-file setup. The
launcher/config integrations must be committed; the machine override stays ignored.

Applied to `team_development/updated_code/Neuro-Project`, using the earlier
`LOCAL_RUN_AND_GAMEPLAY_RECOVERY.md` as the recovery reference. This document
describes the **current** game choices and direction convention; older game tables
in the 9 October document are historical and must not override this mapping.

## Run this checkout

Double-click the `Run-Neuro.cmd` alongside this document's parent folder.
It calls its own `glove-dashboard/Launch-Neuro.cmd`; it does not launch the
original project or the previous team checkout.

- Frontend: `http://127.0.0.1:3000/`, current React/Vinext source.
- Python bridge: `http://127.0.0.1:8765/`, checkout-local environment.
- `/api` and `/ws` are proxied through the frontend.
- Chrome is opened only after checking `/api/runtime` for the expected checkout
  root and unique launch token. The token is a startup identity check, not auth.
- Another app on either port causes a clear failure, not a fallback to its UI.
- `Stop-Neuro.cmd` uses checkout-scoped ownership and descendant checks.

Prerequisites: Python 3.11 or 3.12 x64, Node >=22.13 and npm. The local environment
was created using an explicitly supplied available Python 3.12 interpreter;
that computer-specific runtime path is not embedded in the launcher.
Do not share/copy virtual environments or `node_modules` as portable runtimes.

## Startup fixes reapplied

1. Replaced packaged-UI startup with the recovered source frontend launcher.
2. Restored relative launcher paths, exit-code handling and dependency checks.
3. Restored Python setup compatibility, isolated environment and pinned installs.
4. Restored `backend/local_launch.py`, with its identity route before the
   backend catch-all; otherwise the check receives HTML instead of JSON.
5. Added `vite.local.config.ts`, local proxies and polling at 500 ms to avoid
   mapped-drive native watcher `EBUSY` crashes.
   Generated backend, log and packaged-bundle folders are excluded from polling;
   the first cold source compile timed out during testing, and the subsequent
   verified launch completed with these exclusions and the warmed dependency cache.
6. Restored the missing `lib/utils.ts` class-name helper.
7. Installed this pull's locked npm dependencies and backend requirements.
8. Restored the omitted Three.js module, core and MIT license under
   `public/games/lib`. The launcher now copies these from its own installed
   dependency if absent. They are a matched pair from Three.js 0.185.1.
9. The pull also omitted `public/games/lib/rehab-audio.js`, which every active
   game imports. Added an API-compatible WebAudio helper so this missing import
   does not stop module initialization. Existing game synths remain.
   It is not the team's unavailable full adaptive soundtrack/volume HUD;
   replace it with their full helper when supplied.
10. Reapplied iframe ready-message validation, 20-second loading timeout and
    retry. Sky Glider had no ready signal; it now sends one after initialization.
    The team's countdown and layout remain, and countdown starts after readiness.

The configured XR Game path is now `paths.xr_game` in root `neuro.local.json`,
relative to that config's directory. The default is
`XR Game 0.4.2-BETA/XR Game 0.4.2-BETA/XR Game.exe`.
That file exists inside this updated checkout. No XR Game binary or launcher
core behavior was modified, and no absolute original-project path was introduced.
Hand models/textures and vendor SDK remain from the team's updated pull.

## Current exercise → game connection

```text
XR Game → Python SDK bridge → existing Python EMA/windowed detectors
       → selected-hand /ws exercise events/counts → ExerciseSession
       → neuro-game-action iframe message → validated game receiver
       → existing game function
```

The guidance and live hand rig visualize movement; they do not generate gameplay
events or replace the detector. At the initial launcher repair the detector
matched the previous version ignoring line endings. Later corrections described
below update the detector input and ambiguous-direction fallback without retuning.

| Exercise | Current game | Confirmed event → gameplay |
| --- | --- | --- |
| Pronation/supination | Sky Glider | Hand-specific action → left/right airplane steering |
| Wrist circumduction | Rolling Wonder | Clockwise → right; anticlockwise → left, via existing circumduction callback |
| Hand open/close | Balloon Blitz | Close → grip/inflate; open → release |

The new pull's game design is preserved: Rolling Wonder is no longer the older
multi-exercise/turbo binding, and Sky Glider replaces the older Gelato Tower
default. Do not copy old game HTML over these new versions to recover startup.

### Requested rotation convention

A detected movement name is its destination pose.

| Selected glove | Detected transition | Movement name | Game action |
| --- | --- | --- | --- |
| LEFT | Supination → pronation | `pronation` | `move_right` |
| LEFT | Pronation → supination | `supination` | `move_left` |
| RIGHT | Supination → pronation | `pronation` | `move_left` |
| RIGHT | Pronation → supination | `supination` | `move_right` |

The older pull's left/right rule was opposite. The pure mapping now lives in
`lib/rotation-controls.ts`. Sky Glider respects that action rather than
reclassifying a raw quaternion or reversing the movement a second time.
Its internal handed rendering is compensated in its message callback so left
actions actually move the airplane left for either glove.
The selected hand is configured after game readiness, and its in-game hand toggle
cannot independently change the glove during embedded play.

Example confirmed left-hand event:

```js
{
  type: 'neuro-game-action',
  exercise: 'pronation_supination',
  movement: 'pronation',
  side: 'LEFT',
  action: 'move_right',
  event_id: 1,
  timestamp_ms: 123456789, // actual detector timestamp replaces this example
  keyboard_key: 'ArrowRight'
}
```

These are messages, not synthetic Windows keystrokes.
`public/games/glove-controls.js` rejects untrusted senders, wrong exercises,
duplicates and stale timestamps. Messages are gated on selected-glove connection,
game readiness and countdown completion. A new hand/exercise remounts the session
to prevent replaying old events. Only the game's matching exercise is offered.
New confirmed events arriving during loading/countdown are queued, then delivered
once ready, rather than marked consumed and silently discarded. The full recent
event list is used instead of only the latest event.

The embedded games do not start their old competing raw-sensor WebSocket readers,
and mouse movement cannot override glove control. Keyboard testing remains.
Sky Glider/balloon raw-message fallback detection is no longer a competing input.
The small gameplay bar reads counts from the selected Python detector, not game
score/cycle messages. It shows completed reps, detected movements and delivery
status (queued, sent, acknowledged or game paused/ignored).
Pronation reps remain paired pronation/supination counts; open/close reps count
closure transitions; circumduction reps sum both directions. A single direction
can therefore increment MOVES before a pronation pair increments REPS.
Game score remains separate. Empty sessions no longer fabricate a minimum count.

## Files to retain after the next pull

- Config integration: `neuro.config.example.json`, `Read-NeuroConfig.ps1`,
  `Run-Neuro.ps1`, `Stop-Neuro.ps1`, `neuro-config.ts`,
  `backend/local_config.py`, config-aware launch/setup scripts, asset proxy and
  `backend/tests/local_config_test.py`. Keep your Git-ignored `neuro.local.json`
  separately when downloading a fresh folder.

- Root: `Run-Neuro.cmd`, `Setup-Neuro.ps1`.
- Dashboard: `Launch-Neuro.cmd`, `start-local.ps1`, `stop-local.ps1`,
  `vite.local.config.ts`, `backend/local_launch.py`, `lib/utils.ts`.
- Binding: `lib/rotation-controls.ts`, `components/exercise-session.tsx`,
  the session key/live props in `app/page.tsx`,
  `public/games/glove-controls.js`.
- Delivery/counting: `lib/game-event-delivery.ts`, feedback styles in
  `app/redesign.css`, and `backend/tests/pronation_stream_regression_test.py`.
- Detector input/fallback fixes: `backend/exercise_detector.py` and the
  orientation conversion in `backend/server.py`.
- Local typechecking: `tsconfig.local.json` excludes the unused hosted Vite
  config, whose hosting JSON is not present in the downloaded team checkout.
- Active games: the targeted binding changes in Sky Glider, Rolling Wonder and
  Balloon Blitz HTML. Preserve newer game content when merging these changes.
- Assets: `public/games/lib`, including the audio helper and engine license.
- Tests: `tests/game-controls.test.mjs`; this document.

Commit the reviewed source fixes and required assets to the team repository.
Do not commit local environments, logs, credentials or patient/report data.
No commit or push was performed during this repair.

## Post-pull checklist and tests

From the checkout root:

```powershell
.\Stop-Neuro.cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Setup-Neuro.ps1
# If Python is not discoverable, supply -PythonExecutable with a local installed path.
Set-Location .\glove-dashboard
npm.cmd ci --no-audit --no-fund
node.exe --test .\tests\game-controls.test.mjs
.\backend\.venv\Scripts\python.exe -B -m backend.tests.exercise_detector_test
.\backend\.venv\Scripts\python.exe -B -m backend.tests.pronation_stream_regression_test
.\node_modules\.bin\tsc.cmd --project tsconfig.local.json --noEmit --incremental false
Set-Location ..
.\Run-Neuro.cmd
Invoke-RestMethod 'http://127.0.0.1:3000/api/runtime' |
  Select-Object project_root, pid
```

Run `npm ci` after lockfile changes; startup only installs frontend dependencies
automatically when Vite is missing. If sharing the folder, ensure the complete
XR Game directory, hand assets, vendor SDK and local game helper files are included.
Stop a verified older checkout with its own stop script if it still owns the ports;
the new launcher deliberately refuses to kill an unrelated port owner.

Logs: `glove-dashboard/.logs/backend*.log` and `frontend*.log`.
Missing local module responses must be HTTP 200 JavaScript, not an HTML 404 page.
Reload existing Chrome pages after updating game scripts.

Regression tests cover local module availability, Three.js API availability,
both hands' direction rules, every active game's event mapping, deduplication,
sender validation and the actual Sky Glider steering callback for all four cases.
The Python detector parity checks and launcher/game syntax checks also passed.
The dependency test checks every shared audio method called by the active games,
including `updateRolling`, to prevent a missing-method failure inside the frame loop.
The latest checkout was launched in Chrome and its runtime identity verified.
Sky Glider, Rolling Wonder and Balloon Blitz initialized in temporary browser
test tabs after repair; corrected Sky Glider directions and Rolling Wonder's
rendered scene were inspected, with no new startup errors in the final checks.
Real-glove end-to-end testing is still required for movement detection and
gameplay accuracy, calibration, disconnect/reconnect and stale-event behavior.

## Follow-up: detector and delivery corrections (12 October 2026)

The revised user mapping is the table above. Clockwise remains right and
anticlockwise remains left for **both** gloves; there is no hand-side reversal
for circumduction.

### Comparison with original Python and Gloves.Exercise.cs

The original and initially updated Python detector matched. The C# active
detector settings also match: one-second window, velocity EMA alpha 0.2,
start velocity 40°/s, settling velocity 20°/s for 0.12 seconds, accumulated
rotation 40°, direction consistency 0.50 and palm-dot threshold 0.08.
These values were not retuned, and the original C# file was not edited.

However, the Unity SDK's `StretchSenseOSCReceiver.OnOrientation` constructs
`Quaternion(-y, -z, x, w)` before updating HandStateManager. Python stores the
raw `(x,y,z,w)` packet. The initial Python bridge fed raw components into the
Unity-ported palm/axis detector, so its coordinate frame differed from the C#
input even though the algorithm body matched.

The updated bridge converts orientation **only on the detector path**, using
`sdk_to_unity_orientation`. SDK shared state, live hand rig joints, textures,
calibration and XR launch behavior are not rewritten. Both Unity-ported wrist
orientation detectors receive this frame; finger open/close data is unaffected.

The fallback direction had a separate bug inherited from the C# source:
normalizing the net rotation vector as the dominant axis makes projection onto
that axis always nonnegative. If the palm normal does not change meaningfully,
that fallback cannot distinguish reverse rotation. The Python implementation now
uses a canonical signed axis, preserving net direction. Palm-dot classification
keeps the source's executed mapping. Its C# comment says the opposite of the
expression; the expression was preserved rather than trusting the comment.

Pronation input now also normalizes valid quaternions, hemisphere-aligns equivalent
`q/-q` poses, rejects invalid/non-increasing samples, and resets across a stale
stream gap rather than treating reconnect as motion. Hemisphere alignment is a
representation correction, not NLERP or a replacement for the velocity EMA.

The original algorithm still expects sufficient travel and brief settling.
Slow motion below its start-velocity gate or continuous reversals without settling
can still be rejected. These original requirements were not silently relaxed.
Real-glove testing is needed before any further sensitivity changes.

### Why a detected event could fail to execute a game input

The earlier session marked a timestamp sent **before** checking readiness,
connection and countdown. An event arriving while gated was consumed without
being posted. Also, forwarding only `latest` could miss multiple events between
React updates; rounded wall-clock timestamps could collide.

The bridge now emits a sequence `event_id` and strictly increasing display
timestamps. The frontend queue deduplicates and retains new confirmed events
while temporarily gated, then forwards them in timestamp order. Initial snapshot
history is not replayed on a fresh session.

Each embedded game replies with `neuro-game-action-ack` including event identity,
hand, exercise and whether its input callback accepted the action. Paused/completed
games can report ignored input. The bar's confirmation means the game input
callback ran/accepted it, **not** that the player earned points or hit a target.
For Balloon Archery, close fires once and open rearms; a repeated close is ignored.

Eight game-binding/delivery tests, original detector checks, new stream/frame/sign
tests, local typechecking and active-game syntax checks passed after these changes.
The updated checkout was restarted on port 3000 to activate the Python changes.

## 2026-10-12: Balloon Archery and two-lane Sky Glider

Only game mechanics, game labels, score messages and game-overlay positioning
changed. Python/SDK detection, XR Game launching, live rig and circumduction
game remain unchanged. Retain these files after a pull:

- `glove-dashboard/public/games/gameplay-rules.js`: pure archery/flight state.
- `glove-dashboard/public/games/balloon-blitz/index.html`: now Balloon Archery,
  retaining its URL/id and the festival environment.
- `glove-dashboard/public/games/sky-glider/index.html`: lane-based endless flight.
- `glove-dashboard/components/exercise-session.tsx`: new labels/instructions,
  `neuro-game-score` handling (including score decreases after missile hits).
- `glove-dashboard/tests/game-controls.test.mjs` and `gameplay-rules.test.mjs`.

### Archery

The balloon sweeps horizontally across a fixed golden sight. One confirmed
`wrist_close` shoots one animated arrow; `wrist_open` reloads. Holding closed never
pumps or repeatedly shoots. Arrow arrival tests the moving balloon against the
aim line, with a forgiving 0.72 world-unit hit radius. Hits earn 100 points and
pop/replace the balloon. Shots, hits, accuracy and score are gameplay measures,
not exercise repetitions. The backend remains the clinical count authority.

### Sky Glider

LH starts supinated in the left lane; RH starts supinated in the right lane.
LH pronation moves right, LH supination moves left; RH is the opposite.
Only alternating pronation/supination poses change lanes, and each command
selects an exact lane with a short eased transition rather than accumulating drift.
The first ring is opposite the starting lane; each collection flips the next
ring's lane. Misses retry that target instead of skipping ahead to an impossible
repeat-pose instruction. Each new target starts 82 units ahead at speed 14,
giving roughly six seconds to change position. On collection, a red missile
starts 40 units ahead in the collected lane and the next ring appears in the
opposite lane. The return rotation avoids this intervening missile and aims
for the next ring, with about three seconds separating the encounters.
Removing the passed, collected ring does not clear that missile or create
a duplicate target. Ring collection earns 150; missile contact
subtracts 50 (minimum zero), briefly shakes/flashes the game only, then continues.
There is no game-over state. Ring pairs are explicitly labelled game statistics,
not clinical repetitions. A shield prevents repeated hits within one second.

### Overlay layout and checks

Game stats occupy the top-right above the existing bottom-right hand-rig overlay.
Objectives/feedback sit at the top-left; control hints at the bottom-left.
The embedded camera reserves 308px on the right and shifts the action left;
Sky's lens also widens for narrow/short desktop play areas to protect both wings.
The parent live rig, its position, rendering, tare and guide toggle are unchanged.

Run `node --test tests/game-controls.test.mjs tests/gameplay-rules.test.mjs`
from `glove-dashboard`: 12 checks cover hand mappings, actual flight callbacks,
event deduplication, queued delivery, alternation, reloading and hit penalties.
Local TypeScript checks and original Python detector/stream regressions also pass.
`/games/test-preview.html` is an optional manual integration QA view. It emits
confirmed-event-shaped messages using buttons and reserves a labelled placeholder
where the existing live rig sits; it is not a new patient route or sensor demo.
Browser QA verified acknowledgements, lane switches, ring collection, continuing
missile penalties and one shot despite repeated close messages. Real-glove timing
and comfort still need testing with LH and RH hardware.

### Bow refinement and easy archery obstacle

The bow now uses recurved wooden limbs, a red leather wrapped grip, an animated
three-point string, and a visibly nocked arrow with shaft, arrowhead and three
feathers. A confirmed close animates a 0.28-second draw then automatically releases
the arrow for a 0.36-second flight; open reloads. The arrow's tail follows the
drawn string, and the limbs flex then recover. No extra sensor thresholds or
hold-to-repeat shooting were introduced.

A single slow wooden shield crosses the shooting line in front of the balloon.
Collision is checked once as the arrow reaches its depth, not repeatedly after
the arrow has passed. A blocked arrow stops with feedback and counts as a missed
shot for accuracy; score is not reduced and the game continues. The aim sight
only turns green when the balloon is aligned and the shield is clear. Festival
environment, UI layout, live rig, circumduction and detector logic are unchanged.
Thirteen game tests now include the real flight loop's post-ring scheduling and
cleanup behavior; local TypeScript validation also passes.

### Teal Festival design integration

The recommended second concept is saved at `doc/designs/teal-festival-concept.png`
as a design reference, not a game sprite or a generated 3D model. Its style is
recreated as real mesh components in
`glove-dashboard/public/games/festival-archery-assets.js`: tapered laminated
wooden limbs, cream bindings, teal grip, matching teal/coral feathers and a coral
padded oval shield with cream piping, stitches and teal straps. The old plank
obstacle is replaced. The first-person bow uses a three-quarter orientation and
an arrow rest; drawing moves the arrow nock with the bowstring. Flight begins
at the actual release position, so there is no jump from a hardcoded origin.

An obstacle collision briefly lodges the arrow in the shield, animates damped
local recoil/twist, briefly brightens the face, emits particles and plays a
soft impact sound. The embedded arrow is removed after 1.15 seconds. Reduced
motion disables shield shake/recoil/pulse; all movement detection, shot/reload
rules, clinical repetitions and no-penalty obstacle scoring remain unchanged.
No whole-screen shake or hand-rig movement is introduced. Arrow instances share
their template meshes instead of allocating new geometry on every shot.

Retain the new asset module, the Balloon Archery import/integration, and
`tests/festival-assets.test.mjs` in subsequent pulls. Sixteen game checks cover
geometry, exact arrow-nock/string attachment through the draw, settling effects,
reduced motion, single-impact collision/no-penalty scoring, exercise bindings
and the existing plane schedule.
