import { expect, test } from '@playwright/test';

test('landing page loads the verified catalog and links into the explorer', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: /Choose the right AI model/i })).toBeVisible();
  await expect(page.getByText('44 offers')).toBeVisible();
  await page.getByRole('link', { name: /Explore models/i }).click();
  await expect(page.getByRole('heading', { name: 'Model explorer' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Searchable AI model offers' })).toBeVisible();
});

test('explorer creates a shareable comparison', async ({ page }) => {
  await page.goto('./explore');
  await page.getByPlaceholder('Search model, provider or API ID').fill('GPT');

  const addButtons = page.locator('button[aria-label^="Add"]');
  await expect(addButtons).toHaveCount(7, { timeout: 10_000 });
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await expect(page.getByText('2 offers ready')).toBeVisible();
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison workspace' })).toBeVisible();
  await expect(page).toHaveURL(/compare=offer-/);
});

test('calculator produces known estimates for selected offers', async ({ page }) => {
  await page.goto('./calculator');

  await expect(page.getByRole('heading', { name: 'Estimate the bill before it arrives.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monthly cost by offer' })).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(6);
  await expect(page.locator('.result-price').first()).not.toHaveText('Not verified');
  await page.getByRole('button', { name: 'annual' }).click();
  await expect(page.locator('.result-period').first()).toHaveText('per year');
});

test('calculator persists named scenarios locally', async ({ page }) => {
  await page.goto('./calculator');

  await page.getByLabel('Scenario name').fill('Support pilot');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('Support pilot')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Support pilot')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Support pilot' }).click();
  await expect(page.getByText('Support pilot')).not.toBeVisible();
});
