import { expect, test } from '@playwright/test';

test('mobile navigation and calculator controls expose accessible state', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await page.goto('./calculator');

    const menuButton = page.getByRole('button', { name: 'Open navigation' });
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#main-content')).toBeVisible();

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();

    await page.locator('.mobile-backdrop').click({ position: { x: 350, y: 100 } });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    const monthlyButton = page.getByRole('button', { name: 'monthly' });
    const annualButton = page.getByRole('button', { name: 'annual' });
    await expect(monthlyButton).toHaveClass(/active/);
    await annualButton.click();
    await expect(annualButton).toHaveClass(/active/);
    await expect(monthlyButton).not.toHaveClass(/active/);

    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();
  } finally {
    await context.close();
  }
});
