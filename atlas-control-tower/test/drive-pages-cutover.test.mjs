import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const path = (...parts) => join(root, ...parts);
const text = (...parts) => readFileSync(path(...parts), 'utf8');
const json = (...parts) => JSON.parse(text(...parts));

test('cutover artifacts exist', () => {
  for (const file of [
    ['apps-script','Code.gs'],
    ['apps-script','appsscript.json'],
    ['data','atlas.json'],
    ['data','lineage.json'],
    ['data','presentation.json'],
    ['nextgen','lib','snapshot-loader.mjs'],
    ['nextgen','lib','snapshot-contract.mjs'],
    ['..','.github','workflows','atlas-pages.yml']
  ]) assert.equal(existsSync(path(...file)), true, `missing ${file.join('/')}`);
});

test('browser runtime is static and Drive-owned', () => {
  const html = text('index.html');
  const app = text('nextgen','app.mjs');
  const loader = existsSync(path('nextgen','lib','snapshot-loader.mjs')) ? text('nextgen','lib','snapshot-loader.mjs') : '';
  assert.match(html, /GOOGLE DRIVE/i);
  assert.doesNotMatch(html, /NEON V1/i);
  assert.doesNotMatch(app, /\/api\/ng/);
  assert.doesNotMatch(loader, /\/api\/ng/);
  assert.match(loader, /atlas\.json/);
  assert.match(loader, /lineage\.json/);
  assert.match(loader, /presentation\.json/);
});

test('all snapshots use the canonical envelope', () => {
  for (const name of ['atlas.json','lineage.json','presentation.json']) {
    const file = path('data',name);
    if (!existsSync(file)) continue;
    const envelope = json('data',name);
    assert.equal(envelope.schemaVersion,'nexo-atlas-snapshot/v1');
    assert.equal(envelope.source,'GOOGLE_DRIVE');
    assert.ok(envelope.generatedAt);
    assert.ok(envelope.fingerprint);
    assert.ok(envelope.data && typeof envelope.data === 'object');
  }
});

test('Apps Script compiler is deterministic, bounded and change-aware', () => {
  const file = path('apps-script','Code.gs');
  if (!existsSync(file)) return;
  const code = readFileSync(file, 'utf8');
  assert.match(code, /function compileAtlasProjection\s*\(/);
  assert.match(code, /function syncAtlasToGitHub\s*\(/);
  assert.match(code, /function syncAtlas\s*\(/);
  assert.match(code, /Utilities\.computeDigest/);
  assert.match(code, /PropertiesService/);
  assert.match(code, /api\.github\.com\/repos/);
  assert.match(code, /fingerprint/);
  assert.match(code, /getRange\(/);
  assert.match(code, /nexo-atlas-snapshot\/v1/);
});

test('compiler projects canonical learning, relations, operations and Olympus without inventing a new store', () => {
  const code = text('apps-script','Code.gs');
  for (const surface of [
    'LEARNING_INDEX','PROCEDURAL_MEMORY','ADAPTIVE_POLICY','STRATEGY_REGISTRY',
    'RELATION_LEDGER','HISTORICAL_LEARNING_LEDGER','ACTION_INDEX','EXECUTION_RUNS',
    "'Ledger'","'Evidence_Registry'"
  ]) assert.match(code, new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')), `missing Drive surface ${surface}`);
  assert.doesNotMatch(code, /CREATE TABLE|INSERT INTO|postgres|neon\.tech/i);
});

test('compiler uses ACTION_INDEX as the merged operational projection instead of duplicating partition reads', () => {
  const code = text('apps-script','Code.gs');
  assert.match(code, /readTable_\(book,'ACTION_INDEX'\)/);
  assert.match(code, /compactRecord_\('ACTION_INDEX',row\)/);
  assert.doesNotMatch(code, /readTable_\(book,'ACTIONS_SCIENCE'\)/);
  assert.doesNotMatch(code, /readTable_\(book,'ACTIONS_ENGINEERING'\)/);
  assert.doesNotMatch(code, /readTable_\(book,'ACTIONS_OLYMPUS'\)/);
});

test('snapshot contract exposes hierarchy, provenance and Present from one truth', async () => {
  const file = path('nextgen','lib','snapshot-contract.mjs');
  if (!existsSync(file)) return;
  const {normalizeAtlasEnvelope, sliceSnapshot, buildPresentStory} = await import('../nextgen/lib/snapshot-contract.mjs');
  const envelope = normalizeAtlasEnvelope({
    schemaVersion:'nexo-atlas-snapshot/v1',
    source:'GOOGLE_DRIVE',
    fingerprint:'abc',
    generatedAt:'2026-09-08T21:00:00Z',
    data:{nodes:[
      {id:'system:NEXO',type:'SYSTEM',label:'NEXO'},
      {id:'domain:DE',type:'DOMAIN',label:'Dark Energy',parentId:'system:NEXO'},
      {id:'campaign:C1',type:'CAMPAIGN',label:'Campaign 1',parentId:'domain:DE'},
      {id:'claim:X1',type:'CLAIM',label:'Claim',parentId:'campaign:C1'},
      {id:'test:T1',type:'TEST',label:'Test',parentId:'claim:X1'},
      {id:'result:R1',type:'RESULT',label:'Result',parentId:'test:T1',status:'PASS',sourceRefs:[{source:'Drive',sourceId:'doc1'}]},
      {id:'source:doc1',type:'SOURCE',label:'Evidence',parentId:'result:R1'}
    ],edges:[]}
  });
  const graph = sliceSnapshot(envelope,{focus:'campaign:C1',view:'scientific',depth:4,limit:50});
  assert.equal(graph.focus,'campaign:C1');
  assert.ok(graph.nodes.some(n=>n.id==='test:T1'));
  assert.ok(graph.nodes.some(n=>n.id==='result:R1'));
  assert.equal(graph.source,'GOOGLE_DRIVE');
  const story = buildPresentStory(envelope,'campaign:C1');
  assert.equal(story.current.id,'campaign:C1');
  assert.ok(story.tests.length >= 1);
  assert.ok(story.results.length >= 1);
  assert.equal(story.parent.id,'domain:DE');
  assert.ok(story.children.some(n=>n.id==='claim:X1'));
});

test('NextGen exposes explicit Explore hierarchy and Present overlay on the same static map', () => {
  const html = text('index.html');
  const app = text('nextgen','app.mjs');
  assert.match(html, /data-atlas-mode="explore"/);
  assert.match(html, /data-atlas-mode="present"/);
  assert.match(html, /id="hierarchy-parent"/);
  assert.match(html, /id="hierarchy-current"/);
  assert.match(html, /id="hierarchy-children"/);
  assert.match(html, /id="present-panel"/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(app, /getPresentStory/);
  assert.match(app, /renderHierarchy/);
  assert.match(app, /renderPresent/);
});
