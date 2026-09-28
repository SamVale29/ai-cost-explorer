import { describe, expect, it } from 'vitest';
import { formatDate, formatExactTokens, formatUnitPrice, getStaleness } from './format';

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

describe('civil dates', () => {
  it('formats date-only values without shifting them across time zones', () => {
    expect(formatDate('2026-08-06')).toBe('Aug 6, 2026');
  });
});

describe('unit formatting', () => {
  it('preserves published fractional prices and exact token limits', () => {
    expect(formatUnitPrice(0.075)).toBe('$0.075');
    expect(formatUnitPrice(0.000018)).toBe('$0.000018');
    expect(formatExactTokens(1_048_576)).toBe('1,048,576 tokens');
  });
});
