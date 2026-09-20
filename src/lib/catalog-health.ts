import type { Catalog } from '../types';
import { choosePricingRule } from './pricing';

export type CatalogHealth = {
  schemaVersion: 'v1';
  generatedAt: string;
  dataAsOf: string;
  totals: {
    organizations: number;
    providers: number;
    directProviders: number;
    models: number;
    offers: number;
    sources: number;
    historyEvents: number;
    benchmarks: number;
  };
  coverage: {
    offersWithStandardInputPrice: number;
    offersWithStandardOutputPrice: number;
    offersWithSources: number;
    modelsWithContextWindow: number;
    modelsWithMaxOutput: number;
    modelsWithVerifiedCapability: number;
  };
  freshness: {
    freshSources: number;
    agingSources: number;
    staleSources: number;
    unknownSources: number;
  };
  benchmarkStatus: 'empty' | 'populated';
};

function countPercent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function freshness(
  value: string | undefined,
  dataAsOf: string,
): 'fresh' | 'aging' | 'stale' | 'unknown' {
  if (!value) return 'unknown';
  const date = Date.parse(value);
  const asOf = Date.parse(dataAsOf);
  if (Number.isNaN(date) || Number.isNaN(asOf)) return 'unknown';
  const days = Math.max(0, Math.floor((asOf - date) / 86_400_000));
  if (days <= 30) return 'fresh';
  if (days <= 60) return 'aging';
  return 'stale';
}

export function calculateCatalogHealth(catalog: Catalog): CatalogHealth {
  const asOf = new Date(`${catalog.dataAsOf}T23:59:59.999Z`);
  const standardRules = catalog.offers.map((offer) =>
    choosePricingRule(offer.pricing, 'standard', 0, asOf),
  );
  const sourcesByFreshness = catalog.sources.reduce(
    (counts, source) => {
      const key = `${freshness(source.checkedAt, catalog.dataAsOf)}Sources` as keyof typeof counts;
      counts[key] += 1;
      return counts;
    },
    { freshSources: 0, agingSources: 0, staleSources: 0, unknownSources: 0 },
  );
  const modelsWithVerifiedCapability = catalog.models.filter((model) =>
    Object.values(model.capabilities).some((value) => value !== null && value !== undefined),
  ).length;

  return {
    schemaVersion: 'v1',
    generatedAt: catalog.generatedAt,
    dataAsOf: catalog.dataAsOf,
    totals: {
      organizations: catalog.organizations.length,
      providers: catalog.providers.length,
      directProviders: catalog.providers.filter((provider) => provider.directProvider).length,
      models: catalog.models.length,
      offers: catalog.offers.length,
      sources: catalog.sources.length,
      historyEvents: catalog.history.length,
      benchmarks: catalog.benchmarks.length,
    },
    coverage: {
      offersWithStandardInputPrice: countPercent(
        standardRules.filter((rule) => rule?.inputPrice !== null && rule?.inputPrice !== undefined)
          .length,
        catalog.offers.length,
      ),
      offersWithStandardOutputPrice: countPercent(
        standardRules.filter(
          (rule) => rule?.outputPrice !== null && rule?.outputPrice !== undefined,
        ).length,
        catalog.offers.length,
      ),
      offersWithSources: countPercent(
        catalog.offers.filter((offer) => offer.sources.length > 0).length,
        catalog.offers.length,
      ),
      modelsWithContextWindow: countPercent(
        catalog.models.filter(
          (model) => model.contextWindowTokens !== null && model.contextWindowTokens !== undefined,
        ).length,
        catalog.models.length,
      ),
      modelsWithMaxOutput: countPercent(
        catalog.models.filter(
          (model) => model.maxOutputTokens !== null && model.maxOutputTokens !== undefined,
        ).length,
        catalog.models.length,
      ),
      modelsWithVerifiedCapability: countPercent(
        modelsWithVerifiedCapability,
        catalog.models.length,
      ),
    },
    freshness: sourcesByFreshness,
    benchmarkStatus: catalog.benchmarks.length === 0 ? 'empty' : 'populated',
  };
}
