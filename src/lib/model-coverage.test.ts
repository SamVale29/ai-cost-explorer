import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ModelRecord = {
  id: string;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
};

type PricingRecord = {
  mode: string;
  inputPrice?: number | null;
  cachedInputPrice?: number | null;
  outputPrice?: number | null;
  cacheWritePrice?: number | null;
  minimumInputTokens?: number | null;
  maximumInputTokens?: number | null;
};

type OfferRecord = {
  modelId: string;
  apiModelId: string;
  pricing: PricingRecord[];
};

const models = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/models/index.json'), 'utf8'),
) as ModelRecord[];
const offers = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/offers/index.json'), 'utf8'),
) as OfferRecord[];

function model(id: string): ModelRecord {
  const value = models.find((candidate) => candidate.id === id);
  if (!value) throw new Error('missing model ' + id);
  return value;
}

function offer(modelId: string): OfferRecord {
  const value = offers.find((candidate) => candidate.modelId === modelId);
  if (!value) throw new Error('missing offer for ' + modelId);
  return value;
}

describe('official model coverage', () => {
  it('keeps GPT-6 Astra pricing and the 272k boundary exact', () => {
    const value = model('gpt-6-astra');
    const pricing = offer(value.id);
    const short = pricing.pricing.find((rule) => rule.maximumInputTokens === 272_000);
    const long = pricing.pricing.find((rule) => rule.minimumInputTokens === 272_001);

    expect(value.contextWindowTokens).toBe(1_050_000);
    expect(value.maxOutputTokens).toBe(128_000);
    expect(pricing.apiModelId).toBe('gpt-6-astra');
    expect(short).toMatchObject({
      mode: 'standard',
      inputPrice: 10,
      cachedInputPrice: 1,
      cacheWritePrice: 12.5,
      outputPrice: 50,
    });
    expect(long).toMatchObject({
      mode: 'standard',
      inputPrice: 20,
      cachedInputPrice: 2,
      cacheWritePrice: 25,
      outputPrice: 75,
    });
  });

  it('keeps xAI 200k ranges and Batch support explicit', () => {
    const grok46 = offer('grok-4-6');
    const multi = offer('grok-4-20-multi-agent-0309');
    expect(grok46.apiModelId).toBe('grok-4.6');
    expect(grok46.pricing.map((rule) => rule.mode)).toEqual(['standard', 'standard']);
    expect(
      grok46.pricing.map((rule) => [
        rule.minimumInputTokens ?? null,
        rule.maximumInputTokens ?? null,
      ]),
    ).toEqual([
      [null, 199_999],
      [200_000, null],
    ]);
    expect(multi.apiModelId).toBe('grok-4.20-multi-agent-0309');
    expect(multi.pricing.filter((rule) => rule.mode === 'standard')).toHaveLength(2);
    expect(multi.pricing.filter((rule) => rule.mode === 'batch')).toHaveLength(2);
    expect(
      multi.pricing.every(
        (rule) => rule.minimumInputTokens === 200_000 || rule.maximumInputTokens === 199_999,
      ),
    ).toBe(true);
  });
});
