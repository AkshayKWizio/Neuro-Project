"""Config consistency checks; fixtures never alter the user's local settings."""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from backend.local_config import LocalConfig, PROJECT_ROOT


def expect_failure(file, settings):
    file.write_text(json.dumps(settings), encoding='utf-8')
    try:
        LocalConfig(file)
    except ValueError:
        return
    raise AssertionError('Invalid settings were accepted')


with tempfile.TemporaryDirectory(prefix='config-test-', dir=Path(__file__).parent) as temp:
    directory = Path(temp)
    file = directory / 'neuro.local.json'
    settings = {
        'paths': {'xr_game': 'XR Folder With Spaces/XR Game.exe', 'data': 'patient data'},
        'network': {'frontend_port': 3100, 'backend_port': 8799},
    }
    file.write_text(json.dumps(settings), encoding='utf-8')
    config = LocalConfig(file)
    assert config.network['frontend_port'] == 3100
    assert config.network['backend_port'] == 8799
    assert config.network['osc_receive_port'] == 9002
    assert config.path('xr_game') == directory / 'XR Folder With Spaces' / 'XR Game.exe'
    assert config.path('data') == directory / 'patient data'
    config.settings['paths']['data'] = str(PROJECT_ROOT / 'glove-dashboard' / 'backend' / 'data')
    assert config.path('data') == PROJECT_ROOT / 'glove-dashboard' / 'backend' / 'data'

    # Compare the real Windows launcher reader with Python.
    if os.name == 'nt':
        helper = str(PROJECT_ROOT / 'Read-NeuroConfig.ps1').replace("'", "''")
        config_file = str(file).replace("'", "''")
        command = f". '{helper}'; $c = Get-NeuroConfig '{config_file}'; @{{port=$c.network.frontend_port; data=$c.paths.data}} | ConvertTo-Json -Compress"
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], capture_output=True, text=True, check=True)
        parsed = json.loads(result.stdout)
        assert parsed['port'] == 3100
        assert Path(parsed['data']) == directory / 'patient data'

    # Compare Vite's actual TypeScript reader (Node supports stripping TS types).
    node = shutil.which('node')
    if node:
        env = dict(os.environ, NEURO_PROJECT_ROOT=str(PROJECT_ROOT), NEURO_CONFIG_FILE=str(file))
        helper_url = (PROJECT_ROOT / 'neuro-config.ts').as_uri()
        command = f"import {{ readNeuroConfig }} from '{helper_url}'; const c=readNeuroConfig(); console.log(JSON.stringify({{port:c.network.frontend_port,data:c.paths.data}}));"
        result = subprocess.run([node, '--input-type=module', '-e', command], env=env, capture_output=True, text=True, check=True)
        parsed = json.loads(result.stdout)
        assert parsed['port'] == 3100
        assert Path(parsed['data']) == directory / 'patient data'

    expect_failure(file, {'network': {'host': '0.0.0.0'}})
    expect_failure(file, {'network': {'backend_port': 3000}})
    expect_failure(file, {'network': {'frontend_port': '3000'}})
    expect_failure(file, {'paths': {'xr_game': ''}})
    expect_failure(file, {'paths': {'misspelled_setting': 'x'}})
    expect_failure(file, {'browser': {'app_mode': 'yes'}})
    expect_failure(file, {'schema_version': True})

print('Local config defaults, relocation, cross-runtime consistency and validation passed')
