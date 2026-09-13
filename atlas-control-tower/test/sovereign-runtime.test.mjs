import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../lib/atlas-api.mjs';

const api=createApi({profile:'atlas'});

test('local Atlas science resolves D7 campaign without HTTP',async()=>{
  const graph=await api.graph({focus:'domain:D7',depth:3});
  assert.equal(graph.focus,'domain:D7');
  assert.ok(graph.nodes.some(node=>node.id==='CAMP-CMB-ANOMALIES'&&node.type==='CAMPAIGN'),'missing CAMP-CMB-ANOMALIES');
  assert.equal(graph.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
  assert.equal(graph.truncated,false);
});

test('local Atlas entity resolution keeps campaign provenance metadata',async()=>{
  const response=await api.entity('CAMP-CMB-ANOMALIES');
  assert.equal(response.entity?.id,'CAMP-CMB-ANOMALIES');
  assert.equal(response.entity?.type,'CAMPAIGN');
  assert.equal(response.entity?.metadata?.testCount,104);
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
