import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Model, Offer, Provider, SourceReference } from '../src/types';
import { normalizeApiModelId } from '../src/lib/model-discovery';

type CoverageStatus =
  | 'tracked'
  | 'pending-review'
  | 'out-of-scope'
  | 'deferred-non-token'
  | 'restricted'
  | 'retired'
  | 'not-listed';
type CoverageEntry = {
  providerId: string;
  apiModelId: string;
  catalogModelId?: string;
  status: CoverageStatus;
  sourceUrl: string;
  reason?: string;
};
type CoverageManifest = {
  schemaVersion: 'v2';
  reviewedAt: string;
  providers: Array<{ providerId: string; reviewedAt: string; sourceUrl: string; summary: string }>;
  entries: CoverageEntry[];
};

const root = resolve(process.cwd());
async function load<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
}

const [manifest, providers, models, offers, sources] = await Promise.all([
  load<CoverageManifest>('data/sources/model-coverage.json'),
  load<Provider[]>('data/providers/index.json'),
  load<Model[]>('data/models/index.json'),
  load<Offer[]>('data/offers/index.json'),
  load<SourceReference[]>('data/sources/index.json'),
]);
const sourceUrls = new Set(sources.map((source) => source.url));
const providerIds = new Set(providers.map((provider) => provider.id));
const errors: string[] = [];
const seen = new Set<string>();
const maxReviewAgeDays = Number(
  process.argv.find((argument) => argument.startsWith('--max-age-days='))?.split('=')[1] ?? 30,
);
const today = Date.now();
const ageDays = (date: string) =>
  Math.floor((today - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);

function sourceIsInCatalog(entry: CoverageEntry, related: Offer[]): boolean {
  return related.some((offer) =>
    [...offer.sources, ...offer.pricing.flatMap((rule) => rule.sources)].some(
      (source) => source.url === entry.sourceUrl,
    ),
  );
}

if (manifest.schemaVersion !== 'v2')
  errors.push(`unsupported model coverage schema ${manifest.schemaVersion}`);
if (Number.isNaN(Date.parse(`${manifest.reviewedAt}T00:00:00Z`)))
  errors.push('manifest reviewedAt must be a valid date');

const reviews = new Map<string, CoverageManifest['providers'][number]>();
for (const review of manifest.providers ?? []) {
  if (!providerIds.has(review.providerId))
    errors.push(`review references unknown provider ${review.providerId}`);
  if (reviews.has(review.providerId))
    errors.push(`duplicate provider inventory ${review.providerId}`);
  reviews.set(review.providerId, review);
  if (!sourceUrls.has(review.sourceUrl))
    errors.push(`${review.providerId}: inventory source is not registered`);
  const age = ageDays(review.reviewedAt);
  if (!Number.isFinite(age)) errors.push(`${review.providerId}: invalid reviewedAt date`);
  else if (age < 0) errors.push(`${review.providerId}: reviewedAt is in the future`);
  else if (age > maxReviewAgeDays)
    errors.push(`${review.providerId}: inventory is ${age} days old (maximum ${maxReviewAgeDays})`);
  if (!review.summary.trim()) errors.push(`${review.providerId}: inventory summary is required`);
}
for (const provider of providers)
  if (!reviews.has(provider.id))
    errors.push(`provider ${provider.id} has no current inventory review`);

for (const entry of manifest.entries ?? []) {
  const normalizedId = normalizeApiModelId(entry.apiModelId);
  const key = `${entry.providerId}:${normalizedId}`;
  if (!providerIds.has(entry.providerId)) errors.push(`${key}: unknown provider`);
  if (seen.has(key)) errors.push(`duplicate coverage decision ${key}`);
  seen.add(key);
  if (!normalizedId) errors.push(`${key}: API model ID cannot be empty`);
  if (!sourceUrls.has(entry.sourceUrl))
    errors.push(`${key}: source URL is not in the source registry`);
  if (!['tracked', 'pending-review'].includes(entry.status) && !entry.reason?.trim())
    errors.push(`${key}: ${entry.status} decision needs an explanation`);

  const related = offers.filter(
    (offer) =>
      offer.providerId === entry.providerId &&
      normalizeApiModelId(offer.apiModelId) === normalizedId,
  );
  const live = related.filter((offer) => offer.availability.status !== 'retired');
  if (entry.status === 'tracked') {
    if (!entry.catalogModelId) errors.push(`${key}: tracked decision needs catalogModelId`);
    const model = models.find((candidate) => candidate.id === entry.catalogModelId);
    if (!model) errors.push(`${key}: tracked model is missing from the catalog`);
    else if (model.id !== live[0]?.modelId)
      errors.push(`${key}: tracked model ID does not match the active offer`);
    if (live.length !== 1) errors.push(`${key}: tracked decision needs exactly one active offer`);
    else {
      const offer = live[0]!;
      if (!offer.pricing.some((rule) => rule.unit === 'per_million_tokens'))
        errors.push(`${key}: tracked token offer has no token-priced rule`);
      if (!sourceIsInCatalog(entry, live))
        errors.push(`${key}: coverage source is not cited by the offer or its pricing`);
      for (const rule of offer.pricing) {
        if (
          rule.priceStatus === 'contact-sales' &&
          (rule.inputPrice != null || rule.outputPrice != null)
        )
          errors.push(`${key}: contact-sales rule must not claim public input/output prices`);
        if (
          rule.priceStatus === 'not-published' &&
          (rule.inputPrice != null || rule.outputPrice != null)
        )
          errors.push(`${key}: not-published rule must keep input/output prices unknown`);
      }
    }
  } else if (entry.status === 'retired') {
    if (!related.some((offer) => offer.availability.status === 'retired'))
      errors.push(`${key}: retired decision has no retired catalog offer`);
    if (live.length > 0) errors.push(`${key}: retired decision also has an active offer`);
    const replacementId = related.find((offer) => offer.availability.status === 'retired')
      ?.availability.replacementOfferId;
    if (
      replacementId &&
      !offers.some((offer) => offer.id === replacementId && offer.availability.status !== 'retired')
    )
      errors.push(`${key}: retired offer replacement is missing or retired`);
  } else if (entry.status === 'deferred-non-token') {
    if (live.some((offer) => offer.pricing.some((rule) => rule.unit === 'per_million_tokens')))
      errors.push(`${key}: non-token deferral conflicts with a token-priced offer`);
  } else if (entry.status === 'restricted') {
    if (live.length > 0)
      errors.push(
        `${key}: restricted candidate should not be listed as a generally available offer`,
      );
  } else if (['out-of-scope', 'not-listed'].includes(entry.status)) {
    if (live.length > 0) errors.push(`${key}: ${entry.status} candidate has an active offer`);
  }
}

for (const offer of offers) {
  const key = `${offer.providerId}:${normalizeApiModelId(offer.apiModelId)}`;
  if (!seen.has(key)) errors.push(`${key}: catalog offer has no coverage decision`);
}

if (errors.length > 0) {
  console.error(`Model coverage check failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const counts = new Map<CoverageStatus, number>();
  for (const entry of manifest.entries)
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  console.log(
    `Model coverage passed: ${reviews.size} provider inventories; ` +
      [...counts].map(([status, count]) => `${count} ${status}`).join(', ') +
      '.',
  );
}
