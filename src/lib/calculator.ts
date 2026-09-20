import Decimal from 'decimal.js';
import type { CalculatorInput, CalculatorResult, OfferView, PricingRule } from '../types';
import { choosePricingRule, TOKEN_PRICING_UNIT } from './pricing';

export { choosePricingRule } from './pricing';

const MILLION = new Decimal(1_000_000);

function priceFor(
  rule: PricingRule | null,
  key: 'inputPrice' | 'cachedInputPrice' | 'cacheWritePrice' | 'outputPrice',
) {
  return rule?.[key] ?? null;
}

function mixedPrice(
  standard: PricingRule | null,
  batch: PricingRule | null,
  key: 'inputPrice' | 'cachedInputPrice' | 'cacheWritePrice' | 'outputPrice',
  batchRate: Decimal,
): Decimal | null {
  const standardPrice = priceFor(standard, key);
  const batchPrice = priceFor(batch, key);
  const standardShare = new Decimal(1).sub(batchRate);
  const batchShare = batchRate;
  if (standardShare.gt(0) && standardPrice === null) return null;
  if (batchShare.gt(0) && batchPrice === null) return null;
  return new Decimal(standardPrice ?? 0)
    .mul(standardShare)
    .add(new Decimal(batchPrice ?? 0).mul(batchShare));
}

function tokenCost(tokens: number, price: Decimal | null): Decimal | null {
  if (tokens === 0) return new Decimal(0);
  if (price === null) return null;
  return new Decimal(tokens).div(MILLION).mul(price);
}

function addNullable(values: Array<Decimal | null>): Decimal | null {
  const present = values.filter((value): value is Decimal => value !== null);
  if (present.length !== values.length) return null;
  return present.reduce((sum, value) => sum.add(value), new Decimal(0));
}

function normalizedTokenBuckets(input: CalculatorInput) {
  const tokenTotal = Math.max(0, input.inputTokens);
  const requestedCachedTokens = Math.max(0, input.cachedInputTokens);
  const requestedCacheWriteTokens = Math.max(0, input.cacheWriteTokens);
  const cachedInputTokens = Math.min(requestedCachedTokens, tokenTotal);
  const cacheWriteTokens = Math.min(
    requestedCacheWriteTokens,
    Math.max(0, tokenTotal - cachedInputTokens),
  );
  return {
    tokenTotal,
    cachedInputTokens,
    cacheWriteTokens,
    standardTokens: Math.max(0, tokenTotal - cachedInputTokens - cacheWriteTokens),
    wasCapped: requestedCachedTokens + requestedCacheWriteTokens > tokenTotal,
  };
}

export function effectiveRequestsPerDay(input: CalculatorInput): number {
  const derivedInputs = [input.users, input.conversationsPerUser, input.messagesPerConversation];
  const hasDerivedWorkload = derivedInputs.every((value) => value !== undefined);
  if (hasDerivedWorkload)
    return Math.max(
      0,
      derivedInputs.reduce((total, value) => total * value!, 1),
    );
  return Math.max(0, input.requestsPerDay);
}

