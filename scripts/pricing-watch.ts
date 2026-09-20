import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Offer, SourceReference } from '../src/types';

type WatchBaseline = Record<string, { sha256: string; checkedAt: string; pricingSignals: number }>;

const root = resolve(process.cwd());
const sources = JSON.parse(
  await readFile(resolve(root, 'data', 'sources', 'index.json'), 'utf8'),
) as SourceReference[];
const offers = JSON.parse(
  await readFile(resolve(root, 'data', 'offers', 'index.json'), 'utf8'),
) as Offer[];
const baselinePath = resolve(root, 'data', 'sources', 'watch-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

function normalizedBody(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberVariants(value: number): string[] {
  return [...new Set([String(value), value.toFixed(2), value.toFixed(3)])];
}

function containsPricingValue(body: string, value: number): boolean {
  return numberVariants(value).some((variant) => {
    const pattern = new RegExp(`(?<![\\d.])(?:\\$|USD\\s*)?${escapeRegExp(variant)}(?![\\d.])`);
    return pattern.test(body);
  });
}

/**
 * Hash only the reviewed price signals. Provider pages often include rotating
 * timestamps, request IDs or recommendation blocks that should not invalidate
 * a pricing baseline on every run.
 */
function pricingFingerprint(body: string, expectedValues: number[]): string {
  const compact = normalizedBody(body);
  return [...new Set(expectedValues)]
    .sort((a, b) => a - b)
    .map((value) => `${value}:${containsPricingValue(compact, value) ? 'present' : 'missing'}`)
    .join('|');
}

function digest(body: string, expectedValues: number[]): string {
  return createHash('sha256').update(pricingFingerprint(body, expectedValues)).digest('hex');
}

function pricingSignalsFor(url: string): number[] {
  const values: number[] = [];
  for (const offer of offers) {
    for (const rule of offer.pricing) {
      if (!rule.sources.some((source) => source.url === url)) continue;
      for (const value of [
        rule.inputPrice,
        rule.outputPrice,
        rule.cachedInputPrice,
        rule.cacheWritePrice,
      ]) {
        if (value !== null && value !== undefined && !values.includes(value)) values.push(value);
      }
    }
  }
  return values;
}

function countPricingSignals(body: string, expectedValues: number[]): number {
  const compact = body.replace(/\s+/g, ' ');
  return expectedValues.filter((value) => containsPricingValue(compact, value)).length;
}

async function loadBaseline(): Promise<WatchBaseline> {
  try {
    return JSON.parse(await readFile(baselinePath, 'utf8')) as WatchBaseline;
  } catch {
    return {};
  }
}

async function checkSource(source: SourceReference) {
  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': 'ai-cost-explorer-pricing-watch/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    const expectedValues = pricingSignalsFor(source.url);
    return {
      source,
      ok: response.ok,
      status: response.status,
      sha256: response.ok ? digest(body, expectedValues) : null,
      expectedSignals: expectedValues.length,
      pricingSignals: response.ok ? countPricingSignals(body, expectedValues) : 0,
    };
  } catch (error) {
    return {
      source,
      ok: false,
      status: error instanceof Error ? error.message : 'network error',
      sha256: null,
      expectedSignals: pricingSignalsFor(source.url).length,
      pricingSignals: 0,
    };
  }
}

console.log(`# Pricing watch · ${new Date().toISOString()}`);
console.log(`Registered official sources: ${sources.length}`);
const baseline = await loadBaseline();
const results = await Promise.all(sources.map(checkSource));
const nextBaseline: WatchBaseline = {};
const failures: string[] = [];
const reviews: string[] = [];

for (const result of results) {
  const { source } = result;
  if (!result.ok || !result.sha256) {
    failures.push(`${source.publisher}: ${source.url} (${result.status})`);
    continue;
  }
  nextBaseline[source.url] = {
    sha256: result.sha256,
    checkedAt: new Date().toISOString(),
    pricingSignals: result.pricingSignals,
  };
  if (!updateBaseline) {
    const previous = baseline[source.url];
    if (!previous) failures.push(`${source.publisher}: no baseline for ${source.url}`);
    else if (previous.sha256 !== result.sha256)
      failures.push(`${source.publisher}: content changed at ${source.url}`);
  }
  if (result.expectedSignals > 0 && result.pricingSignals === 0)
    reviews.push(`${source.publisher}: no expected price value was found at ${source.url}`);
  console.log(
    `- ${source.publisher}: ${result.pricingSignals}/${result.expectedSignals} pricing signals, ${result.sha256.slice(0, 12)}…`,
  );
}

if (updateBaseline) {
  await writeFile(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  console.log(`Updated ${baselinePath}`);
} else if (Object.keys(baseline).length === 0) {
  failures.push('no baseline file found; run pnpm pricing:watch -- --update-baseline after review');
}

if (reviews.length > 0) {
  console.warn(`Pricing values requiring manual review: ${reviews.length}`);
  for (const review of reviews) console.warn(`- ${review}`);
}
if (failures.length > 0) {
  console.error(`Pricing watch failed with ${failures.length} actionable signal(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    updateBaseline
      ? 'Baseline updated after reviewing reachable sources. Values were checked for visible pricing signals; catalog data was not mutated.'
      : 'All registered sources are reachable and unchanged from the reviewed baseline. Values were checked for visible pricing signals; no data was mutated.',
  );
}
