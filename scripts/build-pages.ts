import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Catalog } from '../src/types';
import { buildPages } from '../src/lib/static-pages';

const catalog = JSON.parse(await readFile(resolve('dist/data/catalog-v1.json'), 'utf8')) as Catalog;
console.log(
  `Generated ${await buildPages(resolve('dist'), catalog.models)} static route documents with canonical metadata.`,
);
