import type { PriceChangeEvent, PricingRule } from '../types';
import { formatCurrency } from './format';

export function historyEventLabel(event: PriceChangeEvent): string {
  const type = event.eventType ?? (event.previousPricing.length ? 'price-change' : 'initial');
  return {
    initial: 'Initial observation',
    'price-change': 'Price change',
    retirement: 'Offer retired',
  }[type];
}

export function historyPriceChanges(event: PriceChangeEvent): string[] {
  if (event.eventType === 'retirement')
    return ['Offer retired; previous prices are retained as historical evidence.'];
  const fields = ['inputPrice', 'cachedInputPrice', 'cacheWritePrice', 'outputPrice'] as const;
  const key = (rule: PricingRule) =>
    `${rule.mode}|${rule.unit}|${rule.minimumInputTokens ?? ''}|${rule.maximumInputTokens ?? ''}`;
  const changes: string[] = [];
  for (const current of event.currentPricing) {
    const previous = event.previousPricing.find((rule) => key(rule) === key(current));
    for (const field of fields) {
      if (previous && previous[field] === current[field]) continue;
      if (!previous && current[field] == null) continue;
      const unit =
        current.unit === 'per_million_tokens' ? '1M tokens' : current.unit.replace('per_', '');
      changes.push(
        `${current.mode} ${field.replace('Price', '')} / ${unit}: ${previous ? `${formatCurrency(previous[field], 4)} → ` : ''}${formatCurrency(current[field], 4)}`,
      );
    }
  }
  return changes.length
    ? changes
    : ['No numeric price change recorded; see the source review notes.'];
}
