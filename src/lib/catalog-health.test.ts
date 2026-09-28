import { describe, expect, it } from 'vitest';
import type { Catalog } from '../types';
import { calculateCatalogHealth } from './catalog-health';

describe('catalog health', () => {
  it('reports coverage, source freshness and empty benchmark status', () => {
    const catalog = {
      schemaVersion: 'v1',
      generatedAt: '2026-08-02T00:00:00Z',
      dataAsOf: '2026-08-02',
      organizations: [{ id: 'org', name: 'Org' }],
      providers: [{ id: 'provider', name: 'Provider', directProvider: true }],
      models: [
        {
          id: 'model',
          organizationId: 'org',
          name: 'Model',
          status: 'active',
          modalities: { input: ['text'], output: ['text'] },
          capabilities: { functionCalling: true },
          sources: [],
          lastVerifiedAt: '2026-08-02',
          contextWindowTokens: 1000,
          maxOutputTokens: null,
        },
      ],
      offers: [
        {
          id: 'offer',
          modelId: 'model',
          providerId: 'provider',
          apiModelId: 'model',
          availability: { status: 'active' },
          pricing: [
            {
              id: 'standard',
              currency: 'USD',
              unit: 'per_million_tokens',
              mode: 'standard',
              inputPrice: 1,
              outputPrice: null,
              sources: [],
            },
          ],
          sources: [
            {
              url: 'https://example.com/offer',
              title: 'Offer',
              publisher: 'Org',
              sourceType: 'official-pricing',
              checkedAt: '2026-08-02',
            },
          ],
          lastVerifiedAt: '2026-08-02',
        },
      ],
      benchmarks: [],
      history: [],
      sources: [
        {
          url: 'https://example.com/fresh',
          title: 'Fresh',
          publisher: 'Org',
          sourceType: 'official-pricing',
          checkedAt: '2026-08-02',
        },
        {
          url: 'https://example.com/stale',
          title: 'Stale',
          publisher: 'Org',
          sourceType: 'official-pricing',
          checkedAt: '2026-05-01',
        },
      ],
    } as Catalog;

    const health = calculateCatalogHealth(catalog, new Date('2026-08-02T23:59:59.999Z'));
    expect(health.totals.directProviders).toBe(1);
    expect(health.coverage.offersWithStandardInputPrice).toBe(100);
    expect(health.coverage.offersWithStandardOutputPrice).toBe(0);
    expect(health.coverage.modelsWithContextWindow).toBe(100);
    expect(health.coverage.modelsWithMaxOutput).toBe(0);
    expect(health.coverage.modelsWithCapabilitiesListed).toBe(100);
    expect(health.coverage.modelsWithFieldEvidence).toBe(0);
    expect(health.snapshotAgeDays).toBe(0);
    expect(health.freshness.freshSources).toBe(1);
    expect(health.freshness.staleSources).toBe(1);
    expect(health.benchmarkStatus).toBe('empty');
  });

  it('counts field-to-source evidence separately from a listed capability value', () => {
    const catalog = {
      schemaVersion: 'v1',
      generatedAt: '2026-08-02T00:00:00Z',
      dataAsOf: '2026-08-02',
      organizations: [],
      providers: [],
      models: [
        {
          id: 'model',
          organizationId: 'org',
          name: 'Model',
          status: 'active',
          modalities: { input: ['text'], output: ['text'] },
          capabilities: { functionCalling: true },
          evidenceByField: {
            'capabilities.functionCalling': [
              {
                url: 'https://example.com/model',
                title: 'Model docs',
                publisher: 'Example',
                sourceType: 'official-documentation',
                checkedAt: '2026-08-02',
              },
            ],
          },
          sources: [],
          lastVerifiedAt: '2026-08-02',
        },
      ],
      offers: [],
      benchmarks: [],
      history: [],
      sources: [],
    } as Catalog;

    const health = calculateCatalogHealth(catalog, new Date('2026-08-02T23:59:59.999Z'));
    expect(health.coverage.modelsWithCapabilitiesListed).toBe(100);
    expect(health.coverage.modelsWithFieldEvidence).toBe(100);
  });
});
