import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { call, installFakeCamera, startApp, waitModels } from './fakeCamera';

// Needs FACE_FIXTURES: a folder of named photos (happy neutral open closed gazeCentre surprised victory thumb_up .jpg).
// Real-model paths (swipe, thumbs up, avatar, blinks, mood) run the actual models on photos through a fake camera.
// Air Draw and the 3D Object need a pinch and a two-hand grip, for which there is no real photo here, so those
// two are driven with simulated input through the dev hook (the demos' own logic, not the models).
const dir = process.env.FACE_FIXTURES;
test.skip(!dir, 'set FACE_FIXTURES to a folder of named face photos');

async function openDemo(page: Page, demo: string) {
  await installFakeCamera(page, dir!);
  await startApp(page, 'Playground');
  await call(page, '__show', 'happy');
  await waitModels(page);
  await page.getByTestId(`demo-tab-${demo}`).click();
}
const sim = (page: Page, parts?: unknown) =>
  page.evaluate(
    (p) =>
      (
        window as unknown as { __senselab: { simulate: (x?: unknown) => void } }
      ).__senselab.simulate(p),
    parts,
  );
const emit = (page: Page, name: string, payload: unknown) =>
  page.evaluate(
    ([n, p]) =>
      (
        window as unknown as { __senselab: { bus: { emit: (a: string, b: unknown) => void } } }
      ).__senselab.bus.emit(n as string, p),
    [name, payload] as const,
  );
const gestureEvent = (id: string, kind = 'start') => ({
  id,
  kind,
  handId: 1,
  hand: 'Right',
  confidence: 1,
  t: 0,
});
const pixels = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="air-draw-canvas"]') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });

test('How it works: readable before the camera, with a diagram and no live numbers yet', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /How it works/ }).click();
  await expect(page.getByRole('heading', { name: 'How it works', level: 1 })).toBeVisible();
  const diagram = page.getByTestId('architecture-diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram).toHaveAccessibleName('SenseLab architecture');
  await expect(page.getByText('Everything below runs inside your browser tab')).toBeVisible();
  for (const t of ['Web Worker', 'Main thread', 'Event bus + store', 'IndexedDB'])
    await expect(diagram.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByTestId('live-timings')).toHaveAttribute('data-running', 'false');
  await expect(page.getByTestId('timing-worker')).toContainText('-');
  await expect(page.getByText('No liveness check')).toBeVisible();
  await expect(page.getByText('Uneven accuracy across people')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('checkbox')).toBeVisible();
});

test('How it works inside the app shows live per-stage timings from the real stats', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installFakeCamera(page, dir!);
  await startApp(page, 'How it works');
  await call(page, '__show', 'happy');
  await waitModels(page);
  await expect(page.getByTestId('live-timings')).toHaveAttribute('data-running', 'true');
  await expect(page.getByTestId('timing-face').locator('td').last()).toHaveText(/^\d+\.\d ms$/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('timing-worker').locator('td').last()).toHaveText(
    /^[1-9]\d*\.\d ms$/,
    { timeout: 15_000 },
  );
  await expect(page.getByTestId('timing-fps').locator('td').last()).toHaveText(/^\d+\.\d fps$/);
  console.log(
    'TIMINGS',
    (await page.getByTestId('live-timings').innerText()).replace(/\s+/g, ' ').slice(0, 400),
  );
});

