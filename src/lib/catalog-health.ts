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
    offersWithPublicStandardPrices: number;
    offersWithPriceSources: number;
    modelsWithContextWindow: number;
    modelsWithMaxOutput: number;
    modelsWithCapabilitiesListed: number;
    modelsWithFieldEvidence: number;
  };
  snapshotAgeDays: number | null;
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
  if (date > asOf + 86_400_000) return 'unknown';
  if (days <= 30) return 'fresh';
  if (days <= 60) return 'aging';
  return 'stale';
}

export function calculateCatalogHealth(catalog: Catalog, now = new Date()): CatalogHealth {
  const asOf = new Date(`${catalog.dataAsOf}T23:59:59.999Z`);
  const standardRules = catalog.offers.map((offer) =>
    offer.availability.status === 'retired'
      ? null
      : choosePricingRule(offer.pricing, 'standard', 0, asOf),
  );
  const sourcesByFreshness = catalog.sources.reduce(
    (counts, source) => {
      const key = `${freshness(source.checkedAt, catalog.dataAsOf)}Sources` as keyof typeof counts;
      counts[key] += 1;
      return counts;
    },
    { freshSources: 0, agingSources: 0, staleSources: 0, unknownSources: 0 },
  );
  const modelsWithCapabilitiesListed = catalog.models.filter((model) =>
    Object.values(model.capabilities).some((value) => value !== null && value !== undefined),
  ).length;
  const snapshotTime = Date.parse(`${catalog.dataAsOf}T23:59:59.999Z`);
  const snapshotAgeDays = Number.isNaN(snapshotTime)
    ? null
    : Math.floor((now.getTime() - snapshotTime) / 86_400_000);

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
      offersWithPublicStandardPrices: countPercent(
        standardRules.filter((rule) => rule?.inputPrice != null && rule.outputPrice != null).length,
        catalog.offers.length,
      ),
      offersWithPriceSources: countPercent(
        standardRules.filter((rule) => (rule?.sources.length ?? 0) > 0).length,
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
      modelsWithCapabilitiesListed: countPercent(
        modelsWithCapabilitiesListed,
        catalog.models.length,
      ),
      modelsWithFieldEvidence: countPercent(
        catalog.models.filter((model) => Object.keys(model.evidenceByField ?? {}).length > 0)
          .length,
        catalog.models.length,
      ),
    },
    snapshotAgeDays: snapshotAgeDays !== null && snapshotAgeDays < 0 ? null : snapshotAgeDays,
    freshness: sourcesByFreshness,
    benchmarkStatus: catalog.benchmarks.length === 0 ? 'empty' : 'populated',
  };
}
