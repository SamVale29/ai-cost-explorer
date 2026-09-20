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

  it('selects the rule published for the requested date and context size', () => {
    const offer = {
      pricing: [
        {
          id: 'short-current',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 1,
          maximumInputTokens: 272_000,
          effectiveUntil: '2026-08-31',
          sources: [],
        },
        {
          id: 'long-current',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 2,
          minimumInputTokens: 272_001,
          effectiveFrom: '2026-08-01',
          sources: [],
        },
        {
          id: 'short-next',
          currency: 'USD' as const,
          unit: 'per_million_tokens' as const,
          mode: 'standard' as const,
          inputPrice: 3,
          maximumInputTokens: 272_000,
          effectiveFrom: '2026-09-01',
          sources: [],
        },
      ],
    } as unknown as OfferView;

    expect(
      standardRule({ offer }, { inputTokens: 272_000, asOf: new Date('2026-08-31T12:00:00Z') })?.id,
    ).toBe('short-current');
    expect(
      standardRule({ offer }, { inputTokens: 272_001, asOf: new Date('2026-08-31T12:00:00Z') })?.id,
    ).toBe('long-current');
    expect(
      standardRule({ offer }, { inputTokens: 272_000, asOf: new Date('2026-09-01T00:00:00Z') })?.id,
    ).toBe('short-next');
  });
});
