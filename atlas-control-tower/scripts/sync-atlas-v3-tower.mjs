import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSanitizedTowerSource } from '../v3/tower-source.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const towerDir = arg('--tower');
const out = arg('--out') || 'v3/tower-source.json';
const sourceRevision = arg('--source-revision') || undefined;
const generatedAt = arg('--generated-at') || undefined;

if (!towerDir) {
  console.error('Usage: node scripts/sync-atlas-v3-tower.mjs --tower <TOWER_V06 dir> [--out v3/tower-source.json] [--source-revision <revision>]');
  process.exit(2);
}

const source = await buildSanitizedTowerSource({ towerDir: path.resolve(towerDir), sourceRevision, generatedAt });
const target = path.resolve(out);
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(source, null, 2)}\n`);

console.log(JSON.stringify({
  state: 'SYNCED_SANITIZED_SOURCE',
  authority: source.control.atlas_truth_source,
  sourceVersion: source.sourceVersion,
  completeness: source.completeness,
  counts: Object.fromEntries(Object.entries(source.entities).map(([key, values]) => [key, values.length])),
  out: path.relative(process.cwd(), target)
}));
