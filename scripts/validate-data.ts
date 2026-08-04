import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  BenchmarkResult,
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

const errors: string[] = [];
const organizations = await load<Organization[]>('organizations');
const providers = await load<Provider[]>('providers');
const models = await load<Model[]>('models');
const offers = await load<Offer[]>('offers');
const sources = await load<SourceReference[]>('sources');
const benchmarks = await load<BenchmarkResult[]>('benchmarks');
const history = await load<PriceChangeEvent[]>('history');

function uniqueIds<T extends { id: string }>(items: T[], label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function uniqueSourceUrls(items: SourceReference[], label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.url)) errors.push(`${label}: duplicate URL ${item.url}`);
    seen.add(item.url);
  }
}

function checkSource(source: SourceReference, label: string) {
  try {
    new URL(source.url);
  } catch {
    errors.push(`${label}: invalid source URL ${source.url}`);
  }
  if (!source.title || !source.publisher || !source.sourceType || !source.checkedAt)
    errors.push(`${label}: incomplete source reference`);
  if (Number.isNaN(new Date(source.checkedAt).getTime()))
    errors.push(`${label}: invalid checkedAt ${source.checkedAt}`);
}

uniqueIds(organizations, 'organizations');
uniqueIds(providers, 'providers');
uniqueIds(models, 'models');
uniqueIds(offers, 'offers');
uniqueSourceUrls(sources, 'sources');
const organizationIds = new Set(organizations.map((item) => item.id));
const providerIds = new Set(providers.map((item) => item.id));
const modelIds = new Set(models.map((item) => item.id));
const offerIds = new Set(offers.map((item) => item.id));

for (const model of models) {
  if (!organizationIds.has(model.organizationId))
    errors.push(`model ${model.id}: missing organization ${model.organizationId}`);
  if (!model.name || !model.lastVerifiedAt)
    errors.push(`model ${model.id}: missing name or lastVerifiedAt`);
  if (
    model.contextWindowTokens !== null &&
    model.contextWindowTokens !== undefined &&
    model.contextWindowTokens <= 0
  )
    errors.push(`model ${model.id}: invalid context window`);
  for (const source of model.sources) checkSource(source, `model ${model.id}`);
}

for (const offer of offers) {
  if (!modelIds.has(offer.modelId))
    errors.push(`offer ${offer.id}: missing model ${offer.modelId}`);
  if (!providerIds.has(offer.providerId))
    errors.push(`offer ${offer.id}: missing provider ${offer.providerId}`);
  if (!offer.apiModelId || !offer.lastVerifiedAt || offer.sources.length === 0)
    errors.push(`offer ${offer.id}: missing required fields`);
  for (const source of offer.sources) checkSource(source, `offer ${offer.id}`);
  for (const rule of offer.pricing) {
    const priceKeys = [
      'inputPrice',
      'outputPrice',
      'cachedInputPrice',
      'cacheWritePrice',
      'audioInputPrice',
      'audioOutputPrice',
      'imageInputPrice',
      'imageOutputPrice',
    ] as const;
    for (const key of priceKeys) {
      const value = rule[key];
      if (value !== null && value !== undefined && value < 0)
        errors.push(`offer ${offer.id}/${rule.id}: negative ${key}`);
    }
    if (
      rule.minimumInputTokens !== null &&
      rule.minimumInputTokens !== undefined &&
      rule.minimumInputTokens < 0
    )
      errors.push(`offer ${offer.id}/${rule.id}: invalid minimumInputTokens`);
    if (
      rule.maximumInputTokens !== null &&
      rule.maximumInputTokens !== undefined &&
      rule.maximumInputTokens < 0
    )
      errors.push(`offer ${offer.id}/${rule.id}: invalid maximumInputTokens`);
    if ((rule.minimumInputTokens ?? 0) > (rule.maximumInputTokens ?? Number.POSITIVE_INFINITY))
      errors.push(`offer ${offer.id}/${rule.id}: pricing tier range is inverted`);
    for (const source of rule.sources) checkSource(source, `pricing rule ${rule.id}`);
  }
}

for (const source of sources) checkSource(source, 'source registry');

for (const benchmark of benchmarks) {
  if (!offerIds.has(benchmark.offerId))
    errors.push(`benchmark ${benchmark.id}: missing offer ${benchmark.offerId}`);
  if (!benchmark.methodologyUrl || benchmark.concurrency < 1 || benchmark.repetitions < 5)
    errors.push(`benchmark ${benchmark.id}: incomplete protocol metadata`);
  if (Number.isNaN(new Date(benchmark.measuredAt).getTime()))
    errors.push(`benchmark ${benchmark.id}: invalid measuredAt`);
  try {
    new URL(benchmark.methodologyUrl);
  } catch {
    errors.push(`benchmark ${benchmark.id}: invalid methodology URL`);
  }
}

for (const event of history) {
  if (!offerIds.has(event.offerId))
    errors.push(`history ${event.id}: missing offer ${event.offerId}`);
  checkSource(event.source, `history ${event.id}`);
  if (Number.isNaN(new Date(event.detectedAt).getTime()))
    errors.push(`history ${event.id}: invalid detectedAt`);
}

if (offers.length < 40)
  errors.push(`catalog has ${offers.length} offers; v0.1.0 target is at least 40`);
if (providers.filter((provider) => provider.directProvider).length < 8)
  errors.push('catalog has fewer than 8 direct API providers');

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Data validation passed: ${organizations.length} organizations, ${models.length} models, ${providers.length} providers, ${offers.length} offers.`,
  );
}
