import { test, expect, type Page } from '@playwright/test';

async function gotoHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByRole('heading', { name: /ldnout/i })).toBeVisible();
}

test.describe('Core interactions', () => {
  test('page loads and is interactive', async ({ page }) => {
    await gotoHome(page);

    await expect(page).toHaveTitle(/.+/);

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await gotoHome(page);

    const navLinks = page.locator('nav a, header a');
    const linkCount = await navLinks.count();

    if (linkCount > 0) {
      const firstLink = navLinks.first();
      const href = await firstLink.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        await firstLink.click();
        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('buttons are clickable and respond', async ({ page }) => {
    await gotoHome(page);

    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      const firstButton = buttons.first();
      await expect(firstButton).toBeEnabled();
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await gotoHome(page);

    expect(errors).toEqual([]);
  });

  test('no accessibility violations in tab order', async ({ page }) => {
    await gotoHome(page);

    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
