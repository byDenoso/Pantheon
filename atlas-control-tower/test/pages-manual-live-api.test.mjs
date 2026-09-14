import test from 'node:test';
import assert from 'node:assert/strict';
import { createPagesManualSyncApi } from '../lib/pages-manual-live-api.mjs';

const snapshot = fingerprint => ({
  contract:'NEXO_ATLAS_SSOT_V1',authority:'GOOGLE_DRIVE',projectionAuthority:'DERIVED_FROM_SSOT',projectionOnly:true,
  access:'PUBLIC_SANITIZED',privacyGate:'OLYMPUS_EXCLUDED',sourceFileId:'sheet',sourceModifiedAt:'2026-09-14T12:00:00Z',generatedAt:'2026-09-14T12:00:01Z',fingerprint,
  sections:{THREADS:[],WORK:[],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[]},
  projections:{
    Science:[{record_type:'CAMPAIGN',record_id:'CAMP-1',status:'ACTIVE',title:'Campanha 1',summary:'live',parent_id:'',domain:'D1'}],
    Engineering:[],Olympus:[],StructuralLearning:[],CrossDomain:[],Integrity:[]
  }
});

function staticApi(){
  return {
    remote:false, provenance:{source:'GOOGLE_DRIVE',freshness:'SNAPSHOT'}, clear(){},
    graph:async q=>({focus:q?.focus||'system:NEXO',nodes:[{id:'static',type:'SYSTEM',label:'Static'}],edges:[],freshness:'SNAPSHOT'}),
    state:async()=>({source:'static'}), health:async()=>({ok:true,dataSource:{freshness:'SNAPSHOT'}}),
    entity:async()=>({entity:null}), lineage:async()=>({nodes:[],edges:[]}), learning:async()=>({ladder:[]}), learningFor:async()=>({item:null}), learningLineage:async()=>({nodes:[],edges:[]}),
    ops:async()=>({actions:[]}),automationRuns:async()=>[],audit:async()=>({issues:[]}),files:async()=>({files:[]}),research:async()=>{throw new Error('not materialized')},searchIndex:async()=>({items:[]})
  };
}

test('Pages stays on static snapshot until manual sync completes with independent readback', async()=>{
  const calls=[];
  const live=snapshot('sha256:'+'a'.repeat(64));
  const api=createPagesManualSyncApi(staticApi(),{fetchImpl:async url=>{calls.push(String(url));return {ok:true,json:async()=>structuredClone(live)}}});
  const before=await api.graph({focus:'system:SCIENCE'});
  assert.equal(before.nodes[0].id,'static');
  const receipt=await api.sync();
  assert.equal(receipt.outcome,'REFRESHED');
  assert.equal(receipt.readbackVerified,true);
  assert.equal(calls.length,2);
  const after=await api.graph({focus:'system:SCIENCE'});
  assert.equal(after.freshness,'LIVE');
  assert.ok(after.nodes.some(node=>node.id==='domain:D1'));
});

test('failed manual sync preserves the last valid source instead of blanking Atlas', async()=>{
  const api=createPagesManualSyncApi(staticApi(),{fetchImpl:async()=>({ok:false,status:503,json:async()=>({})})});
  const receipt=await api.sync();
  assert.equal(receipt.outcome,'FAILED');
  assert.equal(receipt.readbackVerified,false);
  const graph=await api.graph({focus:'system:SCIENCE'});
  assert.equal(graph.nodes[0].id,'static');
});
