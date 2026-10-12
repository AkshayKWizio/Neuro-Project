# Team setup: change paths once, then run Neuro

This guide applies to the current **Windows source checkout**. Do not edit source
files to insert another developer's `Z:` drive or user-directory paths.

## 1. The only machine-specific file to edit

Edit **`neuro.local.json` beside `Run-Neuro.cmd`**, not inside `glove-dashboard`.
The tracked `neuro.config.example.json` supplies defaults. The local override
is Git-ignored so a normal pull keeps each developer's settings.

```text
Neuro-Project/                 <- your own checkout, anywhere on your computer
  Run-Neuro.cmd               <- double-click this copy
  Stop-Neuro.cmd
  Setup-Neuro.ps1
  neuro.config.example.json   <- shared defaults; commit this
  neuro.local.json            <- YOUR machine settings; do not commit this
  glove-dashboard/
  doc/TEAM_LOCAL_SETUP.md
```

If the local config does not exist, the launcher creates it from the template.
To create it before the first run, open PowerShell in the checkout root:

```powershell
if (-not (Test-Path -LiteralPath '.\neuro.local.json')) {
    Copy-Item -LiteralPath '.\neuro.config.example.json' -Destination '.\neuro.local.json'
}
notepad.exe '.\neuro.local.json'
```

Do not overwrite an existing config when pulling updates. Stop the app before
editing settings, then relaunch; settings are not live-reloaded.

## 2. Which paths need changing?

Paths are relative to the directory containing the config unless absolute.
Moving the **whole checkout** does not require changing the default relative paths.

| Config setting | What to put there |
| --- | --- |
| `paths.xr_game` | Exact path to your installed `XR Game.exe`. This is the usual required edit if the runtime is stored outside the checkout. |
| `runtime.python_executable` | Installed Python **3.11 or 3.12 x64** `python.exe`; leave empty to auto-detect. Not a copied virtual environment or Python 3.6/32-bit. |
| `runtime.node_executable` | Installed `node.exe`; leave empty to use PATH. The project's package manifest requires Node **22.13.0 or newer**. |
| `runtime.npm_executable` | Installed `npm.cmd`; leave empty to use PATH. Needed for frontend dependency installation. |
| `browser.executable` | Your Chrome `chrome.exe`; leave empty to check standard Chrome installation locations. Without Chrome found, the launcher falls back to your default browser. |
| `paths.dashboard` | Normally keep `glove-dashboard`. It must be inside this checkout, never point to the original app or another team's folder. |
| `paths.venv` | Normally keep `glove-dashboard/backend/.venv`. Setup creates an environment on this computer. |
| `paths.sdk` | Normally keep `glove-dashboard/backend/vendor/reality_sdk`. Change only if you intentionally keep the supplied SDK elsewhere. |
| `paths.hand_models`, `paths.hand_textures` | Keep the defaults if the original hand FBX files and textures are included. |
| `paths.game_library` | Keep `glove-dashboard/public/games/lib`; contains Three.js and the audio helper. Never point it at private documents. |
| `paths.license_file` | Local licence JSON location; keep the default if provided through your authorised team setup. |
| `paths.data`, `paths.logs` | Keep defaults, or choose explicit local storage directories. A different data path does not migrate existing reports/patients. |
| `paths.web_bundle` | Legacy packaged frontend fallback; normally leave unchanged for source launch. |

**Keep the entire XR Game installation together**, including its adjacent data,
DLLs and other runtime files. Point to the executable in that installation;
copying just the EXE is insufficient. Obtain the vendor runtime/SDK through
the team's authorised distribution; do not assume GitHub includes those files.

## 3. Copyable config example

Replace the example locations with paths that actually exist on your computer.
This is a valid **partial override**: other values come from the template.

```json
{
  "schema_version": 1,
  "paths": {
    "xr_game": "C:/Apps/StretchSense/XR Game/XR Game.exe"
  },
  "runtime": {
    "python_executable": "C:/Python312/python.exe",
    "node_executable": "C:/Program Files/nodejs/node.exe",
    "npm_executable": "C:/Program Files/nodejs/npm.cmd"
  },
  "browser": {
    "executable": "C:/Program Files/Google/Chrome/Application/chrome.exe"
  },
  "network": {
    "frontend_port": 3000,
    "backend_port": 8765
  }
}
```

If Python, Node/npm and Chrome are auto-detectable, the minimal local config can
simply contain `paths.xr_game`. An empty executable string requests auto-detection;
a non-empty but incorrect path fails instead of silently using another executable.

Use **forward slashes** in JSON Windows paths, or escape backslashes as `\\`.
Spaces are supported. Do not add shell commands, `%VARIABLE%`, `~`, comments,
trailing commas or misspelled setting names to the JSON.

Keep HTTP/OSC hosts at `127.0.0.1`. Keep frontend **3000**, backend **8765**, OSC
receive **9002** and send **9003**, unless an intentional integration change
requires otherwise. OSC changes must agree with XR Game's own configuration;
editing this JSON does not change the vendor application's settings.

## 4. First run on a teammate's machine

