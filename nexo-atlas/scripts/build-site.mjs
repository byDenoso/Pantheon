import {build} from 'vite';
import {mkdir, readFile, readdir, rm, writeFile, cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {buildPrivateUi} from './build-private-ui.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
await rm('dist', {recursive: true, force: true});
await mkdir('.sites-runtime', {recursive: true});
await import('./package-public-campaigns.mjs');
await import('./package-public-visuals.mjs');
await buildPrivateUi();
const privateRoot = path.join(root, 'server/private-ui');
const manifest = JSON.parse(await readFile(path.join(privateRoot, 'manifest.json'), 'utf8'));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'};
const assets = {};
for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(privateRoot, name));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('PRIVATE_ASSET_HASH_MISMATCH');
  const type = types[path.extname(name)]; if (!type) throw new Error('PRIVATE_ASSET_TYPE');
  // Compress immutable code at build time, not on every authenticated asset read.
  // Keep just one representation to reduce Worker startup and resident memory.
  const compressed = /\.(?:js|css|html|svg)$/.test(name) ? gzipSync(bytes, {level: 9}) : null;
  assets[name] = {type, ...(compressed && compressed.length < bytes.length
    ? {gzipBase64: compressed.toString('base64')}
    : {base64: bytes.toString('base64')})};
}
await writeFile('.sites-runtime/private-assets.mjs', `export default ${JSON.stringify(assets)};\n`);
await build({configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn'});
await build({configFile: false, publicDir: false, logLevel: 'warn', ssr:{noExternal:true,resolve:{conditions:['workerd','module','import']}}, build: {target: 'es2022', ssr: 'worker/index.mjs', outDir: 'dist/server', emptyOutDir: true, sourcemap: false, rollupOptions: {output: {entryFileNames: 'index.js', format: 'es'}, external: [/^node:/]}}});
await mkdir('dist/.openai', {recursive: true});
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', {recursive: true});
// Keep private output only inside the server Worker module, never dist/client.
const publicNames = (await readdir('dist/client')).sort();
if (publicNames.some(n => !['index.html', 'assets', 'metodo.html', 'publicacoes.html', 'site-config.json', 'publications.json', 'robots.txt', 'sitemap.xml'].includes(n))) throw new Error('UNEXPECTED_PUBLIC_OUTPUT');
console.log(`Sites Worker built; ${Object.keys(assets).length} guarded assets; public output: ${publicNames.join(', ')}`);
