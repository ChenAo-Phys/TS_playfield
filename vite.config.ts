import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project page: https://chenao-phys.github.io/TS_playfield/
export default defineConfig({
  base: '/TS_playfield/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: { vendor: ['react', 'react-dom', 'i18next'] } } },
  },
  // TSP_NO_HMR=1: no hot reload / file watching, so long QA play-throughs are not reloaded by other agents' edits.
  server: { port: 5173, ...(process.env.TSP_NO_HMR ? { hmr: false, watch: null } : {}) },
  // Several dev servers may run at once (one per workstream): each sets TSP_VITE_CACHE to its own dir.
  cacheDir: process.env.TSP_VITE_CACHE ?? 'node_modules/.vite',
});
