import { describe, expect, it } from 'vitest';
import { assessModelDiscovery, extractModelIds, normalizeApiModelId } from './model-discovery';

describe('model discovery', () => {
  it('normalizes provider API IDs while preserving the provider namespace', () => {
    expect(normalizeApiModelId('Qwen/Qwen3.8-Flash')).toBe('qwen/qwen3.8-flash');
    expect(extractModelIds('together', 'Use Qwen/Qwen3.8-Flash with zai-org/GLM-5.3.')).toEqual([
      'qwen/qwen3.8-flash',
      'zai-org/glm-5.3',
    ]);
  });

  it('filters asset filenames and documentation component slugs', () => {
    expect(
      extractModelIds(
        'google-ai',
        'gemini-3.8-flash gemini-api-card-title gemini-api-logo.svg gemini-3.1-flash-lite',
      ),
    ).toEqual(['gemini-3.1-flash-lite', 'gemini-3.8-flash']);
    expect(
      extractModelIds(
        'mistral',
        'mistral-large-3-25-12 mistral-connectors-01-build-a-database-advisor-agent mistral-ocr-2505 codestral-code-interpreter-python-readme',
      ),
    ).toEqual(['mistral-large-3-25-12', 'mistral-ocr-2505']);
    expect(extractModelIds('xai', 'Grok 4.7 uses grok-4.7; grok-4-7 is a display slug.')).toEqual([
      'grok-4.7',
    ]);
  });

  it('reports IDs missing from the reviewed baseline as pending findings', () => {
    expect(
      assessModelDiscovery(
        'google-ai',
        'gemini-3.8-flash gemini-3.9-flash gemini-3.8-pro',
        ['gemini-3.8-flash'],
        2,
      ),
    ).toEqual({
      status: 'complete',
      observedIds: ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.9-flash'],
      newIds: ['gemini-3.8-pro', 'gemini-3.9-flash'],
    });
  });

  it('reports parser-inconclusive separately from an empty new-model result', () => {
    expect(assessModelDiscovery('anthropic', 'claude-fable-5-1', ['claude-fable-5-1'], 3)).toEqual({
      status: 'parser-inconclusive',
      observedIds: ['claude-fable-5-1'],
      newIds: [],
    });
  });
});
