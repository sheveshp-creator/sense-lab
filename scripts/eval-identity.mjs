#!/usr/bin/env node
// Face-recognition accuracy check. Give it a folder with one sub-folder of images per person:
//
//   faces/
//     alice/ 1.jpg 2.jpg 3.jpg ...
//     bob/   1.jpg 2.jpg ...
//
//   node scripts/eval-identity.mjs faces/ [--thresholds 0.2:0.7:0.05] [--min-images 3]
//        [--enroll N] [--model fp32|int8] [--provider auto|wasm|webgpu] [--json out.json [--embeddings]] [--url http://localhost:5173]
//
// It runs the app's real pipeline (MediaPipe landmarks -> 5-point alignment -> ONNX model) in a headless
// browser, then prints false-reject and false-accept rates at each threshold using the same "person =
// mean of their embeddings" matching the app uses (leave-one-out, see src/features/face/evalMetrics.ts).
// Needs `npm install`, `./scripts/fetch-models.sh` and Playwright's browser (`npx playwright install chromium`).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { evaluate } from '../src/features/face/evalMetrics.ts';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!root) {
  console.error(
    'Usage: node scripts/eval-identity.mjs <folder-of-person-folders> [options]  (see the top of this file)',
  );
  process.exit(2);
}
const [lo, hi, step] = flag('thresholds', '0.20:0.70:0.05').split(':').map(Number);
const thresholds = [];
for (let t = lo; t <= hi + 1e-9; t += step) thresholds.push(Math.round(t * 1000) / 1000);
const minImages = Number(flag('min-images', '3'));
const enroll = Number(flag('enroll', 'Infinity'));
const model = flag('model', 'fp32');
const provider = flag('provider', 'auto');
let url = flag('url', 'http://localhost:5173');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};
const people = readdirSync(root)
  .filter((d) => statSync(join(root, d)).isDirectory())
  .sort();
const files = people.flatMap((p) =>
  readdirSync(join(root, p))
    .filter((f) => MIME[extname(f).toLowerCase()])
    .sort()
    .map((f) => ({ person: p, path: join(root, p, f), mime: MIME[extname(f).toLowerCase()] })),
);
if (files.length === 0) {
  console.error(`No images found under ${resolve(root)}`);
  process.exit(2);
}
console.log(
  `${files.length} images, ${people.length} people, model=${model}, provider=${provider}, enroll=${enroll}`,
);

async function reachable(u) {
  try {
    return (await fetch(u + '/eval.html')).ok;
  } catch {
    return false;
  }
}

// Use a running dev server if there is one, otherwise start our own on a spare port.
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
  // Prefer the installed Chrome (real GPU); fall back to Playwright's bundled Chromium.
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}/eval.html?model=${model}&provider=${provider}`);
  // Vite may reload the page once while it optimises dependencies on a cold start: retry.
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
  const status = await retry(() => page.evaluate(() => window.__eval.ready));
  if (status.state !== 'ready') {
    console.error(
      `Identity model not ready: ${status.state}: ${status.message}\nRun ./scripts/fetch-models.sh`,
    );
    process.exitCode = 1;
  } else {
    console.log(`model ${status.modelId}, ${status.dim}-d, backend ${status.provider}`);
    if (status.fallbackReason) console.log(`(WebGPU was not used: ${status.fallbackReason})`);
    const samples = [];
    const rows = [];
    let noFace = 0;
    let times = [];
    for (const f of files) {
      const b64 = readFileSync(f.path).toString('base64');
      const r = await retry(() =>
        page.evaluate(([d, m]) => window.__eval.embed(d, m), [b64, f.mime]),
      );
      // Embeddings are only written when asked for (--embeddings): they are numbers, not images.
      rows.push({
        person: f.person,
        file: f.path,
        ...r,
        embedding: args.includes('--embeddings') ? r.embedding : undefined,
      });
      if (!r.embedding) {
        noFace++;
        continue;
      }
      times.push(r.ms);
      samples.push({ person: f.person, embedding: Float32Array.from(r.embedding) });
    }
    times = times.sort((a, b) => a - b);
    console.log(
      `${samples.length} embedded, ${noFace} without a detectable face (skipped). Embedding time median ${times[Math.floor(times.length / 2)]?.toFixed(0)} ms (incl. face detection).`,
    );

    const { results, genuineScores, impostorScores } = evaluate(
      samples,
      thresholds,
      minImages,
      enroll,
    );
    const pct = (x) => (100 * x).toFixed(2).padStart(6) + '%';
    console.log(
      `\nSame-person comparisons: ${results[0]?.genuine}, different-person comparisons: ${results[0]?.impostor}`,
    );
    console.log('\nthreshold   false reject   false accept');
    for (const r of results)
      console.log(
        `  ${r.threshold.toFixed(2)}       ${pct(r.falseRejectRate)}      ${pct(r.falseAcceptRate)}`,
      );
    const sorted = (a) => [...a].sort((x, y) => x - y);
    const pctl = (a, p) =>
      a.length
        ? sorted(a)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))].toFixed(3)
        : 'n/a';
    const min = (a) => (a.length ? Math.min(...a).toFixed(3) : 'n/a');
    const max = (a) => (a.length ? Math.max(...a).toFixed(3) : 'n/a');
    const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : 'n/a');
    console.log(
      `same person scores:      min ${min(genuineScores)}, 5th percentile ${pctl(genuineScores, 5)}, median ${pctl(genuineScores, 50)}`,
    );
    console.log(
      `different person scores: median ${pctl(impostorScores, 50)}, 99th percentile ${pctl(impostorScores, 99)}, max ${max(impostorScores)}`,
    );
    console.log(
      `\nmean score: same person ${mean(genuineScores)}, different person ${mean(impostorScores)}`,
    );
    if (genuineScores.length === 0)
      console.log(`No person has ${minImages}+ usable images, so nothing could be measured.`);
    else if (impostorScores.length === 0)
      console.log('Only one person: add more person folders to measure false accepts.');
    else {
      const zeroFar = results.find((r) => r.falseAcceptRate === 0);
      const eer = results.reduce((b, r) =>
        Math.abs(r.falseRejectRate - r.falseAcceptRate) <
        Math.abs(b.falseRejectRate - b.falseAcceptRate)
          ? r
          : b,
      );
      if (zeroFar)
        console.log(
          `lowest threshold with no false accepts: ${zeroFar.threshold.toFixed(2)} (false reject ${pct(zeroFar.falseRejectRate).trim()})`,
        );
      console.log(
        `closest to equal error: ${eer.threshold.toFixed(2)} (reject ${pct(eer.falseRejectRate).trim()}, accept ${pct(eer.falseAcceptRate).trim()})`,
      );
    }
    console.log(
      'Small folders give coarse rates: with N comparisons one error moves a rate by 1/N.',
    );
    const out = flag('json');
    if (out)
      writeFileSync(out, JSON.stringify({ model, provider, status, results, rows }, null, 1));
  }
} finally {
  await browser?.close();
  server?.kill();
}
