import { describe, expect, it } from 'vitest';
import type { Catalog } from '../types';
import { hydrateOffers, parseIds } from './catalog';

const catalog: Catalog = {
  schemaVersion: 'test',
  generatedAt: '2026-08-04T00:00:00Z',
  dataAsOf: '2026-08-04',
  organizations: [{ id: 'org', name: 'Organization' }],
  models: [
    {
      id: 'model',
      organizationId: 'org',
      name: 'Model',
      status: 'active',
      modalities: { input: ['text'], output: ['text'] },
      capabilities: {},
      sources: [],
      lastVerifiedAt: '2026-08-04',
    },
  ],
  providers: [{ id: 'provider', name: 'Provider', directProvider: true }],
  offers: [
    {
      id: 'offer',
      modelId: 'model',
      providerId: 'provider',
      apiModelId: 'model',
      availability: { status: 'active' },
      pricing: [],
      sources: [],
      lastVerifiedAt: '2026-08-04',
    },
    {
      id: 'orphan',
      modelId: 'missing',
      providerId: 'provider',
      apiModelId: 'missing',
      availability: { status: 'active' },
      pricing: [],
      sources: [],
      lastVerifiedAt: '2026-08-04',
    },
  ],
  benchmarks: [],
  history: [],
  sources: [],
};

describe('catalog helpers', () => {
  it('hydrates only offers with complete references', () => {
    expect(hydrateOffers(catalog).map((offer) => offer.id)).toEqual(['offer']);
    expect(hydrateOffers(catalog)[0]?.organization.name).toBe('Organization');
  });

  it('parses and trims comma-separated ids', () => {
    expect(parseIds(' offer-a,offer-b,, offer-c ')).toEqual(['offer-a', 'offer-b', 'offer-c']);
    expect(parseIds(null)).toEqual([]);
  });
});
