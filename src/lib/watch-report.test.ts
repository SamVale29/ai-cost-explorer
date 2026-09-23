import { expect, it } from 'vitest';
import { canAcceptBaseline, sourceCheckStatus } from './watch-report';

it('never accepts incomplete evidence in a full or single-source baseline update', () => {
  const complete = {
    ok: true,
    expectedSignals: 1,
    pricingSignals: 1,
    missingSignals: 0,
    signalStates: { price: 'present' as const },
  };
  const inconclusive = {
    ...complete,
    pricingSignals: 0,
    missingSignals: 1,
    signalStates: { price: 'ambiguous' as const },
  };
  expect(canAcceptBaseline([complete])).toBe(true);
  expect(canAcceptBaseline([])).toBe(false);
  expect(canAcceptBaseline([complete, inconclusive])).toBe(false);
  expect(canAcceptBaseline([{ ...complete, ok: false }])).toBe(false);
  expect(
    sourceCheckStatus({ ...complete, expectedSignals: 0, pricingSignals: 0, signalStates: {} }),
  ).toBe('reachability-only');
  expect(sourceCheckStatus(inconclusive)).toBe('inconclusive');
});
