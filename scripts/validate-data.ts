import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateDataSet } from '../src/lib/data-validation';

const root = resolve(process.cwd());
const entityNames = [
  'organizations',
  'providers',
  'models',
  'offers',
  'sources',
  'benchmarks',
  'history',
] as const;
const data = Object.fromEntries(
  await Promise.all(
    entityNames.map(async (name) => [
      name,
      JSON.parse(await readFile(resolve(root, 'data', name, 'index.json'), 'utf8')),
    ]),
  ),
);
const errors = validateDataSet(data);
const organizations = Array.isArray(data.organizations) ? data.organizations : [];
const models = Array.isArray(data.models) ? data.models : [];
const offers = Array.isArray(data.offers) ? data.offers : [];
const providers = Array.isArray(data.providers)
  ? (data.providers as Array<{ directProvider?: boolean }>)
  : [];
if (offers.length < 40)
  errors.push(`catalog has ${offers.length} offers; v0.1.0 target is at least 40`);
if (providers.filter((provider) => provider.directProvider).length < 8)
  errors.push('catalog has fewer than 8 direct API providers');

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Data validation passed: ${organizations.length} organizations, ${models.length} models, ${providers.length} providers, ${offers.length} offers.`,
  );
}
