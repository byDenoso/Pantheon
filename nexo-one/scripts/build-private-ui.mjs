// Builds the private legacy Atlas shell into server/private-ui (never the public dist) and writes
// manifest.json = {contract:'ATLAS_PRIVATE_ASSETS_V1', files:{<relative path>: <sha256 hex>}}.
// Local build only: no upload, no network. Usage: node scripts/build-private-ui.mjs [--out <dir>]
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

export const MANIFEST_CONTRACT = 'ATLAS_PRIVATE_ASSETS_V1';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULT_OUT = resolve(root, 'server/private-ui');
const PUBLIC_DIST = resolve(root, 'dist');

export function listFiles(dir) {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? listFiles(p) : [p]; });
}

export function writeManifest(outDir) {
  const files = {};
  for (const f of listFiles(outDir).sort()) {
    const rel = relative(outDir, f).split(sep).join('/');
    if (rel === 'manifest.json') continue;
    if (rel.endsWith('.map')) throw new Error(`source map in private build: ${rel}`);
    if (rel.startsWith('..') || rel.startsWith('/')) throw new Error(`unsafe path: ${rel}`);
    files[rel] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  if (!files['index.html']) throw new Error('index.html missing from private build');
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify({contract: MANIFEST_CONTRACT, files}, null, 2)}\n`);
  return files;
}

export async function buildPrivateUi(out = DEFAULT_OUT) {
  const outDir = resolve(out);
  if (outDir === PUBLIC_DIST || outDir.startsWith(PUBLIC_DIST + sep)) throw new Error('refusing to write the private shell into the public dist');
  process.env.ATLAS_PRIVATE_OUT = outDir;
  await build({configFile: resolve(root, 'vite.private.config.ts'), logLevel: 'warn'});
  return {outDir, files: writeManifest(outDir)};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out');
  const {outDir, files} = await buildPrivateUi(i > 0 ? process.argv[i + 1] : DEFAULT_OUT);
  console.log(`private ui: ${Object.keys(files).length} files -> ${relative(root, outDir) || outDir}`);
}
