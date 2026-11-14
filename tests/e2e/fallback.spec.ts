import { expect, test } from '@playwright/test';
import { call, installFakeCamera, startApp, waitModels } from './fakeCamera';

// The main-thread path (what a browser without module workers would use) must really work: force it with
// ?thread=main in Chrome and check a face is found. Needs FACE_FIXTURES with portrait.jpg.
const dir = process.env.FACE_FIXTURES;
test.skip(!dir, 'set FACE_FIXTURES to a folder with portrait.jpg');

test('?thread=main runs the models on the page and still tracks a face', async ({ page }) => {
  test.setTimeout(90_000);
  await installFakeCamera(page, dir!, ['portrait']);
  await page.goto('/?thread=main');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await call(page, '__show', 'portrait');
  await waitModels(page);
  await expect(page.getByLabel('Performance stats')).toContainText('main thread');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as never as {
                __senselab: { frameStore: { getState: () => { faces: unknown[] } } };
              }
            ).__senselab.frameStore.getState().faces.length,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByLabel('Performance stats')).toContainText(/Web Worker|main thread/);
});

test('the worker path says so in the stats panel', async ({ page }) => {
  await installFakeCamera(page, dir!, ['portrait']);
  await startApp(page, 'Live Studio');
  await waitModels(page);
  await expect(page.getByLabel('Performance stats')).toContainText('Web Worker');
});

test('?capture=canvas (the route for Safari versions without createImageBitmap(video)) tracks a face', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installFakeCamera(page, dir!, ['portrait']);
  await page.goto('/?capture=canvas');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await call(page, '__show', 'portrait');
  await waitModels(page);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as never as {
                __senselab: { frameStore: { getState: () => { faces: unknown[] } } };
              }
            ).__senselab.frameStore.getState().faces.length,
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});