test('Slide Remote: keyboard, buttons, and the real swipe and thumbs-up gestures', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openDemo(page, 'slide-remote');
  const pos = page.getByTestId('slide-position');
  await expect(pos).toHaveText('Slide 1 of 5');
  // Keyboard and buttons.
  await page.keyboard.press('ArrowRight');
  await expect(pos).toHaveText('Slide 2 of 5');
  await page.keyboard.press('ArrowLeft');
  await expect(pos).toHaveText('Slide 1 of 5');
  await page.getByRole('button', { name: /Next slide/ }).click();
  await expect(pos).toHaveText('Slide 2 of 5');
  await page.getByRole('button', { name: /Previous slide/ }).click();
  await page.keyboard.press('l');
  await expect(page.getByTestId('slide-likes')).toContainText('1 on this slide');
  // Real model: a hand photo slides to the screen's left (raw frame: to the right) = swipe left = next slide.
  await call(page, '__show', 'blank');
  await call(page, '__setHand', 'victory');
  await page.evaluate(
    () =>
      (window as never as { __scene: { handX: number } }).__scene &&
      ((window as never as { __scene: { handX: number } }).__scene.handX = 40),
  );
  await page.waitForTimeout(2500);
  await call(page, '__slideHand', 40, 400, 380);
  await expect(pos).toHaveText('Slide 2 of 5', { timeout: 6000 });
  await expect(page.getByTestId('slide-toast')).toContainText('Swipe left');
  // ...and back to the right = swipe right = previous slide (after the return-stroke pause).
  await page.waitForTimeout(2000); // longer than the 800 ms pause that ignores a hand coming back
  await call(page, '__slideHand', 400, 40, 380);
  await expect(pos).toHaveText('Slide 1 of 5', { timeout: 6000 });
  await expect(page.getByTestId('slide-toast')).toContainText('Swipe right');
  // Thumbs up (a real photo of one) likes the slide.
  await call(page, '__setHand', 'thumb_up');
  await expect(page.getByTestId('slide-toast')).toContainText('Thumbs up', { timeout: 8000 });
  await expect(page.getByTestId('slide-likes')).toContainText('2 on this slide');
});

test('Mirror Avatar: copies a smile and blinks from the real face models; sliders work without a camera', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openDemo(page, 'mirror-avatar');
  const curve = async () =>
    Number(
      /Q 0 (-?[\d.]+) /.exec(
        (await page.getByTestId('avatar').locator('path').first().getAttribute('d')) ?? '',
      )?.[1],
    );
  const eyeScale = async () =>
    Number(
      /scale\(1 ([\d.]+)\)/.exec(
        (await page
          .getByTestId('avatar')
          .locator('g[transform^="translate(-27"]')
          .getAttribute('transform')) ?? '',
      )?.[1],
    );
  // Neutral face first: mouth curve near flat, eyes open.
  await call(page, '__show', 'open');
  await expect.poll(eyeScale, { timeout: 15_000 }).toBeGreaterThan(0.9);
  const flat = await curve();
  await call(page, '__show', 'happy');
  await expect.poll(curve, { timeout: 10_000 }).toBeGreaterThan(flat + 4); // the mouth curls into a smile
  console.log('AVATAR smile curve', flat, '->', await curve());
  // A photo with closed eyes: the eyes shut.
  await call(page, '__show', 'closed');
  await expect.poll(eyeScale, { timeout: 10_000 }).toBeLessThan(0.5);
  // Manual sliders (the camera-free alternative).
  await page.getByLabel('Control with sliders instead of the camera').check();
  await page.getByLabel('Smile').fill('1');
  await expect.poll(curve, { timeout: 3000 }).toBeGreaterThan(45);
  await page.getByLabel('Left eye shut').fill('1');
  await expect.poll(eyeScale, { timeout: 3000 }).toBeLessThan(0.15);
  await page.getByLabel('Turn head (left to right)').fill('30');
  await expect
    .poll(
      async () =>
        /translate\((-?[\d.]+)/.exec(
          (await page.getByTestId('avatar').locator('g').first().getAttribute('transform')) ?? '',
        )?.[1],
      { timeout: 3000 },
    )
    .toMatch(/^1[0-5]/);
});

