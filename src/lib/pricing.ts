import type { OfferView, PricingRule } from '../types';

export function standardRule({ offer }: { offer: OfferView }): PricingRule | undefined {
  return offer.pricing.find(
    (rule) => rule.mode === 'standard' && rule.unit === 'per_million_tokens',
  );
}
