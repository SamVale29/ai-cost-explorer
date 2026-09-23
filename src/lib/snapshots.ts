import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { catalogSchema } from './data-validation';

export async function snapshotCatalog(root: string, date: string, diff = false): Promise<string> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('An explicit valid --date=YYYY-MM-DD is required.');
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(resolve(root, 'public/data/catalog-v1.json'), 'utf8')),
  );
  const path = resolve(root, 'data/snapshots', `catalog-${date}.json`);
  if (diff) {
    const previous = catalogSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const entities = [
      'organizations',
      'providers',
      'models',
      'offers',
      'sources',
      'benchmarks',
      'history',
    ] as const;
    const changes = Object.fromEntries(
      entities.map((entity) => {
        const key = (item: { id?: string; url?: string }) => item.id ?? item.url!;
        const before = new Map(previous[entity].map((item) => [key(item), item]));
        const after = new Map(catalog[entity].map((item) => [key(item), item]));
        return [
          entity,
          {
            added: [...after.keys()].filter((id) => !before.has(id)),
            removed: [...before.keys()].filter((id) => !after.has(id)),
            changed: [...after.keys()].filter(
              (id) =>
                before.has(id) && JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
            ),
          },
        ];
      }),
    );
    return JSON.stringify(
      {
        against: date,
        ...changes.offers,
        entities: changes,
      },
      null,
      2,
    );
  }
  await mkdir(resolve(root, 'data/snapshots'), { recursive: true });
  await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
  return `Created immutable catalog snapshot ${path}.`;
}
