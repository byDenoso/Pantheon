import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../lib/atlas-api.mjs';

const api=createApi({profile:'atlas'});

test('local Atlas science resolves D7 test and result without HTTP',async()=>{
  const graph=await api.graph({focus:'domain:D7',depth:3});
  assert.equal(graph.focus,'domain:D7');
  assert.ok(graph.nodes.some(node=>node.id==='T-ALENS-001'&&node.type==='TEST'),'missing T-ALENS-001');
  assert.ok(graph.nodes.some(node=>node.id==='result:T-ALENS-001'&&node.type==='RESULT'),'missing result:T-ALENS-001');
  assert.ok(graph.edges.some(edge=>edge.source==='T-ALENS-001'&&edge.target==='result:T-ALENS-001'&&edge.type==='PRODUCES'),'missing PRODUCES relation');
});

test('local Atlas entity resolution keeps scientific sentinel metadata',async()=>{
  const response=await api.entity('T-ALENS-001');
  assert.equal(response.entity?.id,'T-ALENS-001');
  assert.equal(response.entity?.type,'TEST');
  assert.equal(response.authority,'GITHUB');
  assert.equal(response.projectionAuthority,'GOOGLE_DRIVE');
});

test('local Atlas health declares static snapshot semantics',async()=>{
  const health=await api.health();
  assert.equal(health.ok,true);
  assert.equal(health.runtime,'STATIC_LOCAL');
  assert.equal(health.dataSource?.freshness,'SNAPSHOT');
  assert.equal(health.dataSource?.authority,'GITHUB');
  assert.equal(health.dataSource?.projectionAuthority,'GOOGLE_DRIVE');
  assert.equal(health.dataSource?.usedFallback,false);
});
