import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export function readNeuroConfig() {
  const projectRoot = process.env.NEURO_PROJECT_ROOT || resolve(process.cwd(), '..');
  const configFile = process.env.NEURO_CONFIG_FILE || resolve(projectRoot, 'neuro.local.json');
  const defaults = JSON.parse(readFileSync(resolve(projectRoot, 'neuro.config.example.json'), 'utf8').replace(/^\uFEFF/, ''));
  const overrides = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')) : {};
  for (const [section, values] of Object.entries(overrides)) {
    if (!(section in defaults)) throw new Error(`Unknown config section: ${section}`);
    if (section === 'schema_version') {
      if (values !== 1) throw new Error('Unsupported config schema_version');
    } else {
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`Invalid config section: ${section}`);
      for (const [key, value] of Object.entries(values)) {
        if (!(key in defaults[section])) throw new Error(`Unknown config setting: ${section}.${key}`);
        defaults[section][key] = value;
      }
    }
  }
  const network = defaults.network as { host: string; frontend_port: number; backend_port: number; osc_receive_host: string; osc_receive_port: number; osc_send_host: string; osc_send_port: number };
  for (const key of ['host', 'osc_receive_host', 'osc_send_host'] as const) {
    if (network[key] !== '127.0.0.1') throw new Error(`network.${key} must stay 127.0.0.1 for this local-only app`);
  }
  for (const key of ['frontend_port', 'backend_port', 'osc_receive_port', 'osc_send_port'] as const) {
    if (!Number.isInteger(network[key]) || network[key] < 1 || network[key] > 65535) throw new Error(`Invalid port: network.${key}`);
  }
  if (network.frontend_port === network.backend_port) throw new Error('Frontend and backend ports must differ');
  for (const [name, value] of Object.entries(defaults.paths)) {
    if (typeof value !== 'string' || !value) throw new Error(`paths.${name} must be a non-empty path`);
  }
  for (const name of ['python_executable', 'node_executable', 'npm_executable']) {
    if (typeof defaults.runtime[name] !== 'string') throw new Error(`runtime.${name} must be a path string`);
  }
  if (typeof defaults.browser.executable !== 'string') throw new Error('browser.executable must be a path string');
  for (const [section, name] of [['runtime', 'watch_interval_ms'], ['runtime', 'page_timeout_seconds'], ['browser', 'width'], ['browser', 'height']]) {
    if (!Number.isInteger(defaults[section][name]) || defaults[section][name] <= 0) throw new Error(`${section}.${name} must be a positive integer`);
  }
  if (typeof defaults.runtime.watch_polling !== 'boolean' || typeof defaults.browser.app_mode !== 'boolean') throw new Error('Polling and app_mode must be JSON booleans');
  return {
    network,
    runtime: defaults.runtime as { watch_polling: boolean; watch_interval_ms: number },
    frontendUrl: `http://${network.host}:${network.frontend_port}`,
    configFile,
    root: dirname(configFile),
    paths: Object.fromEntries(Object.entries(defaults.paths).map(([name, value]) => [name, resolve(dirname(configFile), value as string)])),
  };
}
