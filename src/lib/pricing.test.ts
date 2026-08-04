import { describe, expect, it } from 'vitest';
import type { OfferView } from '../types';
import { standardRule } from './pricing';

describe('standardRule', () => {
  it('does not expose non-token pricing as a token price', () => {
    const offer = {
      pricing: [
        {
          id: 'per-second',
          currency: 'USD' as const,
          unit: 'per_second' as const,
          mode: 'standard' as const,
          inputPrice: 0.01,
          sources: [],
        },
        {
          id: 'per-million',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 1,
          sources: [],
        },
      ],
    } as unknown as OfferView;

    expect(standardRule({ offer })?.id).toBe('per-million');
  });
});
