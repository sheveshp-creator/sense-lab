import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// Needs a folder of face photos laid out like the eval script's: LFW_DIR/<Person>/01.jpg ...
// The photos are fed to the app through a fake camera that we can switch between people at will.
const dir = process.env.LFW_DIR;
test.skip(
  !dir,
  'set LFW_DIR to a folder of per-person image folders (see scripts/eval-identity.mjs)',
);

const ALICE = 'George_W_Bush';
const BOB = 'Colin_Powell';
const STRANGER = 'Tony_Blair';
const img = (person: string, n: number) =>
  readFileSync(join(dir!, person, `${String(n).padStart(2, '0')}.jpg`)).toString('base64');

test('register two people, recognise them, show a stranger as Unknown, persist, export, delete, import', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const foreign: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== origin) foreign.push(r.url());
  });
  page.on('dialog', (d) => void d.accept()); // "Delete all data" asks for confirmation

  const images: Record<string, string> = { blank: '' };
  for (let n = 1; n <= 8; n++) {
    images[`A${n}`] = img(ALICE, n);
    images[`B${n}`] = img(BOB, n);
  }
  images.S1 = img(STRANGER, 1);
  images.S2 = img(STRANGER, 2);

  // A fake camera: a canvas stream showing whichever photo the test selects.
  await page.addInitScript((imgs) => {
    const loaded: Record<string, HTMLImageElement | null> = {};
    let current = 'blank';
    const w = window as unknown as Record<string, unknown>;
    w.__setImage = (name: string) => (current = name);
    let timer = 0;
    w.__cycle = (names: string[], ms: number) => {
      clearInterval(timer);
      let i = 0;
      current = names[0]!;
      timer = window.setInterval(() => (current = names[++i % names.length]!), ms);
    };
    w.__stopCycle = () => clearInterval(timer);
    navigator.mediaDevices.getUserMedia = async () => {
      for (const [k, b64] of Object.entries(imgs)) {
        if (!b64) continue;
        const im = new Image();
        im.src = `data:image/jpeg;base64,${b64}`;
        await im.decode();
        loaded[k] = im;
      }
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d')!;
      setInterval(() => {
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(0, 0, 640, 480);
        const im = loaded[current];
        if (im) ctx.drawImage(im, 80, 0, 480, 480); // 250x250 photo scaled up to fill the height
      }, 33);
      return c.captureStream(30);
    };
  }, images);

  const show = (name: string) =>
    page.evaluate(
      (n) => (window as never as { __setImage: (s: string) => void }).__setImage(n),
      name,
    );
  const cycle = (names: string[]) =>
    page.evaluate(
      (n) => (window as never as { __cycle: (a: string[], ms: number) => void }).__cycle(n, 400),
      names,
    );
  const faceRow = page.getByTestId('face-row').first();
  /** Show a photo as a "new person walking in": a short blank gap so the tracker starts a fresh face. */
  const present = async (name: string) => {
    await show('blank');
    await page.waitForTimeout(900);
    await show(name);
  };
  const startApp = async () => {
    await page.goto('/');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Face Lab' }).click();
  };

  await startApp();
  await expect(page.getByLabel('Recognition').getByText(/sface-2021dec-fp32 · 128-d/)).toBeVisible({
    timeout: 20_000,
  });

  // --- register ---------------------------------------------------------------------------
  const register = async (name: string, shots: string[]) => {
    await page.getByLabel('Name').fill(name);
    // Static photos cannot turn their head. check() sets the box on; it stays on between people.
    await page.getByRole('checkbox', { name: /Skip the head-turn guidance/ }).check();
    await cycle(shots);
    await page.getByRole('button', { name: 'Start guided capture' }).click();
    await expect(page.getByRole('button', { name: `Save ${name}` })).toBeVisible({
      timeout: 40_000,
    });
    await page.getByRole('button', { name: `Save ${name}` }).click();
    await expect(page.getByTestId('reg-saved')).toContainText(`Saved ${name}`);
    await page.evaluate(() => (window as never as { __stopCycle: () => void }).__stopCycle());
  };
  await register('Alice', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  await show('blank');
  await register('Bob', ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  await expect(page.getByTestId('person')).toHaveCount(2);

  // --- recognise (photos 7 and 8 were never used for registration) -------------------------
  await present('A7');
  await expect(faceRow).toContainText('Alice', { timeout: 15_000 });
  await page.screenshot({ path: process.env.SHOT_ALICE ?? 'alice.png' });
  await present('B7');
  await expect(faceRow).toContainText('Bob', { timeout: 15_000 });
  await present('A8');
  await expect(faceRow).toContainText('Alice', { timeout: 15_000 });
  await present('S1');
  await expect(faceRow).toHaveAttribute('data-state', 'unknown', { timeout: 15_000 });
  await expect(faceRow).toContainText('Unknown');
  await page.screenshot({ path: process.env.SHOT_STRANGER ?? 'stranger.png' });
  await present('S2');
  await expect(faceRow).toHaveAttribute('data-state', 'unknown', { timeout: 15_000 });

  // --- threshold slider persists -----------------------------------------------------------
  await page.getByLabel('Match threshold').fill('0.66');
  await expect(page.getByTestId('threshold-value')).toHaveText('0.66');

  // --- persistence across a reload ---------------------------------------------------------
  await startApp();
  await expect(page.getByTestId('person')).toHaveCount(2);
  await expect(page.getByTestId('threshold-value')).toHaveText('0.66');
  await page.getByLabel('Match threshold').fill('0.50');
  await present('B8');
  await expect(faceRow).toContainText('Bob', { timeout: 15_000 });

  // --- export, delete everything, import ---------------------------------------------------
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await dl;
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  const exported = JSON.parse(text);
  expect(exported.people.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Bob']);
  expect(exported.people[0].embeddings.length).toBeGreaterThanOrEqual(5);
  expect(exported.people[0].embeddings[0]).toHaveLength(128);
  // Privacy: names and numbers only. No image data of any kind in the file.
  expect(text).not.toMatch(/data:image|base64|jpe?g|png/i);
  expect(Object.keys(exported.people[0]).sort()).toEqual([
    'createdAt',
    'embeddings',
    'id',
    'modelId',
    'name',
  ]);

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await expect(page.getByTestId('person')).toHaveCount(0);
  await show('blank');
  await present('A7');
  await expect(faceRow).not.toContainText('Alice'); // forgotten

  await page.getByLabel('Import people file').setInputFiles(path);
  await expect(page.getByRole('status').filter({ hasText: 'Imported 2 new' })).toBeVisible();
  await expect(page.getByTestId('person')).toHaveCount(2);
  await present('B7');
  await expect(faceRow).toContainText('Bob', { timeout: 15_000 });

  expect(foreign).toEqual([]);
});
