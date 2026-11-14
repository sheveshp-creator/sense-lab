import { expect, test } from '@playwright/test';
import { call, installFakeCamera } from './fakeCamera';

// Runs the app in Playwright's WebKit build (same engine family as Safari, but not Safari: no iOS, no
// Safari-specific policies). Reports which path it takes and whether a face is found.
//   WEBKIT=1 FACE_FIXTURES=/path/to/photos npx playwright test webkit
const dir = process.env.FACE_FIXTURES;
test.skip(!process.env.WEBKIT || !dir, 'set WEBKIT=1 and FACE_FIXTURES');
test.use({ browserName: 'webkit', launchOptions: {}, permissions: [] });

test('WebKit: the app starts, picks a path, and tracks a face', async ({ page }) => {
  test.setTimeout(120_000);
  const log: string[] = [];
  page.on('console', (m) => log.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message.slice(0, 200)}`));
  await installFakeCamera(page, dir!, ['portrait', 'victory']);
  await page.goto('/');
  const notes = await page.getByLabel('About this browser').allInnerTexts();
  console.log('WEBKIT notes:', JSON.stringify(notes));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await call(page, '__show', 'portrait');
  await call(page, '__setHand', 'victory');
  const stats = page.getByLabel('Performance stats');
  const modelState = () =>
    page.evaluate(() =>
      JSON.stringify(
        (
          window as never as {
            __senselab: { liveStore: { getState: () => { modelLoad: unknown; thread: unknown } } };
          }
        ).__senselab.liveStore.getState(),
      ),
    );
  try {
    await expect(stats.getByText(/^(GPU|CPU)$/)).toBeVisible({ timeout: 60_000 });
  } catch (e) {
    console.log(
      'WEBKIT page text:',
      (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | '),
    );
    console.log(
      'WEBKIT api:',
      await page.evaluate(() =>
        JSON.stringify({
          md: !!navigator.mediaDevices,
          gum: typeof navigator.mediaDevices?.getUserMedia,
          cap: typeof HTMLCanvasElement.prototype.captureStream,
        }),
      ),
    );
    console.log(
      'WEBKIT init:',
      await page.evaluate(() =>
        JSON.stringify({
          scene: typeof (window as never as { __scene?: unknown }).__scene,
          src: String(navigator.mediaDevices.getUserMedia).slice(0, 60),
          own: Object.getOwnPropertyNames(navigator.mediaDevices),
        }),
      ),
    );
    console.log(
      'WEBKIT gum:',
      await page.evaluate(async () => {
        try {
          const st = await navigator.mediaDevices.getUserMedia({ video: true });
          return 'ok tracks=' + st.getTracks().length;
        } catch (e) {
          return String(e instanceof DOMException ? e.name + ': ' + e.message : e);
        }
      }),
    );
    console.log('WEBKIT model state at timeout:', await modelState());
    console.log('WEBKIT console:', JSON.stringify(log.slice(0, 15)));
    throw e;
  }
  await page.waitForTimeout(20_000); // past model warm-up
  console.log('WEBKIT stats:', (await stats.locator('dl').innerText()).replace(/\n+/g, ' | '));
  const seen = await page.evaluate(() => {
    const st = (
      window as never as {
        __senselab: {
          frameStore: { getState: () => { faces: unknown[]; hands: unknown[] } };
        };
      }
    ).__senselab.frameStore.getState();
    return { faces: st.faces.length, hands: st.hands.length };
  });
  const faces = seen.faces;
  console.log('WEBKIT tracked:', JSON.stringify(seen));
  console.log(
    'WEBKIT console:',
    JSON.stringify(log.filter((l) => !l.startsWith('log')).slice(0, 12)),
  );
  expect(faces).toBeGreaterThan(0);
});
