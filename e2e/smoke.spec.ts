import { expect, test } from '@playwright/test';

test('landing page loads the verified catalog and links into the explorer', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: /Choose the right AI model/i })).toBeVisible();
  await expect(page.getByText(/^\d+ offers monitored$/i)).toBeVisible();
  await page.getByRole('link', { name: /Explore models/i }).click();
  await expect(page.getByRole('heading', { name: 'Model explorer' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Searchable AI model offers' })).toBeVisible();
});

test('landing page renders when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  await page.goto('./');

  await expect(page.getByRole('heading', { name: /Choose the right AI model/i })).toBeVisible();
});

test('explorer creates a shareable comparison', async ({ page }) => {
  await page.goto('./explore');
  await page.getByPlaceholder('Search model, provider or API ID').fill('GPT');

  const addButtons = page.locator('button[aria-label^="Add"]');
  await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
  expect(await addButtons.count()).toBeGreaterThanOrEqual(2);
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await expect(page.getByText('2 offers ready')).toBeVisible();
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison workspace' })).toBeVisible();
  await expect(page).toHaveURL(/compare=offer-/);
});

test('calculator produces known estimates for selected offers', async ({ page }) => {
  await page.goto('./calculator');

  await expect(
    page.getByRole('heading', { name: 'Estimate the bill before it arrives.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inference subtotal by offer' })).toBeVisible();
  await expect(page.locator('.result-card').first()).toBeVisible();
  await expect(page.locator('.result-price').first()).not.toHaveText('Not verified');
  await page.getByRole('button', { name: 'annual' }).click();
  await expect(page.locator('.result-period').first()).toHaveText('per year');
});

test('calculator persists named scenarios locally', async ({ page }) => {
  await page.goto('./calculator');

  await page.getByLabel('Scenario name').fill('Support pilot');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('Support pilot', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Support pilot', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Support pilot' }).click();
  await expect(page.getByText('Support pilot', { exact: true })).not.toBeVisible();
});

test('calculator accepts shareable URL state and imports scenario JSON', async ({ page }) => {
  await page.goto(
    './calculator?in=1000&out=200&cache=100&write=0&req=10&days=30&retry=0.02&batch=0&offers=offer-a&mode=annual',
  );

  await expect(page.locator('.number-field input').first()).toHaveValue('1000');
  await expect(page.getByRole('button', { name: 'annual' })).toHaveClass(/active/);

  const payload = JSON.stringify({
    schemaVersion: 1,
    scenarios: [
      {
        id: 'imported-pilot',
        name: 'Imported pilot',
        savedAt: '2026-08-02',
        input: {
          inputTokens: 1000,
          outputTokens: 200,
          cachedInputTokens: 100,
          cacheWriteTokens: 0,
          requestsPerDay: 10,
          daysPerMonth: 30,
          retryRate: 0.02,
          batchRate: 0,
        },
        selectedOfferIds: ['offer-a'],
        mode: 'monthly',
      },
    ],
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'scenarios.json',
    mimeType: 'application/json',
    buffer: Buffer.from(payload),
  });
  await expect(page.getByText('Imported pilot')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('imported');
});

test('direct routes have canonical metadata and scenario queries are noindex', async ({ page }) => {
  await page.goto('./calculator/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://samvale29.github.io/ai-cost-explorer/calculator/',
  );
  await expect(page).toHaveTitle('Cost simulator · AI Cost Explorer');
  await page.goto(
    './calculator/?in=1000&out=200&cache=0&write=0&req=1000&days=30&retry=0&batch=0&users=10&convos=2&messages=3&offers=offer-cohere-command-r7b&mode=monthly',
  );
  await expect(page.getByLabel('Requests / day')).toHaveValue('60');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.getByRole('button', { name: 'monthly', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
