// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildPages } from './static-pages';
import { robotsFor } from './page-meta';
import type { Model } from '../types';

it('builds real documents and route-specific metadata without changing CSP script hashes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'static-pages-'));
  try {
    const template = await readFile(resolve('index.html'), 'utf8');
    await writeFile(resolve(root, 'index.html'), template);
    const models = [{ id: 'model-a', name: 'Model A' }] as Model[];
    expect(await buildPages(root, models)).toBe(8);
    const calculator = await readFile(resolve(root, 'calculator/index.html'), 'utf8');
    expect(calculator).toContain('<title>Cost simulator · AI Cost Explorer</title>');
    expect(calculator).toContain('href="https://samvale29.github.io/ai-cost-explorer/calculator/"');
    expect(calculator.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)?.[0]).toBe(
      template.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)?.[0],
    );
    expect(await readFile(resolve(root, 'model/model-a/index.html'), 'utf8')).toContain(
      '<title>Model A · AI Cost Explorer</title>',
    );
    expect(await readFile(resolve(root, 'compare/index.html'), 'utf8')).toContain(
      'content="noindex,follow"',
    );
    expect(await readFile(resolve(root, '404.html'), 'utf8')).toContain('content="noindex,follow"');
    expect(await readFile(resolve(root, 'sitemap.xml'), 'utf8')).not.toContain('/compare/');
    expect(robotsFor('/calculator', '?in=100')).toBe('noindex,follow');
    await expect(readFile(resolve(root, 'unknown/index.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
