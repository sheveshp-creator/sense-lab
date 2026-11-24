import { execFileSync } from 'node:child_process';
import { test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { call, installFakeCamera, waitModels } from './fakeCamera';

// Makes most of the README images (see the README). Only runs when DOCS_DIR and FACE_FIXTURES are set:
//   DOCS_DIR=docs FACE_FIXTURES=/folder-with-portrait.jpg CHROME=1 npx playwright test docsAuthor
const out = process.env.DOCS_DIR;
const dir = process.env.FACE_FIXTURES;
test.skip(!out || !dir, 'set DOCS_DIR and FACE_FIXTURES');
test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: 'on', size: { width: 1280, height: 800 } },
});
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${out}/screenshots/${name}.png` });

async function gif(
  page: Page,
  box: Locator,
  startSec: number,
  lengthSec: number,
  out: string,
  width: number,
) {
  const b = (await box.boundingBox())!;
  await page.close();
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
    out,
  ]);
}

test('screenshots', async ({ page }) => {
  test.setTimeout(180_000);
  await installFakeCamera(page, dir!, ['portrait']);
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await call(page, '__show', 'portrait');
  await waitModels(page);
  await page.waitForTimeout(3500);
  await shot(page, 'live-studio');
  await page.getByRole('button', { name: 'Face Lab', exact: true }).click();
  await page.waitForTimeout(1800);
  await shot(page, 'face-lab');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByTestId('demo-tab-mirror-avatar').click();
  await page.waitForTimeout(2500);
  await shot(page, 'playground-avatar');
  await page.getByTestId('demo-tab-air-draw').click();
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
    palmLen: 0.18,
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
  await stroke(
    Array.from({ length: 70 }, (_, i): [number, number] => [
      0.3 + Math.cos(i / 5) * (0.03 + i * 0.0025),
      0.42 + Math.sin(i / 5) * (0.04 + i * 0.0035),
    ]),
  );
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
});

test('GIF: Slide Remote', async ({ page }) => {
  test.setTimeout(120_000);
  const born = Date.now();
  await installFakeCamera(page, dir!, ['portrait']);
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByTestId('demo-tab-slide-remote').click();
  await page.waitForTimeout(1500);
  const panel = page
    .getByTestId('slide')
    .locator('xpath=ancestor::div[contains(@class,"overflow-hidden")]')
    .first();
  const t0 = Date.now();
  for (const [key, ms] of [
    ['ArrowRight', 1300],
    ['ArrowRight', 1300],
    ['ArrowRight', 1300],
    ['ArrowLeft', 1300],
    ['l', 1500],
  ] as const) {
    await page.keyboard.press(key);
    await page.waitForTimeout(ms);
  }
  const total = (Date.now() - t0) / 1000;
  await gif(
    page,
    panel,
    Math.max(0, (t0 - born) / 1000 - 0.4),
    total + 0.6,
    `${out}/slide-remote.gif`,
    520,
  );
});
