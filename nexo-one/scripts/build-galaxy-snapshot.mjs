// TOWER_V06 -> dist/system.json -> NEXO_ONE_GALAXY_V1 snapshots.
//
// This builder never owns operational truth. It consumes the already verified
// public SystemState produced by build-pages-system.mjs and derives only the
// visualization contract. A previous published snapshot may be supplied to
// compute honest deltas and to preserve bounded public history for future
// time-travel support.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { compileGalaxySnapshot } from '../src/viewmodels/galaxyCompiler.ts';
import { GALAXY_CONTRACT } from '../src/contracts/galaxy.ts';

const dist = resolve('dist');
const systemPath = resolve(dist, 'system.json');
const galaxyDir = resolve(dist, 'galaxy');
const snapshotsDir = resolve(galaxyDir, 'snapshots');
const previousPath = process.env.NEXO_GALAXY_PREVIOUS?.trim()
  ? resolve(process.env.NEXO_GALAXY_PREVIOUS.trim())
  : resolve(galaxyDir, 'previous.json');
const retention = Math.max(2, Math.min(720, Number(process.env.NEXO_GALAXY_RETENTION || 360) || 360));

function isSnapshot(value) {
  return Boolean(
    value
    && value.contract === GALAXY_CONTRACT
    && typeof value.snapshot_id === 'string'
    && /^galaxy-[0-9a-f]+$/i.test(value.snapshot_id)
    && typeof value.generated_at === 'string'
    && typeof value.tower_revision === 'string'
    && Array.isArray(value.entities)
    && Array.isArray(value.relations),
  );
}

async function readJsonIfValid(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return isSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

const system = JSON.parse(await readFile(systemPath, 'utf8'));
const previous = await readJsonIfValid(previousPath);
const snapshot = compileGalaxySnapshot(system, { previous });

await mkdir(snapshotsDir, { recursive: true });
const body = JSON.stringify(snapshot, null, 2) + '\n';
await writeFile(resolve(galaxyDir, 'latest.json'), body, 'utf8');
await writeFile(resolve(snapshotsDir, `${snapshot.snapshot_id}.json`), body, 'utf8');

const candidates = [];
for (const name of await readdir(snapshotsDir)) {
  if (!/^galaxy-[0-9a-f]+\.json$/i.test(name)) continue;
  const value = await readJsonIfValid(resolve(snapshotsDir, name));
  if (!value || basename(name, '.json') !== value.snapshot_id) {
    await rm(resolve(snapshotsDir, name), { force: true });
    continue;
  }
  candidates.push(value);
}

const byId = new Map();
for (const candidate of candidates) {
  const current = byId.get(candidate.snapshot_id);
  if (!current || Date.parse(candidate.generated_at) > Date.parse(current.generated_at)) {
    byId.set(candidate.snapshot_id, candidate);
  }
}

const history = [...byId.values()]
  .sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at) || a.snapshot_id.localeCompare(b.snapshot_id))
  .slice(0, retention);

const keep = new Set(history.map(item => item.snapshot_id));
for (const name of await readdir(snapshotsDir)) {
  const id = basename(name, '.json');
  if (/^galaxy-[0-9a-f]+$/i.test(id) && !keep.has(id)) {
    await rm(resolve(snapshotsDir, name), { force: true });
  }
}

const index = {
  contract: 'NEXO_ONE_GALAXY_INDEX_V1',
  generated_at: snapshot.generated_at,
  latest_snapshot_id: snapshot.snapshot_id,
  retention,
  snapshots: history.map(item => ({
    snapshot_id: item.snapshot_id,
    generated_at: item.generated_at,
    tower_revision: item.tower_revision,
    fingerprint: item.fingerprint,
    changes: Array.isArray(item.changes) ? item.changes.length : 0,
  })),
};

await writeFile(resolve(galaxyDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  contract: snapshot.contract,
  snapshot_id: snapshot.snapshot_id,
  tower_revision: snapshot.tower_revision,
  previous_snapshot_id: previous?.snapshot_id ?? null,
  history_size: history.length,
  changes: snapshot.changes.length,
  stats: snapshot.stats,
}));
