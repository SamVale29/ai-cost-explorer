import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SourceReference } from '../src/types';

const sources = JSON.parse(await readFile(resolve(process.cwd(), 'data', 'sources', 'index.json'), 'utf8')) as SourceReference[];

async function checkSource(source: SourceReference) {
  try {
    let response = await fetch(source.url, { method: 'HEAD', signal: AbortSignal.timeout(8_000) });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(source.url, { method: 'GET', headers: { Range: 'bytes=0-512' }, signal: AbortSignal.timeout(8_000) });
    }
    return { source, ok: response.ok || response.status === 405 || response.status === 403, status: response.status };
  } catch (error) {
    return { source, ok: false, status: error instanceof Error ? error.message : 'network error' };
  }
}

console.log(`# Pricing watch · ${new Date().toISOString()}`);
console.log(`Registered official sources: ${sources.length}`);
const results = await Promise.all(sources.map(checkSource));
const failures = results.filter((result) => !result.ok);

if (failures.length === 0) {
  console.log('All source URLs responded or explicitly rejected automated probing. No data was mutated.');
} else {
  console.warn(`Unavailable source URLs: ${failures.length}. This is a review signal, not an automatic data edit.`);
  for (const failure of failures) console.warn(`- ${failure.source.publisher}: ${failure.source.url} (${failure.status})`);
}
