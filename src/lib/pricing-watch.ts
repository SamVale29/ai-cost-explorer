import type { Model, Offer, PricingMode, PricingRule } from '../types';

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
  mode: PricingMode;
  component: PricingSignalComponent;
  value: number;
  minimumInputTokens: number | null;
  maximumInputTokens: number | null;
  inputModality?: string | null;
  outputModality?: string | null;
};

export type PricingSignalStatus = 'present' | 'missing' | 'ambiguous';

export type PricingSignalEvidence = {
  signal: PricingSignal;
  status: PricingSignalStatus;
};

type ComponentDescriptor = {
  component: PricingSignalComponent;
  mode: PricingMode | null;
  range: PricingRange | null;
  boundaries: RangeBoundary[];
};

type PricingRange = 'base' | 'short' | 'long';

type RangeBoundary = {
  operator: '<' | '<=' | '>' | '>=';
  tokens: number;
};

type PricingRecord = {
  cells: string[];
  headers: string[];
  text: string;
  mode: PricingMode | null;
  range: PricingRange | null;
  boundaries: RangeBoundary[];
};

type XaiLanguageModel = {
  name?: string;
  promptTextTokenPrice?: string | number;
  promptTextTokenPriceLongContext?: string | number;
  cachedPromptTokenPrice?: string | number;
  cachedPromptTokenPriceLongContext?: string | number;
  completionTextTokenPrice?: string | number;
  completionTokenPriceLongContext?: string | number;
  batchDiscountPercent?: string | number;
  batchEnabled?: boolean;
};

type CellPrice = number | 'ambiguous' | null;

type NumericMatch = {
  value: number;
  start: number;
  end: number;
  currency: boolean;
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
          minimumInputTokens: rule.minimumInputTokens ?? null,
          maximumInputTokens: rule.maximumInputTokens ?? null,
          inputModality: model?.modalities?.input?.[0] ?? null,
          outputModality: model?.modalities?.output?.[0] ?? null,
        });
      }
    }
  }

  return signals.sort((left, right) =>
    pricingSignalKey(left).localeCompare(pricingSignalKey(right)),
  );
}

