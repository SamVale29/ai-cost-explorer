import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessModelDiscovery, normalizeApiModelId } from '../src/lib/model-discovery';
import type { SourceReference } from '../src/types';

type CoverageEntry = {
  providerId: string;
  apiModelId: string;
  status: string;
  sourceUrl: string;
  reason?: string;
};
type CoverageManifest = {
  providers: Array<{ providerId: string; sourceUrl: string; reviewedAt: string }>;
  entries: CoverageEntry[];
};
type DiscoveryBaseline = Record<
  string,
  { sourceUrl: string; reviewedAt: string; apiModelIds: string[] }
>;

const root = resolve(process.cwd());
const load = async <T>(path: string) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
const [sources, manifest, baseline] = await Promise.all([
  load<SourceReference[]>('data/sources/index.json'),
  load<CoverageManifest>('data/sources/model-coverage.json'),
  load<DiscoveryBaseline>('data/sources/model-discovery-baseline.json'),
]);
const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
const decisions = new Map(
  manifest.entries.map((entry) => [
    `${entry.providerId}:${normalizeApiModelId(entry.apiModelId)}`,
    entry,
  ]),
);
const minimumIds: Record<string, number> = {
  openai: 5,
  anthropic: 3,
  'google-ai': 8,
  mistral: 5,
  cohere: 4,
  xai: 3,
  deepseek: 5,
  groq: 10,
  together: 20,
};
const now = new Date().toISOString();
const results: Array<Record<string, unknown>> = [];

async function fetchSource(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'ai-cost-explorer-model-discovery/1.0',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Source request failed after retry');
}

for (let index = 0; index < manifest.providers.length; index += 3) {
  const batch = manifest.providers.slice(index, index + 3);
  results.push(
    ...(await Promise.all(
      batch.map(async (review) => {
        const source = sourceByUrl.get(review.sourceUrl);
        if (!source)
          return {
            providerId: review.providerId,
            sourceUrl: review.sourceUrl,
            status: 'source-not-registered',
            discoveredIds: [],
            newIds: [],
          };
        try {
          const response = await fetchSource(review.sourceUrl);
          if (!response.ok) {
            await response.body?.cancel();
            return {
              providerId: review.providerId,
              sourceUrl: review.sourceUrl,
              status: 'unreachable',
              httpStatus: response.status,
              discoveredIds: [],
              newIds: [],
            };
          }
          const body = await response.text();
          const assessment = assessModelDiscovery(
            review.providerId,
            body,
            baseline[review.providerId]?.apiModelIds ?? [],
            minimumIds[review.providerId] ?? 2,
          );
          const pending = assessment.newIds.map((apiModelId) => {
            const decision = decisions.get(`${review.providerId}:${apiModelId}`);
            return {
              apiModelId,
              status: decision?.status ?? 'pending-review',
              reason: decision?.reason ?? null,
              catalogued: decision?.status === 'tracked',
            };
          });
          return {
            providerId: review.providerId,
            sourceUrl: review.sourceUrl,
            status: assessment.status,
            discoveredIds: assessment.observedIds,
            newIds: pending,
          };
        } catch (error) {
          return {
            providerId: review.providerId,
            sourceUrl: review.sourceUrl,
            status: 'unreachable',
            error: error instanceof Error ? error.message : 'Network failure',
            discoveredIds: [],
            newIds: [],
          };
        }
      }),
    )),
  );
}

const missingBaseline = manifest.providers.filter((review) => !baseline[review.providerId]);
const unreachable = results.filter(
  (result) => result.status === 'unreachable' || result.status === 'source-not-registered',
);
const inconclusive = results.filter((result) => result.status === 'parser-inconclusive');
const discoveredNewCount = results.reduce(
  (count, result) => count + (Array.isArray(result.newIds) ? result.newIds.length : 0),
  0,
);
const pendingCount = results.reduce(
  (count, result) =>
    count +
    (Array.isArray(result.newIds)
      ? (result.newIds as Array<{ status: string }>).filter(
          (item) => item.status === 'pending-review',
        ).length
      : 0),
  0,
);
const report = {
  schemaVersion: 1,
  checkedAt: now,
  policy:
    'Discovery creates review findings only. It never changes model, offer, price, coverage or baseline data.',
  providers: results,
  summary: {
    providersReviewed: results.length,
    sourceFailures: unreachable.length,
    parserInconclusive: inconclusive.length,
    newIdsComparedToBaseline: discoveredNewCount,
    newIdsRequiringReview: pendingCount,
    missingBaselines: missingBaseline.map((review) => review.providerId),
  },
};
await mkdir(resolve(root, 'reports'), { recursive: true });
await writeFile(
  resolve(root, 'reports/model-discovery.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
const lines = [
  '## Model discovery',
  '',
  `Checked ${now}. This report creates review findings only and never mutates the catalog.`,
  '',
  '| Provider | Status | IDs seen | New IDs |',
  '|---|---|---:|---:|',
  ...results.map((result) => {
    const ids = Array.isArray(result.discoveredIds) ? result.discoveredIds.length : 0;
    const fresh = Array.isArray(result.newIds) ? result.newIds.length : 0;
    return `| ${result.providerId} | ${result.status} | ${ids} | ${fresh} |`;
  }),
  '',
  'Review each new API ID against its official page. Unreachable pages and inconclusive parsers are reported separately from new model IDs.',
];
const summary = `${lines.join('\n')}\n`;
await writeFile(resolve(root, 'reports/model-discovery.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);

const updateBaseline = process.argv.includes('--update-baseline');
if (updateBaseline) {
  const unresolved = results.flatMap((result) =>
    Array.isArray(result.newIds)
      ? (result.newIds as Array<{ apiModelId: string; status: string }>)
          .filter((item) => item.status === 'pending-review')
          .map((item) => `${result.providerId}:${item.apiModelId}`)
      : [],
  );
  if (unreachable.length || inconclusive.length || missingBaseline.length || unresolved.length)
    throw new Error(
      'Baseline update blocked. Review source failures, parser status and every new ID first; see reports/model-discovery.json.',
    );
  const next: DiscoveryBaseline = { ...baseline };
  for (const result of results) {
    const providerId = String(result.providerId);
    next[providerId] = {
      sourceUrl: String(result.sourceUrl),
      reviewedAt: now.slice(0, 10),
      apiModelIds: result.discoveredIds as string[],
    };
  }
  await writeFile(
    resolve(root, 'data/sources/model-discovery-baseline.json'),
    `${JSON.stringify(next, null, 2)}\n`,
  );
  console.log(
    'Model discovery baseline updated after all IDs received explicit coverage decisions.',
  );
} else {
  console.log(
    `Model discovery: ${unreachable.length} source failures, ${inconclusive.length} inconclusive parsers, ${pendingCount} unresolved IDs requiring review (${discoveredNewCount} compared with the baseline).`,
  );
  if (missingBaseline.length || unreachable.length) process.exitCode = 1;
  else if (inconclusive.length || pendingCount) process.exitCode = 2;
}
