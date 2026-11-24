import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The built site's Content-Security-Policy (QA D-001). GitHub Pages cannot send headers, so it is a <meta>, right after
 * <meta charset>. Build only (`apply: 'build'`): the dev server injects inline scripts. Zero violations in Chromium,
 * Firefox and WebKit through boot, AI moves, save/resume, cards, fonts, About and the language switch
 * (docs/qa/r3-xbrowser.md, "CSP").
 * - 'wasm-unsafe-eval': the engine's and onnxruntime's WebAssembly (no eval otherwise).
 * - connect-src: Hugging Face and its CDN redirect (*.hf.co) for the model fallback when the self-hosted copy fails.
 *   That fetch runs in the AI worker, which no tested engine puts under the page's meta policy (a worker gets its
 *   own from its response headers); kept for the inline (no-Worker) mode and engines that let workers inherit it.
 * - worker-src 'self' (no blob:): onnxruntime runs with proxy off, one thread and same-origin wasmPaths.
 * - style-src 'self' without 'unsafe-inline': React's `style` props go through the CSSOM, which CSP does not govern.
 * - No frame-ancestors / report-uri / sandbox: a <meta> policy ignores them.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "img-src 'self' data:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'tsp-csp-meta',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (ctx.path !== '/index.html') return html; // the site's page only (not tests/ai/browser's bench page)
      const at = '<meta charset="UTF-8" />';
      if (!html.includes(at)) throw new Error('tsp-csp-meta: index.html has no <meta charset="UTF-8" />');
      return html.replace(at, `${at}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// GitHub Pages project page: https://chenao-phys.github.io/TS_playfield/
export default defineConfig({
  base: '/TS_playfield/',
  plugins: [react(), cspMeta()],
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
