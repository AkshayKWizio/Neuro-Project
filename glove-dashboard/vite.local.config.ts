import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, normalizePath } from 'vite';
import { readNeuroConfig } from '../neuro-config';

const settings = readNeuroConfig();
const backendUrl = `http://${settings.network.host}:${settings.network.backend_port}`;
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [vinext()],
  server: {
    host: settings.network.host, port: settings.network.frontend_port, strictPort: true,
    // Mapped drives can reject native file watching with EBUSY.
    watch: {
      usePolling: settings.runtime.watch_polling, interval: settings.runtime.watch_interval_ms,
      ignored: [
        '**/backend/**', '**/.logs/**', '**/desktop_bundle/**',
        normalizePath(settings.paths.logs) + '/**',
        normalizePath(settings.paths.venv) + '/**',
        normalizePath(settings.paths.data) + '/**',
      ],
    },
    proxy: {
      '/api': { target: backendUrl, changeOrigin: true },
      '/ws': { target: backendUrl.replace('http:', 'ws:'), ws: true },
      '/games/lib': {
        target: backendUrl, changeOrigin: true,
        rewrite: path => path.replace(/^\/games\/lib/, '/api/game-library'),
      },
    },
  },
});
