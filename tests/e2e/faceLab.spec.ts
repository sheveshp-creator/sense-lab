import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Needs a folder of named face photos (see the README): happy surprised angry sad neutral open closed
// gazeScreenLeft gazeScreenRight gazeCentre (.jpg). They are fed to the app through a fake camera that the
// test controls frame by frame. The expression photos are CLEAR examples chosen to check the wiring and the
// anti-flicker behaviour; they say nothing about accuracy (the eval script does that).
const dir = process.env.FACE_FIXTURES;
test.skip(!dir, 'set FACE_FIXTURES to a folder of named face photos');

const NAMES = [
  'happy',
  'surprised',
  'angry',
  'sad',
  'neutral',
  'open',
  'closed',
  'gazeScreenLeft',
  'gazeScreenRight',
  'gazeCentre',
];

async function start(page: Page) {
  const images: Record<string, string> = {};
  for (const n of NAMES) images[n] = readFileSync(join(dir!, `${n}.jpg`)).toString('base64');
  await page.addInitScript((imgs) => {
    const loaded: Record<string, HTMLImageElement> = {};
    let current = 'blank';
    const w = window as unknown as Record<string, unknown>;
    w.__show = (n: string) => (current = n);
    // Timed sequence of [photo, ms] steps; resolves when finished.
    w.__sequence = (steps: [string, number][]) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const next = () => {
          if (i >= steps.length) return resolve();
          const [n, ms] = steps[i++]!;
          current = n;
          setTimeout(next, ms);
        };
        next();
      });
    navigator.mediaDevices.getUserMedia = async () => {
      for (const [k, b64] of Object.entries(imgs)) {
        const im = new Image();
        im.src = `data:image/jpeg;base64,${b64}`;
        await im.decode();
        loaded[k] = im;
      }
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d')!;
      setInterval(() => {
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(0, 0, 640, 480);
        const im = loaded[current];
        if (im) ctx.drawImage(im, 80, 0, 480, 480);
      }, 33);
      return c.captureStream(30);
    };
  }, images);

  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Face Lab' }).click();
}
const show = (page: Page, n: string) =>
  page.evaluate((x) => (window as never as { __show: (s: string) => void }).__show(x), n);
const sequence = (page: Page, steps: [string, number][]) =>
  page.evaluate(
    (s) =>
      (window as never as { __sequence: (a: [string, number][]) => Promise<void> }).__sequence(s),
    steps,
  );

test('expressions: all five show up, hold steady, and change without flicker', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  const label = page.getByTestId('expression-label');
  const read = async () => (await label.innerText()).toLowerCase();

  let prev = '';
  for (const [photo, expected] of [
    ['neutral', 'neutral'],
    ['happy', 'happy'],
    ['surprised', 'surprised'],
    ['angry', 'angry'],
    ['sad', 'sad'],
    ['neutral', 'neutral'],
  ] as const) {
    await show(page, photo); // direct swap, same face track: this is what a person changing expression looks like
    // Follow the label for a few seconds and record each distinct value in order.
    const seen: string[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 3500) {
      const l = await read().catch(() => '');
      if (l && seen.at(-1) !== l) seen.push(l);
      await page.waitForTimeout(60);
    }
    console.log(`EXPR ${prev || 'start'} -> ${photo}: label went through [${seen.join(' > ')}]`);
    expect(seen.at(-1), `${photo} should end as ${expected}`).toBe(expected);
    // No flicker: no label appears twice (e.g. happy > neutral > happy would be a flicker).
    expect(new Set(seen).size, `labels for ${photo} must not repeat: ${seen.join(',')}`).toBe(
      seen.length,
    );
    // The meter agrees with the label.
    await expect(page.getByTestId(`expr-${expected}`)).toHaveAttribute('data-active', 'true');
    prev = photo;
  }
});

test('blinks: five blinks count as five, held-shut eyes do not count, reset works', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await show(page, 'open');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('blink-count')).toHaveText('0');

  // Five quick blinks: eyes open 1.4 s, closed ~130 ms.
  const steps: [string, number][] = [];
  for (let i = 0; i < 5; i++) steps.push(['open', 1400], ['closed', 130]);
  steps.push(['open', 1000]);
  await sequence(page, steps);
  await expect(page.getByTestId('blink-count')).toHaveText('5', { timeout: 3000 });

  // Eyes held shut for 1.6 s are not a blink.
  await sequence(page, [['closed', 1600]]);
  await expect(page.getByTestId('eye-state')).toContainText('held shut');
  await sequence(page, [['open', 1200]]);
  await expect(page.getByTestId('blink-count')).toHaveText('5');

  // The charts mark the counted blinks, and the rate is not shown until 10 s of data.
  await expect(page.getByTestId('line-chart')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('blink-count')).toHaveText('0');
});

test('gaze: sideways eyes read left / right, a centred gaze reads centre', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  const label = page.getByTestId('gaze-label');
  for (const [photo, expected] of [
    ['gazeCentre', 'Looking at the centre'],
    ['gazeScreenLeft', 'Looking left'],
    ['gazeScreenRight', 'Looking right'],
    ['gazeCentre', 'Looking at the centre'],
  ] as const) {
    await show(page, photo);
    await expect(label).toHaveText(expected, { timeout: 8000 });
    // Stays put (hysteresis + smoothing): still the same two seconds later.
    await page.waitForTimeout(2000);
    await expect(label).toHaveText(expected);
    console.log(`GAZE ${photo}:`, await page.getByTestId('gaze-values').innerText());
  }
});

test('charts: crosshair tooltip, keyboard, and a table view', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await show(page, 'open');
  await page.waitForTimeout(4000);
  const chart = page.getByTestId('line-chart').first();
  await expect(chart).toBeVisible();
  await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
  // hover() scrolls the chart into view first (the charts sit below the fold of a short window).
  await chart.hover({ position: { x: 200, y: 40 } });
  await expect(page.getByTestId('chart-tooltip')).toBeVisible();
  await expect(page.getByTestId('chart-tooltip')).toContainText('s ago');
  await page.mouse.move(2, 2); // pointer leaves the chart
  await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
  // Keyboard: focus the chart and step through values.
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('chart-tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
  // Table view.
  await page.getByText('Table view').first().click();
  expect(await page.locator('details[open] table tbody tr').count()).toBeGreaterThan(5);
});

test('calibration: the 9-dot flow runs, and says so honestly when the gaze never moved', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await start(page);
  await show(page, 'gazeCentre'); // a still photo: the gaze never changes between dots
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Calibrate gaze/ }).click();
  await expect(page.getByTestId('calibration-overlay')).toBeVisible();
  await expect(page.getByTestId('calibration-dot')).toBeVisible();
  await expect(page.getByTestId('calibration-summary')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('calibration-summary')).toContainText(
    /barely changed|enough samples/,
  );
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('calibration-result')).toContainText('Calibration failed');
});

test('screenshot of the whole Face Lab (only when SHOT is set)', async ({ page }) => {
  test.skip(!process.env.SHOT, 'set SHOT=/path/file.png');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1400, height: 1500 });
  await start(page);
  await show(page, 'open');
  await page.waitForTimeout(2500);
  await sequence(page, [
    ['closed', 130],
    ['open', 1500],
    ['closed', 130],
    ['open', 1500],
    ['closed', 130],
    ['open', 800],
    ['happy', 3500],
  ]);
  await page.screenshot({ path: process.env.SHOT });
});
