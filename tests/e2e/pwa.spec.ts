import { expect, test } from '@playwright/test';

// Production build only (the service worker is not registered in dev):
//   npm run build && npm run preview -- --port 4173   then   PORT=4173 npx playwright test pwa
test.skip(process.env.PORT !== '4173', 'needs the production preview: set PORT=4173');

test('after one visit the shell and the models are cached, and the app starts offline', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker takes control of this first page (clients.claim), so the model fetches below go through it.
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });

  const cached = await page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    }
    return out;
  });
  const shellName = Object.keys(cached).find((n) => n.startsWith('senselab-shell-'))!;
  expect(shellName, 'a shell cache exists').toBeTruthy();
  expect(cached[shellName]).toContain('/');
  expect(cached[shellName]!.some((p) => /\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(cached[shellName]!.some((p) => /inference\.worker-.*\.js$/.test(p))).toBe(true);
  expect(cached['senselab-models-v1']).toContain('/models/face_landmarker.task');
  expect(cached['senselab-models-v1']!.some((p) => p.includes('/models/wasm/'))).toBe(true);
  console.log(
    'PWA cached',
    JSON.stringify(Object.fromEntries(Object.entries(cached).map(([k, v]) => [k, v.length]))),
  );

  // Offline: the page, its chunks, the worker and the models must all come from the cache.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await context.setOffline(false);
});
