import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Model, Offer, SourceReference } from '../src/types';
import {
  countPricingSignals,
  pricingFingerprint,
  pricingSignalKey,
  pricingSignalEvidence,
  pricingSignalsFor,
} from '../src/lib/pricing-watch';
import type { PricingSignalStatus } from '../src/lib/pricing-watch';

type WatchBaseline = Record<
  string,
  {
    sha256: string;
    checkedAt: string;
    expectedSignals: number;
    pricingSignals: number;
    missingSignals: number;
    signalStates?: Record<string, PricingSignalStatus>;
  }
>;

const root = resolve(process.cwd());
const sources = JSON.parse(
  await readFile(resolve(root, 'data', 'sources', 'index.json'), 'utf8'),
) as SourceReference[];
const offers = JSON.parse(
  await readFile(resolve(root, 'data', 'offers', 'index.json'), 'utf8'),
) as Offer[];
const models = JSON.parse(
  await readFile(resolve(root, 'data', 'models', 'index.json'), 'utf8'),
) as Model[];
const baselinePath = resolve(root, 'data', 'sources', 'watch-baseline.json');
const baselineUpdateUrl = process.argv
  .find((argument) => argument.startsWith('--update-baseline-url='))
  ?.slice('--update-baseline-url='.length);
const updateBaseline = process.argv.includes('--update-baseline') || Boolean(baselineUpdateUrl);

function digest(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex');
}

async function loadBaseline(): Promise<WatchBaseline> {
  try {
    return JSON.parse(await readFile(baselinePath, 'utf8')) as WatchBaseline;
  } catch {
    return {};
  }
}

async function checkSource(source: SourceReference) {
  const signals = pricingSignalsFor(offers, models, source.url);
  try {
    const response = await fetch(source.url, {
      headers: {
        'user-agent': 'ai-cost-explorer-pricing-watch/2.0',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    const evidence = response.ok ? pricingSignalEvidence(body, signals) : [];
    const pricingSignals = response.ok ? countPricingSignals(body, signals) : 0;
    const fingerprint = response.ok ? pricingFingerprint(body, signals) : '';
    const signalStates = Object.fromEntries(
      evidence.map(({ signal, status }) => [pricingSignalKey(signal), status]),
    ) as Record<string, PricingSignalStatus>;
    return {
      source,
      ok: response.ok,
      status: response.status,
      sha256: response.ok ? digest(fingerprint) : null,
      expectedSignals: signals.length,
      pricingSignals,
      missingSignals: evidence.filter(({ status }) => status !== 'present').length,
      signalStates,
      missingSignalDetails: evidence
        .filter(({ status }) => status !== 'present')
        .slice(0, 4)
        .map(
          ({ signal, status }) =>
            `${signal.apiModelId}/${signal.mode}/${signal.component}=${signal.value} (${status})`,
        ),
    };
  } catch (error) {
    return {
      source,
      ok: false,
      status: error instanceof Error ? error.message : 'network error',
      sha256: null,
      expectedSignals: signals.length,
      pricingSignals: 0,
      missingSignals: signals.length,
      missingSignalDetails: [],
      signalStates: Object.fromEntries(
        signals.map((signal) => [pricingSignalKey(signal), 'missing']),
      ) as Record<string, PricingSignalStatus>,
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
    expectedSignals: result.expectedSignals,
    pricingSignals: result.pricingSignals,
    missingSignals: result.missingSignals,
    signalStates: result.signalStates,
  };
  if (!updateBaseline) {
    const previous = baseline[source.url];
    if (!previous) failures.push(`${source.publisher}: no baseline for ${source.url}`);
    else if (previous.sha256 !== result.sha256) {
      const regressions = previous.signalStates
        ? Object.entries(result.signalStates).filter(
            ([key, status]) => status !== 'present' && previous.signalStates?.[key] === 'present',
          )
        : [];
      if (regressions.length > 0) {
        failures.push(
          `${source.publisher}: ${regressions.length} previously present model/mode/component pricing signal(s) disappeared at ${source.url}`,
        );
      } else {
        reviews.push(`${source.publisher}: semantic evidence coverage changed at ${source.url}`);
      }
    }
  }
  if (result.expectedSignals > 0 && result.pricingSignals === 0) {
    reviews.push(`${source.publisher}: no model-scoped price evidence was found at ${source.url}`);
  } else if (result.missingSignals > 0) {
    const detail =
      result.missingSignalDetails.length > 0
        ? ` (e.g. ${result.missingSignalDetails.join(', ')})`
        : '';
    reviews.push(
      `${source.publisher}: ${result.missingSignals}/${result.expectedSignals} model/mode/component signals need review at ${source.url}${detail}`,
    );
  }
  console.log(
    `- ${source.publisher}: ${result.pricingSignals}/${result.expectedSignals} model-scoped pricing signals, ${result.missingSignals} needing review, ${result.sha256.slice(0, 12)}…`,
  );
}

if (updateBaseline) {
  const baselineToWrite = baselineUpdateUrl
    ? { ...baseline, [baselineUpdateUrl]: nextBaseline[baselineUpdateUrl] }
    : nextBaseline;
  if (baselineUpdateUrl && !nextBaseline[baselineUpdateUrl]) {
    throw new Error(`Cannot update baseline: source was not reachable: ${baselineUpdateUrl}`);
  }
  await writeFile(baselinePath, `${JSON.stringify(baselineToWrite, null, 2)}\n`);
  console.log(`Updated ${baselinePath}${baselineUpdateUrl ? ` for ${baselineUpdateUrl}` : ''}`);
} else if (Object.keys(baseline).length === 0) {
  failures.push('no baseline file found; run pnpm pricing:watch -- --update-baseline after review');
}

if (reviews.length > 0) {
  console.warn(`Pricing evidence requiring manual review: ${reviews.length}`);
  for (const review of reviews) console.warn(`- ${review}`);
}
if (failures.length > 0) {
  console.error(`Pricing watch failed with ${failures.length} actionable signal(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    updateBaseline
      ? 'Baseline updated after reviewing reachable sources and model-scoped evidence; catalog data was not mutated.'
      : 'All registered sources are reachable and unchanged from the reviewed semantic baseline. Model, mode and component evidence was checked; no data was mutated.',
  );
}
