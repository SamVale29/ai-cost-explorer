import type { OfferView, PricingMode, PricingRule } from '../types';

export const TOKEN_PRICING_UNIT = 'per_million_tokens' as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type PricingSelectionOptions = {
  inputTokens?: number;
  asOf?: Date;
};

/**
 * A date-only boundary describes a civil day, not midnight in the local time zone.
 * Effective-until dates therefore remain valid through 23:59:59.999 UTC.
 */
function parseBoundary(value: string, edge: 'start' | 'end'): Date {
  if (!DATE_ONLY.test(value)) return new Date(value);
  return new Date(`${value}T${edge === 'start' ? '00:00:00.000Z' : '23:59:59.999Z'}`);
}

function isEffective(rule: PricingRule, asOf: Date): boolean {
  const effectiveFrom = rule.effectiveFrom ? parseBoundary(rule.effectiveFrom, 'start') : null;
  const effectiveUntil = rule.effectiveUntil ? parseBoundary(rule.effectiveUntil, 'end') : null;
  if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) return false;
  if (effectiveUntil && Number.isNaN(effectiveUntil.getTime())) return false;
  return (!effectiveFrom || effectiveFrom <= asOf) && (!effectiveUntil || effectiveUntil >= asOf);
}

function inRange(rule: PricingRule, inputTokens: number): boolean {
  const minimum = rule.minimumInputTokens ?? 0;
  const maximum = rule.maximumInputTokens ?? Number.POSITIVE_INFINITY;
  return inputTokens >= minimum && inputTokens <= maximum;
}

function effectiveFromTimestamp(rule: PricingRule): number {
  if (!rule.effectiveFrom) return Number.NEGATIVE_INFINITY;
  const date = parseBoundary(rule.effectiveFrom, 'start');
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}

/** Select the applicable pricing rule for a mode, token count and reference time. */
export function choosePricingRule(
  rules: PricingRule[],
  mode: PricingMode,
  inputTokens = 0,
  asOf = new Date(),
): PricingRule | null {
  const tokenCount = Math.max(0, inputTokens);
  return (
    rules
      .filter(
        (rule) =>
          rule.unit === TOKEN_PRICING_UNIT &&
          rule.mode === mode &&
          inRange(rule, tokenCount) &&
          isEffective(rule, asOf),
      )
      .sort(
        (a, b) =>
          (b.minimumInputTokens ?? 0) - (a.minimumInputTokens ?? 0) ||
          effectiveFromTimestamp(b) - effectiveFromTimestamp(a),
      )[0] ?? null
  );
}

/**
 * Return the same standard token rule used by the calculator for catalog views.
 * Callers with a workload should pass its input token count; catalog summaries use 0.
 */
export function standardRule(
  { offer }: { offer: OfferView },
  options: PricingSelectionOptions = {},
): PricingRule | undefined {
  return (
    choosePricingRule(
      offer.pricing,
      'standard',
      options.inputTokens ?? 0,
      options.asOf ?? new Date(),
    ) ?? undefined
  );
}
