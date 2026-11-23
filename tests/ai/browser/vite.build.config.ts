/**
 * Dev-only: build the AI bench page (tests/ai/browser/index.html) with the site's own Vite config, to a
 * temporary outDir, to check that a production build emits the AI worker and onnxruntime's wasm under
 * the base path. Never used by the site's build.
 *
 *   npx vite build   --config tests/ai/browser/vite.build.config.ts --outDir /tmp/ai-dist --emptyOutDir
 *   npx vite preview --config tests/ai/browser/vite.build.config.ts --outDir /tmp/ai-dist --port 5182
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import site from "../../../vite.config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default mergeConfig(site, defineConfig({
  root,
  build: { rollupOptions: { input: { aibench: path.join(root, "tests/ai/browser/index.html") } } },
}));
