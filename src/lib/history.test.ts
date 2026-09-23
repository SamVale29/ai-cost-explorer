import { expect, it } from 'vitest';
import { historyEventLabel, historyPriceChanges } from './history';
import history from '../../data/history/index.json';
import type { PriceChangeEvent } from '../types';

it('distinguishes observations, price changes and retirements with old and new prices', () => {
  const events = history as PriceChangeEvent[];
  expect(historyEventLabel(events[0])).toBe('Initial observation');
  const change = events.find(
    (event) => event.id === 'offer-together-qwen-3-7-max-pricing-review-2026-09-23',
  )!;
  expect(historyEventLabel(change)).toBe('Price change');
  expect(historyPriceChanges(change).join(' ')).toContain('$2.50 → $1.50');
  expect(change.effectiveAt).toBeNull();
  expect(historyEventLabel(events.find((event) => event.eventType === 'retirement')!)).toBe(
    'Offer retired',
  );
});