export function calculateOfferCost(offer: OfferView, input: CalculatorInput): CalculatorResult {
  const warnings: string[] = [];
  const buckets = normalizedTokenBuckets(input);
  if (buckets.wasCapped) {
    warnings.push(
      'Cache and cache-write tokens exceeded total input; cache hits take precedence and cache writes use the remaining input.',
    );
  }

  const batchRate = new Decimal(Math.min(1, Math.max(0, input.batchRate)));
  const standardRule = choosePricingRule(offer.pricing, 'standard', buckets.tokenTotal);
  const batchRule = choosePricingRule(offer.pricing, 'batch', buckets.tokenTotal);
  if (!standardRule) {
    const hasNonTokenStandardPricing = offer.pricing.some(
      (rule) => rule.mode === 'standard' && rule.unit !== TOKEN_PRICING_UNIT,
    );
    warnings.push(
      hasNonTokenStandardPricing
        ? 'This offer uses non-token pricing and cannot be simulated by token inputs.'
        : 'No standard token pricing rule is available for this input size.',
    );
  }
  if (input.batchRate > 0 && !batchRule)
    warnings.push('Batch share requested, but no batch pricing rule is available.');

  const inputPrice = mixedPrice(standardRule, batchRule, 'inputPrice', batchRate);
  const cachedInputPrice = mixedPrice(standardRule, batchRule, 'cachedInputPrice', batchRate);
  const cacheWritePrice = mixedPrice(standardRule, batchRule, 'cacheWritePrice', batchRate);
  const outputPrice = mixedPrice(standardRule, batchRule, 'outputPrice', batchRate);

  if (input.outputTokens > 0 && outputPrice === null)
    warnings.push('Output price is not verified for this offer.');
  if (buckets.cachedInputTokens > 0 && cachedInputPrice === null)
    warnings.push('Cached input price is not verified; cached tokens were not priced.');
  if (buckets.cacheWriteTokens > 0 && cacheWritePrice === null)
    warnings.push('Cache-write price is not verified; cache writes were not priced.');

  const breakdown = {
    standardInput: tokenCost(buckets.standardTokens, inputPrice),
    cachedInput: tokenCost(buckets.cachedInputTokens, cachedInputPrice),
    cacheWrite: tokenCost(buckets.cacheWriteTokens, cacheWritePrice),
    output: tokenCost(Math.max(0, input.outputTokens), outputPrice),
  };
  const total = addNullable([
    breakdown.standardInput,
    breakdown.cachedInput,
    breakdown.cacheWrite,
    breakdown.output,
  ]);
  if (total === null)
    warnings.push('Monthly totals are unavailable until every used price component is verified.');

  const adjustedRequestsPerDay = new Decimal(effectiveRequestsPerDay(input))
    .mul(new Decimal(1).add(Math.max(0, input.retryRate)))
    .toNumber();
  const daily = total?.mul(adjustedRequestsPerDay) ?? null;
  const monthly = daily?.mul(Math.max(0, input.daysPerMonth)) ?? null;
  const annual = monthly?.mul(12) ?? null;

  return {
    offerId: offer.id,
    costPerRequest: total?.toNumber() ?? null,
    dailyCost: daily?.toNumber() ?? null,
    monthlyCost: monthly?.toNumber() ?? null,
    annualCost: annual?.toNumber() ?? null,
    adjustedRequestsPerDay,
    breakdown: {
      standardInput: breakdown.standardInput?.toNumber() ?? null,
      cachedInput: breakdown.cachedInput?.toNumber() ?? null,
      cacheWrite: breakdown.cacheWrite?.toNumber() ?? null,
      output: breakdown.output?.toNumber() ?? null,
      total: total?.toNumber() ?? null,
    },
    warnings,
    ruleIds: [standardRule?.id, batchRule?.id].filter((value): value is string => Boolean(value)),
  };
}

export function calculateAll(offers: OfferView[], input: CalculatorInput): CalculatorResult[] {
  return offers
    .map((offer) => calculateOfferCost(offer, input))
    .sort((a, b) => (a.monthlyCost ?? Infinity) - (b.monthlyCost ?? Infinity));
}

export function resultAsText(
  result: CalculatorResult,
  offer: OfferView,
  input: CalculatorInput,
): string {
  return [
    `AI Cost Explorer estimate — ${offer.model.name} via ${offer.provider.name}`,
    `Input ${input.inputTokens.toLocaleString()} / output ${input.outputTokens.toLocaleString()} tokens per request`,
    `Monthly: ${result.monthlyCost === null ? 'Not verified' : `$${result.monthlyCost.toFixed(2)}`}`,
    `Daily: ${result.dailyCost === null ? 'Not verified' : `$${result.dailyCost.toFixed(4)}`}`,
    `Assumptions: ${effectiveRequestsPerDay(input).toLocaleString()} effective requests/day, ${input.daysPerMonth} days/month, ${(input.retryRate * 100).toFixed(1)}% retries, ${(input.batchRate * 100).toFixed(1)}% batch`,
    'Estimate only. Verify current pricing with the provider before making purchasing decisions.',
  ].join('\n');
}
