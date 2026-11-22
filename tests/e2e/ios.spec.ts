import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// iPhone and iPad browsers: Chrome and Firefox there are WebKit with a user-agent that has "Safari" but no
// "Chrome" and no "Version/17". MediaPipe reads that as "old Safari", skips OffscreenCanvas and calls
// document.createElement, which a worker does not have: "Can't find variable: document" (face and hand tracking
// both failed on a real iPad and iPhone). Chromium with that user-agent reproduces it. No camera photos needed.
const CRIOS =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as never as {
        __senselab: {
          liveStore: {
            getState: () => { thread: string; modelLoad: Record<string, { state: string }> };
          };
        };
      }
    ).__senselab.liveStore.getState();
    return `${s.thread} ${s.modelLoad.face!.state}/${s.modelLoad.hand!.state}`;
  });

const start = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
};

test.describe('iPad Chrome user-agent', () => {
  test.use({ userAgent: CRIOS });

  test('face and hand tracking load in the worker (MediaPipe is given its own canvas)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await start(page);
    await expect.poll(() => state(page), { timeout: 60_000 }).toBe('worker ready/ready');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('if the worker still fails for a browser reason, the models start on the main thread instead', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Make every worker-side canvas request fail the way WebKit's does: no OffscreenCanvas in the worker.
    await page.route('**/inference.worker*', async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      await route.fulfill({
        response: res,
        body: `delete globalThis.OffscreenCanvas;\n${body}`,
        headers: { ...res.headers(), 'content-type': 'text/javascript' },
      });
    });
    await start(page);
    await expect.poll(() => state(page), { timeout: 60_000 }).toBe('main ready/ready');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
