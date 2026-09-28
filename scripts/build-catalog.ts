import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { calculateCatalogHealth } from '../src/lib/catalog-health';
import { choosePricingRule } from '../src/lib/pricing';
import { offerCapabilities, offerModalities } from '../src/types';
import type {
  BenchmarkResult,
  Catalog,
  Model,
  Offer,
  Organization,
  PriceChangeEvent,
  Provider,
  OfferView,
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
const dataAsOf = sources
  .map((source) => source.checkedAt)
  .sort()
  .at(-1);
if (!dataAsOf) throw new Error('Cannot build a catalog without checked source dates.');

const catalog: Catalog = {
  schemaVersion: 'v1',
  generatedAt: `${dataAsOf}T00:00:00Z`,
  dataAsOf,
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
  const provider = providers.find((item) => item.id === offer.providerId);
  const organization = model
    ? organizations.find((item) => item.id === model.organizationId)
    : undefined;
  const view: OfferView | null =
    model && provider && organization ? { ...offer, model, provider, organization } : null;
  const modalities = view ? offerModalities(view) : model?.modalities;
  const capabilities = view ? offerCapabilities(view) : model?.capabilities;
  const standard = choosePricingRule(
    offer.pricing,
    'standard',
    0,
    new Date(`${dataAsOf}T23:59:59.999Z`),
  );
  return {
    offerId: offer.id,
    model: model?.name ?? '',
    organization: model ? (organizationMap.get(model.organizationId) ?? '') : '',
    provider: providerMap.get(offer.providerId) ?? '',
    apiModelId: offer.apiModelId,
    apiVariant: offer.apiVariant ?? '',
    availabilityStatus: offer.availability.status,
    accountEligibility: offer.availability.accountEligibility ?? '',
    availabilityNotes: offer.availability.notes ?? '',
    replacementOfferId: offer.availability.replacementOfferId ?? '',
    modalitiesInput: modalities?.input.join('; ') ?? '',
    modalitiesOutput: modalities?.output.join('; ') ?? '',
    inputPriceUsdPerMillion: standard?.inputPrice ?? '',
    cachedInputPriceUsdPerMillion: standard?.cachedInputPrice ?? '',
    outputPriceUsdPerMillion: standard?.outputPrice ?? '',
    contextWindowTokens: model?.contextWindowTokens ?? '',
    maxOutputTokens: model?.maxOutputTokens ?? '',
    priceStatus:
      standard?.priceStatus ??
      (offer.pricing.some((rule) => rule.mode === 'peak' || rule.mode === 'off-peak') && !standard
        ? 'time-based-not-simulated'
        : ''),
    functionCalling: capabilities?.functionCalling ?? '',
    structuredOutputs: capabilities?.structuredOutputs ?? '',
    promptCaching: capabilities?.promptCaching ?? '',
    batchApi: capabilities?.batchApi ?? '',
    pricingVerifiedAt:
      offer.pricingVerifiedAt ??
      standard?.sources
        .map((source) => source.checkedAt)
        .sort()
        .at(-1) ??
      '',
    availabilityVerifiedAt: offer.availabilityVerifiedAt ?? offer.lastVerifiedAt,
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
