# Local game dependencies

Ship this directory with the app. Three.js module and core are copied together
from this checkout's installed `three` package (0.185.1), with its MIT license.
The imported `rehab-audio.js` was absent from the latest team pull. The supplied
compatibility helper exposes the API used by the existing game sound-effect synths
and respects the browser's user-gesture requirement for audio. It does not recreate
the team's missing full adaptive soundtrack/volume HUD; replace it with their
complete implementation when available, keeping the exported API compatible.

Run `node --test tests/game-controls.test.mjs` after dependency or binding changes.
