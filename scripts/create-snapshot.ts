import { snapshotCatalog } from '../src/lib/snapshots';

const date = process.argv.find((argument) => argument.startsWith('--date='))?.slice(7);
if (!date)
  throw new Error(
    'Pass --date=YYYY-MM-DD; --diff compares that existing snapshot without writing.',
  );
console.log(await snapshotCatalog(process.cwd(), date, process.argv.includes('--diff')));
