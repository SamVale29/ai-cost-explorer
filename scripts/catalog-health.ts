import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculateCatalogHealth } from '../src/lib/catalog-health';
import type {
  BenchmarkResult,
  Catalog,
  Model,
  Offer,
  Organization,
  PriceChangeEvent,
  Provider,
  SourceReference,
} from '../src/types';

const root = resolve(process.cwd());
const dataPath = (name: string) => resolve(root, 'data', name, 'index.json');
async function load<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(dataPath(name), 'utf8')) as T;
}

const catalog: Catalog = {
  schemaVersion: 'v1',
  organizations: await load<Organization[]>('organizations'),
  providers: await load<Provider[]>('providers'),
  models: await load<Model[]>('models'),
  offers: await load<Offer[]>('offers'),
  benchmarks: await load<BenchmarkResult[]>('benchmarks'),
  history: await load<PriceChangeEvent[]>('history'),
  sources: await load<SourceReference[]>('sources'),
  generatedAt: '',
  dataAsOf: '',
};
catalog.dataAsOf =
  catalog.sources
    .map((source) => source.checkedAt)
    .sort()
    .at(-1) ?? '';
if (!catalog.dataAsOf) throw new Error('Cannot calculate health without checked source dates.');
catalog.generatedAt = `${catalog.dataAsOf}T00:00:00Z`;

const health = calculateCatalogHealth(catalog);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(health, null, 2));
} else {
  console.log(`Catalog health as of ${health.dataAsOf}`);
  console.log(
    `- ${health.totals.offers} offers across ${health.totals.providers} providers (${health.totals.directProviders} direct)`,
  );
  console.log(`- input price coverage: ${health.coverage.offersWithStandardInputPrice}%`);
  console.log(`- output price coverage: ${health.coverage.offersWithStandardOutputPrice}%`);
  console.log(`- context window coverage: ${health.coverage.modelsWithContextWindow}%`);
  console.log(
    `- source freshness: ${health.freshness.freshSources} fresh, ${health.freshness.agingSources} aging, ${health.freshness.staleSources} stale, ${health.freshness.unknownSources} unknown`,
  );
  console.log(`- benchmarks: ${health.benchmarkStatus}`);
}
