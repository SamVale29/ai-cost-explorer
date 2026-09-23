import { describe, expect, it, vi } from 'vitest';
import {
  storeSavedScenarios,
  isCalculatorInput,
  MAX_SAVED_SCENARIOS,
  parseSavedScenarioExport,
  parseSavedScenarios,
  serializeSavedScenarios,
} from './scenarios';

const input = {
  inputTokens: 1000,
  outputTokens: 200,
  cachedInputTokens: 100,
  cacheWriteTokens: 0,
  requestsPerDay: 10,
  daysPerMonth: 30,
  retryRate: 0.02,
  batchRate: 0,
};

describe('saved calculator scenarios', () => {
  it('keeps valid scenarios and ignores malformed records', () => {
    const serialized = JSON.stringify([
      {
        id: 'valid',
        name: 'Support',
        savedAt: '2026-08-02T12:00:00.000Z',
        input,
        selectedOfferIds: ['offer-a'],
        mode: 'monthly',
      },
      {
        id: 'broken',
        name: '',
        savedAt: '2026-08-02',
        input,
        selectedOfferIds: [],
        mode: 'monthly',
      },
      {
        id: 'wrong-mode',
        name: 'Wrong mode',
        savedAt: '2026-08-02',
        input,
        selectedOfferIds: [],
        mode: 'hourly',
      },
    ]);

    expect(parseSavedScenarios(serialized)).toHaveLength(1);
    expect(parseSavedScenarios(serialized)[0]?.name).toBe('Support');
  });

  it('returns an empty list for invalid storage and caps the number of records', () => {
    expect(parseSavedScenarios('{not-json')).toEqual([]);

    const records = Array.from({ length: MAX_SAVED_SCENARIOS + 2 }, (_, index) => ({
      id: `scenario-${index}`,
      name: `Scenario ${index}`,
      savedAt: '2026-08-02',
      input,
      selectedOfferIds: [],
      mode: 'monthly',
    }));
    expect(parseSavedScenarios(JSON.stringify(records))).toHaveLength(MAX_SAVED_SCENARIOS);
  });

  it('round-trips the versioned import/export format', () => {
    const scenarios = [
      {
        id: 'support',
        name: 'Support',
        savedAt: '2026-08-02',
        input,
        selectedOfferIds: ['offer-a'],
        mode: 'monthly' as const,
      },
    ];
    expect(parseSavedScenarioExport(serializeSavedScenarios(scenarios))).toEqual(scenarios);
    expect(parseSavedScenarioExport('{"schemaVersion":2,"scenarios":[]}')).toEqual(null);
  });
});

it('reports storage failure instead of reporting a durable save', () => {
  const stub = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  expect(storeSavedScenarios([])).toBe(false);
  stub.mockRestore();
  expect(storeSavedScenarios([])).toBe(true);
});

it('validates bounded whole-number workloads and complete legacy dimensions', () => {
  for (const change of [
    { requestsPerDay: 1e308 },
    { inputTokens: 1.5 },
    { daysPerMonth: 32 },
    { batchRate: 1.1 },
    { users: 2 },
    { users: 1e6, conversationsPerUser: 1e6, messagesPerConversation: 1e6 },
  ])
    expect(isCalculatorInput({ ...input, ...change })).toBe(false);
});

it('makes legacy imported requests editable without hidden overrides', () => {
  const record = {
    id: 'legacy',
    name: 'Legacy',
    savedAt: '2026-09-23',
    mode: 'monthly',
    selectedOfferIds: [],
    input: { ...input, users: 10, conversationsPerUser: 2, messagesPerConversation: 3 },
  };
  const migrated = parseSavedScenarios(JSON.stringify([record]))[0];
  expect(migrated.input).toEqual({ ...input, requestsPerDay: 60 });
  migrated.input.requestsPerDay = 999;
  expect(
    parseSavedScenarioExport(serializeSavedScenarios([migrated]))?.[0].input.requestsPerDay,
  ).toBe(999);
});
