import { describe, expect, it } from 'vitest';
import { parseExplorerUrl, serializeExplorerUrl } from './url-state';

describe('explorer URL state', () => {
  it('round-trips shareable filters', () => {
    const state = {
      search: 'gpt 4.1',
      providers: ['openai', 'groq'],
      organization: 'openai',
      status: 'active',
      capabilities: ['functionCalling', 'batchApi'],
      recentOnly: true,
      minInput: 0.1,
      maxInput: 5,
      minOutput: 1,
      maxOutput: 30,
      minContext: 128000,
    };

    expect(parseExplorerUrl(serializeExplorerUrl(state))).toEqual(state);
  });
});
