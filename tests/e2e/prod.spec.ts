import { expect, test } from '@playwright/test';
import { call, installFakeCamera, startApp } from './fakeCamera';

// Smoke test of the PRODUCTION build (run it against `vite preview`: PORT=4173). It must not rely on the dev hook.
const dir = process.env.FACE_FIXTURES;
test.skip(
  !dir || !process.env.PORT,
  'set FACE_FIXTURES and PORT (a running `npm run preview -- --port 4173`)',
);

test('production build: no dev hook, demos load lazily, keyboard works, no console errors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('INFO:')) errors.push(m.text());
  });
  const chunks: string[] = [];
  page.on('request', (r) => {
    const m = /assets\/(Demo|PlaygroundPage|HowItWorksPage)-[\w-]+\.js/.exec(r.url());
    if (m) chunks.push(m[0]);
  });

  await installFakeCamera(page, dir!);
  await startApp(page, 'Live Studio');
  await call(page, '__show', 'happy');
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  expect(await page.evaluate(() => '__senselab' in window)).toBe(false); // the test hook is development-only
  expect(chunks, 'nothing from the playground is downloaded before it is opened').toEqual([]);

  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await expect(page.getByTestId('air-draw-canvas')).toBeVisible({ timeout: 10_000 });
  expect(chunks.some((c) => c.startsWith('assets/PlaygroundPage'))).toBe(true);
  const before = chunks.length;
  await page.getByTestId('demo-tab-object-3d').click();
  await expect(page.getByTestId('object3d-view').locator('canvas')).toBeVisible({
    timeout: 10_000,
  });
  expect(chunks.length).toBeGreaterThan(before); // the 3D demo (with Three.js) came in only now
  await page.getByTestId('demo-tab-slide-remote').click();
  await expect(page.getByTestId('slide-position')).toHaveText('Slide 1 of 5'); // the lazy demo has mounted
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('slide-position')).toHaveText('Slide 2 of 5');
  await page.getByTestId('demo-tab-mirror-avatar').click();
  await expect(page.getByTestId('avatar')).toBeVisible();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await expect(page.getByTestId('architecture-diagram')).toBeVisible();
  await expect(page.getByTestId('timing-worker').locator('td').last()).toHaveText(
    /^[1-9]\d*\.\d ms$/,
    { timeout: 15_000 },
  );
  expect(errors).toEqual([]);
});
