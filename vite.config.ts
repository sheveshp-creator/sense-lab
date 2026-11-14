/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Writes the list of built files into dist/sw.js so the service worker can precache the app shell.
 * File names carry a content hash, so the build id (a hash of the names) changes exactly when the app does.
 */
function serviceWorkerManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'senselab-sw-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
        );
      const files = walk(join(outDir, 'assets'))
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .sort();
      const id = createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 12);
      const path = join(outDir, 'sw.js');
      const sw = readFileSync(path, 'utf8')
        .replace("'__BUILD_ID__'", JSON.stringify(id))
        .replace("'__PRECACHE__'", JSON.stringify(files));
      writeFileSync(path, sw);
    },
  };
}

/**
 * The site-wide headers from vercel.json (the single source of truth for deployment), so `vite preview` and
 * the end-to-end tests run under the same Content-Security-Policy etc. as production.
 */
function deployHeaders(): Record<string, string> {
  try {
    const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const all = cfg.headers.find((h) => h.source === '/(.*)');
    return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
  } catch {
    return {};
  }
}

/**
 * onnxruntime-web's JS refers to its .wasm files with `new URL(..., import.meta.url)`, so Vite emits copies
 * into assets/ (42 MB). They are never fetched: we set `ort.env.wasm.wasmPaths` to our own /models/ort/ copies.
 * Left in, they would bloat the deploy and the service worker would precache them.
 */
function dropUnusedOrtWasm(): Plugin {
  return {
    name: 'senselab-drop-unused-ort-wasm',
    apply: 'build',
    enforce: 'post',
    generateBundle(_o, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/(^|\/)ort-wasm[^/]*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

/**
 * ANALYZE=1 npm run build writes bundle-stats.json: every chunk with the size each module contributes,
 * for scripts/bundle-report.mjs. Off by default so a normal build does not write extra files.
 */
function bundleStats(): Plugin {
  return {
    name: 'senselab-bundle-stats',
    apply: 'build',
    generateBundle(_o, bundle) {
      const out: Record<string, Record<string, number>> = {};
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        out[name] = Object.fromEntries(
          Object.entries(chunk.modules).map(([id, m]) => [id, m.renderedLength]),
        );
      }
      writeFileSync('bundle-stats.json', JSON.stringify(out));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dropUnusedOrtWasm(),
    serviceWorkerManifest(),
    ...(process.env.ANALYZE ? [bundleStats()] : []),
  ],
  // ngrok URLs change per session, so allow any *.ngrok-free.app / *.ngrok.app subdomain
  // (leading dot = domain and all subdomains). Dev server only; not used in production builds.
  server: { allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'] },
  preview: {
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    headers: deployHeaders(),
  },
  // Pre-bundle onnxruntime-web up front. Otherwise Vite discovers it the first time the worker loads
  // the identity model and reloads the whole page in the middle of a session.
  optimizeDeps: { include: ['onnxruntime-web/wasm', 'onnxruntime-web/webgpu'] },
  // Module workers: Vite bundles them as ES modules. Phase 1 must verify MediaPipe works in one.
  worker: { format: 'es', plugins: () => [dropUnusedOrtWasm()] },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
});
