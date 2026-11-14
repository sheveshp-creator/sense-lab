#!/usr/bin/env node
// Expression-classifier accuracy check. Give it a folder with one sub-folder of photos per expression:
//
//   photos/
//     happy/ 001.jpg ...     (also accepted: happiness, anger/angry, sadness/sad, surprise/surprised, neutral)
//     sad/   ...
//
//   node scripts/eval-expressions.mjs photos/ [--dump faces.json] [--url http://localhost:5173]
//
// It runs the app's real face pipeline (MediaPipe FaceLandmarker blendshapes) in a headless browser and
// classifies each photo with the app's own classifier, then prints a confusion matrix and per-class
// precision / recall. --dump also writes every photo's blendshape scores (numbers only) for analysis.
// Needs `npm install`, `./scripts/fetch-models.sh` and Playwright's browser (`npx playwright install chromium`).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!root) {
  console.error(
    'Usage: node scripts/eval-expressions.mjs <folder-of-expression-folders> [--dump out.json]',
  );
  process.exit(2);
}
let url = flag('url', 'http://localhost:5173');
const LABELS = ['happy', 'sad', 'angry', 'surprised', 'neutral'];
const ALIASES = {
  happy: 'happy',
  happiness: 'happy',
  sad: 'sad',
  sadness: 'sad',
  angry: 'angry',
  anger: 'angry',
  surprised: 'surprised',
  surprise: 'surprised',
  neutral: 'neutral',
};
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const dirs = readdirSync(root).filter(
  (d) => statSync(join(root, d)).isDirectory() && ALIASES[d.toLowerCase()],
);
const files = dirs.flatMap((d) =>
  readdirSync(join(root, d))
    .filter((f) => MIME[extname(f).toLowerCase()])
    .sort()
    .map((f) => ({
      label: ALIASES[d.toLowerCase()],
      path: join(root, d, f),
      mime: MIME[extname(f).toLowerCase()],
    })),
);
if (files.length === 0) {
  console.error(
    `No images found under ${resolve(root)} (expected sub-folders named like ${Object.keys(ALIASES).join(', ')})`,
  );
  process.exit(2);
}
console.log(`${files.length} photos in ${dirs.length} folders`);

const reachable = async (u) => {
  try {
    return (await fetch(u + '/eval.html')).ok;
  } catch {
    return false;
  }
};
let server = null;
if (!(await reachable(url))) {
  url = 'http://localhost:5199';
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], {
    stdio: 'ignore',
    cwd: resolve(import.meta.dirname, '..'),
  });
  for (let i = 0; i < 60 && !(await reachable(url)); i++)
    await new Promise((r) => setTimeout(r, 500));
  if (!(await reachable(url))) {
    server.kill();
    console.error('Could not start the Vite dev server.');
    process.exit(1);
  }
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}/eval.html`);
  const retry = async (fn) => {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i >= 5 || !/context was destroyed|navigation/i.test(String(err))) throw err;
        await page.waitForLoadState('load');
      }
    }
  };
  await retry(() => page.evaluate(() => window.__eval.ready));

  const rows = [];
  let noFace = 0;
  for (const f of files) {
    const b64 = readFileSync(f.path).toString('base64');
    const r = await retry(() =>
      page.evaluate(([d, m]) => window.__eval.embed(d, m), [b64, f.mime]),
    );
    if (!r.face) {
      noFace++;
      continue;
    }
    // Classify with the app's own classifier, if the eval page has one.
    const verdict = await retry(() =>
      page.evaluate((face) => window.__eval.expression?.(face) ?? null, r.face),
    );
    const eyes = await retry(() =>
      page.evaluate((face) => window.__eval.eyes?.(face) ?? null, r.face),
    );
    rows.push({ label: f.label, file: f.path.replace(root, ''), face: r.face, verdict, eyes });
  }
  console.log(`${rows.length} with a detectable face, ${noFace} without (skipped)`);

  const out = flag('dump');
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        rows.map((r) => ({
          label: r.label,
          file: r.file,
          eyes: r.eyes,
          blendshapes: r.face.slice(1434, 1486),
          pose: r.face.slice(1486),
          landmarks: r.face.slice(0, 1434).map((v) => Math.round(v * 1e5) / 1e5),
        })),
      ),
    );
    console.log(`wrote ${out}`);
  }

  if (rows.some((r) => r.verdict)) {
    const idx = Object.fromEntries(LABELS.map((l, i) => [l, i]));
    const m = LABELS.map(() => LABELS.map(() => 0));
    for (const r of rows) if (r.verdict) m[idx[r.label]][idx[r.verdict.label]]++;
    const pad = (s, n = 10) => String(s).padStart(n);
    console.log('\nrows = true expression, columns = what the classifier said\n');
    console.log(pad('', 10) + LABELS.map((l) => pad(l)).join('') + pad('recall'));
    LABELS.forEach((l, i) => {
      const tot = m[i].reduce((a, b) => a + b, 0);
      console.log(
        pad(l) +
          m[i].map((v) => pad(v)).join('') +
          pad(tot ? ((100 * m[i][i]) / tot).toFixed(1) + '%' : '-'),
      );
    });
    console.log(
      pad('precision') +
        LABELS.map((_, j) => {
          const tot = m.reduce((a, row) => a + row[j], 0);
          return pad(tot ? ((100 * m[j][j]) / tot).toFixed(1) + '%' : '-');
        }).join(''),
    );
    const total = m.flat().reduce((a, b) => a + b, 0);
    const correct = LABELS.reduce((a, _, i) => a + m[i][i], 0);
    console.log(
      `\naccuracy ${((100 * correct) / total).toFixed(1)}% over ${total} photos (chance with 5 balanced classes: 20%)`,
    );
  }
} finally {
  await browser?.close();
  server?.kill();
}