function stripMarkup(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:tr|li|p|div|section|article|h[1-6]|td|th)>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function visibleText(body: string): string {
  return stripMarkup(body)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function normalized(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumericCell(cell: string): CellPrice {
  const values = numericMatches(cell).map((match) => match.value);
  if (values.length === 0) return null;
  if (values.length > 1) return 'ambiguous';
  return values[0];
}

function numericMatches(cell: string): NumericMatch[] {
  return Array.from(cell.matchAll(/(?<![\w.])(?:USD\s*)?\$?\d+(?:[.,]\d+)?(?![\w.])/gi))
    .map((match) => {
      const numeric = match[0]
        .replace(/^USD\s*/i, '')
        .replace(/^\$/, '')
        .replace(',', '.');
      return {
        value: Number(numeric),
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        currency: /\$|^USD\b/i.test(match[0]),
      };
    })
    .filter((match) => Number.isFinite(match.value));
}

type NumericContext = {
  before: string;
  after: string;
};

function numericContext(
  cell: string,
  match: NumericMatch,
  index: number,
  matches: NumericMatch[],
): NumericContext {
  const previousEnd = matches[index - 1]?.end ?? 0;
  const beforeStart = index === 0 ? Math.max(0, match.start - 40) : previousEnd;
  const afterEnd = matches[index + 1]?.start ?? cell.length;
  return {
    before: cell.slice(beforeStart, match.start),
    after: cell.slice(match.end, afterEnd),
  };
}

function numericMatchesRange(context: NumericContext, expected: PricingRange): boolean {
  const afterRange = rangeFromText(context.after);
  return (afterRange ?? rangeFromText(context.before)) === expected;
}

function modeFromText(value: string): PricingMode | null {
  const text = normalized(value);
  if (/\b(batch|bulk)\b/.test(text)) return 'batch';
  if (/\b(priority)\b/.test(text)) return 'priority';
  if (/\b(flex)\b/.test(text)) return 'flex';
  if (/\b(realtime|real-time)\b/.test(text)) return 'realtime';
  if (/\b(fast)\b/.test(text)) return 'fast';
  if (/\b(standard|on[ -]?demand|pay[ -]?as[ -]?you[ -]?go)\b/.test(text)) return 'standard';
  return null;
}

function rangeFromText(value: string): PricingRange | null {
  const text = normalized(value);
  const long =
    /\b(long|extended)\s+context\b|\babove\b|\bover\b|\bgreater than\b|(?:>|>=)\s*\d/.test(text);
  const short =
    /\b(short|regular)\s+context\b|\bup to\b|\bbelow\b|\bless than\b|(?:<|<=)\s*\d/.test(text);
  if (long && short) return null;
  if (long) {
    return 'long';
  }
  if (short) {
    return 'short';
  }
  return null;
}

function parseTokenCount(raw: string, suffix?: string): number | null {
  const normalizedNumber =
    raw.includes(',') && raw.includes('.')
      ? raw.replace(/,/g, '')
      : /,\d{3}$/.test(raw)
        ? raw.replace(/,/g, '')
        : raw.replace(',', '.');
  const value = Number(normalizedNumber);
  if (!Number.isFinite(value)) return null;
  const multiplier = /^(?:k|thousand)$/i.test(suffix ?? '')
    ? 1_000
    : /^(?:m|million)$/i.test(suffix ?? '')
      ? 1_000_000
      : 1;
  const tokens = value * multiplier;
  return Number.isSafeInteger(tokens) ? tokens : null;
}

function rangeBoundariesFromText(value: string): RangeBoundary[] {
  const boundaries: RangeBoundary[] = [];
  const addBoundary = (operator: RangeBoundary['operator'], raw: string, suffix?: string) => {
    const tokens = parseTokenCount(raw, suffix);
    if (tokens === null) return;
    if (
      !boundaries.some((boundary) => boundary.operator === operator && boundary.tokens === tokens)
    ) {
      boundaries.push({ operator, tokens });
    }
  };
  const directPattern =
    /(?:^|[^\w])([<>]=?)\s*([\d]+(?:[.,][\d]+)?)\s*(k|m|thousand|million)?(?:\s+tokens?)?/gi;
  for (const match of value.matchAll(directPattern)) {
    addBoundary(match[1] as RangeBoundary['operator'], match[2], match[3]);
  }
  const phrasePatterns: Array<[RegExp, RangeBoundary['operator']]> = [
    [/(?:above|over|greater than)\s*([\d]+(?:[.,][\d]+)?)\s*(k|m|thousand|million)?/gi, '>'],
    [/(?:up to|below|less than)\s*([\d]+(?:[.,][\d]+)?)\s*(k|m|thousand|million)?/gi, '<'],
  ];
  for (const [pattern, operator] of phrasePatterns) {
    for (const match of value.matchAll(pattern)) addBoundary(operator, match[1], match[2]);
  }
  return boundaries;
}

function rangeBoundaryMatchesSignal(signal: PricingSignal, boundary: RangeBoundary): boolean {
  if (signal.minimumInputTokens !== null && signal.minimumInputTokens !== undefined) {
    return (
      (boundary.operator === '>' && boundary.tokens === signal.minimumInputTokens - 1) ||
      (boundary.operator === '>=' && boundary.tokens === signal.minimumInputTokens)
    );
  }
  if (signal.maximumInputTokens !== null && signal.maximumInputTokens !== undefined) {
    return (
      (boundary.operator === '<' && boundary.tokens === signal.maximumInputTokens + 1) ||
      (boundary.operator === '<=' && boundary.tokens === signal.maximumInputTokens)
    );
  }
  return false;
}

function numericMatchesSignalRange(context: NumericContext, signal: PricingSignal): boolean {
  const boundary =
    rangeBoundariesFromText(context.after)[0] ?? rangeBoundariesFromText(context.before)[0];
  return boundary
    ? rangeBoundaryMatchesSignal(signal, boundary)
    : signalRange(signal) === 'base' || numericMatchesRange(context, signalRange(signal));
}

function componentDescriptor(value: string): ComponentDescriptor | null {
  const text = normalized(value);
  const range = rangeFromText(text);
  const mode = modeFromText(text);
  const boundaries = rangeBoundariesFromText(text);
  if (/cache\s*(write|creation)|write\s*cache/.test(text)) {
    return { component: 'cacheWrite', mode, range, boundaries };
  }
  if (/cached|context\s+caching|cache\s*(hit|read)/.test(text)) {
    return { component: 'cachedInput', mode, range, boundaries };
  }
  if (/audio\s*(input|in)|input\s*(audio|minutes?)/.test(text)) {
    return { component: 'audioInput', mode, range, boundaries };
  }
  if (/audio\s*(output|out)|output\s*(audio|minutes?)/.test(text)) {
    return { component: 'audioOutput', mode, range, boundaries };
  }
  if (/image\s*(input|in)|input\s*(image|megapixel)/.test(text)) {
    return { component: 'imageInput', mode, range, boundaries };
  }
  if (/image\s*(output|out)|output\s*(image|megapixel)/.test(text)) {
    return { component: 'imageOutput', mode, range, boundaries };
  }
  if (/\b(output|completion|generated)\b/.test(text)) {
    return { component: 'output', mode, range, boundaries };
  }
  if (/\b(input|prompt)\b/.test(text)) {
    return { component: 'input', mode, range, boundaries };
  }
  return null;
}

function rowIsHeader(cells: string[], headerFlags: boolean[]): boolean {
  const descriptors = cells.filter((cell) => componentDescriptor(cell) !== null).length;
  const headerText = normalized(cells.join(' '));
  return (
    headerFlags.some(Boolean) &&
    (descriptors > 0 || /\b(model|mode|free|paid|price|pricing|tier|context)\b/.test(headerText))
  );
}

type HtmlRow = {
  cells: string[];
  headerFlags: boolean[];
  colSpans: number[];
};

function expandedCells(row: HtmlRow): string[] {
  return row.cells.flatMap((cell, index) =>
    Array.from({ length: row.colSpans[index] ?? 1 }, () => cell),
  );
}

function htmlRows(body: string): PricingRecord[] {
  const records: PricingRecord[] = [];
  const tables = Array.from(body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi));
  for (const table of tables) {
    const rows: Array<HtmlRow & { index: number }> = Array.from(
      table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
    ).map((row, index) => {
      const cells = Array.from(row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
      return {
        index,
        cells: cells.map((cell) =>
          stripMarkup(cell[3])
            .replace(/[ \t]+/g, ' ')
            .trim(),
        ),
        headerFlags: cells.map((cell) => cell[1].toLocaleLowerCase() === 'th'),
        colSpans: cells.map((cell) =>
          Number(cell[2].match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1),
        ),
      };
    });
    const headerRows = rows.filter((row) => rowIsHeader(row.cells, row.headerFlags));
    if (headerRows.length === 0) continue;
    const columnHeader = [...headerRows].sort(
      (left, right) =>
        expandedCells(right).filter((cell) => componentDescriptor(cell) !== null).length -
        expandedCells(left).filter((cell) => componentDescriptor(cell) !== null).length,
    )[0];
    const baseHeaders = expandedCells(columnHeader);
    const groupHeaders = headerRows
      .filter((row) => row.index !== columnHeader.index)
      .map((row) => expandedCells(row));
    const leadingHeaderColumns = Math.max(
      0,
      ...groupHeaders.map((group) => group.length - baseHeaders.length),
    );
    const alignedBaseHeaders = [
      ...Array.from({ length: leadingHeaderColumns }, () => ''),
      ...baseHeaders,
    ];
    const headers = alignedBaseHeaders.map((header, columnIndex) => {
      const groups = groupHeaders
        .map((group) => group[columnIndex])
        .filter(
          (group) => group && (rangeFromText(group) !== null || modeFromText(group) !== null),
        );
      return [...groups, header].filter(Boolean).join(' ');
    });
    const beforeTable = body.slice(0, table.index ?? 0);
    const headings = Array.from(beforeTable.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)).map(
      (heading) => ({
        level: Number(heading[1]),
        text: stripMarkup(heading[2]).replace(/\s+/g, ' ').trim(),
      }),
    );
    let modelHeadingIndex = -1;
    for (let index = headings.length - 1; index >= 0; index -= 1) {
      if (headings[index].level <= 2) {
        modelHeadingIndex = index;
        break;
      }
    }
    const modelHeading = headings[modelHeadingIndex];
    const modeHeading = headings.slice(modelHeadingIndex < 0 ? 0 : modelHeadingIndex + 1).at(-1);
    const context = [modelHeading?.text, modeHeading?.text].filter(Boolean).join(' | ');
    const firstDataIndex = Math.max(...headerRows.map((row) => row.index)) + 1;
    for (const row of rows.filter((candidate) => candidate.index >= firstDataIndex)) {
      if (row.cells.length === 0 || rowIsHeader(row.cells, row.headerFlags)) continue;
      const rowText = row.cells.join(' | ');
      const text = [context, rowText].filter(Boolean).join(' | ');
      records.push({
        cells: row.cells,
        headers,
        text,
        mode: modeFromText(text),
        range: rangeFromText(text),
        boundaries: rangeBoundariesFromText(text),
      });
    }
  }
  return records;
}

function splitTableLine(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function markdownRows(body: string): PricingRecord[] {
  const lines = visibleText(body)
    .split('\n')
    .map((line) => line.trim());
  const records: PricingRecord[] = [];
  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!lines[index].includes('|') || !/^\|?\s*:?-{2,}/.test(lines[index + 1])) continue;
    const headers = splitTableLine(lines[index]);
    for (
      let rowIndex = index + 2;
      rowIndex < lines.length && lines[rowIndex].includes('|');
      rowIndex += 1
    ) {
      const cells = splitTableLine(lines[rowIndex]);
      if (cells.length === 0) continue;
      const text = cells.join(' | ');
      records.push({
        cells,
        headers,
        text,
        mode: modeFromText(text),
        range: rangeFromText(text),
        boundaries: rangeBoundariesFromText(text),
      });
    }
    index += 1;
  }
  return records;
}

