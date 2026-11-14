import { expect, test } from '@playwright/test';
import { call, installFakeCamera, startApp, waitModels } from './fakeCamera';

// Needs FACE_FIXTURES (portrait + victory). Prints measured timings per pinned quality level and checks
// that tracking still works at each level, then that auto mode steps down under load and back up.
const dir = process.env.FACE_FIXTURES;
test.skip(!dir, 'set FACE_FIXTURES to a folder with portrait.jpg and victory.jpg');

const readStats = async (page: import('@playwright/test').Page) => {
  const t = (await page.getByLabel('Performance stats').locator('dl').innerText())
    .split('\n')
    .filter(Boolean);
  const o: Record<string, string> = {};
  for (let i = 0; i < t.length - 1; i += 2) o[t[i]!] = t[i + 1]!;
  return o;
};

const tracked = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __senselab: { frameStore: { getState: () => { faces: unknown[]; hands: unknown[] } } };
    };
    const s = w.__senselab.frameStore.getState();
    return { faces: s.faces.length, hands: s.hands.length };
  });

test('each pinned level keeps tracking a face and a hand (timings printed)', async ({ page }) => {
  test.setTimeout(150_000);
  await installFakeCamera(page, dir!, ['portrait', 'victory']);
  await startApp(page, 'Live Studio');
  await call(page, '__show', 'portrait');
  await call(page, '__setHand', 'victory');
  await page.evaluate(
    () => ((window as never as { __scene: { handX: number } }).__scene.handX = 400),
  );
  await waitModels(page);
  await page.waitForTimeout(8000); // first-run warm-up outliers
  for (const label of ['High', 'Medium', 'Low']) {
    await page.getByLabel('Quality mode').selectOption({ label });
    await page.waitForTimeout(9000);
    const s = await readStats(page);
    const seen = await tracked(page);
    console.log('LEVEL', label, JSON.stringify(s), JSON.stringify(seen));
    expect(s['Quality']).toBe(`${label} (pinned)`);
    expect(seen.faces, `${label}: face tracked`).toBeGreaterThan(0);
    expect(seen.hands, `${label}: hand tracked`).toBeGreaterThan(0);
  }
});

test('auto mode steps down when the worker is slow and back up when it recovers', async ({
  page,
}) => {
  test.setTimeout(330_000);
  await installFakeCamera(page, dir!, ['portrait', 'victory']);
  await startApp(page, 'Live Studio');
  await call(page, '__show', 'portrait');
  await call(page, '__setHand', 'victory');
  await waitModels(page);
  await page.waitForTimeout(8000);
  const NAMES = ['High', 'Medium', 'Low'];
  const level = async () => NAMES.indexOf((await readStats(page))['Quality']!.split(' ')[0]!);
  const before = await level();
  console.log('AUTO level before load:', NAMES[before]);

  // Dev-only load: CPU throttling slows the worker too, like a slow device would.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });
  await expect.poll(level, { timeout: 60_000, intervals: [1000] }).toBeGreaterThan(before);
  console.log('AUTO under load:', NAMES[await level()]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect.poll(level, { timeout: 200_000, intervals: [2000] }).toBeLessThanOrEqual(before);
  console.log('AUTO recovered to', NAMES[await level()]);
});
