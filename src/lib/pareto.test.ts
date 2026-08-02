import { describe, expect, it } from 'vitest';
import type { OfferView } from '../types';
import { paretoFrontier } from './pareto';

function offer(id: string): OfferView {
  return {
    id,
    modelId: id,
    providerId: 'provider',
    apiModelId: id,
    availability: { status: 'active' },
    pricing: [],
    sources: [],
    lastVerifiedAt: '2026-08-02',
    model: {
      id,
      organizationId: 'org',
      name: id,
      status: 'active',
      modalities: { input: ['text'], output: ['text'] },
      capabilities: {},
      sources: [],
      lastVerifiedAt: '2026-08-02',
    },
    provider: { id: 'provider', name: 'Provider', directProvider: true },
    organization: { id: 'org', name: 'Organization' },
  };
}

describe('pareto frontier', () => {
  it('keeps lower-cost/higher-context offers and removes dominated points', () => {
    const points = [
      { offer: offer('best'), x: 1, y: 100, dominated: false },
      { offer: offer('dominated'), x: 2, y: 90, dominated: false },
      { offer: offer('cheap'), x: 0.5, y: 50, dominated: false },
    ];

    expect(paretoFrontier(points).map((point) => point.offer.id)).toEqual(['best', 'cheap']);
  });
});
