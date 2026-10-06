import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildPrivateUi, listFiles, MANIFEST_CONTRACT} from '../scripts/build-private-ui.mjs';
import {scanDist} from '../scripts/scan-public-bundle.mjs';
import {adaptObservation, adaptations} from '../vite.private.config.ts';

const root = new URL('../', import.meta.url).pathname;
let out, publicOut, publicTemp;
test.before(async () => {
  out = mkdtempSync(join(tmpdir(), 'atlas-private-'));
  await buildPrivateUi(out);
  publicTemp = mkdtempSync(join(tmpdir(), 'atlas-public-'));
  publicOut = join(publicTemp, 'dist');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', publicOut, '--emptyOutDir'], {cwd: root, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});
test.after(() => { rmSync(out, {recursive: true, force: true}); rmSync(publicTemp, {recursive: true, force: true}); });

test('private manifest: contract, relative paths only, exact SHA256 of every file, no maps, index.html present', () => {
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(m.contract, MANIFEST_CONTRACT);
  assert.deepEqual(Object.keys(m).sort(), ['contract', 'files']);
  assert.ok('index.html' in m.files);
  const onDisk = listFiles(out).map(f => f.slice(out.length + 1)).filter(f => f !== 'manifest.json').sort();
  assert.deepEqual(Object.keys(m.files).sort(), onDisk, 'manifest lists exactly the emitted files');
  for (const [p, h] of Object.entries(m.files)) {
    assert.doesNotMatch(p, /^\/|\.\.|\\|\.map$/, p);
    assert.equal(createHash('sha256').update(readFileSync(join(out, p))).digest('hex'), h, p);
    assert.match(h, /^[0-9a-f]{64}$/);
  }
});

test('private HTML uses the authenticated asset base and loads nothing from outside', () => {
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(x => x[1]).filter(u => !u.startsWith('data:'));
  assert.ok(urls.length > 0);
  for (const u of urls) assert.match(u, /^\/api\/atlas-private-assets\/assets\//, u);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('private bundle carries no fixtures, no old session bridge, no CDN loaders, no persistent receipt cache', () => {
  const forbidden = ['olympus-conflict', '/api/session', 'script.google.com', 'unpkg.com', 'cdn.jsdelivr', 'public-projection-receipt', 'tower-projection/projection.json', 'fonts.googleapis', 'sourceMappingURL', 'VITE_NEXO_AUTH_BRIDGE_URL'];
  for (const f of listFiles(out).filter(f => /\.(js|css|html)$/.test(f))) {
    const t = readFileSync(f, 'utf8');
    for (const s of forbidden) assert.equal(t.includes(s), false, `${f.slice(out.length + 1)} contains ${s}`);
  }
});

test('private build: no static data files and nothing copied from public/', () => {
  const files = listFiles(out).map(f => f.slice(out.length + 1));
  assert.deepEqual(files.filter(f => /\.(json|ndjson)$/.test(f) && f !== 'manifest.json'), []);
  assert.deepEqual(files.filter(f => /google-drive-connect|system\.json|topology|publication|galaxy\//.test(f)), []);
});

test('public dist does not contain the private shell, and still passes the public leak scan', () => {
  const {files, findings} = scanDist(publicOut);
  assert.deepEqual(findings, []);
  assert.equal(files.some(f => /manifest\.json|private-ui|private-legacy/.test(f)), false);
  const publicJs = files.filter(f => f.endsWith('.js')).map(f => readFileSync(join(publicOut, f), 'utf8')).join('\n');
  for (const s of ['NEXO_ATLAS_PRIVATE_RUNTIME_V1', 'ATLAS_PRIVATE_ASSETS_V1', 'PRIVATE_ADAPTER_MISSING', 'PRIVATE_SHELL_', 'olympus-conflict', 'NexoStoreProvider']) assert.equal(publicJs.includes(s), false, s);
  assert.ok(publicJs.includes('/api/atlas-private-ui'), 'public shell only knows the guarded frame URL');
});

test('builder refuses to write into the public dist', async () => {
  await assert.rejects(buildPrivateUi(resolve(root, 'dist')), /public dist/);
  await assert.rejects(buildPrivateUi(resolve(root, 'dist/private')), /public dist/);
});

test('galaxy alias parser: private contract, opaque revision/fingerprints, real layout kept, no PUBLIC label and no invented authority', async () => {
  const src = readFileSync(new URL('../src/data/atlasObservation.ts', import.meta.url), 'utf8');
  const adapted = adaptObservation(src);
  const f = join(root, 'src/data', `.obs-adapted-${process.pid}.ts`); writeFileSync(f, adapted); // beside the original so relative imports resolve
  try {
    const {observeGalaxySnapshot} = await import(pathToFileURL(f).href);
    const {makeGalaxy, FP, FP2} = await import('./helpers/synthetic-runtime.mjs');
    const at = '2030-01-01T00:00:00.000Z';
    const g = makeGalaxy();
    const snap = observeGalaxySnapshot(g, FP, at);
    assert.equal(snap.entities[0].observation.access, 'PRIVATE_RUNTIME');
    assert.equal(snap.entities[0].observation.source_revision, 'opaque-rev-7');
    assert.equal(snap.tower_revision, 'opaque-rev-7');
    assert.deepEqual(snap.entities[0].layout, g.entities[0].layout, 'real node layout is preserved');
    assert.equal(snap.provenance.authority, undefined, 'no authority invented');
    assert.equal(snap.provenance.source_contract, 'NEXO_ATLAS_PRIVATE_RUNTIME_V1');
    assert.equal(snap.access, 'PRIVATE');
    const code = fn => { try { fn(); return 'OK'; } catch (e) { return e.code; } };
    assert.equal(code(() => observeGalaxySnapshot(makeGalaxy(FP2), FP, at)), 'FINGERPRINT_MISMATCH');
    assert.equal(code(() => observeGalaxySnapshot(g, '', at)), 'FINGERPRINT_MISMATCH', 'an unbound parse (no expected fingerprint) is refused');
    assert.equal(code(() => observeGalaxySnapshot({...g, access: 'PUBLIC'}, FP, at)), 'SOURCE_PROVENANCE_INVALID');
    assert.equal(code(() => observeGalaxySnapshot({...g, access: undefined}, FP, at)), 'SOURCE_PROVENANCE_INVALID');
    assert.equal(code(() => observeGalaxySnapshot({...g, provenance: {authority: 'TOWER_V06', source_fingerprint: FP}}, FP, at)), 'SOURCE_PROVENANCE_INVALID');
    assert.equal(code(() => observeGalaxySnapshot({...g, provenance: {...g.provenance, source_contract: 'OTHER'}}, FP, at)), 'SOURCE_PROVENANCE_INVALID');
    assert.equal(code(() => observeGalaxySnapshot({...g, tower_revision: ''}, FP, at)), 'TOWER_REVISION_INVALID');
    assert.equal(code(() => observeGalaxySnapshot({...g, entities: [{id: 'x', layout: {x: 'nope'}}]}, FP, at)), 'ENTITY_LAYOUT_INVALID');
  } finally { rmSync(f, {force: true}); }
  // the UNADAPTED legacy parser still requires the public form: proof the alias is what makes the private shape parse
  const legacy = join(root, 'src/data', `.obs-legacy-${process.pid}.ts`); writeFileSync(legacy, src);
  try {
    const {observeGalaxySnapshot} = await import(pathToFileURL(legacy).href);
    const {makeGalaxy, FP} = await import('./helpers/synthetic-runtime.mjs');
    assert.throws(() => observeGalaxySnapshot(makeGalaxy(), FP), e => e.code === 'TOWER_REVISION_INVALID' || e.code === 'SOURCE_PROVENANCE_INVALID' || e.code === 'SNAPSHOT_FINGERPRINT_INVALID');
  } finally { rmSync(legacy, {force: true}); }
  assert.throws(() => adaptObservation('unrelated'), /no longer applies/);
});

test('every legacy adaptation fails the build loudly if its source text drifted, and applies to the current sources', () => {
  for (const [suffix, fn] of Object.entries(adaptations)) {
    const code = readFileSync(join(root, suffix.replace(/^\//, '')), 'utf8');
    const out = fn(code);
    assert.notEqual(out, code, suffix);
    assert.throws(() => fn('/* drifted */'), /no longer applies/, suffix);
  }
  const out = Object.fromEntries(Object.entries(adaptations).map(([k, fn]) => [k, fn(readFileSync(join(root, k.replace(/^\//, '')), 'utf8'))]));
  assert.match(out['/src/data/NexoStore.tsx'], /NEXO_PRIVATE_PROJECTION_PUBLICATION_V1/); assert.doesNotMatch(out['/src/data/NexoStore.tsx'], /NEXO_PUBLIC_PROJECTION_PUBLICATION_V1/);
  assert.doesNotMatch(out['/src/features/Workspace.tsx'], /\/api\/recall/); assert.match(out['/src/features/Workspace.tsx'], /privateRecall\(query,ctrl\.signal\)/);
  assert.match(out['/src/app/App.tsx'], /isGalaxyRoute = \(hash: string\) => \/\^#\\\/galaxia/);
  assert.match(out['/src/mcp/McpControlPanel.tsx'], /PRIVATE · snapshot local/);
  assert.doesNotMatch(out['/src/data/useSystem.ts'], /Disparando sincronização real|aguardando publicação|Publicação confirmada/);
});
