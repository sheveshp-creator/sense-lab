import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { call, installFakeCamera, startApp, waitModels } from './fakeCamera';

// Makes the screenshots and GIFs in docs/ (only when DOCS_DIR is set). Run:
//   DOCS_DIR=docs FACE_FIXTURES=/path/to/photos CHROME=1 npx playwright test docs
// Photos needed: portrait (a public-domain official portrait), victory (MediaPipe's sample hand photo), and for the
// avatar GIF happy / surprised / neutral / closed (their faces never appear in the GIF: it is cropped to the cartoon).
const out = process.env.DOCS_DIR;
const dir = process.env.FACE_FIXTURES;
test.skip(!out || !dir, 'set DOCS_DIR and FACE_FIXTURES');
test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: 'on', size: { width: 1280, height: 800 } },
});

const NAMES = [
  'portrait',
  'victory',
  'thumb_up',
  'happy',
  'neutral',
  'surprised',
  'closed',
  'open',
];
const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(out!, 'screenshots', `${name}.png`) });

/** Crops the recorded video to an element's box and turns the given time range into a small GIF. */
async function gif(
  page: Page,
  box: Locator,
  startSec: number,
  lengthSec: number,
  name: string,
  width = 560,
) {
  const b = (await box.boundingBox())!;
  await page.close(); // finishes the video file
  const video = await page.video()!.path();
  const even = (n: number) => Math.floor(n / 2) * 2;
  const vf = `crop=${even(b.width)}:${even(b.height)}:${even(b.x)}:${even(b.y)},fps=10,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(startSec),
    '-t',
    String(lengthSec),
    '-i',
    video,
    '-vf',
    vf,
    '-loop',
    '0',
    join(out!, name),
  ]);
}

test('screenshots of every page', async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(join(out!, 'screenshots'), { recursive: true });
  await installFakeCamera(page, dir!, NAMES);
  await page.goto('/');
  await page.waitForTimeout(600); // let the fade-in finish
  await shot(page, 'welcome');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await call(page, '__show', 'portrait');
  await call(page, '__setHand', 'victory');
  await page.evaluate(
    () => ((window as never as { __scene: { handX: number; handY: number } }).__scene.handX = 400),
  );
  await waitModels(page);
  await page.waitForTimeout(3500);
  await shot(page, 'live-studio');
  await page.getByRole('button', { name: 'Face Lab', exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'face-lab');
  await page.getByRole('button', { name: 'Hand Lab', exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'hand-lab');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByTestId('demo-tab-mirror-avatar').click();
  await call(page, '__setHand', '');
  await call(page, '__show', 'portrait');
  await page.waitForTimeout(2500);
  await shot(page, 'playground-avatar');
  // Air Draw with simulated pinch input (there is no pinch photo): a spiral and a wave.
  await page.getByTestId('demo-tab-air-draw').click();
  await call(page, '__show', 'portrait');
  const sim = (p?: unknown) =>
    page.evaluate(
      (x) =>
        (
          window as never as { __senselab: { simulate: (a?: unknown) => void } }
        ).__senselab.simulate(x),
      p,
    );
  const hand = (x: number, y: number, pinch: boolean) => ({
    id: 1,
    hand: 'Right',
    gesture: null,
    palmX: x * (4 / 3),
    palmY: y,
    pinch: pinch ? { x: x * (4 / 3), y, dragging: true } : null,
  });
  const bus = (n: string) =>
    page.evaluate(
      (id) =>
        (
          window as never as { __senselab: { bus: { emit: (a: string, b: unknown) => void } } }
        ).__senselab.bus.emit(`gesture:${id}`, {
          id,
          kind: 'start',
          handId: 1,
          hand: 'Right',
          confidence: 1,
          t: 0,
        }),
      n,
    );
  const stroke = async (pts: [number, number][]) => {
    for (const [x, y] of pts) {
      await sim({ hands: [hand(x, y, true)] });
      await page.waitForTimeout(25);
    }
    await sim({ hands: [hand(0.5, 0.5, false)] });
    await page.waitForTimeout(150);
  };
  const spiral = Array.from({ length: 70 }, (_, i): [number, number] => [
    0.3 + Math.cos(i / 5) * (0.03 + i * 0.0025),
    0.42 + Math.sin(i / 5) * (0.04 + i * 0.0035),
  ]);
  await stroke(spiral);
  await bus('peace');
  await stroke(
    Array.from({ length: 50 }, (_, i): [number, number] => [
      0.52 + i * 0.008,
      0.62 + Math.sin(i / 4) * 0.1,
    ]),
  );
  await bus('peace');
  await stroke(
    Array.from({ length: 40 }, (_, i): [number, number] => [
      0.55 + Math.cos(i / 6.4) * 0.12,
      0.3 + Math.sin(i / 6.4) * 0.12,
    ]),
  );
  await page.waitForTimeout(300);
  await shot(page, 'playground-air-draw');
  await sim();
  await page.getByTestId('demo-tab-object-3d').click();
  await page.waitForTimeout(800);
  await sim({ twoHand: { engaged: true, scale: 1.6, deg: 40 } });
  await page.waitForTimeout(1200);
  await shot(page, 'playground-3d');
  await sim();
  await page.getByTestId('demo-tab-mood-meter').click();
  await call(page, '__show', 'portrait');
  await page.waitForTimeout(16_000);
  await shot(page, 'playground-mood');
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await call(page, '__show', 'portrait');
  await page.waitForTimeout(3500);
  await shot(page, 'how-it-works');
});

test('GIF: Slide Remote driven by a real swipe', async ({ page }) => {
  test.setTimeout(120_000);
  const born = Date.now(); // the video starts when the page is created, about now
  mkdirSync(out!, { recursive: true });
  await installFakeCamera(page, dir!, NAMES);
  await startApp(page, 'Playground');
  await call(page, '__show', 'blank');
  await waitModels(page);
  await page.getByTestId('demo-tab-slide-remote').click();
  await call(page, '__setHand', 'victory');
  await page.evaluate(
    () => ((window as never as { __scene: { handX: number } }).__scene.handX = 40),
  );
  await page.waitForTimeout(2200);
  const panel = page
    .getByTestId('slide')
    .locator('xpath=ancestor::div[contains(@class,"overflow-hidden")]')
    .first();
  const t0 = Date.now();
  await call(page, '__slideHand', 40, 400, 380);
  await page.waitForTimeout(1900);
  await call(page, '__slideHand', 400, 40, 380);
  await page.waitForTimeout(1500);
  await call(page, '__setHand', 'thumb_up');
  await page.waitForTimeout(2200);
  const total = (Date.now() - t0) / 1000;
  await gif(
    page,
    panel,
    Math.max(0, (t0 - born) / 1000 - 0.5),
    total + 0.8,
    'slide-remote.gif',
    520,
  );
});

test('GIF: Mirror Avatar copying expressions from the camera', async ({ page }) => {
  test.setTimeout(120_000);
  const born = Date.now();
  mkdirSync(out!, { recursive: true });
  await installFakeCamera(page, dir!, NAMES);
  await startApp(page, 'Playground');
  await call(page, '__show', 'neutral');
  await waitModels(page);
  await page.getByTestId('demo-tab-mirror-avatar').click();
  await page.waitForTimeout(2500);
  const avatar = page.getByTestId('avatar');
  const t0 = Date.now();
  for (const [photo, ms] of [
    ['neutral', 1200],
    ['happy', 1800],
    ['surprised', 1800],
    ['closed', 700],
    ['open', 900],
    ['happy', 1500],
  ] as const) {
    await call(page, '__show', photo);
    await page.waitForTimeout(ms);
  }
  const total = (Date.now() - t0) / 1000;
  await gif(
    page,
    avatar,
    Math.max(0, (t0 - born) / 1000 - 0.3),
    total + 0.6,
    'mirror-avatar.gif',
    420,
  );
});
