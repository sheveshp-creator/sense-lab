import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Chromium's fake camera plays a recorded clip (--use-file-for-fake-video-capture), so this checks the whole
// real path: camera -> frame loop -> worker -> models -> overlay, with no test hooks, in dev or production
// (PORT=4173 for the production preview).
//
// The clip, tests/fixtures/clip-face.mjpeg, is 3 s of a public-domain portrait with a slow zoom and sway
// (made with ffmpeg, see tests/fixtures/README.md). It is not a recording of a person.
//
// MIN_FPS (default 15) is the floor for the model result rate. It is a loose floor so a slow CI machine does
// not fail; the numbers are printed so you can see the real ones.
const clip = fileURLToPath(new URL('../fixtures/clip-face.mjpeg', import.meta.url));
const minFps = Number(process.env.MIN_FPS ?? 15);

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${clip}`,
    ],
  },
});

test('a face box appears from the recorded clip and the frame rate stays above the floor', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('checkbox').check();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Start camera' }).click();

  // "Face box": the overlay canvas has drawn pixels (only faces and hands draw on it).
  const drawn = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c || c.width === 0) return 0;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i]! > 0) n++;
      return n;
    });
  let firstBoxMs = -1;
  while (Date.now() - t0 < 30_000) {
    if ((await drawn()) > 0) {
      firstBoxMs = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(50);
  }
  expect(firstBoxMs, 'a face box was drawn').toBeGreaterThan(0);
  console.log(
    `CLIP first face box after ${firstBoxMs} ms (Start camera click to first drawn pixels)`,
  );

  await page.waitForTimeout(4000); // let first-run warm-up leave the averages
  const stats = page.getByLabel('Performance stats').locator('dl');
  const read = async () => {
    const t = (await stats.innerText()).split('\n').filter(Boolean);
    const o: Record<string, string> = {};
    for (let i = 0; i < t.length - 1; i += 2) o[t[i]!] = t[i + 1]!;
    return o;
  };
  const inference: number[] = [];
  const video: number[] = [];
  for (let i = 0; i < 8; i++) {
    const s = await read();
    inference.push(parseFloat(s['Inference FPS']!));
    video.push(parseFloat(s['Video FPS']!));
    expect(await drawn(), `face box still drawn at sample ${i}`).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
  }
  const last = await read();
  console.log('CLIP video FPS samples', video.join(' '));
  console.log('CLIP inference FPS samples', inference.join(' '));
  console.log('CLIP stats', JSON.stringify(last));
  expect(Math.min(...inference), `lowest inference FPS vs floor ${minFps}`).toBeGreaterThanOrEqual(
    minFps,
  );
});
