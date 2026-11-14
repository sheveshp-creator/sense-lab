import { expect, test } from '@playwright/test';

test('consent -> camera -> worker loads FaceLandmarker -> live stats', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // MediaPipe prints INFO lines through console.error; those are not failures.
    if (m.type() === 'error' && !m.text().startsWith('INFO:'))
      problems.push(`console.error: ${m.text()}`);
  });
  // Privacy rule: after load, only our own origin may be contacted.
  const foreign: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404) problems.push(`404: ${r.url()}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (
      u.protocol.startsWith('http') &&
      u.origin !== new URL(test.info().project.use.baseURL!).origin
    )
      foreign.push(r.url());
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();

  await expect(page.getByText('Delegate')).toBeVisible();
  // Wait until the worker has loaded the model (delegate shows GPU or CPU instead of "-").
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(6000); // let the ring buffers fill

  // Overlay alignment: the view box, video and canvas must all share the stream's real aspect ratio,
  // otherwise landmarks drift off the face (seen on phones whose camera is not 4:3).
  const geo = await page.evaluate(() => {
    const v = document.querySelector('video')!;
    const c = document.querySelector('canvas')!;
    const vb = v.getBoundingClientRect();
    const cb = c.getBoundingClientRect();
    return {
      native: v.videoWidth / v.videoHeight,
      video: vb.width / vb.height,
      canvas: cb.width / cb.height,
      same: Math.abs(vb.width - cb.width) < 1 && Math.abs(vb.height - cb.height) < 1,
      cw: c.width,
      ch: c.height,
      vw: v.videoWidth,
      vh: v.videoHeight,
    };
  });
  console.log('GEO', JSON.stringify(geo));
  expect(Math.abs(geo.video - geo.native)).toBeLessThan(0.01);
  expect(geo.same).toBe(true);
  expect([geo.cw, geo.ch]).toEqual([geo.vw, geo.vh]);

  // Layers toggle independently: count drawn pixels on the overlay canvas for each combination.
  const drawn = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    });
  const layerNames = [
    'Box',
    'Mesh',
    'Eyes',
    'Brows',
    'Nose',
    'Lips',
    'Jaw',
    'ID label',
    'Expression',
    'Gaze',
    'Skeleton',
    'Finger states',
    'Gesture tag',
    'Palm trail',
    'Gesture effects',
    'Heatmap',
  ];
  // Gesture effects only draw while point / pinch / a two-hand gesture is active, which this video
  // (a face and a victory sign) never does, so it cannot show pixels here.
  const noPixelsExpected = new Set(['Gesture effects']);
  for (const name of layerNames) await page.getByLabel(name, { exact: true }).uncheck();
  await page.waitForTimeout(300);
  expect(await drawn(), 'all layers off draws nothing').toBe(0);
  for (const name of layerNames) {
    await page.getByLabel(name, { exact: true }).check();
    await page.waitForTimeout(300);
    if (!noPixelsExpected.has(name))
      expect(await drawn(), `only ${name} on draws something`).toBeGreaterThan(0);
    await page.getByLabel(name, { exact: true }).uncheck();
  }
  for (const name of [
    'Box',
    'Eyes',
    'Brows',
    'Nose',
    'Lips',
    'Jaw',
    'ID label',
    'Expression',
    'Gaze',
    'Skeleton',
    'Finger states',
    'Gesture tag',
    'Palm trail',
    'Gesture effects',
  ]) {
    await page.getByLabel(name, { exact: true }).check();
  }

  await page.waitForTimeout(500); // let the canvas redraw with the restored layers
  const stats = await page.getByLabel('Performance stats').innerText();
  console.log('STATS\n' + stats);
  await page.screenshot({ path: process.env.SHOT ?? 'studio.png' });
  console.log('PROBLEMS', JSON.stringify(problems));
  console.log('FOREIGN', JSON.stringify(foreign));
  expect(problems).toEqual([]);
  expect(foreign).toEqual([]);
});
