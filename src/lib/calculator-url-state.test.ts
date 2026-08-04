import { describe, expect, it } from 'vitest';
import type { CalculatorInput } from '../types';
import { parseCalculatorUrl, serializeCalculatorUrl } from './calculator-url-state';

const input: CalculatorInput = {
  inputTokens: 5000,
  outputTokens: 1200,
  cachedInputTokens: 1500,
  cacheWriteTokens: 0,
  requestsPerDay: 25000,
  daysPerMonth: 30,
  retryRate: 0.03,
  batchRate: 0,
};

describe('calculator URL state', () => {
  it('round-trips workload assumptions, offers and mode', () => {
    const state = { input, selectedOfferIds: ['offer-a', 'offer-b'], mode: 'annual' as const };
    expect(parseCalculatorUrl(serializeCalculatorUrl(state))).toEqual(state);
  });

  it('rejects incomplete or unsafe query state', () => {
    expect(parseCalculatorUrl('?mode=monthly&in=100')).toBeNull();
    expect(
      parseCalculatorUrl(
        '?in=-1&out=1&cache=0&write=0&req=1&days=30&retry=0&batch=0&offers=x&mode=monthly',
      ),
    ).toBeNull();
    expect(
      parseCalculatorUrl(
        '?in=1&out=1&cache=0&write=0&req=1&days=30&retry=0&batch=0&offers=x&mode=hourly',
      ),
    ).toBeNull();
  });
});
