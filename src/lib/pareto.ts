import type { OfferView } from '../types';

export type ParetoPoint = {
  offer: OfferView;
  x: number;
  y: number;
  dominated: boolean;
};

export function paretoFrontier(points: ParetoPoint[]): ParetoPoint[] {
  return points.filter(
    (point) =>
      !points.some((candidate) => {
        if (candidate.offer.id === point.offer.id) return false;
        const noWorse = candidate.x <= point.x && candidate.y >= point.y;
        const strictlyBetter = candidate.x < point.x || candidate.y > point.y;
        return noWorse && strictlyBetter;
      }),
  );
}

export function scoreOffers(
  offers: OfferView[],
  weights: { cost: number; context: number; resources: number },
) {
  const maxContext = Math.max(...offers.map((offer) => offer.model.contextWindowTokens ?? 0), 1);
  const maxInputPrice = Math.max(
    ...offers.map(
      (offer) => offer.pricing.find((pricing) => pricing.mode === 'standard')?.inputPrice ?? 0,
    ),
    1,
  );
  return offers
    .map((offer) => {
      const rule = offer.pricing.find((pricing) => pricing.mode === 'standard');
      const costScore =
        rule?.inputPrice === null || rule?.inputPrice === undefined
          ? null
          : 1 - Math.min(1, rule.inputPrice / maxInputPrice);
      const contextScore = offer.model.contextWindowTokens
        ? offer.model.contextWindowTokens / maxContext
        : null;
      const resourceScore =
        [
          offer.model.capabilities.functionCalling,
          offer.model.capabilities.structuredOutputs,
          offer.model.capabilities.promptCaching,
        ].filter((value) => value === true).length / 3;
      const knownScores = [costScore, contextScore, resourceScore].filter(
        (value): value is number => value !== null,
      );
      const denominator = weights.cost + weights.context + weights.resources;
      const score =
        denominator === 0
          ? null
          : ((costScore ?? 0) * weights.cost +
              (contextScore ?? 0) * weights.context +
              resourceScore * weights.resources) /
            denominator;
      return { offer, score, knownFields: knownScores.length };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
