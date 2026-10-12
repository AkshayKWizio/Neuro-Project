"""Run only the bridge belonging to this checkout, with launch verification."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from backend.local_config import CONFIG
from backend.server import app
import uvicorn


@app.get('/api/runtime')
def runtime_identity():
    return {'project_root': str(ROOT), 'launch_token': os.environ.get('NEURO_LAUNCH_TOKEN', ''),
            'pid': os.getpid(), 'config_file': str(CONFIG.file),
            'frontend_port': CONFIG.network['frontend_port'], 'backend_port': CONFIG.network['backend_port']}


# The packaged site's catch-all route must not shadow this verification API.
app.router.routes.insert(0, app.router.routes.pop())


if __name__ == '__main__':
    uvicorn.run(app, host=CONFIG.network['host'], port=CONFIG.network['backend_port'])
