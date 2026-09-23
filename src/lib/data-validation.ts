import { z } from 'zod';

const HTTP_URL = z
  .string()
  .url()
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'must be an HTTP(S) URL',
  });
const NON_EMPTY = z.string().min(1);
const FINITE_NON_NEGATIVE = z.number().finite().nonnegative();
const DATE_VALUE = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'must be a valid date',
  });
const OPTIONAL_DATE = DATE_VALUE.nullable().optional();

const sourceType = z.enum([
  'official-pricing',
  'official-documentation',
  'official-release',
  'benchmark',
  'community',
]);
const status = z.enum(['active', 'preview', 'deprecated', 'retired']);
const pricingMode = z.enum([
  'standard',
  'batch',
  'priority',
  'flex',
  'fast',
  'realtime',
  'peak',
  'off-peak',
]);
const pricingUnit = z.enum(['per_million_tokens', 'per_request', 'per_second', 'per_image']);

export const sourceReferenceSchema = z
  .object({
    url: HTTP_URL,
    title: NON_EMPTY,
    publisher: NON_EMPTY,
    sourceType,
    checkedAt: DATE_VALUE,
    retrievedAt: OPTIONAL_DATE,
    archivedUrl: HTTP_URL.nullable().optional(),
    notes: z.string().optional(),
  })
  .strict();

const capabilitiesSchema = z
  .object({
    reasoning: z.boolean().nullable().optional(),
    functionCalling: z.boolean().nullable().optional(),
    structuredOutputs: z.boolean().nullable().optional(),
    promptCaching: z.boolean().nullable().optional(),
    batchApi: z.boolean().nullable().optional(),
    fineTuning: z.boolean().nullable().optional(),
    embeddings: z.boolean().nullable().optional(),
    realtime: z.boolean().nullable().optional(),
    webSearch: z.boolean().nullable().optional(),
    computerUse: z.boolean().nullable().optional(),
  })
  .strict();

const modalitiesSchema = z
  .object({
    input: z.array(z.enum(['text', 'image', 'audio', 'video', 'file'])).min(1),
    output: z.array(z.enum(['text', 'image', 'audio', 'video'])).min(1),
  })
  .strict();

export const organizationSchema = z
  .object({
    id: NON_EMPTY,
    name: NON_EMPTY,
    website: HTTP_URL.optional(),
    country: NON_EMPTY.optional(),
  })
  .strict();

export const providerSchema = z
  .object({
    id: NON_EMPTY,
    name: NON_EMPTY,
    website: HTTP_URL.optional(),
    pricingPage: HTTP_URL.optional(),
    documentationPage: HTTP_URL.optional(),
    directProvider: z.boolean(),
  })
  .strict();

export const modelSchema = z
  .object({
    id: NON_EMPTY,
    organizationId: NON_EMPTY,
    name: NON_EMPTY,
    family: NON_EMPTY.optional(),
    status,
    releaseDate: OPTIONAL_DATE,
    knowledgeCutoff: OPTIONAL_DATE,
    contextWindowTokens: FINITE_NON_NEGATIVE.nullable().optional(),
    contextWindowScope: z.enum(['input', 'combined']).optional(),
    maxOutputTokens: FINITE_NON_NEGATIVE.nullable().optional(),
    modalities: modalitiesSchema,
    capabilities: capabilitiesSchema,
    sources: z.array(sourceReferenceSchema).min(1),
    lastVerifiedAt: DATE_VALUE,
  })
  .strict()
  .superRefine((model, context) => {
    if (model.contextWindowTokens === 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextWindowTokens'],
        message: 'must be positive',
      });
    if (model.maxOutputTokens === 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxOutputTokens'],
        message: 'must be positive',
      });
  });

const priceField = FINITE_NON_NEGATIVE.nullable().optional();

export const pricingRuleSchema = z
  .object({
    id: NON_EMPTY,
    currency: z.literal('USD'),
    unit: pricingUnit,
    mode: pricingMode,
    inputPrice: priceField,
    outputPrice: priceField,
    cachedInputPrice: priceField,
    cacheWritePrice: priceField,
    audioInputPrice: priceField,
    audioOutputPrice: priceField,
    imageInputPrice: priceField,
    imageOutputPrice: priceField,
    minimumInputTokens: FINITE_NON_NEGATIVE.nullable().optional(),
    maximumInputTokens: FINITE_NON_NEGATIVE.nullable().optional(),
    effectiveFrom: OPTIONAL_DATE,
    effectiveUntil: OPTIONAL_DATE,
    notes: z.string().optional(),
    sources: z.array(sourceReferenceSchema).min(1),
  })
  .strict()
  .superRefine((rule, context) => {
    const minimum = rule.minimumInputTokens ?? 0;
    const maximum = rule.maximumInputTokens ?? Number.POSITIVE_INFINITY;
    if (minimum > maximum)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maximumInputTokens'],
        message: 'must be at least minimumInputTokens',
      });
    if (
      rule.effectiveFrom &&
      rule.effectiveUntil &&
      new Date(rule.effectiveFrom) > new Date(rule.effectiveUntil)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveUntil'],
        message: 'must not precede effectiveFrom',
      });
  });

