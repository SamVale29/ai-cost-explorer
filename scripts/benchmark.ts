import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BenchmarkResult, Offer } from '../src/types';

const WARMUPS = 2;
const REPETITIONS = 5;
const PROMPT = 'Reply with one short sentence explaining why caching repeated context can reduce API cost.';
const METHODOLOGY_URL = 'https://github.com/omentordotrader-afk/ai-cost-explorer/blob/main/docs/benchmark-submission.md';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

type BenchmarkArgs = {
  provider: string;
  model: string;
  suite: string;
  execute: boolean;
  write: boolean;
  region: string;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

type Measurement = {
  timeToFirstTokenMs: number | null;
  totalLatencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

function parseArgs(argv: string[]): BenchmarkArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]?.replace(/^--/, '');
    if (key && !key.startsWith('-')) values.set(key, argv[index + 1] ?? '');
  }
  return {
    provider: values.get('provider') || 'openai',
    model: values.get('model') || 'gpt-4.1',
    suite: values.get('suite') || 'standard-v1',
    execute: argv.includes('--execute'),
    write: argv.includes('--write'),
    region: values.get('region') || 'provider-global',
  };
}

function percentile(values: number[], percentage: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentage;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? null;
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower);
}

function parseSseBlock(block: string): { delta: string; usage: Usage | null } {
  const data = block
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'))
    ?.slice('data:'.length)
    .trim();
  if (!data || data === '[DONE]') return { delta: '', usage: null };
  try {
    const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: Usage | null };
    return { delta: payload.choices?.[0]?.delta?.content ?? '', usage: payload.usage ?? null };
  } catch {
    return { delta: '', usage: null };
  }
}

async function runOpenAiMeasurement(model: string, apiKey: string): Promise<Measurement> {
  const startedAt = performance.now();
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_completion_tokens: 64,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 240).replaceAll(/\s+/g, ' ');
    throw new Error(`OpenAI API ${response.status}: ${body}`);
  }
  if (!response.body) throw new Error('OpenAI API returned no streaming body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenAt: number | null = null;
  let usage: Usage | null = null;

  const consume = (block: string) => {
    const parsed = parseSseBlock(block);
    if (parsed.delta && firstTokenAt === null) firstTokenAt = performance.now();
    if (parsed.usage) usage = parsed.usage;
  };

  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    blocks.forEach(consume);
    if (chunk.done) break;
  }
  if (buffer.trim()) consume(buffer);
  const finalUsage = usage as Usage | null;

  return {
    timeToFirstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
    totalLatencyMs: performance.now() - startedAt,
    inputTokens: finalUsage?.prompt_tokens ?? null,
    outputTokens: finalUsage?.completion_tokens ?? null,
  };
}

function medianTokenCount(measurements: Measurement[], key: 'inputTokens' | 'outputTokens'): number | undefined {
  const values = measurements.map((measurement) => measurement[key]).filter((value): value is number => value !== null);
  const median = percentile(values, 0.5);
  return median === null ? undefined : Math.round(median);
}

function makeBenchmarkResult(args: BenchmarkArgs, offer: Offer, measurements: Measurement[]): BenchmarkResult {
  const ttft = measurements.map((measurement) => measurement.timeToFirstTokenMs).filter((value): value is number => value !== null);
  const latency = measurements.map((measurement) => measurement.totalLatencyMs);
  const outputRates = measurements
    .map((measurement) => measurement.outputTokens === null ? null : measurement.outputTokens / (measurement.totalLatencyMs / 1_000))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const timestamp = new Date().toISOString();
  const stamp = timestamp.replaceAll(/[-:.TZ]/g, '').slice(0, 14);
  return {
    id: `benchmark-${args.provider}-${args.model}-${stamp}`,
    offerId: offer.id,
    benchmarkVersion: args.suite,
    measuredAt: timestamp,
    region: args.region,
    concurrency: 1,
    repetitions: measurements.length,
    inputTokens: medianTokenCount(measurements, 'inputTokens'),
    outputTokens: medianTokenCount(measurements, 'outputTokens'),
    timeToFirstTokenMsP50: percentile(ttft, 0.5),
    timeToFirstTokenMsP95: percentile(ttft, 0.95),
    outputTokensPerSecondP50: percentile(outputRates, 0.5),
    outputTokensPerSecondP95: percentile(outputRates, 0.95),
    totalLatencyMsP50: percentile(latency, 0.5),
    sourceType: 'project-run',
    methodologyUrl: METHODOLOGY_URL,
    sourceUrl: 'https://platform.openai.com/docs/api-reference/chat/create',
    notes: `OpenAI streaming Chat Completions; ${WARMUPS} warmups; fixed public prompt; no customer data; sequential concurrency 1.`,
  };
}

const args = parseArgs(process.argv.slice(2));
const apiKeyEnv: Record<string, string> = { openai: 'OPENAI_API_KEY' };
const apiKeyName = apiKeyEnv[args.provider];

console.log(`Benchmark harness configured for ${args.provider}/${args.model} (${args.suite}).`);
console.log(`Protocol: ${WARMUPS} warmups, ${REPETITIONS} measured repetitions, concurrency 1, streaming for TTFT, UTC timestamp, P50/P95.`);

if (!args.execute) {
  console.log('No paid benchmark was executed. Add --execute in a local environment to run one measurement.');
  process.exit(0);
}
if (!apiKeyName) throw new Error(`Provider ${args.provider} is not implemented by the safe local runner.`);
const apiKey = process.env[apiKeyName];
if (!apiKey) throw new Error(`${apiKeyName} is required for --execute and is never written to disk.`);

const offers = JSON.parse(await readFile(resolve(process.cwd(), 'data', 'offers', 'index.json'), 'utf8')) as Offer[];
const offer = offers.find((item) => item.providerId === args.provider && item.apiModelId === args.model);
if (!offer) throw new Error(`No catalog offer matches provider=${args.provider} and model=${args.model}.`);

const measurements: Measurement[] = [];
try {
  for (let warmup = 1; warmup <= WARMUPS; warmup += 1) {
    await runOpenAiMeasurement(args.model, apiKey);
    console.log(`Warmup ${warmup}/${WARMUPS} complete.`);
  }
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    const measurement = await runOpenAiMeasurement(args.model, apiKey);
    measurements.push(measurement);
    console.log(`Measurement ${repetition}/${REPETITIONS}: TTFT ${measurement.timeToFirstTokenMs?.toFixed(1) ?? 'n/a'} ms; total ${measurement.totalLatencyMs.toFixed(1)} ms.`);
  }
} catch (error) {
  console.error(`Benchmark failed before a complete result was produced: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const result = makeBenchmarkResult(args, offer, measurements);
console.log(JSON.stringify(result, null, 2));

if (args.write) {
  const benchmarkPath = resolve(process.cwd(), 'data', 'benchmarks', 'index.json');
  const current = JSON.parse(await readFile(benchmarkPath, 'utf8')) as BenchmarkResult[];
  await writeFile(benchmarkPath, `${JSON.stringify([...current, result], null, 2)}\n`);
  console.log(`Wrote ${result.id} to data/benchmarks/index.json. Run pnpm data:build before committing.`);
} else {
  console.log('Result not written. Add --write only after reviewing the output.');
}
