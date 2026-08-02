export type Status = 'active' | 'preview' | 'deprecated' | 'retired';
export type SourceType = 'official-pricing' | 'official-documentation' | 'official-release' | 'benchmark' | 'community';
export type PricingMode = 'standard' | 'batch' | 'priority' | 'flex' | 'fast' | 'realtime';
export type PricingUnit = 'per_million_tokens' | 'per_request' | 'per_second' | 'per_image';

export type SourceReference = {
  url: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  checkedAt: string;
  retrievedAt?: string;
  archivedUrl?: string | null;
  notes?: string;
};

export type Organization = {
  id: string;
  name: string;
  website?: string;
  country?: string;
};

export type Model = {
  id: string;
  organizationId: string;
  name: string;
  family?: string;
  status: Status;
  releaseDate?: string | null;
  knowledgeCutoff?: string | null;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  modalities: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'file'>;
    output: Array<'text' | 'image' | 'audio' | 'video'>;
  };
  capabilities: {
    reasoning?: boolean | null;
    functionCalling?: boolean | null;
    structuredOutputs?: boolean | null;
    promptCaching?: boolean | null;
    batchApi?: boolean | null;
    fineTuning?: boolean | null;
    embeddings?: boolean | null;
    realtime?: boolean | null;
    webSearch?: boolean | null;
    computerUse?: boolean | null;
  };
  sources: SourceReference[];
  lastVerifiedAt: string;
};

export type Provider = {
  id: string;
  name: string;
  website?: string;
  pricingPage?: string;
  documentationPage?: string;
  directProvider: boolean;
};

export type PricingRule = {
  id: string;
  currency: 'USD';
  unit: PricingUnit;
  mode: PricingMode;
  inputPrice?: number | null;
  outputPrice?: number | null;
  cachedInputPrice?: number | null;
  cacheWritePrice?: number | null;
  audioInputPrice?: number | null;
  audioOutputPrice?: number | null;
  imageInputPrice?: number | null;
  imageOutputPrice?: number | null;
  minimumInputTokens?: number | null;
  maximumInputTokens?: number | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  notes?: string;
  sources: SourceReference[];
};

export type Offer = {
  id: string;
  modelId: string;
  providerId: string;
  apiModelId: string;
  availability: {
    status: Status;
    regions?: string[];
  };
  pricing: PricingRule[];
  rateLimits?: {
    requestsPerMinute?: number | null;
    inputTokensPerMinute?: number | null;
    outputTokensPerMinute?: number | null;
    notes?: string;
  };
  sources: SourceReference[];
  lastVerifiedAt: string;
};

export type BenchmarkResult = {
  id: string;
  offerId: string;
  benchmarkVersion: string;
  measuredAt: string;
  region?: string;
  concurrency: number;
  repetitions: number;
  inputTokens?: number;
  outputTokens?: number;
  timeToFirstTokenMsP50?: number | null;
  timeToFirstTokenMsP95?: number | null;
  outputTokensPerSecondP50?: number | null;
  outputTokensPerSecondP95?: number | null;
  totalLatencyMsP50?: number | null;
  sourceType: 'project-run' | 'community' | 'external';
  methodologyUrl: string;
  sourceUrl?: string;
  notes?: string;
};

export type PriceChangeEvent = {
  id: string;
  offerId: string;
  detectedAt: string;
  effectiveAt?: string | null;
  previousPricing: PricingRule[];
  currentPricing: PricingRule[];
  source: SourceReference;
  commitSha?: string;
  notes?: string;
};

export type Catalog = {
  schemaVersion: string;
  generatedAt: string;
  dataAsOf: string;
  organizations: Organization[];
  providers: Provider[];
  models: Model[];
  offers: Offer[];
  benchmarks: BenchmarkResult[];
  history: PriceChangeEvent[];
  sources: SourceReference[];
};

export type OfferView = Offer & {
  model: Model;
  provider: Provider;
  organization: Organization;
};

export type Staleness = 'fresh' | 'aging' | 'stale' | 'unknown';

export type CalculatorInput = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  requestsPerDay: number;
  daysPerMonth: number;
  retryRate: number;
  batchRate: number;
  users?: number;
  conversationsPerUser?: number;
  messagesPerConversation?: number;
};

export type CostBreakdown = {
  standardInput: number | null;
  cachedInput: number | null;
  cacheWrite: number | null;
  output: number | null;
  total: number | null;
};

export type CalculatorResult = {
  offerId: string;
  costPerRequest: number | null;
  dailyCost: number | null;
  monthlyCost: number | null;
  annualCost: number | null;
  adjustedRequestsPerDay: number;
  breakdown: CostBreakdown;
  warnings: string[];
  ruleIds: string[];
};
