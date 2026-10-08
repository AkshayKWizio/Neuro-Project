import { defineConfig } from 'vite';

export default defineConfig({
  base: '/night-relay/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
