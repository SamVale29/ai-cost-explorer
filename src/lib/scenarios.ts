import type { CalculatorInput } from '../types';

export const SCENARIO_STORAGE_KEY = 'ai-cost-explorer-scenarios';
export const MAX_SAVED_SCENARIOS = 12;

export type ScenarioMode = 'request' | 'daily' | 'monthly' | 'annual';

export type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  input: CalculatorInput;
  selectedOfferIds: string[];
  mode: ScenarioMode;
};

const REQUIRED_INPUT_KEYS: Array<keyof CalculatorInput> = [
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'cacheWriteTokens',
  'requestsPerDay',
  'daysPerMonth',
  'retryRate',
  'batchRate',
];
const OPTIONAL_INPUT_KEYS: Array<keyof CalculatorInput> = ['users', 'conversationsPerUser', 'messagesPerConversation'];
const MODES: ScenarioMode[] = ['request', 'daily', 'monthly', 'annual'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCalculatorInput(value: unknown): value is CalculatorInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (!REQUIRED_INPUT_KEYS.every((key) => isFiniteNumber(input[key]))) return false;
  return OPTIONAL_INPUT_KEYS.every((key) => input[key] === undefined || isFiniteNumber(input[key]));
}

function isSavedScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as Record<string, unknown>;
  return (
    typeof scenario.id === 'string' &&
    scenario.id.length > 0 &&
    typeof scenario.name === 'string' &&
    scenario.name.trim().length > 0 &&
    typeof scenario.savedAt === 'string' &&
    isCalculatorInput(scenario.input) &&
    Array.isArray(scenario.selectedOfferIds) &&
    scenario.selectedOfferIds.every((id) => typeof id === 'string' && id.length > 0) &&
    typeof scenario.mode === 'string' &&
    MODES.includes(scenario.mode as ScenarioMode)
  );
}

export function parseSavedScenarios(serialized: string | null): SavedScenario[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(isSavedScenario).slice(0, MAX_SAVED_SCENARIOS) : [];
  } catch {
    return [];
  }
}

export function loadSavedScenarios(): SavedScenario[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseSavedScenarios(window.localStorage.getItem(SCENARIO_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function storeSavedScenarios(scenarios: SavedScenario[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios.slice(0, MAX_SAVED_SCENARIOS)));
  } catch {
    // Local persistence is best effort; calculator use should never fail when storage is blocked.
  }
}
