import { expect, test } from '@playwright/test';

// Prints measured timings for: both models, face only, hands only. Not a pass/fail benchmark.
test('measure per-model cost', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  const panel = page.getByLabel('Performance stats');
  await expect(panel.getByText(/^(GPU|CPU)$/)).toBeVisible({ timeout: 60_000 });

  const read = async () => {
    const t = (await panel.innerText()).split('\n').filter(Boolean).slice(1); // skip the title
    const o: Record<string, string> = {};
    for (let i = 0; i < t.length - 1; i += 2) o[t[i]!] = t[i + 1]!;
    return o;
  };
  const faceBox = page.getByLabel('Face model', { exact: true });
  const handBox = page.getByLabel('Hand models', { exact: true });
  const measure = async (name: string) => {
    await page.waitForTimeout(Number(process.env.MEASURE_MS ?? 6000));
    console.log('PERF', name, JSON.stringify(await read()));
  };

  // Let the first-run model warm-up pass: it adds multi-second outliers to the 60-sample means.
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 12_000));
  await measure('both models');
  await handBox.uncheck();
  await measure('face only');
  await handBox.check();
  await faceBox.uncheck();
  await measure('hands only');
});
