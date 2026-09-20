import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredTheme, storeTheme } from './theme';

describe('theme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads and writes the selected theme', () => {
    expect(readStoredTheme()).toBe('dark');
    storeTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('keeps rendering when browser storage is blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });

    expect(readStoredTheme()).toBe('dark');
    expect(() => storeTheme('light')).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