1. Install Python 3.11/3.12 **x64**, Node meeting the package requirement, and
   Chrome. These are required for this source build; it is not the deferred
   self-contained EXE package.
2. Get the complete repository, SDK, hand models/textures, audio helper and
   authorised XR Game installation. Include the package lockfile.
3. Create/edit your root `neuro.local.json` as above.
4. Double-click **this checkout's `Run-Neuro.cmd`**.
5. The launcher prepares missing Python dependencies, installs frontend dependencies
   with `npm ci` if the Vite CLI is missing, starts the local bridge/frontend,
   verifies checkout identity, then opens the app in Chrome.

Initial dependency installation requires access to the configured package
registries. Allow setup to finish; later launches reuse the installed dependencies.
For explicit first-time backend setup, run from the root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Setup-Neuro.ps1
```

Use **`Stop-Neuro.cmd`** from the same root to stop this checkout. After changing
paths, always stop/relaunch through these launchers. Do not use the legacy
`Run-Neuro.sh`, hosted `npm start`, or another checkout's launcher for this flow.
XR Game is launched through the existing glove-connection workflow; editing
paths does not change that workflow or bypass any vendor permission prompts.

## 5. Confirm that it launched your project

After launch, run in PowerShell:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/runtime' |
    Select-Object project_root, config_file, frontend_port, backend_port
```

`project_root` must be **your checkout's `glove-dashboard` directory** and
`config_file` must be **your root `neuro.local.json`**. The launcher verifies this
before opening the browser. Do not paste the whole runtime response into public
issues; use the selected fields above. Do not share licence keys or patient data.

## 6. Common startup problems

| Symptom | What to check |
| --- | --- |
| Python not found / wrong version | Correct `runtime.python_executable`, or install 3.11/3.12 x64 for auto-detection. This setup no longer requires only 3.12. |
| Virtual environment copied from another machine fails | Python virtual environments are not portable. Create a fresh checkout/environment with setup; do not copy someone else's `.venv` or set your Python path to it. Preserve local data before any cleanup. |
| Node/npm not found | Set both executable paths, or verify `Get-Command node.exe` and `Get-Command npm.cmd` find your installation. Restart your terminal after PATH changes. |
| XR Game missing / gloves never connect | Check `paths.xr_game` names the correct EXE and its complete adjacent installation. Power on gloves and check vendor prompts. A running process alone does not prove a live glove stream. |
| Original app opens instead | Use this folder's `Run-Neuro.cmd`, keep `paths.dashboard` relative, and check `/api/runtime`. Check desktop shortcuts for another checkout's launcher. |
| Port 3000/8765 occupied | Stop the known conflicting app with its own launcher. Do not kill all Python/Node processes or all port owners. |
| Rig or calibration assets missing | Verify the configured FBX/texture folders and complete vendor runtime, not just the EXE. |
| Game blank / audio helper missing | Confirm `public/games/lib/rehab-audio.js` is in the pull. Launcher restores missing Three.js files from the installed package, but needs the tracked audio helper. |
| Dependency installation fails | Inspect network/proxy/package-registry access and the printed error; editing game or detector code will not resolve this. |
| Config rejected | Check valid JSON, exact setting names and existing explicit executable paths. Unknown keys fail deliberately. |

Logs live at `paths.logs`, normally `glove-dashboard/.logs`:
`frontend.log`, `frontend-error.log`, `backend.log`, `backend-error.log`.
Stop/restart only this checkout when troubleshooting. If dependencies change
after a pull, rerun backend setup and `npm ci` in `glove-dashboard` as appropriate;
the launcher does not reinstall every dependency on every launch.

## 7. Instructions to paste into your teammate's Codex

> Read `doc/TEAM_LOCAL_SETUP.md` and `doc/LOCAL_CONFIG.md` first. Work only in
> this checkout. Inspect root `neuro.config.example.json` and my `neuro.local.json`.
> Put my machine-specific XR Game, Python, Node/npm and Chrome paths only in
> `neuro.local.json`; keep source paths relative where possible. Do not copy
> another developer's absolute paths or virtual environment. Do not change the
> bridge, exercise thresholds/EMA, hand rig, calibration or game controls to fix
> a launch/path problem. Use root `Run-Neuro.cmd` and verify `/api/runtime` points
> to this checkout and this config. Diagnose missing vendor assets, dependencies
> or occupied ports without killing unrelated processes. Preserve licence keys,
> patients and reports; keep machine config and private data out of Git.

## 8. Files that must stay in the pull

The config cannot replace missing launch code. Retain the root CMD/PowerShell
launchers, `Read-NeuroConfig.ps1`, `neuro.config.example.json`, `neuro-config.ts`,
and the dashboard's `start-local.ps1`, `stop-local.ps1`, `vite.local.config.ts`,
`backend/local_config.py` and `backend/local_launch.py`.

The readers connect this one config to setup/launch, frontend proxy/ports,
Python SDK/XR Game paths and asset/data locations. Do **not** edit
`xr_game.json` or `NEURO_XR_GAME_PATH` for the current Windows source launcher;
they are not its path sources. For implementation recovery, see
[UPDATED_CODE_RECOVERY.md](UPDATED_CODE_RECOVERY.md).
