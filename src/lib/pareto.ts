import { offerCapabilities, type OfferView } from '../types';
import { standardRule } from './pricing';

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
  options: { inputTokens?: number; asOf?: Date } = {},
) {
  const knownContexts = offers
    .map((offer) => offer.model.contextWindowTokens)
    .filter((value): value is number => value !== null && value !== undefined);
  const maxContext = Math.max(...knownContexts, 1);
  const maxInputPrice = Math.max(
    ...offers.map((offer) => standardRule({ offer }, options)?.inputPrice ?? 0),
    1,
  );
  return offers
    .map((offer) => {
      const rule = standardRule({ offer }, options);
      const costScore =
        rule?.inputPrice === null || rule?.inputPrice === undefined
          ? null
          : 1 - Math.min(1, rule.inputPrice / maxInputPrice);
      const contextScore = offer.model.contextWindowTokens
        ? offer.model.contextWindowTokens / maxContext
        : null;
      const capabilities = offerCapabilities(offer);
      const resourceValues = [
        capabilities.functionCalling,
        capabilities.structuredOutputs,
        capabilities.promptCaching,
      ];
      const knownResourceValues = resourceValues.filter(
        (value): value is boolean => value !== null && value !== undefined,
      );
      const resourceScore =
        knownResourceValues.length !== resourceValues.length
          ? null
          : knownResourceValues.filter(Boolean).length / knownResourceValues.length;
      const selectedScores: Array<[number | null, number]> = [];
      if (weights.cost > 0) selectedScores.push([costScore, weights.cost]);
      if (weights.context > 0) selectedScores.push([contextScore, weights.context]);
      if (weights.resources > 0) selectedScores.push([resourceScore, weights.resources]);
      const denominator = selectedScores.reduce((sum, [, weight]) => sum + weight, 0);
      const score =
        denominator === 0 || selectedScores.some(([value]) => value === null)
          ? null
          : selectedScores.reduce((sum, [value, weight]) => sum + (value ?? 0) * weight, 0) /
            denominator;
      const knownFields = [costScore, contextScore, resourceScore].filter(
        (value): value is number => value !== null,
      ).length;
      return { offer, score, knownFields };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
