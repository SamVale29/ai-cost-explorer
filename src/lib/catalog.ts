import type { Catalog, OfferView } from '../types';

let cachedCatalog: Catalog | null = null;

export async function loadCatalog(): Promise<Catalog> {
  if (cachedCatalog) return cachedCatalog;
  const response = await fetch(`${import.meta.env.BASE_URL}data/catalog-v1.json`);
  if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
  cachedCatalog = (await response.json()) as Catalog;
  return cachedCatalog;
}

export function hydrateOffers(catalog: Catalog): OfferView[] {
  const models = new Map(catalog.models.map((model) => [model.id, model]));
  const providers = new Map(catalog.providers.map((provider) => [provider.id, provider]));
  const organizations = new Map(
    catalog.organizations.map((organization) => [organization.id, organization]),
  );
  return catalog.offers.flatMap((offer) => {
    const model = models.get(offer.modelId);
    const provider = providers.get(offer.providerId);
    const organization = model ? organizations.get(model.organizationId) : undefined;
    return model && provider && organization ? [{ ...offer, model, provider, organization }] : [];
  });
}

export function findOffer(offers: OfferView[], offerId: string): OfferView | undefined {
  return offers.find((offer) => offer.id === offerId);
}

export function joinIds(ids: string[]): string {
  return ids.join(',');
}

export function parseIds(value: string | null): string[] {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
