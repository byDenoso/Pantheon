import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';
import {cockpitCopy} from '../ui/cockpit-copy.mjs';
import {canonicalRuntimeRoute,adaptRuntimeRoute} from '../api/runtime-github.js';

const state={
  authority:{contract:'NEXO_CANONICAL_GITHUB_V1',authority:'GITHUB',repository:'byDenoso/Pantheon',ref:'main',projection:{transportPath:'atlas-control-tower/data/nexo-drive-projection.json'}},
  payload:{meta:{authority:'GOOGLE_DRIVE',schemaVersion:'drive-ssot-v1',sourceModifiedAt:'2026-09-11T16:13:27.114Z',generatedAt:'2026-09-11T19:26:00.000Z'},science:[{record_type:'CAMPAIGN',record_id:'CAMP-CMB-ANOMALIES',status:'ACTIVE',title:'CMB anomalies & systematics',summary:'',domain:'D7',source_ref:'Test Registry'}],engineering:[],olympus:[],learning:[],crossDomain:[],integrity:[],actions:[]},
  fingerprint:'sha256:test'
};

test('projection freshness reflects snapshot age instead of GitHub transport availability',()=>{
  const graph=projectGithubCanonical(state,'graph',{focus:'system:SCIENCE'});
  assert.equal(graph.freshness,'SNAPSHOT');
  assert.equal(graph.sourceVersion,'2026-09-11T16:13:27.114Z');
  assert.equal(graph.schemaVersion,'drive-ssot-v1');
});

test('science domain has a human semantic label without replacing canonical id',()=>{
  const graph=projectGithubCanonical(state,'graph',{focus:'system:SCIENCE'});
  const domain=graph.nodes.find(node=>node.id==='domain:D7');
  assert.equal(domain.domain,'D7');
  assert.match(domain.domainLabel,/CMB/i);
  assert.match(domain.label,/CMB/i);
});

test('entity inspector contract makes absence and provenance explicit',()=>{
  const response=projectGithubCanonical(state,'entity',{id:'CAMP-CMB-ANOMALIES'}),entity=response.entity;
  assert.equal(response.contract,'nexo-entity-v2');
  assert.equal(entity.id,'CAMP-CMB-ANOMALIES');
  assert.equal(entity.canonicalId,'CAMP-CMB-ANOMALIES');
  assert.equal(entity.type,'CAMPAIGN');
  assert.equal(entity.status,'ACTIVE');
  assert.equal(entity.domain,'D7');
  assert.match(entity.domainLabel,/CMB/i);
  assert.equal(entity.what,null);
  assert.equal(entity.how,null);
  assert.equal(entity.why,null);
  assert.equal(entity.summary,null);
  assert.equal(entity.authority,'GITHUB');
  assert.equal(entity.evidenceClass,'PROJECTION');
  assert.equal(entity.freshness,'SNAPSHOT');
  assert.ok(Array.isArray(entity.provenance)&&entity.provenance.length>0);
  assert.equal(entity.availability.summary,'ABSENT');
});

test('universe absence is not silently converted into INCONCLUSIVE',()=>{
  const universe=projectGithubCanonical(state,'universe');
  assert.equal(universe.contract,'nexo-universe-v2');
  assert.equal(universe.synthesis.availability,'UNAVAILABLE');
  assert.equal(universe.synthesis.conclusion,null);
  assert.equal(universe.synthesis.summary,null);
  assert.notEqual(universe.synthesis.status,'INCONCLUSIVE');
});

test('cockpit copy consumes normalized entity fields and describes absence precisely',()=>{
  const direct=cockpitCopy({what:'Questão publicada',how:'Método publicado',why:'Motivo publicado'});
  assert.deepEqual(direct,{what:'Questão publicada',how:'Método publicado',why:'Motivo publicado'});
  const absent=cockpitCopy({availability:{what:'ABSENT',how:'ABSENT',why:'ABSENT'}});
  assert.doesNotMatch(`${absent.what} ${absent.how} ${absent.why}`,/ainda não indexado/i);
  assert.match(absent.what,/não publicado|ausente/i);
});

test('production route manifest exposes normalized research, adapter aliases and provenance contracts',async()=>{
  const manifest=await readFile(new URL('../vercel.json',import.meta.url),'utf8');
  for(const route of ['universe','universe-snapshot','summaries','observatory','observatory-summary','observatory-parameters','observatory-tensions','observatory-directional-signals','lab','lab-claims','lab-tests','lab-runs','lab-results','lab-evidence','lab-pipelines','provenance','operations']) assert.match(manifest,new RegExp(route));
});

test('runtime compatibility aliases resolve to one canonical contract surface',()=>{
  assert.equal(canonicalRuntimeRoute('universe-snapshot'),'universe');
  assert.equal(canonicalRuntimeRoute('observatory-summary'),'observatory');
  assert.equal(canonicalRuntimeRoute('lab-tests'),'lab');
  assert.deepEqual(adaptRuntimeRoute('lab-tests',{tests:[{id:'T-1'}]}).data.items,[{id:'T-1'}]);
});

test('Inspector never manufactures the legacy technical authority enum',async()=>{
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/DERIVED_NOT_EVIDENCE/);
  assert.match(app,/authorityLabel/);
});

test('active Universe UI preserves unavailable separately from scientific INCONCLUSIVE',async()=>{
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
  const page=await readFile(new URL('../src/pages/universe-page.tsx',import.meta.url),'utf8');
  assert.match(app,/import\('\.\/pages\/universe-page'\)/);
  assert.doesNotMatch(page,/\|\|\s*'INCONCLUSIVE'/);
  assert.doesNotMatch(page,/Sem síntese publicada para esta pergunta no payload atual/);
  assert.match(page,/NÃO PUBLICADO/);
  assert.match(page,/availability/);
});
