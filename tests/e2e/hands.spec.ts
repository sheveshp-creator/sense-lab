import { expect, test } from '@playwright/test';

// Run against a fake camera showing a hand photo: FAKE_VIDEO=/path/hand.y4m
// OUT=/path/fixture.json also saves the dev "record" download there.
test('hand lab: tracks a hand, shows finger states and a gesture tag', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Hand Lab' }).click();
  await expect(page.getByTestId('hand-1')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);

  const states: Record<string, string> = {};
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    states[f] = (
      await page.getByTestId(`hand-1`).getByTestId(`finger-${f}`).innerText()
    ).toLowerCase();
  }
  const panel = await page.getByLabel('Finger states').innerText();
  console.log(
    'RESULT',
    JSON.stringify({ states, tag: await page.getByTestId('gesture-tag').first().innerText() }),
  );
  console.log('PANEL', panel.replace(/\n+/g, ' | '));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  if (process.env.OUT) {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Record last 2 s/ }).click();
    await (await dl).saveAs(process.env.OUT);
  }
});
