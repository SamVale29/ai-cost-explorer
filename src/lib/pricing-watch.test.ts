import { describe, expect, it } from 'vitest';
import type { PricingSignal } from './pricing-watch';
import { countPricingSignals, pricingFingerprint, pricingSignalEvidence } from './pricing-watch';

const signals: PricingSignal[] = [
  {
    offerId: 'offer-model-a',
    ruleId: 'model-a-standard',
    modelId: 'model-a',
    modelName: 'Model A',
    apiModelId: 'provider/model-a',
    mode: 'standard',
    component: 'input',
    value: 1,
  },
  {
    offerId: 'offer-model-b',
    ruleId: 'model-b-standard',
    modelId: 'model-b',
    modelName: 'Model B',
    apiModelId: 'provider/model-b',
    mode: 'standard',
    component: 'input',
    value: 1,
  },
];

describe('pricing watch semantic evidence', () => {
  it('binds a price value to the model that publishes it', () => {
    const original =
      '<tr><td>Model A</td><td>$1.00</td></tr><tr><td>Model B</td><td>$1.00</td></tr>';
    const changed =
      '<tr><td>Model A</td><td>$2.00</td></tr><tr><td>Model B</td><td>$1.00</td></tr>';

    expect(countPricingSignals(original, signals)).toBe(2);
    expect(countPricingSignals(changed, signals)).toBe(1);
    expect(pricingFingerprint(original, signals)).not.toBe(pricingFingerprint(changed, signals));

    const evidence = pricingSignalEvidence(changed, signals);
    expect(evidence.map(({ status }) => status)).toEqual(['missing', 'present']);
  });

  it('reports missing model-scoped evidence instead of accepting a global value', () => {
    const body = '<tr><td>Unrelated model</td><td>$1.00</td></tr>';

    expect(countPricingSignals(body, signals)).toBe(0);
    expect(pricingSignalEvidence(body, signals).every(({ status }) => status === 'missing')).toBe(
      true,
    );
  });
});
