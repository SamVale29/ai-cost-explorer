import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SourceReference } from '../src/types';

const sources = JSON.parse(
  await readFile(resolve(process.cwd(), 'data', 'sources', 'index.json'), 'utf8'),
) as SourceReference[];
const invalid = sources.filter((source) => {
  try {
    return !['http:', 'https:'].includes(new URL(source.url).protocol);
  } catch {
    return true;
  }
});
if (invalid.length) {
  console.error(`Source check failed: ${invalid.length} invalid URL(s).`);
  process.exitCode = 1;
} else {
  console.log(`Source URL check passed for ${sources.length} official references.`);
}

if (process.env.CHECK_SOURCES_NETWORK === '1') {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(8_000),
        });
        return { source, ok: response.ok || response.status === 405 };
      } catch {
        return { source, ok: false };
      }
    }),
  );
  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    console.warn(
      `Network source check found ${failures.length} unavailable URL(s); data is not mutated.`,
    );
    for (const failure of failures) console.warn(`- ${failure.source.url}`);
  } else {
    console.log('Network source check passed.');
  }
}
