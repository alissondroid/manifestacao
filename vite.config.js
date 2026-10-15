import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5180,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/api': { target: 'http://localhost:8787', xfwd: true },
      '/pagar': { target: 'http://localhost:8787', xfwd: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
