import type { PricingSignalStatus } from './pricing-watch';

export type SourceCheck = {
  ok: boolean;
  expectedSignals: number;
  pricingSignals: number;
  missingSignals: number;
  signalStates: Record<string, PricingSignalStatus>;
};
export function sourceCheckStatus(
  result: SourceCheck,
): 'unreachable' | 'reachability-only' | 'verified' | 'price-mismatch' | 'inconclusive' {
  if (!result.ok) return 'unreachable';
  if (result.expectedSignals === 0) return 'reachability-only';
  if (Object.values(result.signalStates).includes('missing')) return 'price-mismatch';
  if (result.missingSignals || result.pricingSignals !== result.expectedSignals)
    return 'inconclusive';
  return 'verified';
}
export function canAcceptBaseline(results: SourceCheck[]): boolean {
  return (
    results.length > 0 &&
    results.every((result) => ['verified', 'reachability-only'].includes(sourceCheckStatus(result)))
  );
}
