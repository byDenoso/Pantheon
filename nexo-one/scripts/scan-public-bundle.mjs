// Scans a built dist directory for leakage into the public bundle.
// Usage: node scripts/scan-public-bundle.mjs [dist]. Exit 1 on findings.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validatePublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';

export const FORBIDDEN = [
  'fixtureSource', 'NexoStore', 'TowerSVGSurface', 'tower-projection', 'system.json', 'world-public',
  'science-projection', 'tower-head', 'script.google.com', '/api/session', 'nexo.quality', 'sourceMappingURL',
];

export function scanDist(dist) {
  const findings = [];
  const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(dist);
  for (const f of files) {
    const rel = f.slice(dist.length + 1).replaceAll('\\', '/');
    if (/\.map$/.test(f)) findings.push(`${rel}: source map`);
    if (/\.(json|ndjson)$/.test(f)) {
      if (rel === 'public-campaigns.json') {
        try {validatePublicCampaignSnapshot(JSON.parse(readFileSync(f, 'utf8')));} catch {findings.push(`${rel}: invalid public campaign snapshot`);}
      } else findings.push(`${rel}: static data file`);
    }
    if (!/\.(js|css|html|mjs)$/.test(f) || rel.startsWith('google-drive-connect')) continue; // pre-existing standalone page, outside the Atlas entry
    const text = readFileSync(f, 'utf8');
    for (const m of FORBIDDEN) if (text.includes(m)) findings.push(`${rel}: contains "${m}"`);
  }
  return {files: files.map(f => f.slice(dist.length + 1).replaceAll('\\', '/')), findings};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dist = resolve(process.argv[2] ?? 'dist');
  const {files, findings} = scanDist(dist);
  console.log(`files: ${files.length}`);
  for (const f of findings) console.log(`FINDING ${f}`);
  process.exit(findings.length ? 1 : 0);
}
