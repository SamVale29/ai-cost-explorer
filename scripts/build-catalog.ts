import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const publicData = resolve(root, 'public', 'data');

async function load<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(dataPath(name), 'utf8')) as T;
}

function csvValue(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

const organizations = await load<Organization[]>('organizations');
const providers = await load<Provider[]>('providers');
const models = await load<Model[]>('models');
const offers = await load<Offer[]>('offers');
const benchmarks = await load<BenchmarkResult[]>('benchmarks');
const history = await load<PriceChangeEvent[]>('history');
const sources = await load<SourceReference[]>('sources');

const catalog: Catalog = {
  schemaVersion: 'v1',
  generatedAt: '2026-08-02T00:00:00Z',
  dataAsOf: '2026-08-02',
  organizations,
  providers,
  models,
  offers,
  benchmarks,
  history,
  sources,
};

await mkdir(publicData, { recursive: true });
await writeFile(resolve(publicData, 'catalog-v1.json'), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(resolve(publicData, 'history-v1.json'), `${JSON.stringify(history, null, 2)}\n`);
await writeFile(
  resolve(publicData, 'benchmarks-v1.json'),
  `${JSON.stringify(benchmarks, null, 2)}\n`,
);
await writeFile(
  resolve(publicData, 'catalog-health-v1.json'),
  `${JSON.stringify(calculateCatalogHealth(catalog), null, 2)}\n`,
);
await writeFile(
  resolve(publicData, 'schema-v1.json'),
  `${JSON.stringify(
    {
      schemaVersion: 'v1',
      entities: [
        'organizations',
        'providers',
        'models',
        'offers',
        'benchmarks',
        'history',
        'sources',
      ],
      pricingUnits: ['per_million_tokens', 'per_request', 'per_second', 'per_image'],
      note: 'Null values mean that the field was not verified in an official source at dataAsOf.',
      artifacts: ['catalog-health-v1.json'],
    },
    null,
    2,
  )}\n`,
);

const organizationMap = new Map(organizations.map((item) => [item.id, item.name]));
const providerMap = new Map(providers.map((item) => [item.id, item.name]));
const modelMap = new Map(models.map((item) => [item.id, item]));
const rows = offers.map((offer) => {
  const model = modelMap.get(offer.modelId);
  const standard = offer.pricing.find((rule) => rule.mode === 'standard');
  return {
    offerId: offer.id,
    model: model?.name ?? '',
    organization: model ? (organizationMap.get(model.organizationId) ?? '') : '',
    provider: providerMap.get(offer.providerId) ?? '',
    apiModelId: offer.apiModelId,
    status: offer.availability.status,
    inputPriceUsdPerMillion: standard?.inputPrice ?? '',
    cachedInputPriceUsdPerMillion: standard?.cachedInputPrice ?? '',
    outputPriceUsdPerMillion: standard?.outputPrice ?? '',
    contextWindowTokens: model?.contextWindowTokens ?? '',
    maxOutputTokens: model?.maxOutputTokens ?? '',
    functionCalling: model?.capabilities.functionCalling ?? '',
    structuredOutputs: model?.capabilities.structuredOutputs ?? '',
    promptCaching: model?.capabilities.promptCaching ?? '',
    batchApi: model?.capabilities.batchApi ?? '',
    lastVerifiedAt: offer.lastVerifiedAt,
  };
});
const headers = Object.keys(rows[0] ?? {});
const csv = [
  headers.join(','),
  ...rows.map((row) =>
    headers.map((header) => csvValue(row[header as keyof typeof row])).join(','),
  ),
].join('\n');
await writeFile(resolve(publicData, 'catalog-v1.csv'), `${csv}\n`);

console.log(
  `Built public catalog: ${offers.length} offers, ${providers.length} providers, ${sources.length} registered sources.`,
);
