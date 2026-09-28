import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ModelRecord = {
  id: string;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  modalities: { input: string[]; output: string[] };
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
  id: string;
  modelId: string;
  providerId: string;
  apiModelId: string;
  availability: {
    status: string;
    accountEligibility?: string;
    notes?: string;
    replacementOfferId?: string;
  };
  availabilityVerifiedAt?: string;
  pricingVerifiedAt?: string;
  modalities?: { input: string[]; output: string[] };
  pricing: PricingRecord[];
};

const models = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/models/index.json'), 'utf8'),
) as ModelRecord[];
const offers = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/offers/index.json'), 'utf8'),
) as OfferRecord[];
const providers = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/providers/index.json'), 'utf8'),
) as Array<{ id: string }>;
const coverage = JSON.parse(
  readFileSync(resolve(process.cwd(), 'data/sources/model-coverage.json'), 'utf8'),
) as {
  providers: Array<{ providerId: string; reviewedAt: string; sourceUrl: string }>;
  entries: Array<{ providerId: string; apiModelId: string; status: string }>;
};

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

function offerById(id: string): OfferRecord {
  const value = offers.find((candidate) => candidate.id === id);
  if (!value) throw new Error('missing offer ' + id);
  return value;
}

describe('official model coverage', () => {
  it('has a dated inventory and explicit decision for every provider and offer', () => {
    expect(coverage.providers.map((review) => review.providerId).sort()).toEqual(
      providers.map((provider) => provider.id).sort(),
    );
    expect(coverage.providers.every((review) => review.reviewedAt && review.sourceUrl)).toBe(true);
    const identities = new Set(
      coverage.entries.map((entry) => `${entry.providerId}:${entry.apiModelId.toLowerCase()}`),
    );
    expect(
      offers.every((entry) =>
        identities.has(`${entry.providerId}:${entry.apiModelId.toLowerCase()}`),
      ),
    ).toBe(true);
    expect(coverage.entries.some((entry) => entry.status === 'pending-review')).toBe(false);
  });

  it('keeps Command A and Command A+ attached to their own API identities', () => {
    const commandA = offerById('offer-cohere-command-a');
    const commandAPlus = offerById('offer-cohere-command-a-plus');
    expect(commandA.apiModelId).toBe('command-a-03-2025');
    expect(commandA.pricing[0]).toMatchObject({ inputPrice: 2.5, outputPrice: 10 });
    expect(commandAPlus.apiModelId).toBe('command-a-plus-05-2026');
  });

  it('labels the retired DeepSeek alias historical and links its active replacement', () => {
    const retired = offerById('offer-deepseek-v4-flash');
    const replacement = offers.find(
      (candidate) => candidate.id === retired.availability.replacementOfferId,
    );
    expect(retired.availability.status).toBe('retired');
    expect(replacement?.availability.status).toBe('active');
    expect(replacement?.apiModelId).toBe('deepseek-flash');
  });

  it('keeps provider limits, eligibility and offer modalities distinct', () => {
    expect(model('claude-sonnet-5')).toMatchObject({
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000,
    });
    expect(offerById('offer-google-gemini-2-5-flash').availability).toMatchObject({
      status: 'active',
      accountEligibility: 'existing-users',
    });
    expect(offerById('offer-together-qwen-3-5-9b').modalities?.input).toContain('image');
  });

  it('keeps separate verification dates on every catalog offer', () => {
    expect(
      offers.every(
        (entry) =>
          /^\d{4}-\d{2}-\d{2}$/.test(entry.availabilityVerifiedAt ?? '') &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.pricingVerifiedAt ?? ''),
      ),
    ).toBe(true);
  });

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
