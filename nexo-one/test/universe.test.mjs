import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
import { buildLab } from '../src/features/lab/model.ts';
import { LAB_PAGES, parseLabRoute, labHref } from '../src/features/lab/routes.ts';

function projection(cosmology) {
  const manifest = { authority:'TOWER_V06', projection_only:true, writeback:'FORBIDDEN', tower_commit:'a'.repeat(40), event_cursor:'20260930T010000000000Z', projection_fingerprint:'sha256:'+'b'.repeat(64) };
  return { contract:'NEXO_PUBLIC_PROJECTION_V1', manifest, event_cursor:manifest.event_cursor, counts:{active_work:0,tests:1,capabilities:0}, work:[], tests:[{id:'CURRENT',status:'READY'}], campaigns:[], capabilities:{}, cosmology_state:cosmology };
}
function cosmology() {
  return { model:'COSMOLOGY_STATE_V1', authority:'TOWER', projection_only:true, frontiers:[{id:'frontier',title:'Frontier from Tower',state:'TENSION',summary:'Published synthesis',key_evidence:[{id:'HISTORY'}]}], historical_tests:[{id:'HISTORY',display_name:'Historical null',question:'Frozen question',result_meaning:'Published null result',status:'DONE',review_state:'REFUTED'}] };
}
test('Universo navigation and encoded detail routes preserve first-level order', () => {
  assert.deepEqual(LAB_PAGES.map(([, title]) => title), ['Agora','Universo','Ciclo','Roadmaps','Evidência','Saúde']);
  assert.deepEqual(parseLabRoute('#/universo'), {page:'universo',id:undefined});
  for (const id of ['energia-escura','h0','crescimento-s8','frente futura']) assert.deepEqual(parseLabRoute(labHref('universo',id)),{page:'universo',id});
  assert.deepEqual(parseLabRoute('#/roadmap/existing'),{page:'roadmap',id:'existing'});
});
test('Pages transports the Tower synthesis verbatim and isolates historical evidence from graph and operational counts', () => {
  const data = cosmology();
  const {system} = buildPagesProjection({projection:projection(data)});
  assert.deepEqual(system.cosmology_state,data);
  assert.ok(!system.graph.nodes.some(n=>n.id.includes('HISTORY')));
  assert.equal(system.science_projection_v1.tests.length,1);
  const lab=buildLab(system);
  assert.equal(lab.tests.size,1);
  assert.equal(lab.counts.REFUTED,0);
  assert.equal(lab.historicalTests.get('HISTORY').verdict,'REFUTED');
  assert.equal(lab.historicalTests.get('HISTORY').meaning,'Published null result');
});
test('Current Tower supersedes a historical entity with the same ID', () => {
  const data=cosmology();data.historical_tests[0].id='CURRENT';data.frontiers[0].key_evidence[0].id='CURRENT';
  const lab=buildLab(buildPagesProjection({projection:projection(data)}).system);
  assert.equal(lab.tests.get('CURRENT').verdict,'READY');
  assert.equal(lab.historicalTests.size,0);
});
test('Missing synthesis remains absent and broken evidence references fail closed', () => {
  assert.equal(buildPagesProjection({projection:projection(null)}).system.cosmology_state,null);
  const data=cosmology();data.frontiers[0].key_evidence[0].id='MISSING';
  assert.throws(()=>buildPagesProjection({projection:projection(data)}),/evidence reference missing/);
});
