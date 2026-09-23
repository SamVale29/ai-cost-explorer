// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { pricingSignalEvidence, pricingSignalsFor } from './pricing-watch';
import offers from '../../data/offers/index.json';
import models from '../../data/models/index.json';
import type { Offer, Model } from '../types';

it.each([
  ['openai-gpt-4-1', 'https://developers.openai.com/api/docs/models/gpt-4.1', 3],
  ['cohere-command-a', 'https://docs.cohere.com/docs/command-a', 2],
  ['groq-gpt-oss', 'https://console.groq.com/docs/models', 4],
  ['deepseek-time', 'https://api-docs.deepseek.com/quick_start/pricing/', 6],
  ['mistral-pricing', 'https://docs.mistral.ai/inference/pricing', 18],
] as const)('extracts real source pricing markup: %s', (fixture, url, count) => {
  const body = readFileSync(`src/lib/fixtures/${fixture}.html`, 'utf8');
  const signals = pricingSignalsFor(offers as Offer[], models as Model[], url);
  expect(
    pricingSignalEvidence(body, signals, url).filter((item) => item.status === 'present'),
  ).toHaveLength(count);
  // A changed price must not match a number from a different model or component.
  expect(
    pricingSignalEvidence(
      body,
      signals.map((signal) => ({ ...signal, value: 999 })),
      url,
    ).some((item) => item.status === 'present'),
  ).toBe(false);
});
