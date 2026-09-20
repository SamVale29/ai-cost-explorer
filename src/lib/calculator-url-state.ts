import type { CalculatorInput } from '../types';
import { isCalculatorInput, type ScenarioMode } from './scenarios';

export type CalculatorUrlState = {
  input: CalculatorInput;
  selectedOfferIds: string[];
  mode: ScenarioMode;
};

const INPUT_PARAMS = {
  inputTokens: 'in',
  outputTokens: 'out',
  cachedInputTokens: 'cache',
  cacheWriteTokens: 'write',
  requestsPerDay: 'req',
  daysPerMonth: 'days',
  retryRate: 'retry',
  batchRate: 'batch',
} as const;
const DERIVED_INPUT_PARAMS = {
  users: 'users',
  conversationsPerUser: 'convos',
  messagesPerConversation: 'messages',
} as const;
const MODES: ScenarioMode[] = ['request', 'daily', 'monthly', 'annual'];

function readNumber(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseCalculatorUrl(search: string): CalculatorUrlState | null {
  const params = new URLSearchParams(search);
  const values = Object.fromEntries(
    Object.entries(INPUT_PARAMS).map(([key, param]) => [key, readNumber(params, param)]),
  );
  if (Object.values(values).some((value) => value === null)) return null;
  const derivedValues = Object.fromEntries(
    Object.entries(DERIVED_INPUT_PARAMS)
      .map(([key, param]) => [key, params.has(param) ? readNumber(params, param) : undefined])
      .filter(([, value]) => value !== undefined),
  );
  if (Object.values(derivedValues).some((value) => value === null)) return null;
  const input = { ...values, ...derivedValues } as CalculatorInput;
  const mode = params.get('mode') as ScenarioMode | null;
  if (!isCalculatorInput(input) || !mode || !MODES.includes(mode)) return null;
  return {
    input,
    selectedOfferIds: params.get('offers')?.split(',').filter(Boolean) ?? [],
    mode,
  };
}

export function serializeCalculatorUrl(state: CalculatorUrlState): string {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(INPUT_PARAMS))
    params.set(param, String(state.input[key as keyof typeof INPUT_PARAMS]));
  for (const [key, param] of Object.entries(DERIVED_INPUT_PARAMS)) {
    const value = state.input[key as keyof typeof DERIVED_INPUT_PARAMS];
    if (value !== undefined) params.set(param, String(value));
  }
  params.set('offers', state.selectedOfferIds.join(','));
  params.set('mode', state.mode);
  return `?${params.toString()}`;
}
