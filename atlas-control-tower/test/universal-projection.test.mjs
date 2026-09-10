import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchProjection} from '../api/universal-projection.js';
import {projectionViewModel,readUniversalProjection} from '../ui/universal-projection.mjs';

const upstream={
  contract:'ProjectionEnvelope/v1',
  bus:'Pantheon/UniversalProjectionBus',
  fingerprint:'BUS-ABC123',
  generated_at:'2026-09-09T23:00:00.000Z',
  state:'LIVE',
  sources:[{id:'GITHUB',state:'LIVE',revision:'r1',count:1}],
  envelopes:[{
    entity_id:'issue:1',domain:'ENGINEERING',authority_class:'PROVIDER',source_ref:'https://github.test/1',source_revision:'r1',fingerprint:'PRJ-1',
    freshness:{state:'LIVE',observed_at:'2026-09-09T22:59:00.000Z',expires_at:'2026-09-10T00:00:00.000Z',age_ms:60000},
    derivation_rule:'github:item->projection',state:'LIVE',source:'GITHUB',checked_at:'2026-09-09T23:00:00.000Z',projection_role:'NON_AUTHORITATIVE'
  }]
};

test('Atlas consumes the same projection fingerprint and envelopes without becoming authority',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>structuredClone(upstream)});
  const result=await fetchProjection({url:'https://nexo.test/api/projections',fetcher});
  assert.equal(result.fingerprint,upstream.fingerprint);
  assert.deepEqual(result.envelopes,upstream.envelopes);
  assert.equal(result.consumer,'ATLAS');
  assert.equal(result.projection_role,'NON_AUTHORITATIVE');
  assert.equal(result.upstream.source_ref,'https://nexo.test/api/projections');
});

test('Atlas exposes upstream failure as DEGRADED instead of silently using local truth',async()=>{
  const fetcher=async()=>({ok:false,status:503});
  const result=await fetchProjection({url:'https://nexo.test/api/projections',fetcher});
  assert.equal(result.state,'DEGRADED');
  assert.equal(result.envelopes.length,1);
  assert.equal(result.envelopes[0].state,'DEGRADED');
  assert.equal(result.envelopes[0].projection_role,'NON_AUTHORITATIVE');
  assert.equal(result.envelopes[0].error.code,'SOURCE_UNAVAILABLE');
});

test('Atlas UI model preserves provenance/freshness and rejects invalid contracts',async()=>{
  const model=projectionViewModel(upstream);
  assert.equal(model.state,'LIVE');
  assert.equal(model.fingerprint,'BUS-ABC123');
  assert.equal(model.envelopes[0].source_ref,'https://github.test/1');
  assert.equal(model.envelopes[0].freshness.state,'LIVE');
  assert.equal(projectionViewModel({}).state,'DEGRADED');
  const degraded=await readUniversalProjection({endpoint:'/api/universal-projection',fetcher:async()=>({ok:false,status:502})});
  assert.equal(degraded.state,'DEGRADED');
  assert.equal(degraded.fingerprint,'UNAVAILABLE');
});
