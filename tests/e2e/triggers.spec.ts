import { expect, test } from '@playwright/test';

// Needs the sliding-hand video (it swipes every 6 s): FAKE_VIDEO=/path/raw_left.y4m
test('false-trigger counter counts real gesture events and shows a rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  const stats = page.getByLabel('Performance stats');
  await expect(stats.getByText(/^(GPU|CPU)$/)).toBeVisible({ timeout: 60_000 });

  const panel = page.getByLabel('False triggers');
  await expect(panel.getByTestId('ft-count')).toHaveText('0');
  await panel.getByRole('button', { name: 'Start test' }).click();
  await page.waitForTimeout(14_000); // two swipes
  const count = Number(await panel.getByTestId('ft-count').innerText());
  const rate = await panel.getByTestId('ft-rate').innerText();
  const elapsed = await panel.getByTestId('ft-elapsed').innerText();
  console.log(
    'FT',
    JSON.stringify({
      count,
      rate,
      elapsed,
      text: (await panel.innerText()).replace(/\n+/g, ' | '),
    }),
  );
  expect(count).toBeGreaterThanOrEqual(2);
  expect(Number(rate)).toBeGreaterThan(0);

  await panel.getByRole('button', { name: 'Stop test' }).click();
  const frozen = await panel.getByTestId('ft-count').innerText();
  await page.waitForTimeout(8000);
  expect(await panel.getByTestId('ft-count').innerText()).toBe(frozen); // stopped: no more counting
});
