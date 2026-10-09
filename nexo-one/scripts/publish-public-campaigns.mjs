import * as fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve, basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validatePublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';

/** Called only on a verified Writer-produced snapshot; validation never authorizes raw Tower data. */
export async function publishPublicCampaigns(input, outDir, {io = fs} = {}) {
  const output = resolve(outDir);
  if (basename(output) !== 'dist') throw new Error('PUBLIC_CAMPAIGN_PUBLICATION_REQUIRES_DIST');
  await io.mkdir(output, {recursive: true});
  const stat = await io.lstat(output);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('PUBLIC_CAMPAIGN_OUTPUT_INVALID');
  const data = await io.readFile(input);
  if (data.byteLength > 8 * 1024 * 1024) throw new Error('PUBLIC_CAMPAIGN_SNAPSHOT_TOO_LARGE');
  const snapshot = validatePublicCampaignSnapshot(JSON.parse(data.toString('utf8')));
  if (snapshot.coverage === 'UNAVAILABLE') throw new Error('PUBLIC_CAMPAIGN_PUBLICATION_PENDING');
  const file = join(output, 'public-campaigns.json'), prefix = join(output, `.public-campaigns-${randomUUID()}`);
  const temporary = `${prefix}.tmp`, backup = `${prefix}.previous.tmp`, restore = `${prefix}.restore.tmp`;
  const verify = async (path, expected) => {
    try {
      const bytes = await io.readFile(path);
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('oversize');
      const actual = validatePublicCampaignSnapshot(JSON.parse(bytes.toString('utf8')));
      if (actual.snapshotDigest !== expected.snapshotDigest) throw new Error('digest');
    } catch (cause) {throw new Error('PUBLIC_CAMPAIGN_READBACK_FAILED', {cause});}
  };
  let previous, previousSnapshot, retainBackup = false;
  try {previous = await io.readFile(file);} catch (error) {if (error.code !== 'ENOENT') throw error;}
  if (previous) previousSnapshot = validatePublicCampaignSnapshot(JSON.parse(previous.toString('utf8')));
  try {
    await io.writeFile(temporary, `${JSON.stringify(snapshot)}\n`, {flag: 'wx'});
    await verify(temporary, snapshot);
    if (previous) {
      await io.writeFile(backup, previous, {flag: 'wx'});
      await verify(backup, previousSnapshot);
    }
    await io.rename(temporary, file);
    try {await verify(file, snapshot);} catch (error) {
      try {
        if (previous) {
          await io.copyFile(backup, restore);
          await verify(restore, previousSnapshot);
          await io.rename(restore, file);
          await verify(file, previousSnapshot);
        } else await io.rm(file, {force: true});
      } catch (cause) {
        // Keep the verified previous bytes available for explicit recovery.
        retainBackup = Boolean(previous);
        throw new Error('PUBLIC_CAMPAIGN_ROLLBACK_FAILED', {cause});
      }
      throw error;
    }
    return {status: 'PUBLIC_CAMPAIGNS_VERIFIED', sourceRevision: snapshot.sourceRevision, snapshotDigest: snapshot.snapshotDigest, count: snapshot.campaigns.length};
  } finally {
    await io.rm(temporary, {force: true});
    await io.rm(restore, {force: true});
    if (!retainBackup) await io.rm(backup, {force: true});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const input = args[args.indexOf('--input') + 1], output = args[args.indexOf('--output-dir') + 1];
  if (!args.includes('--input') || !args.includes('--output-dir') || !input || !output) throw new Error('Usage: publish-public-campaigns.mjs --input <verified-writer-snapshot> --output-dir <dist>');
  console.log(JSON.stringify(await publishPublicCampaigns(input, output)));
}
