// TOWER_V06 -> dist/system.json (build-pages-system.mjs) -> GalaxySnapshot -> dist/galaxy/.
//
// Runs after build-pages-system.mjs so dist/system.json already exists and is
// fingerprint-bound to the sanctioned Tower projection (see
// nexo-one-pages.yml's readback step, which checks system.bus.fingerprint against
// the Tower projection manifest). This script only re-projects that same SystemState
// into the galaxy contract; it does not read Tower data on its own and cannot diverge
// from the authority already verified upstream.
//
// The 2-hour refresh schedule and any previous-snapshot diffing across real builds are
// finished in a later stage; this script only has to produce a correct, versioned
// snapshot for a single build. When no prior snapshot is available (the normal case
// for a single CI run), `changes` is correctly empty rather than fabricated.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compileGalaxySnapshot } from '../src/viewmodels/galaxyCompiler.ts';

const dist = resolve('dist');
const systemPath = resolve(dist, 'system.json');
const galaxyDir = resolve(dist, 'galaxy');
const snapshotsDir = resolve(galaxyDir, 'snapshots');

const system = JSON.parse(await readFile(systemPath, 'utf8'));
const snapshot = compileGalaxySnapshot(system, { previous: null });

await mkdir(snapshotsDir, { recursive: true });
const body = JSON.stringify(snapshot, null, 2) + '\n';
await writeFile(resolve(galaxyDir, 'latest.json'), body, 'utf8');
await writeFile(resolve(snapshotsDir, `${snapshot.snapshot_id}.json`), body, 'utf8');

console.log(JSON.stringify({
  contract: snapshot.contract,
  snapshot_id: snapshot.snapshot_id,
  tower_revision: snapshot.tower_revision,
  stats: snapshot.stats,
}));
