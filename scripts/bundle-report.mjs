// Bundle report for the production build. Run:  ANALYZE=1 npm run build && node scripts/bundle-report.mjs
// Reads dist/ (and bundle-stats.json when present). Sizes are bytes as served: raw and gzip.
// "First load" = what index.html pulls in before anything runs (scripts, modulepreloads, stylesheets).
// Models and WASM runtimes (dist/models) are listed separately and are not part of the first load.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'dist';
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const read = (f) => readFileSync(join(dist, f));
const size = (f) => ({ raw: read(f).length, gz: gzipSync(read(f)).length });

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const first = new Set(
  [...html.matchAll(/(?:src|href)="\/?((?:assets)\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
);

const assets = readdirSync(join(dist, 'assets')).map((f) => `assets/${f}`);
const rows = assets.map((f) => ({
  file: f,
  ...size(f),
  kind: first.has(f) ? 'first load' : /worker/i.test(f) ? 'worker' : 'lazy',
}));
rows.sort((a, b) => b.raw - a.raw);

console.log('\nChunks (largest first)');
for (const r of rows)
  console.log(
    `${r.kind.padEnd(11)} ${kb(r.raw).padStart(10)} ${kb(r.gz).padStart(10)} gz  ${r.file}`,
  );

const total = (kind) => {
  const sel = rows.filter((r) => r.kind === kind);
  return { raw: sel.reduce((a, r) => a + r.raw, 0), gz: sel.reduce((a, r) => a + r.gz, 0) };
};
const htmlSize = { raw: Buffer.byteLength(html), gz: gzipSync(html).length };
const f = total('first load');
console.log('\nFirst load (index.html + its scripts and styles, nothing else)');
console.log(
  `  JS+CSS ${kb(f.raw)} raw, ${kb(f.gz)} gzip  (+ index.html ${kb(htmlSize.raw)}, ${kb(htmlSize.gz)} gzip)`,
);
const w = total('worker');
console.log(
  `Worker bundle (MediaPipe + ONNX runtime glue, loaded when the camera starts): ${kb(w.raw)} raw, ${kb(w.gz)} gzip`,
);
const l = total('lazy');
console.log(`Lazy chunks (pages and demos, loaded on demand): ${kb(l.raw)} raw, ${kb(l.gz)} gzip`);

// Models and runtimes are copied from public/: report, not part of the JS budget.
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );
if (existsSync(join(dist, 'models'))) {
  console.log(
    '\nModels and runtimes (public/models, fetched on demand, cached by the service worker)',
  );
  for (const file of walk(join(dist, 'models')).sort())
    if (!file.endsWith('.md') && !file.includes('LICENSE'))
      console.log(`  ${kb(statSync(file).size).padStart(11)}  ${relative(dist, file)}`);
}

// What is inside the first-load JS, by package (needs ANALYZE=1 at build time).
if (existsSync('bundle-stats.json')) {
  const stats = JSON.parse(readFileSync('bundle-stats.json', 'utf8'));
  const by = {};
  for (const [chunk, mods] of Object.entries(stats)) {
    if (!first.has(chunk)) continue;
    for (const [id, len] of Object.entries(mods)) {
      const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
      const key = m
        ? m[1]
        : id.includes('/src/')
          ? 'src/' + (id.split('/src/')[1] ?? '').split('/')[0]
          : 'other';
      by[key] = (by[key] ?? 0) + len;
    }
  }
  console.log('\nFirst-load JS by source (rendered size before gzip)');
  for (const [k, v] of Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14))
    console.log(`  ${kb(v).padStart(10)}  ${k}`);
}
