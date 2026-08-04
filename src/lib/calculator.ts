import Decimal from 'decimal.js';
import type { CalculatorInput, CalculatorResult, OfferView, PricingRule } from '../types';

const MILLION = new Decimal(1_000_000);
const TOKEN_PRICING_UNIT = 'per_million_tokens' as const;

function inRange(rule: PricingRule, inputTokens: number): boolean {
  const minimum = rule.minimumInputTokens ?? 0;
  const maximum = rule.maximumInputTokens ?? Number.POSITIVE_INFINITY;
  return inputTokens >= minimum && inputTokens <= maximum;
}

function isEffective(rule: PricingRule, now: Date): boolean {
  const effectiveFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom) : null;
  const effectiveUntil = rule.effectiveUntil ? new Date(rule.effectiveUntil) : null;
  if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) return false;
  if (effectiveUntil && Number.isNaN(effectiveUntil.getTime())) return false;
  return (!effectiveFrom || effectiveFrom <= now) && (!effectiveUntil || effectiveUntil >= now);
}

export function choosePricingRule(
  rules: PricingRule[],
  mode: PricingRule['mode'],
  inputTokens: number,
  now = new Date(),
): PricingRule | null {
  return (
    rules
      .filter(
        (rule) =>
          rule.unit === TOKEN_PRICING_UNIT &&
          rule.mode === mode &&
          inRange(rule, inputTokens) &&
          isEffective(rule, now),
      )
      .sort((a, b) => (b.minimumInputTokens ?? 0) - (a.minimumInputTokens ?? 0))[0] ?? null
  );
}

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
  if (standardPrice === null && batchPrice === null) return null;
  const base = new Decimal(standardPrice ?? batchPrice ?? 0);
  const batchValue = new Decimal(batchPrice ?? standardPrice ?? 0);
  return base.mul(new Decimal(1).sub(batchRate)).add(batchValue.mul(batchRate));
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

export function calculateOfferCost(offer: OfferView, input: CalculatorInput): CalculatorResult {
  const warnings: string[] = [];
  const tokenTotal = Math.max(0, input.inputTokens);
  const cachedTokens = Math.max(0, input.cachedInputTokens);
  const cacheWriteTokens = Math.max(0, input.cacheWriteTokens);
  const standardTokens = Math.max(0, tokenTotal - cachedTokens - cacheWriteTokens);
  if (cachedTokens + cacheWriteTokens > tokenTotal) {
    warnings.push('Cache and cache-write tokens were capped at the request input total.');
  }

  const batchRate = new Decimal(Math.min(1, Math.max(0, input.batchRate)));
  const standardRule = choosePricingRule(offer.pricing, 'standard', tokenTotal);
  const batchRule = choosePricingRule(offer.pricing, 'batch', tokenTotal);
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
  if (cachedTokens > 0 && cachedInputPrice === null)
    warnings.push('Cached input price is not verified; cached tokens were not priced.');
  if (cacheWriteTokens > 0 && cacheWritePrice === null)
    warnings.push('Cache-write price is not verified; cache writes were not priced.');

  const breakdown = {
    standardInput: tokenCost(standardTokens, inputPrice),
    cachedInput: tokenCost(cachedTokens, cachedInputPrice),
    cacheWrite: tokenCost(cacheWriteTokens, cacheWritePrice),
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

  const directRequests = Math.max(0, input.requestsPerDay);
  const derivedRequests =
    (input.users ?? 0) > 0 &&
    (input.conversationsPerUser ?? 0) > 0 &&
    (input.messagesPerConversation ?? 0) > 0
      ? (input.users ?? 0) *
        (input.conversationsPerUser ?? 0) *
        (input.messagesPerConversation ?? 0)
      : directRequests;
  const adjustedRequestsPerDay = new Decimal(derivedRequests)
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
    `Assumptions: ${input.requestsPerDay.toLocaleString()} requests/day, ${input.daysPerMonth} days/month, ${(input.retryRate * 100).toFixed(1)}% retries, ${(input.batchRate * 100).toFixed(1)}% batch`,
    'Estimate only. Verify current pricing with the provider before making purchasing decisions.',
  ].join('\n');
}
