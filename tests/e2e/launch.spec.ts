import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// How long from "Start camera" to the first face box, on the production build, first visit vs a later visit
// (models served from the service-worker cache). Production preview only:
//   npm run build && npm run preview -- --port 4173   then   PORT=4173 npx playwright test launch
// THROTTLE_MBPS=20 sends everything through a local proxy that limits each response to that speed and adds
// 30 ms latency, so the first visit is not just a local disk read. (A proxy, because browser-level throttling
// does not reach workers or the service worker. Each connection gets the full speed, so it is optimistic when
// files download in parallel; the server here sends files uncompressed, a real host compresses the WASM.)
// DWELL_MS=5000 simulates reading the page for 5 s after ticking the box before pressing Start.
// The numbers are printed; the assertions are loose floors for the later visit only.
test.skip(process.env.PORT !== '4173', 'needs the production preview: set PORT=4173');
const clip = fileURLToPath(new URL('../fixtures/clip-face.mjpeg', import.meta.url));
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${clip}`,
    ],
  },
});

/** Forwards to `target`, delaying the first byte by `latencyMs` and limiting the body to `mbps`. */
function throttledProxy(target: number, mbps: number, latencyMs: number): Promise<Server> {
  const bytesPerMs = (mbps * 1_000_000) / 8 / 1000;
  const server = createServer((req, res) => {
    const up = request(
      { host: 'localhost', port: target, path: req.url, method: req.method, headers: req.headers },
      (r) => {
        setTimeout(() => {
          res.writeHead(r.statusCode ?? 200, r.headers);
          // Send in small slices, each followed by the wait its size costs at this speed.
          void (async () => {
            for await (const chunk of r as AsyncIterable<Buffer>) {
              for (let o = 0; o < chunk.length; o += 16_384) {
                const slice = chunk.subarray(o, o + 16_384);
                if (!res.write(slice)) await new Promise((ok) => res.once('drain', ok));
                await new Promise((ok) => setTimeout(ok, slice.length / bytesPerMs));
              }
            }
            res.end();
          })().catch(() => res.destroy());
        }, latencyMs);
      },
    );
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  return new Promise((ok) => server.listen(4174, () => ok(server)));
}

const drawn = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c || c.width === 0) return 0;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i]! > 0) n++;
    return n;
  });

async function timeToFirstBox(page: Page): Promise<number> {
  const T = Date.now();
  if (process.env.TIMELINE) {
    const t = (u: string) => new URL(u).pathname.replace('/models/', '');
    page.on('request', (r) => {
      if (/models|assets\/(inference|engine|StudioPage)/.test(r.url()))
        console.log(`TL +${Date.now() - T} start ${t(r.url())}`);
    });
    page.on('requestfinished', (r) => {
      if (/models|assets\/(inference|engine|StudioPage)/.test(r.url()))
        console.log(`TL +${Date.now() - T} done  ${t(r.url())}`);
    });
  }
  if (process.env.TIMELINE) console.log(`TL +${Date.now() - T} tick checkbox`);
  await page.getByRole('checkbox').check();
  // DWELL_MS: how long the person reads the consent text before pressing Start (the prefetch runs meanwhile).
  await page.waitForTimeout(Number(process.env.DWELL_MS ?? 0));
  const t0 = Date.now();
  if (process.env.TIMELINE) console.log(`TL +${t0 - T} click Start`);
  await page.getByRole('button', { name: 'Start camera' }).click();
  while (Date.now() - t0 < 120_000) {
    if ((await drawn(page)) > 0) return Date.now() - t0;
    await page.waitForTimeout(25);
  }
  throw new Error('no face box within 120 s');
}

test('first visit vs later visit: time to the first face box', async ({ page }) => {
  test.setTimeout(240_000);
  const mbps = Number(process.env.THROTTLE_MBPS ?? 0);
  const proxy = mbps > 0 ? await throttledProxy(4173, mbps, 30) : null;
  try {
    await page.goto(proxy ? 'http://localhost:4174/' : '/');
    const first = await timeToFirstBox(page);

    // Wait until the models are in the cache, then reload: the later visit.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(
        () =>
          page.evaluate(
            async () => (await (await caches.open('senselab-models-v1')).keys()).length,
          ),
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(3000); // let the hand model finish caching too
    await page.reload();
    const later = await timeToFirstBox(page);

    console.log(
      `LAUNCH network=${mbps > 0 ? `${mbps} Mbit/s + 30 ms` : 'unthrottled localhost'} dwell=${process.env.DWELL_MS ?? 0} ms  first visit ${first} ms  later visit ${later} ms`,
    );
    expect(later, 'a later visit is not slower than the first').toBeLessThanOrEqual(first + 500);
  } finally {
    proxy?.close();
  }
});
