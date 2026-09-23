import type { CalculatorInput } from '../types';
import { normalizeWorkload, workloadErrors } from './workload';

export const SCENARIO_STORAGE_KEY = 'ai-cost-explorer-scenarios';
export const MAX_SAVED_SCENARIOS = 12;
export const SCENARIO_EXPORT_VERSION = 1;

export type ScenarioMode = 'request' | 'daily' | 'monthly' | 'annual';

export type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  input: CalculatorInput;
  selectedOfferIds: string[];
  mode: ScenarioMode;
};

const MODES: ScenarioMode[] = ['request', 'daily', 'monthly', 'annual'];

export function isCalculatorInput(value: unknown): value is CalculatorInput {
  return Boolean(
    value && typeof value === 'object' && workloadErrors(value as CalculatorInput).length === 0,
  );
}

function normalizeScenario(scenario: SavedScenario): SavedScenario {
  return { ...scenario, input: normalizeWorkload(scenario.input) };
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
    return Array.isArray(parsed)
      ? parsed.filter(isSavedScenario).slice(0, MAX_SAVED_SCENARIOS).map(normalizeScenario)
      : [];
  } catch {
    return [];
  }
}

export function limitSavedScenarios(scenarios: SavedScenario[]): SavedScenario[] {
  const unique = new Map<string, SavedScenario>();
  for (const scenario of scenarios)
    if (!unique.has(scenario.id)) unique.set(scenario.id, normalizeScenario(scenario));
  return [...unique.values()].slice(0, MAX_SAVED_SCENARIOS);
}

export function serializeSavedScenarios(scenarios: SavedScenario[]): string {
  return JSON.stringify(
    { schemaVersion: SCENARIO_EXPORT_VERSION, scenarios: limitSavedScenarios(scenarios) },
    null,
    2,
  );
}

export function parseSavedScenarioExport(serialized: string): SavedScenario[] | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    const records = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          'schemaVersion' in parsed &&
          parsed.schemaVersion === SCENARIO_EXPORT_VERSION &&
          'scenarios' in parsed
        ? parsed.scenarios
        : null;
    return Array.isArray(records) ? limitSavedScenarios(records.filter(isSavedScenario)) : null;
  } catch {
    return null;
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

export function storeSavedScenarios(scenarios: SavedScenario[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      SCENARIO_STORAGE_KEY,
      JSON.stringify(limitSavedScenarios(scenarios)),
    );
    return true;
  } catch {
    return false;
  }
}
