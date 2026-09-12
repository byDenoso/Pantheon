import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('layered navigation defaults to one layer per click', () => {
 const app = read('src/App.tsx');
 const pages = read('src/pages/atlas-pages.tsx');
 const session = read('src/state/useAtlasSession.ts');
 assert.match(pages, /useState\(1\)/);
 assert.match(pages, /<option value=\{1\}>1 camada<\/option>/);
 assert.doesNotMatch(pages, /useState\(3\)/);
 assert.match(session, /limit:180,depth:1/);
 assert.match(app, /actions\.open\(node\)/);
});

test('legacy graph opening motion remains a smooth compatibility reference', () => {
 const cfg = read('ui/visual-config.mjs');
 const match = cfg.match(/transitionMs:(\d+)/);
 assert.ok(match, 'transitionMs missing');
 const ms = Number(match[1]);
 assert.ok(ms >= 360 && ms <= 520, `transitionMs=${ms} should be in the fluid 360-520ms range`);
});

test('long labels compact to a deterministic acronym instead of being cut in half', async () => {
 const mod = await import('../ui/cockpit-copy.mjs');
 assert.equal(mod.compactLabel('Ciência', {max:18}), 'Ciência');
 assert.equal(mod.compactLabel('Cosmic Microwave Background lensing reconstruction', {max:24}), 'CMBLR');
 assert.equal(mod.compactLabel('The Shape of the Matter Power Spectrum', {max:18}), 'SMPS');
 assert.equal(mod.compactLabel('A title that is definitely far too long', {max:16, shortLabel:'Título curto'}), 'Título curto');
});

test('cockpit copy exposes only what, how and why and never echoes raw technical hashes', async () => {
 const mod = await import('../ui/cockpit-copy.mjs');
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

test('React inspector is human-facing while raw audit metadata stays isolated', () => {
 const app = read('src/App.tsx');
 const manifest = read('frontend-files.mjs');
 assert.match(app, /inspector-triad/);
 assert.match(app, /O QUÊ/);
 assert.match(app, /COMO/);
 assert.match(app, /POR QUÊ/);
 assert.match(app, /<details className="technical-details">/);
 assert.match(manifest, /ui\/cockpit-copy\.mjs/);
});
