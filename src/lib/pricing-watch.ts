import type { Model, Offer, PricingRule } from '../types';

export type PricingSignalComponent =
  | 'input'
  | 'output'
  | 'cachedInput'
  | 'cacheWrite'
  | 'audioInput'
  | 'audioOutput'
  | 'imageInput'
  | 'imageOutput';

export type PricingSignal = {
  offerId: string;
  ruleId: string;
  modelId: string;
  modelName: string | null;
  apiModelId: string;
  mode: PricingRule['mode'];
  component: PricingSignalComponent;
  value: number;
};

export type PricingSignalStatus = 'present' | 'missing';

export type PricingSignalEvidence = {
  signal: PricingSignal;
  status: PricingSignalStatus;
};

const priceFields: Array<readonly [PricingSignalComponent, keyof PricingRule]> = [
  ['input', 'inputPrice'],
  ['output', 'outputPrice'],
  ['cachedInput', 'cachedInputPrice'],
  ['cacheWrite', 'cacheWritePrice'],
  ['audioInput', 'audioInputPrice'],
  ['audioOutput', 'audioOutputPrice'],
  ['imageInput', 'imageInputPrice'],
  ['imageOutput', 'imageOutputPrice'],
];

function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function pricingSignalsFor(offers: Offer[], models: Model[], url: string): PricingSignal[] {
  const modelsById = new Map(models.map((model) => [model.id, model]));
  const signals: PricingSignal[] = [];

  for (const offer of offers) {
    if (offer.availability.status === 'retired') continue;
    const model = modelsById.get(offer.modelId);
    for (const rule of offer.pricing) {
      if (!rule.sources.some((source) => source.url === url)) continue;
      for (const [component, field] of priceFields) {
        const value = rule[field];
        if (!isNumeric(value)) continue;
        signals.push({
          offerId: offer.id,
          ruleId: rule.id,
          modelId: offer.modelId,
          modelName: model?.name ?? null,
          apiModelId: offer.apiModelId,
          mode: rule.mode,
          component,
          value,
        });
      }
    }
  }

  return signals.sort((left, right) =>
    pricingSignalKey(left).localeCompare(pricingSignalKey(right)),
  );
}

function visibleText(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:tr|li|p|div|section|article|h[1-6]|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .toLocaleLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberVariants(value: number): string[] {
  return [...new Set([String(value), value.toFixed(2), value.toFixed(3)])];
}

function containsPricingValue(body: string, value: number): boolean {
  return numberVariants(value).some((variant) => {
    const pattern = new RegExp(`(?<![\\d.])(?:\\$|USD\\s*)?${escapeRegExp(variant)}(?![\\d.])`);
    return pattern.test(body);
  });
}

function modelTokens(signal: PricingSignal): string[] {
  return [signal.modelName, signal.apiModelId, signal.apiModelId.split('/').at(-1), signal.modelId]
    .filter((token): token is string => Boolean(token && token.trim().length >= 3))
    .map((token) => token.toLocaleLowerCase().replace(/\s+/g, ' ').trim())
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .sort((left, right) => right.length - left.length);
}

function findAll(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  let fromIndex = 0;
  while (fromIndex < haystack.length) {
    const position = haystack.indexOf(needle, fromIndex);
    if (position < 0) break;
    positions.push(position);
    fromIndex = position + Math.max(needle.length, 1);
  }
  return positions;
}

type ModelMarker = { start: number; end: number; token: string };

function modelMarkers(body: string, signals: PricingSignal[]): ModelMarker[] {
  const tokens = [...new Set(signals.flatMap(modelTokens))];
  const markers = tokens.flatMap((token) =>
    findAll(body, token).map((start) => ({ start, end: start + token.length, token })),
  );

  return markers
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter(
      (marker, index, all) =>
        index === 0 || marker.start !== all[index - 1].start || marker.end > all[index - 1].end,
    );
}

function signalEvidence(
  body: string,
  signal: PricingSignal,
  markers: ModelMarker[],
): PricingSignalStatus {
  const ownTokens = new Set(modelTokens(signal));
  const ownMarkers = markers.filter((marker) => ownTokens.has(marker.token));
  if (ownMarkers.length === 0) return 'missing';

  for (const marker of ownMarkers) {
    const nextMarker = markers.find((candidate) => candidate.start > marker.end);
    const end = Math.min(nextMarker?.start ?? body.length, marker.start + 1600);
    const start = Math.max(0, marker.start - 220);
    if (containsPricingValue(body.slice(start, end), signal.value)) return 'present';
  }

  return 'missing';
}

export function pricingSignalEvidence(
  body: string,
  signals: PricingSignal[],
): PricingSignalEvidence[] {
  const compact = visibleText(body);
  const markers = modelMarkers(compact, signals);
  return signals.map((signal) => ({ signal, status: signalEvidence(compact, signal, markers) }));
}

export function pricingSignalKey(signal: PricingSignal): string {
  return [signal.offerId, signal.ruleId, signal.mode, signal.component, signal.value].join('|');
}

export function pricingFingerprint(body: string, signals: PricingSignal[]): string {
  return pricingSignalEvidence(body, signals)
    .sort((left, right) =>
      pricingSignalKey(left.signal).localeCompare(pricingSignalKey(right.signal)),
    )
    .map(({ signal, status }) => `${pricingSignalKey(signal)}:${status}`)
    .join('|');
}

export function countPricingSignals(body: string, signals: PricingSignal[]): number {
  return pricingSignalEvidence(body, signals).filter(({ status }) => status === 'present').length;
}
