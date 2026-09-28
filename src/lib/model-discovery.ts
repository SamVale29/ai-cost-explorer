export const MODEL_ID_PATTERNS: Record<string, RegExp> = {
  openai: /\b(?:gpt|whisper|dall-e|text-embedding|o)[-_][a-z0-9][a-z0-9.-]*\b/gi,
  anthropic: /\bclaude-[a-z0-9][a-z0-9-]*\b/gi,
  'google-ai': /\bgemini-[a-z0-9][a-z0-9.-]*\b/gi,
  mistral:
    /\b(?:zai-glm|ministral|mistral|codestral|voxtral|devstral|magistral)-[a-z0-9][a-z0-9.-]*\b/gi,
  cohere: /\bcommand-[a-z0-9][a-z0-9-]*\b/gi,
  xai: /\bgrok-[a-z0-9][a-z0-9.-]*\b/gi,
  deepseek: /\bdeepseek-[a-z0-9][a-z0-9.-]*\b/gi,
  groq: /\b(?:openai|meta-llama|qwen|deepseek-ai|minimaxai|canopylabs|moonshotai|zai-org|google|meta-models)\/[a-z0-9][a-z0-9._-]*\b/gi,
  together:
    /\b(?:thinkingmachines|minimaxai|qwen|moonshotai|zai-org|openai|deepseek-ai|meta-llama|prism-ml|meta-models|together|google|canopylabs)\/[a-z0-9][a-z0-9._-]*\b/gi,
};

export type DiscoveryAssessment = {
  status: 'complete' | 'parser-inconclusive';
  observedIds: string[];
  newIds: string[];
};

export function normalizeApiModelId(value: string): string {
  return value.trim().replaceAll('\\', '/').toLowerCase();
}

const staticAssetSuffix = /\.(?:avif|gif|jpe?g|png|svg|webp|pdf)$/i;

const providerNoise: Record<string, RegExp[]> = {
  openai: [/^gpt-(?:6|5\.6|oss)$/],
  anthropic: [
    /^claude-(?:api|api-skill|code|code-analytics-api)$/,
    /^claude-(?:in|on|platform-on)-/,
    /^claude-.*-system-card$/,
    /^claude-(?:prompting|fable-and-mythos)/,
  ],
  'google-ai': [
    /^gemini-api(?:-|$)/,
    /^gemini-(?:card|centered-model-grid|icon-|model-(?:desc|details|grid|name|row))/,
    /^gemini-3-models$/,
  ],
  mistral: [
    /^codestral-code-interpreter-/,
    /^mistral-(?:agents|ai-plugin|audio-transcription-extractor|code|color-[1-4]|compute|connectors|evaluation|mlflow-tracing|plan|prompting|rag|safety-prompt)/,
    /^mistral-embeddings-/,
    /^mistral-embedder$/,
    /^mistral-ocr-(?:documentchunking|extractor|hcls)/,
    /^mistral-moderation-(?:moderation-explored|system-level-guardrails)$/,
    /-(?:readme|explored)$/,
  ],
  cohere: [
    /^command-(?:a-hf|a-technical-report|gets-refreshed|models-on-different-platforms|nightly|light-nightly|reference|text-v14)$/,
  ],
  xai: [/^grok-(?:bot|build-latest|4-7|47)$/],
  deepseek: [
    /^deepseek-(?:ai|integration|social-card)/,
    /^deepseek-coder--deepseek-chat-upgraded-to-/,
    /-(?:update|release)$/,
  ],
  groq: [/(?:-price|-limits)$/, /^openai\/v1$/],
};

function isLikelyModelId(providerId: string, rawId: string): boolean {
  const id = normalizeApiModelId(rawId);
  if (staticAssetSuffix.test(id) || id.endsWith('-')) return false;
  return !(providerNoise[providerId] ?? []).some((pattern) => pattern.test(id));
}

export function extractModelIds(providerId: string, content: string): string[] {
  const pattern = MODEL_ID_PATTERNS[providerId];
  if (!pattern) throw new Error(`No model-ID parser registered for provider ${providerId}`);
  return [
    ...new Set(
      [...content.matchAll(pattern)]
        .map((match) => normalizeApiModelId(match[0]))
        .filter((id) => isLikelyModelId(providerId, id)),
    ),
  ].sort();
}

export function assessModelDiscovery(
  providerId: string,
  content: string,
  baselineIds: string[],
  minimumObservedIds = 2,
): DiscoveryAssessment {
  const observedIds = extractModelIds(providerId, content);
  const baseline = new Set(baselineIds.map(normalizeApiModelId));
  return {
    status: observedIds.length < minimumObservedIds ? 'parser-inconclusive' : 'complete',
    observedIds,
    newIds: observedIds.filter((id) => !baseline.has(id)),
  };
}
