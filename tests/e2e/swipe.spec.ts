import { expect, test } from '@playwright/test';

// A real hand photo slides across a fake camera feed. EXPECT is the swipe the app should report
// (the display is mirrored, so a hand moving left in the raw video is a swipeRight on screen).
// OUT saves the dev "record" download, taken right after the event, as a real fixture.
const expectId = process.env.EXPECT;
test.skip(!expectId, 'set EXPECT=swipeRight|swipeLeft|swipeUp|swipeDown and FAKE_VIDEO');

const OPPOSITE: Record<string, string> = {
  swipeLeft: 'swipeRight',
  swipeRight: 'swipeLeft',
  swipeUp: 'swipeDown',
  swipeDown: 'swipeUp',
};

test('real hand sliding across the frame fires the right swipe and nothing else', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Performance stats').getByText(/^(GPU|CPU)$/)).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Hand Lab' }).click();

  const items = page.getByTestId('timeline-item');
  await expect(items.filter({ hasText: expectId! }).first()).toBeVisible({ timeout: 30_000 });

  if (process.env.OUT) {
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Record last 2 s/ }).click();
    await (await dl).saveAs(process.env.OUT);
  }

  // Let two more full loops run: the return stroke and the repeat must not add wrong events.
  await page.waitForTimeout(13_000);
  const texts = await items.allInnerTexts();
  const swipes = texts
    .map((t) => t.split(/\s+/))
    .filter((p) => p.some((w) => w.startsWith('swipe')));
  const names = swipes.map((p) => p.find((w) => w.startsWith('swipe'))!);
  console.log('SWIPES', JSON.stringify(names));
  expect(names.length).toBeGreaterThanOrEqual(2); // the first one plus at least one repeat
  expect(names.every((n) => n === expectId)).toBe(true);
  expect(names).not.toContain(OPPOSITE[expectId!]);
  expect(errors).toEqual([]);
});
