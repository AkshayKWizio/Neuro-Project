"""Shared file-backed settings for the Windows local app (no SDK edits)."""
import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class LocalConfig:
    def __init__(self, config_file=None):
        self.file = Path(config_file or os.environ.get('NEURO_CONFIG_FILE', PROJECT_ROOT / 'neuro.local.json')).resolve()
        self.root = self.file.parent
        with (PROJECT_ROOT / 'neuro.config.example.json').open(encoding='utf-8-sig') as source:
            self.settings = json.load(source)
        if self.file.is_file():
            with self.file.open(encoding='utf-8-sig') as source:
                overrides = json.load(source)
            for section, values in overrides.items():
                if section not in self.settings:
                    raise ValueError(f'Unknown config section: {section}')
                if section == 'schema_version':
                    if type(values) is not int or values != 1:
                        raise ValueError('Unsupported config schema_version')
                    continue
                if not isinstance(values, dict):
                    raise ValueError(f'Config section {section} must be an object')
                for key, value in values.items():
                    if key not in self.settings[section]:
                        raise ValueError(f'Unknown config setting: {section}.{key}')
                    self.settings[section][key] = value
        network = self.settings['network']
        for key in ('host', 'osc_receive_host', 'osc_send_host'):
            if network[key] != '127.0.0.1':
                raise ValueError(f'network.{key} must stay 127.0.0.1 for this local-only app')
        for key in ('frontend_port', 'backend_port', 'osc_receive_port', 'osc_send_port'):
            if type(network[key]) is not int or not 1 <= network[key] <= 65535:
                raise ValueError(f'Invalid port: network.{key}')
        if network['frontend_port'] == network['backend_port']:
            raise ValueError('Frontend and backend ports must differ')
        for name, value in self.settings['paths'].items():
            if not isinstance(value, str) or not value:
                raise ValueError(f'paths.{name} must be a non-empty path')
        runtime, browser = self.settings['runtime'], self.settings['browser']
        for name in ('python_executable', 'node_executable', 'npm_executable'):
            if not isinstance(runtime[name], str):
                raise ValueError(f'runtime.{name} must be a path string')
        if not isinstance(browser['executable'], str):
            raise ValueError('browser.executable must be a path string')
        for section, name in (('runtime', 'watch_interval_ms'), ('runtime', 'page_timeout_seconds'), ('browser', 'width'), ('browser', 'height')):
            value = self.settings[section][name]
            if type(value) is not int or value <= 0:
                raise ValueError(f'{section}.{name} must be a positive integer')
        if type(runtime['watch_polling']) is not bool or type(browser['app_mode']) is not bool:
            raise ValueError('Polling and app_mode must be JSON booleans')

    def path(self, name):
        value = self.settings['paths'][name]
        if not isinstance(value, str) or not value:
            raise ValueError(f'paths.{name} must be a non-empty path')
        result = Path(value)
        return (result if result.is_absolute() else self.root / result).resolve()

    @property
    def network(self):
        return self.settings['network']


CONFIG = LocalConfig()
