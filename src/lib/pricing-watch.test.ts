import { describe, expect, it } from 'vitest';
import type { PricingSignal } from './pricing-watch';
import { countPricingSignals, pricingFingerprint, pricingSignalEvidence } from './pricing-watch';

function signal(overrides: Partial<PricingSignal> = {}): PricingSignal {
  return {
    offerId: 'offer-model-a',
    ruleId: 'model-a-standard',
    modelId: 'model-a',
    modelName: 'Model A',
    apiModelId: 'provider/model-a',
    mode: 'standard',
    component: 'input',
    value: 1,
    minimumInputTokens: null,
    maximumInputTokens: null,
    ...overrides,
  };
}

describe('pricing watch semantic evidence', () => {
  it('binds each component to its explicit table column', () => {
    const signals = [signal(), signal({ component: 'output', value: 2 })];
    const original =
      '<table><tr><th>Model</th><th>Input</th><th>Output</th></tr><tr><td>Model A</td><td>$1.00</td><td>$2.00</td></tr></table>';
    const swapped =
      '<table><tr><th>Model</th><th>Input</th><th>Output</th></tr><tr><td>Model A</td><td>$2.00</td><td>$1.00</td></tr></table>';

    expect(countPricingSignals(original, signals)).toBe(2);
    expect(countPricingSignals(swapped, signals)).toBe(0);
    expect(pricingFingerprint(original, signals)).not.toBe(pricingFingerprint(swapped, signals));
    expect(pricingSignalEvidence(swapped, signals).map(({ status }) => status)).toEqual([
      'missing',
      'missing',
    ]);
  });

  it('keeps a changed later model inside its own row boundary', () => {
    const signals = [
      signal(),
      signal({
        offerId: 'offer-model-b',
        ruleId: 'model-b-standard',
        modelId: 'model-b',
        modelName: 'Model B',
        apiModelId: 'provider/model-b',
      }),
    ];
    const original =
      '<table><tr><th>Model</th><th>Input</th></tr><tr><td>Model A</td><td>$1.00</td></tr><tr><td>Model B</td><td>$1.00</td></tr></table>';
    const changed =
      '<table><tr><th>Model</th><th>Input</th></tr><tr><td>Model A</td><td>$1.00</td></tr><tr><td>Model B</td><td>$2.00</td></tr></table>';

    expect(countPricingSignals(original, signals)).toBe(2);
    expect(countPricingSignals(changed, signals)).toBe(1);
    expect(pricingSignalEvidence(changed, signals).map(({ status }) => status)).toEqual([
      'present',
      'missing',
    ]);
  });

  it('associates standard and batch values with the row mode', () => {
    const signals = [
      signal(),
      signal({
        ruleId: 'model-a-batch',
        mode: 'batch',
        value: 0.5,
      }),
    ];
    const original =
      '<table><tr><th>Model</th><th>Mode</th><th>Input</th></tr><tr><td>Model A</td><td>standard</td><td>$1.00</td></tr><tr><td>Model A</td><td>batch</td><td>$0.50</td></tr></table>';
    const swapped =
      '<table><tr><th>Model</th><th>Mode</th><th>Input</th></tr><tr><td>Model A</td><td>standard</td><td>$0.50</td></tr><tr><td>Model A</td><td>batch</td><td>$1.00</td></tr></table>';

    expect(countPricingSignals(original, signals)).toBe(2);
    expect(countPricingSignals(swapped, signals)).toBe(0);
  });

  it('does not accept a global value when the record has no component column', () => {
    const signals = [signal()];
    const body = '<div>Model A</div><div>Input price is published separately</div><div>$1.00</div>';

    expect(countPricingSignals(body, signals)).toBe(0);
    expect(pricingSignalEvidence(body, signals)[0].status).toBe('ambiguous');
  });

  it('marks a long-context signal only in its matching range', () => {
    const signals = [
      signal({ maximumInputTokens: 200000, inputModality: 'text', value: 1.25 }),
      signal({
        ruleId: 'model-a-standard-long',
        value: 2,
        minimumInputTokens: 200001,
        inputModality: 'text',
      }),
    ];
    const body =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Input price</td><td>Free</td><td>$1.25, prompts <= 200k tokens<br>$2.00, prompts > 200k tokens</td></tr></table>';

    expect(countPricingSignals(body, signals)).toBe(2);
  });

  it('rejects a changed numeric context threshold instead of treating it as the same range', () => {
    const signals = [
      signal({
        ruleId: 'model-a-standard-long',
        value: 1,
        minimumInputTokens: 200001,
        inputModality: 'text',
      }),
    ];
    const before =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th>Model</th><th>Input long context &gt; 200000 tokens</th></tr><tr><td>Model A</td><td>$1.00</td></tr></table>';
    const after =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th>Model</th><th>Input long context &gt; 300000 tokens</th></tr><tr><td>Model A</td><td>$1.00</td></tr></table>';

    expect(pricingSignalEvidence(before, signals)[0].status).toBe('present');
    expect(pricingSignalEvidence(after, signals)[0].status).not.toBe('present');
    expect(pricingFingerprint(before, signals)).not.toBe(pricingFingerprint(after, signals));
  });

  it('aligns grouped HTML headers with leading model and context columns', () => {
    const signals = [
      signal({ value: 1, maximumInputTokens: 199999 }),
      signal({ component: 'cachedInput', value: 0.5, maximumInputTokens: 199999 }),
      signal({ component: 'output', value: 2, maximumInputTokens: 199999 }),
      signal({ ruleId: 'model-a-long', value: 2, minimumInputTokens: 200000 }),
      signal({
        ruleId: 'model-a-long-cache',
        component: 'cachedInput',
        value: 1,
        minimumInputTokens: 200000,
      }),
      signal({
        ruleId: 'model-a-long-output',
        component: 'output',
        value: 4,
        minimumInputTokens: 200000,
      }),
    ];
    const body =
      '<table><tr><th rowspan="2">Model</th><th rowspan="2">Context</th><th colspan="3">Short context</th><th colspan="3">Long context</th></tr><tr><th>Input</th><th>Cached</th><th>Output</th><th>Input</th><th>Cached</th><th>Output</th></tr><tr><td>Model A</td><td>500k</td><td>$1.00</td><td>$0.50</td><td>$2.00</td><td>$2.00</td><td>$1.00</td><td>$4.00</td></tr></table>';

    expect(countPricingSignals(body, signals)).toBe(6);
  });

  it('reads xAI Batch prices from the official embedded model payload', () => {
    const signals = [
      signal({
        ruleId: 'model-a-batch-short',
        mode: 'batch',
        value: 1,
        maximumInputTokens: 199999,
      }),
      signal({
        ruleId: 'model-a-batch-short-cache',
        mode: 'batch',
        component: 'cachedInput',
        value: 0.16,
        maximumInputTokens: 199999,
      }),
      signal({
        ruleId: 'model-a-batch-short-output',
        mode: 'batch',
        component: 'output',
        value: 2,
        maximumInputTokens: 199999,
      }),
      signal({
        ruleId: 'model-a-batch-long',
        mode: 'batch',
        value: 2,
        minimumInputTokens: 200000,
      }),
      signal({
        ruleId: 'model-a-batch-long-cache',
        mode: 'batch',
        component: 'cachedInput',
        value: 0.32,
        minimumInputTokens: 200000,
      }),
      signal({
        ruleId: 'model-a-batch-long-output',
        mode: 'batch',
        component: 'output',
        value: 4,
        minimumInputTokens: 200000,
      }),
    ];
    const body =
      '<script>globalThis.__XAI_PUBLIC_MODELS__={"clusterConfigs":[{"languageModels":[{"name":"Model A","promptTextTokenPrice":"12500","promptTextTokenPriceLongContext":"25000","cachedPromptTokenPrice":"2000","cachedPromptTokenPriceLongContext":"4000","completionTextTokenPrice":"25000","completionTokenPriceLongContext":"50000","batchDiscountPercent":20,"batchEnabled":true}]}]};</script>';

    expect(countPricingSignals(body, signals)).toBe(6);
  });

  it('binds a multi-value cell to the signal modality', () => {
    const signals = [
      signal({ inputModality: 'text' }),
      signal({ inputModality: 'audio', value: 2 }),
    ];
    const body =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th>Tier</th><th>Input price</th></tr><tr><td>Paid</td><td>$1.00 (text)<br>$2.00 (audio)</td></tr></table>';

    expect(countPricingSignals(body, signals)).toBe(2);
    expect(pricingSignalEvidence(body, signals).map(({ status }) => status)).toEqual([
      'present',
      'present',
    ]);
  });

  it('recognizes context caching rows as cached input', () => {
    const signals = [signal({ component: 'cachedInput', value: 0.01, inputModality: 'text' })];
    const body =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Context caching price</td><td>Not available</td><td>$0.01 (text / image / video)<br>$0.03 (audio)<br>$1.00 / 1,000,000 tokens per hour (storage price)</td></tr></table>';

    expect(countPricingSignals(body, signals)).toBe(1);
  });

  it('does not confuse cache storage pricing with token pricing', () => {
    const signals = [
      signal({
        component: 'cachedInput',
        value: 0.125,
        maximumInputTokens: 200000,
        inputModality: 'text',
      }),
      signal({
        component: 'cachedInput',
        value: 0.25,
        minimumInputTokens: 200001,
        inputModality: 'text',
      }),
    ];
    const body =
      '<h2>Model A</h2><h3>Standard</h3><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Context caching price</td><td>Not available</td><td>$0.125, prompts <= 200k tokens<br>$0.25, prompts > 200k tokens<br>$4.50 / 1,000,000 tokens per hour (storage price)</td></tr></table>';

    expect(countPricingSignals(body, signals)).toBe(2);
  });
});