test('Blink Battle: the first of two real faces to blink loses; keys and buttons play it too', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openDemo(page, 'blink-battle');
  // Raw frame: left half = screen RIGHT (the view is mirrored), so the raw-right face is Player 1.
  await call(page, '__showTwo', 'open', 'gazeCentre');
  const banner = page.getByTestId('battle-banner');
  await expect(banner).toContainText('Two faces found', { timeout: 20_000 });
  await page.keyboard.press(' ');
  await expect(banner).toHaveAttribute('data-phase', 'countdown');
  await expect(banner).toHaveAttribute('data-phase', 'live', { timeout: 6000 });
  await page.waitForTimeout(800);
  await call(page, '__setRight', 'closed'); // Player 1 (raw right) blinks for ~130 ms
  await page.waitForTimeout(130);
  await call(page, '__setRight', 'gazeCentre');
  await expect(banner).toHaveAttribute('data-phase', 'over', { timeout: 4000 });
  await expect(page.getByTestId('player-1')).toHaveAttribute('data-lost', 'true');
  await expect(page.getByTestId('wins-2')).toHaveText('1');
  await expect(banner).toContainText('Player 1 blinked first');
  // Keyboard-only round: N for a new round, Space to start, 2 = "Player 2 blinks".
  await page.keyboard.press('n');
  await expect(banner).toHaveAttribute('data-phase', 'waiting');
  await page.keyboard.press(' ');
  await expect(banner).toHaveAttribute('data-phase', 'live', { timeout: 6000 });
  await page.keyboard.press('2');
  await expect(banner).toHaveAttribute('data-phase', 'over', { timeout: 3000 });
  await expect(page.getByTestId('wins-1')).toHaveText('1');
  // Buttons work too.
  await page.getByRole('button', { name: /New round/ }).click();
  await page.getByRole('button', { name: /Start round/ }).click();
  await expect(banner).toHaveAttribute('data-phase', 'live', { timeout: 6000 });
  await page.getByRole('button', { name: /Player 1 blinks/ }).click();
  await expect(page.getByTestId('wins-2')).toHaveText('2', { timeout: 3000 });
});

