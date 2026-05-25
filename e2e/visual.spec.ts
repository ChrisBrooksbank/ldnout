import { test, expect } from '@playwright/test';

test.describe('Visual regression', () => {
  test('homepage can be captured', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /ldnout/i })).toBeVisible();

    const screenshot = await page.screenshot();

    expect(screenshot.byteLength).toBeGreaterThan(1000);
  });
});
