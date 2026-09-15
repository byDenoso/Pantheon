import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateAtlasV3Snapshot } from './sdk.mjs';

export async function publishAtlasV3Snapshot(snapshot, outDir) {
  const valid = validateAtlasV3Snapshot(snapshot);
  const fingerprint = valid.manifest.fingerprint;
  if (!fingerprint?.startsWith('sha256:')) throw new Error('ATLAS_V3_FINGERPRINT_REQUIRED');
  const safe = fingerprint.replace(':', '-');
  const snapshotsDir = path.join(outDir, 'snapshots');
  const targetDir = path.join(snapshotsDir, safe);
  const tempDir = path.join(snapshotsDir, `.tmp-${safe}-${process.pid}`);
  const currentDir = path.join(outDir, 'current');

  await mkdir(snapshotsDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  await writeFile(path.join(tempDir, 'snapshot.json'), `${JSON.stringify(valid, null, 2)}\n`, 'utf8');
  await writeFile(path.join(tempDir, 'manifest.json'), `${JSON.stringify(valid.manifest, null, 2)}\n`, 'utf8');

  await rm(targetDir, { recursive: true, force: true });
  await rename(tempDir, targetDir);
  await mkdir(currentDir, { recursive: true });
  const currentTemp = path.join(currentDir, `.manifest-${process.pid}.tmp`);
  await writeFile(currentTemp, `${JSON.stringify({ ...valid.manifest, snapshotPath: `../snapshots/${safe}/snapshot.json` }, null, 2)}\n`, 'utf8');
  await rename(currentTemp, path.join(currentDir, 'manifest.json'));

  return { fingerprint, targetDir, currentManifest: path.join(currentDir, 'manifest.json') };
}
