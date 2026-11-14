import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// Measures what face recognition costs with TWO faces in view and people registered (random vectors
// are enough: the work per face does not depend on who is registered). Prints numbers, no pass/fail.
const dir = process.env.LFW_DIR;
test.skip(!dir, 'set LFW_DIR (see identity.spec.ts)');
const img = (p: string, n: number) =>
  readFileSync(join(dir!, p, `${String(n).padStart(2, '0')}.jpg`)).toString('base64');

test('identity cost with two faces', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(
    (imgs) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const [a, b] = await Promise.all(
          imgs.map(async (s) => {
            const im = new Image();
            im.src = `data:image/jpeg;base64,${s}`;
            await im.decode();
            return im;
          }),
        );
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext('2d')!;
        setInterval(() => {
          ctx.fillStyle = '#6b7280';
          ctx.fillRect(0, 0, 640, 480);
          ctx.drawImage(a!, 0, 90, 320, 320); // two photos side by side
          ctx.drawImage(b!, 320, 90, 320, 320);
        }, 33);
        return c.captureStream(30);
      };
    },
    [img('George_W_Bush', 7), img('Colin_Powell', 7)],
  );

  await page.goto('/');
  // Seed one registered person straight into IndexedDB so identity has someone to compare against.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('senselab', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('people', { keyPath: 'id' });
        open.onsuccess = () => {
          const v = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i));
          const n = Math.hypot(...v);
          const unit = v.map((x) => x / n);
          const tx = open.result.transaction('people', 'readwrite');
          tx.objectStore('people').put({
            id: 'seed',
            name: 'Seed',
            embeddings: [unit],
            meanEmbedding: unit,
            modelId: 'sface-2021dec-fp32',
            createdAt: 1,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  const stats = page.getByLabel('Performance stats');
  await expect(stats.getByText(/^(GPU|CPU)$/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 10_000));

  const read = async () => {
    const t = (await stats.innerText()).split('\n').filter(Boolean).slice(1);
    const o: Record<string, string> = {};
    for (let i = 0; i < t.length - 1; i += 2) o[t[i]!] = t[i + 1]!;
    return o;
  };
  console.log('PERF identity on ', JSON.stringify(await read()));
  await page.waitForTimeout(6000);
  console.log('PERF identity on ', JSON.stringify(await read()));
  await page.getByLabel('Face recognition', { exact: true }).uncheck();
  await page.waitForTimeout(8000);
  console.log('PERF identity off', JSON.stringify(await read()));
});
