import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FORBIDDEN, scanDist} from '../scripts/scan-public-bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('local production build: no source maps, no static data, no legacy/private markers in any emitted chunk', () => {
  const temp = mkdtempSync(join(tmpdir(), 'atlas-build-'));
  const out = join(temp, 'dist');
  try {
    const r = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir'], {cwd: root, encoding: 'utf8', env: {...process.env, GITHUB_PAGES: ''}});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const {files, findings} = scanDist(out);
    assert.deepEqual(findings, []);
    assert.ok(files.some(f => /assets\/main-.*\.js$/.test(f)));
    assert.ok(files.some(f => /assets\/PrivateApp-.*\.js$/.test(f)), 'private area must be its own chunk');
    const entry = files.find(f => /assets\/main-.*\.js$/.test(f));
    assert.ok(entry);
  } finally { rmSync(temp, {recursive: true, force: true}); }
});

test('scanner itself detects each marker, source maps and JSON (negative control)', async () => {
  const {mkdirSync, writeFileSync} = await import('node:fs');
  const d = mkdtempSync(join(tmpdir(), 'atlas-neg-'));
  try {
    mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'assets/a.js'), FORBIDDEN.join(' '));
    writeFileSync(join(d, 'assets/a.js.map'), '{}'); writeFileSync(join(d, 'data.json'), '{}');
    const {findings} = scanDist(d);
    assert.equal(findings.length, FORBIDDEN.length + 2);
  } finally { rmSync(d, {recursive: true, force: true}); }
});
test('native session marker is allowed only in the human entry; data markers remain forbidden', async()=>{
  const {mkdirSync,writeFileSync}=await import('node:fs');
  const d=mkdtempSync(join(tmpdir(),'atlas-human-scan-'));
  try {
    mkdirSync(join(d,'assets'));
    writeFileSync(join(d,'assets/HumanAutonomyApp-approved.js'),'/api/session');
    assert.deepEqual(scanDist(d).findings,[]);
    writeFileSync(join(d,'assets/main-public.js'),'/api/session');
    assert.equal(scanDist(d).findings.length,1);
    writeFileSync(join(d,'assets/main-public.js'),'');
    writeFileSync(join(d,'assets/HumanAutonomyApp-approved.js'),FORBIDDEN.join(' '));
    assert.equal(scanDist(d).findings.length,FORBIDDEN.length-1);
  } finally {rmSync(d,{recursive:true,force:true});}
});
