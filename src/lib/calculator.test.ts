import { describe, expect, it } from 'vitest';
import type { CalculatorInput, OfferView, PricingRule, SourceReference } from '../types';
import { calculateOfferCost, choosePricingRule, effectiveRequestsPerDay } from './calculator';

const source: SourceReference = {
  url: 'https://example.com/pricing',
  title: 'Official pricing',
  publisher: 'Example',
  sourceType: 'official-pricing',
  checkedAt: '2026-08-02',
};

const baseInput: CalculatorInput = {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cachedInputTokens: 200_000,
  cacheWriteTokens: 100_000,
  requestsPerDay: 10,
  daysPerMonth: 30,
  retryRate: 0.1,
  batchRate: 0.5,
};

function makeOffer(pricing: PricingRule[]): OfferView {
  return {
    id: 'offer-test',
    modelId: 'model-test',
    providerId: 'provider-test',
    apiModelId: 'test-model',
    availability: { status: 'active' },
    pricing,
    sources: [source],
    lastVerifiedAt: '2026-08-02',
    model: {
      id: 'model-test',
      organizationId: 'org-test',
      name: 'Test model',
      status: 'active',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_000,
      modalities: { input: ['text'], output: ['text'] },
      capabilities: { promptCaching: true, batchApi: true },
      sources: [source],
      lastVerifiedAt: '2026-08-02',
    },
    provider: { id: 'provider-test', name: 'Test provider', directProvider: true },
    organization: { id: 'org-test', name: 'Test organization' },
  };
}

const standardAndBatch: PricingRule[] = [
  {
    id: 'standard',
    currency: 'USD',
    unit: 'per_million_tokens',
    mode: 'standard',
    inputPrice: 2,
    cachedInputPrice: 0.5,
    cacheWritePrice: 1,
    outputPrice: 8,
    sources: [source],
  },
  {
    id: 'batch',
    currency: 'USD',
    unit: 'per_million_tokens',
    mode: 'batch',
    inputPrice: 1,
    cachedInputPrice: 0.25,
    cacheWritePrice: 0.5,
    outputPrice: 4,
    sources: [source],
  },
];

describe('calculator', () => {
  it('mixes standard, cache and batch prices using exact decimal arithmetic', () => {
    const result = calculateOfferCost(makeOffer(standardAndBatch), baseInput);

    expect(result.breakdown).toEqual({
      standardInput: 1.05,
      cachedInput: 0.075,
      cacheWrite: 0.075,
      output: 3,
      total: 4.2,
    });
    expect(result.adjustedRequestsPerDay).toBe(11);
    expect(result.monthlyCost).toBe(1386);
    expect(result.annualCost).toBe(16632);
    expect(result.warnings).toEqual([]);
  });

  it('selects the long-context tier at the boundary', () => {
    const rules: PricingRule[] = [
      { ...standardAndBatch[0], id: 'short', maximumInputTokens: 200_000 },
      { ...standardAndBatch[0], id: 'long', minimumInputTokens: 200_001, inputPrice: 3 },
    ];

    expect(choosePricingRule(rules, 'standard', 200_000)?.id).toBe('short');
    expect(choosePricingRule(rules, 'standard', 200_001)?.id).toBe('long');
  });

  it('keeps totals unknown when a used price component is not verified', () => {
    const rule: PricingRule = { ...standardAndBatch[0], outputPrice: null };
    const result = calculateOfferCost(makeOffer([rule]), baseInput);

    expect(result.monthlyCost).toBeNull();
    expect(result.warnings).toContain('Output price is not verified for this offer.');
    expect(result.warnings).toContain(
      'Monthly totals are unavailable until every used price component is verified.',
    );
  });

  it('does not require prices for zero-token cache components', () => {
    const rule: PricingRule = {
      ...standardAndBatch[0],
      cachedInputPrice: null,
      cacheWritePrice: null,
    };
    const result = calculateOfferCost(makeOffer([rule]), {
      ...baseInput,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      batchRate: 0,
    });

    expect(result.monthlyCost).toBe(1980);
    expect(result.breakdown.cachedInput).toBe(0);
    expect(result.breakdown.cacheWrite).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('does not use a batch price when the standard price is unknown', () => {
    const result = calculateOfferCost(
      makeOffer([
        { ...standardAndBatch[0], inputPrice: null },
        { ...standardAndBatch[1], inputPrice: 1 },
      ]),
      { ...baseInput, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, batchRate: 0 },
    );

    expect(result.breakdown.standardInput).toBeNull();
    expect(result.monthlyCost).toBeNull();
  });

  it('requires only the pricing mode used by a 0% or 100% batch mix', () => {
    const rules = [
      { ...standardAndBatch[0], inputPrice: null },
      { ...standardAndBatch[1], inputPrice: 1 },
    ];

    expect(
      calculateOfferCost(makeOffer(rules), {
        ...baseInput,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        batchRate: 1,
      }).monthlyCost,
    ).toBe(330);
  });

  it('normalizes cache buckets before pricing them', () => {
    const result = calculateOfferCost(makeOffer([standardAndBatch[0]]), {
      ...baseInput,
      inputTokens: 100,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      batchRate: 0,
    });

    expect(result.breakdown).toMatchObject({
      standardInput: 0,
      cachedInput: 0.00005,
      cacheWrite: 0,
    });
    expect(result.warnings).toContain(
      'Cache and cache-write tokens exceeded total input; cache hits take precedence and cache writes use the remaining input.',
    );
  });

  it('uses the derived workload dimensions in totals and exported assumptions', () => {
    expect(
      effectiveRequestsPerDay({
        ...baseInput,
        requestsPerDay: 1,
        users: 100,
        conversationsPerUser: 2,
        messagesPerConversation: 3,
      }),
    ).toBe(600);
  });

  it('ignores expired and future pricing rules', () => {
    const now = new Date('2026-08-04T12:00:00Z');
    const rules: PricingRule[] = [
      { ...standardAndBatch[0], id: 'expired', effectiveUntil: '2026-08-03T23:59:59Z' },
      { ...standardAndBatch[0], id: 'future', effectiveFrom: '2026-08-05T00:00:00Z' },
      {
        ...standardAndBatch[0],
        id: 'current',
        inputPrice: 3,
        effectiveFrom: '2026-08-04T00:00:00Z',
      },
    ];

    expect(choosePricingRule(rules, 'standard', 1_000_000, now)?.id).toBe('current');
  });

  it('keeps a date-only effectiveUntil valid through the end of that day', () => {
    const rules: PricingRule[] = [
      { ...standardAndBatch[0], id: 'introductory', effectiveUntil: '2026-08-31' },
      { ...standardAndBatch[0], id: 'successor', inputPrice: 3, effectiveFrom: '2026-09-01' },
    ];
    const at = (iso: string) => choosePricingRule(rules, 'standard', 1_000_000, new Date(iso))?.id;

    expect(at('2026-08-31T00:00:00Z')).toBe('introductory');
    expect(at('2026-08-31T23:59:59Z')).toBe('introductory');
    expect(at('2026-09-01T00:00:00Z')).toBe('successor');
    expect(at('2026-09-15T12:00:00Z')).toBe('successor');
  });

  it('does not simulate non-token pricing as token pricing', () => {
    const rule: PricingRule = {
      ...standardAndBatch[0],
      unit: 'per_request',
      inputPrice: 2,
      outputPrice: 8,
    };
    const result = calculateOfferCost(makeOffer([rule]), baseInput);

    expect(result.monthlyCost).toBeNull();
    expect(result.warnings).toContain(
      'This offer uses non-token pricing and cannot be simulated by token inputs.',
    );
  });
});
