// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { snapshotCatalog } from './snapshots';

it('creates validated snapshots exclusively and diff never writes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'catalog-snapshot-'));
  try {
    const catalog = {
      schemaVersion: 'v1',
      generatedAt: '2026-09-23T00:00:00Z',
      dataAsOf: '2026-09-23',
      organizations: [],
      providers: [],
      models: [],
      offers: [],
      sources: [],
      history: [],
      benchmarks: [],
    };
    await mkdir(resolve(root, 'public/data'), { recursive: true });
    await writeFile(resolve(root, 'public/data/catalog-v1.json'), JSON.stringify(catalog));
    await expect(snapshotCatalog(root, '2026-02-30')).rejects.toThrow('valid');
    await snapshotCatalog(root, '2026-09-23');
    const path = resolve(root, 'data/snapshots/catalog-2026-09-23.json');
    const original = await readFile(path, 'utf8');
    await expect(snapshotCatalog(root, '2026-09-23')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(JSON.parse(await snapshotCatalog(root, '2026-09-23', true))).toMatchObject({
      added: [],
      removed: [],
      changed: [],
    });
    await expect(snapshotCatalog(root, '2026-09-24', true)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await readdir(resolve(root, 'data/snapshots'))).toEqual(['catalog-2026-09-23.json']);
    expect(await readFile(path, 'utf8')).toBe(original);
    await writeFile(resolve(root, 'public/data/catalog-v1.json'), '[]');
    await expect(snapshotCatalog(root, '2026-09-24')).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
