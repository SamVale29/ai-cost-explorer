import { describe, expect, it } from 'vitest';
import { hasDifferences } from './compare';

describe('comparison values', () => {
  it('detects differences in primitive comparison keys', () => {
    expect(hasDifferences([2, 2, 5])).toBe(true);
    expect(hasDifferences([2, 2, 2])).toBe(false);
    expect(hasDifferences([null, null])).toBe(false);
  });
});
