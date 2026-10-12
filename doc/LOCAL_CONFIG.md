# One local configuration file

For a first-time teammate setup, read [TEAM_LOCAL_SETUP.md](TEAM_LOCAL_SETUP.md).
It includes a copyable config and a Codex handoff prompt.

For the current Windows source app, edit **`neuro.local.json` in the checkout
root**, then run `Run-Neuro.cmd`. No machine-specific path edits are needed in
the launcher, Vite config, Python bridge or game HTML.

## Moving folders or pulling updates

- Paths are relative to the folder containing `neuro.local.json`, unless they
  are absolute Windows paths. Moving the complete checkout preserves relative paths.
- `neuro.local.json` is Git-ignored, so an ordinary Git pull does not overwrite
  your settings. Keep a backup; a fresh download/ZIP is a new folder, not a pull.
- The tracked `neuro.config.example.json` supplies defaults. Missing settings
  are merged from it; unknown/misspelled settings and invalid values fail clearly.
- If the local file is absent, the Windows launcher copies the template once.
  New teammates normally leave executable fields empty for auto-detection, or
  set their own installed Python/Node/Chrome paths in this one file.
- This computer's private config currently specifies its available Python 3.12
  interpreter. That absolute path is **not** in the tracked template.
- Stop the app before changing paths/ports, then relaunch. Editing JSON is not
  live configuration reload.
- Commit the new loaders and launcher changes **once** in the team repository.
  A config file cannot restore application code if a future download omits those
  changes. The local override file itself should stay untracked.

## Paths (all relative to the config directory by default)

| Setting in `paths` | Used for |
| --- | --- |
| `dashboard` | Source frontend/backend folder; must belong to this checkout |
| `venv` | Isolated Python environment; recreated by setup if absent |
| `sdk` | Vendored Python SDK import directory |
| `xr_game` | Exact XR Game executable to launch |
| `hand_models` | Original left/right FBX models served by the bridge |
| `hand_textures` | Original glove textures served by the bridge |
| `game_library` | Three.js/core/audio helper folder served at `/games/lib` |
| `license_file` | Existing local licence-key JSON |
| `data` | Doctor/patient/report JSON store |
| `logs` | Process metadata and frontend/backend logs |
| `web_bundle` | Legacy packaged HTML fallback for the Python server |

Keep `data` pointing at the current store if you want existing patients/reports.
Choosing another directory does not migrate the old records; it selects a different
store. No clinical data was moved during this change.

Use forward slashes in JSON Windows paths, or escape each backslash:

```json
{
  "paths": {
    "xr_game": "C:/Apps/StretchSense/XR Game/XR Game.exe",
    "data": "D:/NeuroData",
    "logs": "D:/NeuroLogs"
  },
  "runtime": {
    "python_executable": "C:/Python312/python.exe",
    "node_executable": "",
    "npm_executable": ""
  },
  "browser": {
    "executable": "C:/Program Files/Google/Chrome/Application/chrome.exe"
  }
}
```

This is a partial-override example, not a request to move your existing data.
Paths with spaces are supported. Use literal paths, not shell commands or
environment-variable placeholders. Empty executable strings mean auto-detect;
an explicitly configured missing executable fails instead of silently choosing
another executable.

## Network, browser and watcher settings

- `network.frontend_port`: 3000 by default.
- `network.backend_port`: 8765 by default; must differ from the frontend.
- `network.host`, `osc_receive_host`, `osc_send_host`: remain `127.0.0.1`.
  Configuration cannot silently expose this local clinical app on the network.
- `network.osc_receive_port`: 9002; `osc_send_port`: 9003.
  Keep these at the StretchSense defaults unless XR Game is configured for the
  same endpoints. Changing the JSON alone does not change XR Game's own ports.
- `browser.app_mode`, `width`, `height`: standalone browser window and size.
- `runtime.watch_polling`, `watch_interval_ms`: mapped-drive watcher behavior.
- `runtime.page_timeout_seconds`: startup page readiness timeout.

Frontend proxies, metadata URLs and the Python HTTP/OSC listeners read the same
settings. Standalone game fallback WebSockets use their page origin rather than
a fixed backend port. Embedded game events, exercise detection thresholds and
direction mappings are not changed by configuration.

The game-library proxy serves files only inside the configured library folder.
Do not point this public asset setting at a directory containing private documents.
Three.js/core/license are restored from the installed package if absent. A custom
library directory also receives the tracked audio compatibility helper if absent;
existing custom helper files are not overwritten.

## What changed

- `Run-Neuro.cmd` now delegates to root `Run-Neuro.ps1`.
- `Run-Neuro.ps1`, setup, start/stop and shortcut creation use
  `Read-NeuroConfig.ps1` for paths/settings.
- `backend/local_config.py` applies the same defaults and overrides to the
  bridge; `backend/local_launch.py` reads its HTTP endpoint from it.
- `neuro-config.ts` supplies the frontend proxy/watcher/metadata settings.
- `/api/runtime` reports the exact config file and ports; startup verifies both
  the checkout and configuration identity before opening Chrome.
- `xr_game.json` and `NEURO_XR_GAME_PATH` are no longer sources for the current
  Windows source bridge. Update `paths.xr_game` in `neuro.local.json` instead.
- The Git ignore exceptions now retain the app's source `lib` folder and
  `public/games/lib` assets, which were previously caught by a broad Python
  `lib/` ignore rule.

Stable internal filenames/routes are not machine paths: for example, the
backend entry script, Vite CLI, model filenames and XR calibration files relative
to the configured executable remain part of the code/package structure.
SDK standalone examples and unit-test fake paths are not active launch settings.
Legacy macOS/packaged-EXE launchers are not the current Windows launch workflow;
the deferred EXE packaging work must include these config resources before release.

## Checks

From `glove-dashboard`:

```powershell
.\backend\.venv\Scripts\python.exe -B -m backend.tests.local_config_test
node.exe --test .\tests\game-controls.test.mjs
.\node_modules\.bin\tsc.cmd --project tsconfig.local.json --noEmit --incremental false
```

From the checkout root after launch (adjust URL if you changed the frontend port):

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/runtime' |
  Select-Object project_root, config_file, frontend_port, backend_port
```

Configuration tests cover defaults, partial overrides, relative paths with spaces,
absolute paths, custom ports, invalid settings and agreement between the real
PowerShell, Python and TypeScript readers. The app was launched with the private
config; game-library and left/right model requests returned HTTP 200.
