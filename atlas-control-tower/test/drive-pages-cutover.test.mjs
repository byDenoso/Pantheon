import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = process.cwd();
const path = (...parts) => join(root, ...parts);
const text = (...parts) => readFileSync(path(...parts), 'utf8');

test('cutover artifacts exist', () => {
  for (const file of [
    ['apps-script','Code.gs'],
    ['apps-script','appsscript.json'],
    ['data','atlas.json'],
    ['lib','static-projection.mjs'],
    ['..','.github','workflows','atlas-pages.yml']
  ]) assert.equal(existsSync(path(...file)), true, `missing ${file.join('/')}`);
});

test('browser runtime is static and Drive-owned', () => {
  const html = text('index.html');
  const app = text('nextgen','app.mjs');
  assert.match(html, /GOOGLE DRIVE/i);
  assert.doesNotMatch(html, /NEON V1/i);
  assert.doesNotMatch(app, /\/api\/ng/);
  assert.match(app, /data\/atlas\.json/);
});

test('Apps Script compiler is deterministic and change-aware', () => {
  const file = path('apps-script','Code.gs');
  if (!existsSync(file)) return;
  const code = readFileSync(file, 'utf8');
  assert.match(code, /function compileAtlasProjection\s*\(/);
  assert.match(code, /function syncAtlasToGitHub\s*\(/);
  assert.match(code, /Utilities\.computeDigest/);
  assert.match(code, /PropertiesService/);
  assert.match(code, /api\.github\.com\/repos/);
  assert.match(code, /fingerprint/);
});

test('static projection exposes the hierarchy and provenance contract', async () => {
  const file = path('lib','static-projection.mjs');
  if (!existsSync(file)) return;
  const {normalizeStaticProjection, sliceProjection, buildPresentStory} = await import('../lib/static-projection.mjs');
  const projection = normalizeStaticProjection({
    schemaVersion:'nexo-atlas-static-v1',
    fingerprint:'abc',
    generatedAt:'2026-09-08T21:00:00Z',
    nodes:[
      {id:'system:NEXO',type:'SYSTEM',label:'NEXO'},
      {id:'domain:DE',type:'DOMAIN',label:'Dark Energy',parentId:'system:NEXO'},
      {id:'campaign:C1',type:'CAMPAIGN',label:'Campaign 1',parentId:'domain:DE'},
      {id:'claim:X1',type:'CLAIM',label:'Claim',parentId:'campaign:C1'},
      {id:'test:T1',type:'TEST',label:'Test',parentId:'claim:X1'},
      {id:'result:R1',type:'RESULT',label:'Result',parentId:'test:T1',status:'PASS',sourceRefs:[{source:'Drive',sourceId:'doc1'}]},
      {id:'source:doc1',type:'SOURCE',label:'Evidence',parentId:'result:R1'}
    ],
    edges:[]
  });
  const graph = sliceProjection(projection,{focus:'campaign:C1',view:'scientific',depth:4,limit:50});
  assert.equal(graph.focus,'campaign:C1');
  assert.ok(graph.nodes.some(n=>n.id==='test:T1'));
  assert.ok(graph.nodes.some(n=>n.id==='result:R1'));
  assert.equal(graph.source,'GOOGLE_DRIVE');
  const story = buildPresentStory(projection,'campaign:C1');
  assert.equal(story.current.id,'campaign:C1');
  assert.ok(story.tests.length >= 1);
  assert.ok(story.results.length >= 1);
});