function modelTokens(signal: PricingSignal): string[] {
  return [signal.modelName, signal.apiModelId, signal.apiModelId.split('/').at(-1), signal.modelId]
    .filter((token): token is string => Boolean(token && token.trim().length >= 3))
    .map(normalized)
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .sort((left, right) => right.length - left.length);
}

function containsToken(text: string, token: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}([^a-z0-9]|$)`, 'i');
  return pattern.test(text);
}

function labeledTextRecords(body: string, signals: PricingSignal[]): PricingRecord[] {
  const lines = visibleText(body)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const tokens = [...new Set(signals.flatMap(modelTokens))];
  const labelPattern =
    /cache\s*(?:write|creation)|cached(?:\s+input)?|audio\s*(?:input|output)|image\s*(?:input|output)|input|prompt|output|completion/gi;
  const records: PricingRecord[] = [];

  for (const line of lines) {
    const lower = normalized(line);
    if (!tokens.some((token) => containsToken(lower, token))) continue;
    const labels = Array.from(line.matchAll(labelPattern));
    if (labels.length === 0) continue;
    const cells: string[] = [];
    const headers: string[] = [];
    labels.forEach((label, index) => {
      const end = labels[index + 1]?.index ?? line.length;
      const header = label[0];
      const cell = line.slice(label.index! + header.length, end).trim();
      if (parseNumericCell(cell) === null) return;
      headers.push(header);
      cells.push(cell);
    });
    if (cells.length === 0) continue;
    records.push({
      cells,
      headers,
      text: line,
      mode: modeFromText(line),
      range: rangeFromText(line),
      boundaries: rangeBoundariesFromText(line),
    });
  }
  return records;
}

function pricingRecords(body: string, signals: PricingSignal[]): PricingRecord[] {
  const structured = htmlRows(body);
  const xaiBatch = xaiBatchRecords(body);
  if (structured.length > 0) return [...structured, ...xaiBatch];
  const markdown = markdownRows(body);
  if (markdown.length > 0) return [...markdown, ...xaiBatch];
  return [...labeledTextRecords(body, signals), ...xaiBatch];
}

function embeddedJsonObject(body: string, marker: string): unknown | null {
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = body.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function xaiBatchValue(value: string | number | undefined, discount: number): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const discounted = (numeric / 10_000) * (1 - discount / 100);
  return '$' + Number(discounted.toFixed(8));
}

function xaiBatchRecords(body: string): PricingRecord[] {
  const root = embeddedJsonObject(body, 'globalThis.__XAI_PUBLIC_MODELS__=');
  if (!root || typeof root !== 'object') return [];
  const configs = (root as { clusterConfigs?: unknown }).clusterConfigs;
  if (!Array.isArray(configs)) return [];
  const languageModels = configs.flatMap((config) => {
    if (!config || typeof config !== 'object') return [];
    const models = (config as { languageModels?: unknown }).languageModels;
    return Array.isArray(models) ? (models as XaiLanguageModel[]) : [];
  });
  const records: PricingRecord[] = [];
  for (const model of languageModels) {
    const discount = Number(model.batchDiscountPercent);
    if (!model.name || !model.batchEnabled || !Number.isFinite(discount) || discount <= 0) continue;
    const ranges = [
      {
        label: 'short context',
        input: model.promptTextTokenPrice,
        cached: model.cachedPromptTokenPrice,
        output: model.completionTextTokenPrice,
      },
      {
        label: 'long context',
        input: model.promptTextTokenPriceLongContext,
        cached: model.cachedPromptTokenPriceLongContext,
        output: model.completionTokenPriceLongContext,
      },
    ];
    for (const range of ranges) {
      const input = xaiBatchValue(range.input, discount);
      const cached = xaiBatchValue(range.cached, discount);
      const output = xaiBatchValue(range.output, discount);
      if (!input || !cached || !output) continue;
      records.push({
        cells: [model.name, input, cached, output],
        headers: [
          'Model',
          'Input ' + range.label,
          'Cached ' + range.label,
          'Output ' + range.label,
        ],
        text: model.name + ' batch ' + range.label,
        mode: 'batch',
        range: range.label === 'short context' ? 'short' : 'long',
        boundaries: [],
      });
    }
  }
  return records;
}

function signalRange(signal: PricingSignal): PricingRange {
  if (signal.minimumInputTokens !== null && signal.minimumInputTokens !== undefined) return 'long';
  if (signal.maximumInputTokens !== null && signal.maximumInputTokens !== undefined) return 'short';
  return 'base';
}

function recordMatchesSignal(record: PricingRecord, signal: PricingSignal): boolean {
  const text = normalized(record.text);
  return modelTokens(signal).some((token) => containsToken(text, token));
}

function modeMatches(
  signal: PricingSignal,
  descriptor: ComponentDescriptor,
  record: PricingRecord,
): boolean {
  const mode = descriptor.mode ?? record.mode;
  if (mode !== null) return mode === signal.mode;
  return signal.mode === 'standard';
}

function rangeMatches(
  signal: PricingSignal,
  descriptor: ComponentDescriptor,
  record: PricingRecord,
  cell: string,
): boolean {
  if (descriptor.boundaries.length > 0) {
    return descriptor.boundaries.some((boundary) => rangeBoundaryMatchesSignal(signal, boundary));
  }
  const range = descriptor.range ?? record.range;
  const expected = signalRange(signal);
  const matches = numericMatches(cell);
  const cellBoundaries = matches.flatMap((match, index) => {
    const context = numericContext(cell, match, index, matches);
    return [...rangeBoundariesFromText(context.after), ...rangeBoundariesFromText(context.before)];
  });
  if (cellBoundaries.length > 0) {
    return cellBoundaries.some((boundary) => rangeBoundaryMatchesSignal(signal, boundary));
  }
  if (record.boundaries.length === 1) {
    return rangeBoundaryMatchesSignal(signal, record.boundaries[0]);
  }
  if (range !== null) return range === expected;
  if (expected === 'base') return true;
  return matches.some((match, index) => {
    const context = numericContext(cell, match, index, matches);
    return numericMatchesSignalRange(context, signal);
  });
}

function signalModality(signal: PricingSignal): string | null {
  if (signal.component === 'audioInput' || signal.component === 'audioOutput') return 'audio';
  if (signal.component === 'imageInput' || signal.component === 'imageOutput') return 'image';
  if (signal.component === 'output') return signal.outputModality ?? null;
  return signal.inputModality ?? null;
}

function cellPriceForSignal(cell: string, signal: PricingSignal): CellPrice {
  const parsed = parseNumericCell(cell);
  if (parsed !== 'ambiguous') return parsed;
  const modality = signalModality(signal);
  const modalityPattern = /\b(?:text|audio|image|video)\b/i;
  const allMatches = numericMatches(cell);
  const priceMatches = allMatches.some((match) => match.currency)
    ? allMatches.filter((match) => match.currency)
    : allMatches;
  const matches = priceMatches.filter((match, index) => {
    const context = numericContext(cell, match, index, priceMatches);
    if (/\bstorage\s+price\b/i.test(context.after)) return false;
    const rangeMatches = numericMatchesSignalRange(context, signal);
    const afterHasModality = modalityPattern.test(context.after);
    const cellHasModality = modalityPattern.test(cell);
    const modalityMatches =
      !modality ||
      !cellHasModality ||
      new RegExp(`\\b${escapeRegExp(modality)}\\b`, 'i').test(context.after) ||
      (!afterHasModality &&
        new RegExp(`\\b${escapeRegExp(modality)}\\b`, 'i').test(context.before));
    return rangeMatches && modalityMatches;
  });
  if (matches.length === 0) return null;
  if (matches.length > 1) return 'ambiguous';
  return matches[0].value;
}

function signalCellStatus(record: PricingRecord, signal: PricingSignal): PricingSignalStatus {
  const candidates: CellPrice[] = [];
  const rowLabel = componentDescriptor(record.cells[0] ?? '');
  for (let index = 0; index < record.cells.length; index += 1) {
    const header = record.headers[index] ?? '';
    const descriptor =
      componentDescriptor(header) ??
      (index > 0 && rowLabel
        ? {
            ...rowLabel,
            mode: rowLabel.mode ?? record.mode,
            range: rowLabel.range ?? record.range,
          }
        : null);
    if (!descriptor || descriptor.component !== signal.component) continue;
    if (
      !modeMatches(signal, descriptor, record) ||
      !rangeMatches(signal, descriptor, record, record.cells[index])
    )
      continue;
    candidates.push(cellPriceForSignal(record.cells[index], signal));
  }
  if (candidates.length === 0) return 'ambiguous';
  if (candidates.includes('ambiguous')) return 'ambiguous';
  if (candidates.some((candidate) => typeof candidate === 'number' && candidate === signal.value)) {
    return 'present';
  }
  return 'missing';
}

export function pricingSignalEvidence(
  body: string,
  signals: PricingSignal[],
): PricingSignalEvidence[] {
  const records = pricingRecords(body, signals);
  return signals.map((signal) => {
    const matchingRecords = records.filter((record) => recordMatchesSignal(record, signal));
    const statuses = matchingRecords.map((record) => signalCellStatus(record, signal));
    if (statuses.includes('present')) return { signal, status: 'present' };
    if (statuses.includes('missing')) return { signal, status: 'missing' };
    return { signal, status: 'ambiguous' };
  });
}

export function pricingSignalKey(signal: PricingSignal): string {
  return [
    signal.offerId,
    signal.ruleId,
    signal.mode,
    signal.component,
    signal.value,
    signal.minimumInputTokens ?? '',
    signal.maximumInputTokens ?? '',
  ].join('|');
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
