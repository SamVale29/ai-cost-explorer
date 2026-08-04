import { describe, expect, it } from 'vitest';
import { getStaleness } from './format';

describe('staleness', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  it('classifies fresh, aging and stale dates against an explicit clock', () => {
    expect(getStaleness('2026-08-04T00:00:00Z', now)).toBe('fresh');
    expect(getStaleness('2026-07-05T12:00:00Z', now)).toBe('fresh');
    expect(getStaleness('2026-07-04T00:00:00Z', now)).toBe('aging');
    expect(getStaleness('2026-05-01T00:00:00Z', now)).toBe('stale');
  });

  it('does not treat future verification as fresh', () => {
    expect(getStaleness('2026-08-05T00:00:00Z', now)).toBe('unknown');
  });
});
