import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Friendly handling of everything that can go wrong. Dev server (uses the __senselab hook).

const start = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
};

const rejectCamera = (page: Page, name: string) =>
  page.addInitScript((n) => {
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('blocked for the test', n)),
      configurable: true,
      writable: true,
    });
  }, name);

test('camera denied: says so, offers Retry, never shows a raw error', async ({ page }) => {
  await rejectCamera(page, 'NotAllowedError');
  await start(page);
  await expect(page.getByRole('alert')).toContainText('Camera permission was denied');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('no camera: says so', async ({ page }) => {
  await rejectCamera(page, 'NotFoundError');
  await start(page);
  await expect(page.getByRole('alert')).toContainText('No camera was found');
});

test('camera lost mid-session: the stream stops, the message appears, Retry brings it back', async ({
  page,
}) => {
  await start(page);
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  // A real unplug ends the track and fires 'ended'; stop() would not fire it, so dispatch it.
  await page.evaluate(() => {
    const v = document.querySelector('video')!;
    (v.srcObject as MediaStream).getVideoTracks()[0]!.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByRole('alert')).toContainText('The camera stopped');
  const live = await page.evaluate(() => !!(document.querySelector('video')!.srcObject as unknown));
  expect(live, 'the dead stream is released').toBe(false);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => !!document.querySelector('video')!.srcObject))
    .toBe(true);
});

test('a model that fails to load: friendly message, the rest keeps working, Retry recovers', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route('**/models/hand_landmarker.task', (r) => r.abort());
  await start(page);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Could not load hand tracking.', { timeout: 30_000 });
  await expect(alert).toContainText('Face tracking still works');
  // Face tracking really did load and run in the meantime.
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible();
  const state = () =>
    page.evaluate(() => {
      const hook = (
        window as never as {
          __senselab: {
            liveStore: { getState: () => { modelLoad: Record<string, { state: string }> } };
          };
        }
      ).__senselab;
      const m = hook.liveStore.getState().modelLoad;
      return { face: m.face!.state, hand: m.hand!.state };
    });
  expect(await state()).toEqual({ face: 'ready', hand: 'error' });

  await page.unroute('**/models/hand_landmarker.task');
  await page.getByRole('button', { name: 'Retry hand tracking' }).click();
  await expect.poll(state, { timeout: 30_000 }).toEqual({ face: 'ready', hand: 'ready' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('hidden tab: all processing stops, and resumes from a clean state', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  const results = () =>
    page.evaluate(
      () =>
        (
          window as never as { __senselab: { frameStore: { getState: () => { t: number } } } }
        ).__senselab.frameStore.getState().t,
    );
  await page.waitForTimeout(1500);
  const before = await results();
  expect(before, 'results were arriving').toBeGreaterThan(0);

  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await page.waitForTimeout(500); // let any in-flight frame land
  const frozen = await results();
  await page.waitForTimeout(2000);
  expect(await results(), 'no new results while hidden').toBe(frozen);

  await setHidden(false);
  await expect.poll(results, { timeout: 10_000 }).toBeGreaterThan(frozen);
});
