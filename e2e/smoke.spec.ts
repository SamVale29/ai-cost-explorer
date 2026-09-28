import { expect, test } from '@playwright/test';

test('landing page loads the verified catalog and links into the explorer', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: /Choose the right AI model/i })).toBeVisible();
  await expect(page.getByText(/^\d+ offers monitored$/i)).toBeVisible();
  await page.getByRole('link', { name: 'Explore models', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explore AI models' })).toBeVisible();
  // Laptop widths show the adaptive table; cards are reserved for narrow containers.
  await expect(page.locator('.explorer-table tbody tr').first()).toBeVisible();
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

  const addButtons = page.locator('.explorer-table button[aria-label^="Add"]');
  await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
  expect(await addButtons.count()).toBeGreaterThanOrEqual(2);
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await expect(page.getByText('2 offers ready')).toBeVisible();
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison workspace' })).toBeVisible();
  await expect(page).toHaveURL(/compare=offer-/);
});

test('explorer has no document overflow at audited viewport widths', async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./explore');
    await expect(page.getByRole('heading', { name: 'Explore AI models' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      tableContainers: [
        '.explorer-layout',
        '.explorer-main',
        '.explorer-table-card',
        '.table-scroll',
        '.explorer-table',
      ].map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return { selector, missing: true };
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          overflowX: style.overflowX,
        };
      }),
      overflowingElements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).replaceAll(' ', '.')}` : ''}`,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        })
        .filter((element) => element.right > window.innerWidth + 1)
        .sort((left, right) => right.right - left.right)
        .slice(0, 8),
    }));
    if (dimensions.document > dimensions.viewport)
      console.log(`Overflow diagnostics at ${width}px: ${JSON.stringify(dimensions)}`);
    expect(dimensions.document, `document overflow at ${width}px`).toBeLessThanOrEqual(
      dimensions.viewport,
    );
  }
});

test('mobile explorer selection flows through comparison into the calculator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./explore');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByPlaceholder('Search model, provider or API ID').fill('GPT-6');
  await page.getByRole('button', { name: 'Close catalog filters' }).click();

  const addButtons = page.locator('.explorer-mobile-list button[aria-label^="Add"]');
  await expect(addButtons.first()).toBeVisible();
  expect(await addButtons.count()).toBeGreaterThanOrEqual(2);
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await page.getByRole('button', { name: 'Open comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Simulate selected' }).click();
  await expect(
    page.getByRole('heading', { name: 'Estimate the bill before it arrives.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/calculator\?offers=offer-/);
  await expect(page.locator('.result-period').first()).toContainText('USD');
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
  await expect(page.locator('.result-period').first()).toHaveText('USD per year');
});

test('calculator persists named scenarios locally', async ({ page }) => {
  await page.goto('./calculator');

  await page.getByText('Saved workloads · 0').click();
  await page.getByLabel('Scenario name').fill('Support pilot');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('Support pilot', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByText('Saved workloads · 1').click();
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
  await page.getByText('Saved workloads · 0').click();
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
