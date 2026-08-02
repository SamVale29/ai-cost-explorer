import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const date = '2026-08-02';
const catalog = await readFile(resolve(root, 'public', 'data', 'catalog-v1.json'), 'utf8').catch(async () => readFile(resolve(root, 'data', 'offers', 'index.json'), 'utf8'));
const snapshotDir = resolve(root, 'data', 'snapshots');
await mkdir(snapshotDir, { recursive: true });
await writeFile(resolve(snapshotDir, `catalog-${date}.json`), catalog);
console.log(`Created immutable data snapshot for ${date}.`);
if (process.argv.includes('--diff')) console.log('Diff mode: compare this snapshot with the previous committed snapshot in review.');
