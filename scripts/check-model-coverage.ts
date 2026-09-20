import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Model, Offer, SourceReference } from '../src/types';

type CoverageEntry = {
  providerId: string;
  apiModelId: string;
  catalogModelId?: string;
  status: 'tracked' | 'deferred-non-token';
  sourceUrl: string;
  reason?: string;
};

type CoverageManifest = {
  schemaVersion: string;
  checkedAt: string;
  entries: CoverageEntry[];
};

const root = resolve(process.cwd());
async function load<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
}

const manifest = await load<CoverageManifest>('data/sources/model-coverage.json');
const models = await load<Model[]>('data/models/index.json');
const offers = await load<Offer[]>('data/offers/index.json');
const sources = await load<SourceReference[]>('data/sources/index.json');
const sourceUrls = new Set(sources.map((source) => source.url));
const errors: string[] = [];
const seen = new Set<string>();

if (manifest.schemaVersion !== 'v1')
  errors.push('unsupported model coverage schema ' + manifest.schemaVersion);

for (const entry of manifest.entries) {
  const key = entry.providerId + ':' + entry.apiModelId;
  if (seen.has(key)) errors.push('duplicate coverage entry ' + key);
  seen.add(key);
  if (!sourceUrls.has(entry.sourceUrl))
    errors.push(key + ': source URL is not in the source registry');

  const activeOffers = offers.filter(
    (offer) =>
      offer.providerId === entry.providerId &&
      offer.apiModelId === entry.apiModelId &&
      offer.availability.status !== 'retired',
  );

  if (entry.status === 'tracked') {
    if (!entry.catalogModelId) errors.push(key + ': tracked entry needs catalogModelId');
    const model = models.find((candidate) => candidate.id === entry.catalogModelId);
    if (!model) errors.push(key + ': tracked model is missing from the catalog');
    else if (!model.sources.some((source) => source.url === entry.sourceUrl))
      errors.push(key + ': tracked model does not cite its coverage source');
    if (activeOffers.length === 0) errors.push(key + ': tracked offer is missing from the catalog');
    if (
      activeOffers.length > 0 &&
      !activeOffers.some((offer) =>
        offer.pricing.some((rule) => rule.unit === 'per_million_tokens'),
      )
    )
      errors.push(key + ': tracked offer has no token-priced rule');
  } else if (entry.status === 'deferred-non-token') {
    if (!entry.reason) errors.push(key + ': deferred entry needs a reason');
    if (activeOffers.length > 0)
      errors.push(key + ': deferred non-token model must not have an active offer');
  }
}

if (errors.length > 0) {
  console.error('Model coverage check failed with ' + errors.length + ' error(s):');
  for (const error of errors) console.error('- ' + error);
  process.exitCode = 1;
} else {
  const tracked = manifest.entries.filter((entry) => entry.status === 'tracked').length;
  const deferred = manifest.entries.filter((entry) => entry.status === 'deferred-non-token').length;
  console.log(
    'Model coverage passed: ' +
      tracked +
      ' official token models tracked, ' +
      deferred +
      ' non-token modalities explicitly deferred.',
  );
}
