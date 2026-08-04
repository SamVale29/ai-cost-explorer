import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BenchmarkResult } from '../src/types';

async function load<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8')) as T;
}

const source = await load<BenchmarkResult[]>('data/benchmarks/index.json');
const publicArtifact = await load<BenchmarkResult[]>('public/data/benchmarks-v1.json');

if (!Array.isArray(source) || !Array.isArray(publicArtifact))
  throw new Error('Benchmark artifacts must be JSON arrays.');
if (JSON.stringify(source) !== JSON.stringify(publicArtifact))
  throw new Error('Benchmark source and public artifact are out of sync. Run pnpm data:build.');
if (source.length !== 0)
  throw new Error(
    `Benchmark guard failed: found ${source.length} record(s), but this repository is configured to keep benchmarks empty.`,
  );

console.log('Benchmark contract passed: source and public artifact are synchronized and empty.');
