import type { CalculatorInput, OfferView } from '../types';

// Explicit product limits keep UI, URL imports, persistence and arithmetic consistent.
export const WORKLOAD_LIMITS: Record<keyof CalculatorInput, number> = {
  inputTokens: 1_000_000_000,
  outputTokens: 1_000_000_000,
  cachedInputTokens: 1_000_000_000,
  cacheWriteTokens: 1_000_000_000,
  requestsPerDay: 1_000_000_000_000,
  daysPerMonth: 31,
  retryRate: 1,
  batchRate: 1,
  users: 1_000_000,
  conversationsPerUser: 1_000_000,
  messagesPerConversation: 1_000_000,
};
const DERIVED = ['users', 'conversationsPerUser', 'messagesPerConversation'] as const;

export function workloadErrors(input: CalculatorInput): string[] {
  const errors: string[] = [];
  for (const [key, max] of Object.entries(WORKLOAD_LIMITS)) {
    const value = input[key as keyof CalculatorInput];
    const optional = DERIVED.includes(key as (typeof DERIVED)[number]);
    if (optional && value === undefined) continue;
    const rate = key === 'retryRate' || key === 'batchRate';
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      (!rate && !Number.isSafeInteger(value))
    )
      errors.push(
        `${key} must be ${rate ? 'a number' : 'a whole number'} between 0 and ${max.toLocaleString('en-US')}.`,
      );
  }
  const supplied = DERIVED.filter((key) => input[key] !== undefined).length;
  if (supplied > 0 && supplied < DERIVED.length)
    errors.push('Legacy workload requires users, conversations and messages together.');
  if (supplied === DERIVED.length) {
    const requests = input.users! * input.conversationsPerUser! * input.messagesPerConversation!;
    if (!Number.isSafeInteger(requests) || requests > WORKLOAD_LIMITS.requestsPerDay)
      errors.push('Derived requests per day exceed the supported workload limit.');
  }
  return errors;
}

/** Convert legacy derived workloads into the single, visible Requests / day field. */
export function normalizeWorkload(input: CalculatorInput): CalculatorInput {
  const { users, conversationsPerUser, messagesPerConversation, ...direct } = input;
  if (
    users !== undefined &&
    conversationsPerUser !== undefined &&
    messagesPerConversation !== undefined
  )
    direct.requestsPerDay = users * conversationsPerUser * messagesPerConversation;
  return direct;
}

export function isOfferAvailable(offer: OfferView): boolean {
  return offer.availability.status !== 'retired' && offer.model.status !== 'retired';
}
