import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('layered navigation defaults to one layer per click', () => {
 const html = read('index.html');
 assert.match(html, /<option value="1" selected>1 camada<\/option>/);
 assert.doesNotMatch(html, /<option value="3" selected>/);
 const app = read('app.mjs');
 assert.match(app, /depth: Number\(\$\('#layers'\)\?\.value\) \|\| 1/);
 assert.match(app, /onDomain: domain => focusDomain\(domain\)/);
 assert.match(app, /session\.focusNode\(\{id:`domain:\$\{domain\}`/);
});

test('graph opening motion is slower and smoother than the previous fast snap', () => {
 const cfg = read('ui/visual-config.mjs');
 const match = cfg.match(/transitionMs:(\d+)/);
 assert.ok(match, 'transitionMs missing');
 const ms = Number(match[1]);
 assert.ok(ms >= 360 && ms <= 520, `transitionMs=${ms} should be in the fluid 360-520ms range`);
 const graph = read('graph3d.mjs');
 assert.match(graph, /Math\.cos\(Math\.PI\*/, 'transition easing should use a smooth cosine curve');
});

test('long labels compact to a deterministic acronym instead of being cut in half', async () => {
 let mod = null;
 try { mod = await import('../ui/cockpit-copy.mjs'); } catch {}
 assert.equal(typeof mod?.compactLabel, 'function', 'compactLabel helper missing');
 assert.equal(mod.compactLabel('Ciência', {max:18}), 'Ciência');
 assert.equal(mod.compactLabel('Cosmic Microwave Background lensing reconstruction', {max:24}), 'CMBLR');
 assert.equal(mod.compactLabel('The Shape of the Matter Power Spectrum', {max:18}), 'SMPS');
 assert.equal(mod.compactLabel('A title that is definitely far too long', {max:16, shortLabel:'Título curto'}), 'Título curto');
});

test('cockpit copy exposes only what, how and why and never echoes raw technical hashes', async () => {
 let mod = null;
 try { mod = await import('../ui/cockpit-copy.mjs'); } catch {}
 assert.equal(typeof mod?.cockpitCopy, 'function', 'cockpitCopy helper missing');
 const indexed = mod.cockpitCopy({
  label:'Teste',
  summary:'English raw summary',
  metadata:{what_pt:'Mede a consistência global.', how_pt:'Combina as covariâncias publicadas.', why_pt:'Testar a robustez do resultado.'}
 });
 assert.deepEqual(indexed, {
  what:'Mede a consistência global.',
  how:'Combina as covariâncias publicadas.',
  why:'Testar a robustez do resultado.'
 });
 const raw = mod.cockpitCopy({
  label:'Raw item',
  summary:'Run exactkg archive 6b54a91e721785807ff0e90c897010b6 against branch atlas-control.',
  metadata:{artifact_hash:'6b54a91e721785807ff0e90c897010b6',git_commit:'688b472d2a298ca0f988d6c3be287f2b664dc103'}
 });
 assert.equal(raw.what, 'Conteúdo ainda não indexado em português.');
 assert.equal(raw.how, 'Como ainda não indexado em português.');
 assert.equal(raw.why, 'Por quê ainda não indexado em português.');
 assert.doesNotMatch(JSON.stringify(raw), /6b54a91e721785807ff0e90c897010b6|688b472d2a298ca0f988d6c3be287f2b664dc103/);
});

test('default inspector is human-facing while raw audit metadata stays isolated', () => {
 const inspector = read('ui/inspector.mjs');
 assert.match(inspector, /cockpit-triad/);
 assert.match(inspector, /O QUÊ/);
 assert.match(inspector, /COMO/);
 assert.match(inspector, /POR QUÊ/);
 assert.match(inspector, /audit\?`<div class="detail-section audit-technical">/);
 const manifest = read('frontend-files.mjs');
 const vercel = read('vercel.json');
 assert.match(manifest, /ui\/cockpit-copy\.mjs/);
 assert.match(vercel, /ui\/cockpit-copy\.mjs/);
});
