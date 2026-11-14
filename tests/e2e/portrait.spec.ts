import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Reproduces phones that deliver a portrait stream (e.g. 480x640) instead of 4:3 landscape.
// Needs a face photo: PORTRAIT_IMG=/path/to/face.jpg (not stored in the repo).
const img = process.env.PORTRAIT_IMG;
test.skip(!img, 'set PORTRAIT_IMG to a face photo to run');

test('overlay stays aligned with a portrait camera stream', async ({ page }) => {
  const b64 = readFileSync(img!).toString('base64');
  await page.addInitScript((data) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${data}`;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 640;
      const ctx = c.getContext('2d')!;
      const s = 480 / image.width; // fit width, keep the top of the photo (face)
      setInterval(() => ctx.drawImage(image, 0, 0, image.width * s, image.height * s), 33);
      return c.captureStream(30);
    };
  }, b64);

  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(3000);

  const geo = await page.evaluate(() => {
    const v = document.querySelector('video')!;
    const c = document.querySelector('canvas')!;
    const vb = v.getBoundingClientRect();
    return {
      native: v.videoWidth / v.videoHeight,
      video: vb.width / vb.height,
      canvas: c.width / c.height,
    };
  });
  console.log('GEO', JSON.stringify(geo));
  expect(geo.native).toBeLessThan(1); // really portrait
  expect(Math.abs(geo.video - geo.native)).toBeLessThan(0.01);
  expect(Math.abs(geo.canvas - geo.native)).toBeLessThan(0.01);
  await page.screenshot({ path: process.env.SHOT ?? 'portrait.png' });
});
