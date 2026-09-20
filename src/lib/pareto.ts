import type { OfferView } from '../types';
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
      const resourceValues = [
        offer.model.capabilities.functionCalling,
        offer.model.capabilities.structuredOutputs,
        offer.model.capabilities.promptCaching,
      ];
      const knownResourceValues = resourceValues.filter(
        (value): value is boolean => value !== null && value !== undefined,
      );
      const resourceScore =
        knownResourceValues.length === 0
          ? null
          : knownResourceValues.filter(Boolean).length / knownResourceValues.length;
      const knownScores = [costScore, contextScore, resourceScore].filter(
        (value): value is number => value !== null,
      );
      const weightedScores: Array<[number, number]> = [];
      if (costScore !== null && weights.cost > 0) weightedScores.push([costScore, weights.cost]);
      if (contextScore !== null && weights.context > 0)
        weightedScores.push([contextScore, weights.context]);
      if (resourceScore !== null && weights.resources > 0)
        weightedScores.push([resourceScore, weights.resources]);
      const denominator = weightedScores.reduce((sum, [, weight]) => sum + weight, 0);
      const score =
        denominator === 0
          ? null
          : weightedScores.reduce((sum, [value, weight]) => sum + value * weight, 0) / denominator;
      return { offer, score, knownFields: knownScores.length };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
