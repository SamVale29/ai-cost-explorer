import { describe, expect, it } from 'vitest';
import type { OfferView } from '../types';
import { paretoFrontier, scoreOffers } from './pareto';

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

  it('scores only fields with verified measurements', () => {
    const first = {
      ...offer('first'),
      pricing: [
        {
          id: 'batch',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'batch' as const,
          inputPrice: 100,
          sources: [],
        },
        {
          id: 'standard',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 1,
          sources: [],
        },
      ],
    };
    const second = {
      ...offer('second'),
      pricing: [
        {
          id: 'standard',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 2,
          sources: [],
        },
      ],
    };
    const ranked = scoreOffers([first, second], { cost: 100, context: 0, resources: 0 });

    expect(ranked[0]?.offer.id).toBe('first');
    expect(ranked[0]?.score).toBe(0.5);
    expect(ranked[0]?.knownFields).toBe(1);
  });

  it('does not score unknown resources as a known zero', () => {
    const unknown = offer('unknown');
    const ranked = scoreOffers([unknown], { cost: 50, context: 30, resources: 20 });

    expect(ranked[0]?.score).toBeNull();
    expect(ranked[0]?.knownFields).toBe(0);
  });
});
