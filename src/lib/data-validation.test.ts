import { describe, expect, it } from 'vitest';
import { validateDataSet } from './data-validation';

const source = {
  url: 'https://example.com/pricing',
  title: 'Official pricing',
  publisher: 'Example',
  sourceType: 'official-pricing',
  checkedAt: '2026-09-19',
};

function dataSet() {
  return {
    organizations: [{ id: 'example', name: 'Example' }],
    providers: [{ id: 'example', name: 'Example API', directProvider: true }],
    models: [
      {
        id: 'example-model',
        organizationId: 'example',
        name: 'Example model',
        status: 'active',
        modalities: { input: ['text'], output: ['text'] },
        capabilities: { functionCalling: null },
        sources: [source],
        lastVerifiedAt: '2026-09-19',
      },
    ],
    offers: [
      {
        id: 'example-offer',
        modelId: 'example-model',
        providerId: 'example',
        apiModelId: 'example-model',
        availability: { status: 'active' },
        pricing: [
          {
            id: 'example-standard',
            currency: 'USD',
            unit: 'per_million_tokens',
            mode: 'standard',
            inputPrice: 1,
            outputPrice: 2,
            sources: [source],
          },
        ],
        sources: [source],
        lastVerifiedAt: '2026-09-19',
      },
    ],
    sources: [source],
    benchmarks: [],
    history: [],
  };
}

describe('catalog data validation', () => {
  it('accepts a structurally valid dataset and checks relationships', () => {
    expect(validateDataSet(dataSet())).toEqual([]);
  });

  it('rejects invalid types, enums, dates and empty rule sources', () => {
    const invalid = dataSet();
    invalid.offers[0].pricing[0].inputPrice = 'not-a-number' as never;
    invalid.offers[0].pricing[0].currency = 'INVALID' as never;
    invalid.offers[0].pricing[0].sources = [];
    invalid.offers[0].lastVerifiedAt = 'not-a-date';

    const errors = validateDataSet(invalid);
    expect(errors.some((error) => error.includes('inputPrice'))).toBe(true);
    expect(errors.some((error) => /Invalid (enum value|literal value)/.test(error))).toBe(true);
    expect(errors.some((error) => error.includes('sources'))).toBe(true);
    expect(errors.some((error) => error.includes('valid date'))).toBe(true);
  });

  it('rejects missing model and provider references', () => {
    const invalid = dataSet();
    invalid.offers[0].modelId = 'missing-model';
    invalid.offers[0].providerId = 'missing-provider';

    expect(validateDataSet(invalid)).toEqual([
      'offer example-offer: missing model missing-model',
      'offer example-offer: missing provider missing-provider',
    ]);
  });
});
