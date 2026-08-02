import { describe, expect, it } from 'vitest';
import { MAX_SAVED_SCENARIOS, parseSavedScenarios } from './scenarios';

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
      { id: 'valid', name: 'Support', savedAt: '2026-08-02T12:00:00.000Z', input, selectedOfferIds: ['offer-a'], mode: 'monthly' },
      { id: 'broken', name: '', savedAt: '2026-08-02', input, selectedOfferIds: [], mode: 'monthly' },
      { id: 'wrong-mode', name: 'Wrong mode', savedAt: '2026-08-02', input, selectedOfferIds: [], mode: 'hourly' },
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
});