test('Mood Meter: charts the expressions of everyone in view', async ({ page }) => {
  test.setTimeout(120_000);
  await openDemo(page, 'mood-meter');
  await call(page, '__show', 'happy');
  await expect(page.getByTestId('room-mood')).toHaveText('happy', { timeout: 20_000 });
  await expect(page.getByTestId('mood-face')).toHaveCount(1);
  await call(page, '__showTwo', 'happy', 'neutral');
  await expect(page.getByTestId('mood-face')).toHaveCount(2, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  const chart = page.getByTestId('mood-chart');
  await chart.hover({ position: { x: 380, y: 60 } });
  await expect(page.getByTestId('mood-tooltip')).toBeVisible();
  await expect(page.getByTestId('mood-tooltip')).toContainText('Happy');
  await page.mouse.move(2, 2);
  await page.keyboard.press('p');
  await expect(page.getByTestId('mood-summary')).toContainText('(paused)');
  await page.keyboard.press('p');
  await expect(page.getByTestId('mood-summary')).not.toContainText('(paused)');
  await page.getByText('Table view').click();
  expect(await page.locator('details[open] table tbody tr').count()).toBeGreaterThan(0);
});

test('Air Draw: a simulated pinch draws, a peace sign changes colour, an open palm erases; mouse and keyboard draw too', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openDemo(page, 'air-draw');
  await call(page, '__show', 'blank');
  const strokes = page.getByText(/\d+ strokes?/).first();
  const aspect = 4 / 3;
  const hand = (over: Record<string, unknown> = {}) => ({
    id: 1,
    hand: 'Right',
    gesture: null,
    palmX: 0.5 * aspect,
    palmY: 0.5,
    pinch: null,
    ...over,
  });
  const pinchAt = (x: number, y: number) => hand({ pinch: { x: x * aspect, y, dragging: false } });
  const colour = () => page.getByTestId('air-draw-colour').getAttribute('data-colour');
  // Letting go lasts several frames in real life; give the demo a few (150 ms) to see it before the next pinch.
  const release = async () => {
    await sim(page, { hands: [hand()] });
    await page.waitForTimeout(150);
  };

  const c0 = await colour();
  for (let i = 0; i <= 12; i++) {
    await sim(page, { hands: [pinchAt(0.2 + i * 0.03, 0.3 + i * 0.01)] });
    await page.waitForTimeout(40);
  }
  await release();
  await expect(strokes).toHaveText('1 stroke');
  expect(await pixels(page)).toBeGreaterThan(200);
  // Peace sign: the colour changes, and the next stroke uses it.
  await emit(page, 'gesture:peace', gestureEvent('peace'));
  await expect.poll(colour).not.toBe(c0);
  for (let i = 0; i <= 12; i++) {
    await sim(page, { hands: [pinchAt(0.2 + i * 0.03, 0.7)] });
    await page.waitForTimeout(40);
  }
  await release();
  await expect(strokes).toHaveText('2 strokes');
  // An open palm over the first stroke erases it but not the second.
  await sim(page, { hands: [hand({ gesture: 'openPalm', palmX: 0.3 * aspect, palmY: 0.33 })] });
  await expect(strokes).toHaveText('1 stroke');
  await release();
  // Keyboard: arrows move the pen, Space puts it down and lifts it.
  await sim(page); // back to the real (empty) hands
  await page.keyboard.press(' ');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft'])
    await page.keyboard.press(k);
  await page.keyboard.press(' ');
  await expect(strokes).toHaveText('2 strokes');
  // Mouse.
  const box = (await page.getByTestId('air-draw-canvas').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.up();
  await expect(strokes).toHaveText('3 strokes');
  // Buttons and keys: undo, erase all.
  await page.keyboard.press('u');
  await expect(strokes).toHaveText('2 strokes');
  await page.getByRole('button', { name: /Erase all/ }).click();
  await expect(strokes).toHaveText('0 strokes');
  expect(await pixels(page)).toBe(0);
  await page.getByRole('button', { name: /Change colour/ }).click();
  await expect.poll(colour).not.toBe(c0);
});

test('3D Object: simulated two-hand zoom and rotate, a clap resets, keys and buttons do the same', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openDemo(page, 'object-3d');
  await call(page, '__show', 'blank');
  const readout = page.getByTestId('object3d-readout');
  await expect(page.getByTestId('object3d-view').locator('canvas')).toBeVisible({
    timeout: 15_000,
  });
  await expect(readout).toContainText('Zoom 1.00x');
  await sim(page, { twoHand: { engaged: true, scale: 1.5, deg: 30 } });
  await expect(readout).toContainText('Zoom 1.50x');
  await expect(readout).toContainText('Rotation 30°');
  await expect(readout).toContainText('two palms held');
  await sim(page, { twoHand: { engaged: false, scale: 1, deg: 0 } });
  await expect(readout).toContainText('Zoom 1.50x'); // kept when the hands let go
  await emit(page, 'gesture:clap', gestureEvent('clap', 'fire'));
  await expect(readout).toContainText('Zoom 1.00x');
  await expect(readout).toContainText('Rotation 0°');
  await sim(page);
  // Keys and buttons.
  await page.keyboard.press('=');
  await expect(readout).toContainText('Zoom 1.12x');
  await page.keyboard.press('-');
  await expect(readout).toContainText('Zoom 1.00x');
  await page.keyboard.press(']');
  await expect(readout).toContainText('Rotation 350°');
  await page.getByRole('button', { name: /Rotate left/ }).click();
  await expect(readout).toContainText('Rotation 0°');
  await page.getByRole('button', { name: /Zoom in/ }).click();
  await page.getByRole('button', { name: /Zoom in/ }).click();
  await expect(readout).toContainText('Zoom 1.25x');
  await page.getByRole('button', { name: /Reset/ }).click();
  await expect(readout).toContainText('Zoom 1.00x');
});

test('every demo opens from the picker, lazily, and shows its controls', async ({ page }) => {
  test.setTimeout(90_000);
  await openDemo(page, 'air-draw');
  for (const [id, text] of [
    ['air-draw', 'Pen down / up'],
    ['slide-remote', 'Next slide'],
    ['object-3d', 'Zoom in'],
    ['mirror-avatar', 'Control with sliders'],
    ['blink-battle', 'Start round'],
    ['mood-meter', 'Pause / resume'],
  ] as const) {
    await page.getByTestId(`demo-tab-${id}`).click();
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
  }
});
