import {readFile, writeFile, rename, rm, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {projectApprovedPublicCampaigns} from '../server/atlas/public-campaign-projection.mjs';
import {publicTestSourceDigest} from '../server/atlas/public-test-projection.mjs';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const stable = v => Array.isArray(v) ? v.map(stable) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
async function inputBytes(input) {
  if (input !== '-') return readFile(input);
  const chunks = []; let length = 0;
  for await (const chunk of process.stdin) {length += chunk.length; if (length > 64 * 1024 * 1024) throw new Error('PUBLIC_WRITER_PACKAGE_TOO_LARGE'); chunks.push(chunk);}
  return Buffer.concat(chunks);
}

/** Converts Python/JS JSON number spelling only after checking the exact approved byte commitment.
 * This package is a private local Writer handoff, never a browser upload or public artifact.
 */
export function buildWriterPublicCampaignSnapshot(pkg) {
  if (!object(pkg?.records) || !Array.isArray(pkg.approvals) || !object(pkg.meta) || !object(pkg.source_commitments)) throw new Error('PUBLIC_WRITER_PACKAGE_INVALID');
  const sources = new Map();
  for (const kind of ['campaigns', 'roadmaps', 'tests']) {
    for (const row of pkg.records[kind] ?? []) {
      if (!object(row) || typeof row.id !== 'string') throw new Error('PUBLIC_WRITER_SOURCE_INVALID');
      if (sources.has(row.id) && !equal(sources.get(row.id), row)) throw new Error('PUBLIC_WRITER_SOURCE_AMBIGUOUS');
      sources.set(row.id, row);
    }
  }
  const verified = new Map();
  const verify = id => {
    if (verified.has(id)) return verified.get(id);
    const source = sources.get(id), c = pkg.source_commitments[id];
    if (!source || !object(c) || typeof c.json !== 'string' || typeof c.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(c.sha256) || createHash('sha256').update(c.json).digest('hex') !== c.sha256 || !equal(JSON.parse(c.json), source)) throw new Error('PUBLIC_WRITER_SOURCE_COMMITMENT_FAILED');
    verified.set(id, c.sha256); return c.sha256;
  };
  const approvals = pkg.approvals.map(a => {
    if (!object(a) || a.writerSourceSha256 !== verify(a.sourceId)) throw new Error('PUBLIC_WRITER_APPROVAL_STALE');
    const approval = {...a, sourceDigest: publicTestSourceDigest(sources.get(a.sourceId))};
    if (a.independence) {
      const p = a.independence;
      if (!object(p) || p.writerParentSha256 !== verify(a.sourceId) || p.writerAttackSha256 !== verify(p.attackId)) throw new Error('PUBLIC_WRITER_INDEPENDENCE_STALE');
      approval.independence = {...p, parentDigest: publicTestSourceDigest(sources.get(a.sourceId)), attackDigest: publicTestSourceDigest(sources.get(p.attackId))};
    }
    return approval;
  });
  return projectApprovedPublicCampaigns(pkg.records, approvals, pkg.meta);
}

export async function prepareWriterPublicCampaignSnapshot(pkg, output) {
  const snapshot = buildWriterPublicCampaignSnapshot(pkg);
  if (snapshot.coverage === 'UNAVAILABLE') return {status: 'PUBLIC_CAMPAIGNS_PENDING', reason: 'CANONICAL_PUBLIC_BINDING_OR_APPROVAL_REQUIRED', previousPreserved: true};
  const target = resolve(output), temporary = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), {recursive: true});
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, {flag: 'wx'});
    await rename(temporary, target);
  } finally {await rm(temporary, {force: true});}
  return {status: 'PUBLIC_CAMPAIGNS_PREPARED', sourceRevision: snapshot.sourceRevision, snapshotDigest: snapshot.snapshotDigest, coverage: snapshot.coverage, count: snapshot.campaigns.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), input = args[args.indexOf('--input') + 1], output = args[args.indexOf('--output') + 1];
  if (!args.includes('--input') || !args.includes('--output') || !input || !output) throw new Error('Usage: build-public-campaigns.mjs --input <private-writer-package|-> --output <public-snapshot>');
  const bytes = await inputBytes(input);
  if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('PUBLIC_WRITER_PACKAGE_TOO_LARGE');
  console.log(JSON.stringify(await prepareWriterPublicCampaignSnapshot(JSON.parse(bytes.toString('utf8')), output)));
}