export const offerSchema = z
  .object({
    id: NON_EMPTY,
    modelId: NON_EMPTY,
    providerId: NON_EMPTY,
    apiModelId: NON_EMPTY,
    availability: z.object({ status, regions: z.array(NON_EMPTY).optional() }).strict(),
    pricing: z.array(pricingRuleSchema).min(1),
    rateLimits: z
      .object({
        requestsPerMinute: FINITE_NON_NEGATIVE.nullable().optional(),
        inputTokensPerMinute: FINITE_NON_NEGATIVE.nullable().optional(),
        outputTokensPerMinute: FINITE_NON_NEGATIVE.nullable().optional(),
        notes: z.string().optional(),
      })
      .strict()
      .optional(),
    sources: z.array(sourceReferenceSchema).min(1),
    lastVerifiedAt: DATE_VALUE,
  })
  .strict()
  .superRefine((offer, context) => {
    const ids = new Set<string>();
    for (const [index, rule] of offer.pricing.entries()) {
      if (ids.has(rule.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricing', index, 'id'],
          message: `duplicate pricing rule id ${rule.id}`,
        });
      ids.add(rule.id);
    }
  });

export const benchmarkSchema = z
  .object({
    id: NON_EMPTY,
    offerId: NON_EMPTY,
    benchmarkVersion: NON_EMPTY,
    measuredAt: DATE_VALUE,
    region: NON_EMPTY.optional(),
    concurrency: z.number().int().positive(),
    repetitions: z.number().int().min(5),
    inputTokens: FINITE_NON_NEGATIVE.optional(),
    outputTokens: FINITE_NON_NEGATIVE.optional(),
    timeToFirstTokenMsP50: FINITE_NON_NEGATIVE.nullable().optional(),
    timeToFirstTokenMsP95: FINITE_NON_NEGATIVE.nullable().optional(),
    outputTokensPerSecondP50: FINITE_NON_NEGATIVE.nullable().optional(),
    outputTokensPerSecondP95: FINITE_NON_NEGATIVE.nullable().optional(),
    totalLatencyMsP50: FINITE_NON_NEGATIVE.nullable().optional(),
    sourceType: z.enum(['project-run', 'community', 'external']),
    methodologyUrl: HTTP_URL,
    sourceUrl: HTTP_URL.optional(),
    notes: z.string().optional(),
  })
  .strict();

export const priceChangeEventSchema = z
  .object({
    id: NON_EMPTY,
    offerId: NON_EMPTY,
    detectedAt: DATE_VALUE,
    effectiveAt: OPTIONAL_DATE,
    eventType: z.enum(['initial', 'price-change', 'retirement']).optional(),
    previousPricing: z.array(pricingRuleSchema),
    currentPricing: z.array(pricingRuleSchema).min(1),
    source: sourceReferenceSchema,
    commitSha: NON_EMPTY.optional(),
    notes: z.string().optional(),
  })
  .strict();

export const dataSetSchema = z
  .object({
    organizations: z.array(organizationSchema),
    providers: z.array(providerSchema),
    models: z.array(modelSchema),
    offers: z.array(offerSchema),
    sources: z.array(sourceReferenceSchema),
    benchmarks: z.array(benchmarkSchema),
    history: z.array(priceChangeEventSchema),
  })
  .strict();

export const catalogSchema = dataSetSchema.extend({
  schemaVersion: z.literal('v1'),
  generatedAt: DATE_VALUE,
  dataAsOf: DATE_VALUE,
});

type ParsedDataSet = z.infer<typeof dataSetSchema>;

function duplicateIds(items: Array<{ id: string }>, label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
  return `${issue.message}${path}`;
}

function validateRelations(data: ParsedDataSet): string[] {
  const errors: string[] = [];
  duplicateIds(data.organizations, 'organizations', errors);
  duplicateIds(data.providers, 'providers', errors);
  duplicateIds(data.models, 'models', errors);
  duplicateIds(data.offers, 'offers', errors);
  const organizationIds = new Set(data.organizations.map((item) => item.id));
  const providerIds = new Set(data.providers.map((item) => item.id));
  const modelIds = new Set(data.models.map((item) => item.id));
  const offerIds = new Set(data.offers.map((item) => item.id));
  const sourceUrls = new Set<string>();
  for (const source of data.sources) {
    if (sourceUrls.has(source.url)) errors.push(`sources: duplicate URL ${source.url}`);
    sourceUrls.add(source.url);
  }
  for (const model of data.models)
    if (!organizationIds.has(model.organizationId))
      errors.push(`model ${model.id}: missing organization ${model.organizationId}`);
  for (const offer of data.offers) {
    if (!modelIds.has(offer.modelId))
      errors.push(`offer ${offer.id}: missing model ${offer.modelId}`);
    if (!providerIds.has(offer.providerId))
      errors.push(`offer ${offer.id}: missing provider ${offer.providerId}`);
  }
  for (const benchmark of data.benchmarks)
    if (!offerIds.has(benchmark.offerId))
      errors.push(`benchmark ${benchmark.id}: missing offer ${benchmark.offerId}`);
  for (const event of data.history)
    if (!offerIds.has(event.offerId))
      errors.push(`history ${event.id}: missing offer ${event.offerId}`);
  return errors;
}

export function validateDataSet(value: unknown): string[] {
  const parsed = dataSetSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(formatIssue);
  return validateRelations(parsed.data);
}
