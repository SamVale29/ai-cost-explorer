import AxeBuilder from '@axe-core/playwright';
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

test('primary routes pass automated color contrast checks in both themes', async ({ page }) => {
  test.setTimeout(120_000);
  const routes = [
    './',
    './explore',
    './compare',
    './calculator',
    './value',
    './history',
    './model/claude-sonnet-5',
    './methodology',
  ];
  for (const theme of ['dark', 'light'] as const) {
    await page.goto('./methodology');
    await expect(page.locator('.page-frame h1').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(dark|light)$/);
    const themeButton = page.getByRole('button', { name: `Switch to ${theme} theme` }).first();
    const currentTheme = await page.locator('html').getAttribute('data-theme');
    if (currentTheme !== theme) await themeButton.click();
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.addStyleTag({
        content:
          ':root, :root * { animation-duration: 0s !important; transition-duration: 0s !important; }',
      });
      await expect(page.locator('.page-frame h1').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(results.violations, `${theme} theme contrast violations on ${route}`).toEqual([]);
    }
  }
});

test('mobile explorer filters trap focus and return it to the opener on Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./explore');

  const openFilters = page.getByRole('button', { name: /Filters/ });
  await openFilters.click();
  const dialog = page.getByRole('dialog', { name: 'Filter catalog' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Search model, provider or API ID')).toBeFocused();
  await dialog.locator('input[type="checkbox"]').last().focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Clear all' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(openFilters).toHaveAttribute('aria-expanded', 'false');
  await expect(openFilters).toBeFocused();
});
