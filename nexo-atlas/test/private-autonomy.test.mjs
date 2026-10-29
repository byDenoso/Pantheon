import test from 'node:test';
import assert from 'node:assert/strict';
import {privateAutonomyView} from '../server/atlas/private-autonomy.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {validAutonomyView, loadAutonomyStatus} from '../src/atlas/autonomy.ts';
const at='2026-10-10T18:30:00.000Z';
const active=()=>({schema:'NEXO_AUTONOMY_MANDATE_V1',id:'SYNTHETIC-MANDATE',revision:1,status:'ACTIVE',domain:'OBSERVATIONAL_COSMOLOGY',public_data_only:true,no_additional_cost:true,runner:'GITHUB_ACTIONS_STANDARD_PUBLIC'});
const towerWith=mandate=>{const tower=makePrivateTowerFixture();tower.files['CONTROL.json'].value.autonomy_mandate=mandate;return tower;};
test('canonical adapter rejects wrong file, missing CONTROL and false fingerprints',()=>{
 for(const mutate of [t=>t.stable_file_id='WRONG',t=>t.storage='PUBLIC',t=>delete t.files['CONTROL.json'],t=>t.files['CONTROL.json'].encoding='text',t=>t.state_fingerprint='sha256:'+'a'.repeat(64),t=>t.files['CONTROL.json'].value=[]]){
  const t=towerWith(active());mutate(t);assert.throws(()=>privateAutonomyView(t,at));
 }
});
test('CONTROL mode alone is inactive; declared active remains unverified and revisions are integers',()=>{
 const t=makePrivateTowerFixture();t.files['CONTROL.json'].value.mode='ACTIVE';
 assert.equal(privateAutonomyView(t,at).status,'PREPARED_INACTIVE');
 for(const status of ['ACTIVE','REVOKED']) {const v=privateAutonomyView(towerWith({...active(),status}),at);assert.equal(v.status,status==='ACTIVE'?'ACTIVE_UNVERIFIED':status);assert.equal(v.mandate.revision,1);assert.ok(validAutonomyView(v));}
});
test('malformed mandates and all active invariants fail closed',()=>{
 for(const bad of [false,[],{status:'PREPARED'},...['1',0,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(revision=>({...active(),revision})),...['domain','public_data_only','no_additional_cost','runner'].map(key=>({...active(),[key]:false}))]){
  assert.equal(privateAutonomyView(towerWith(bad),at).status,'UNKNOWN');
 }
});
test('projection is bounded whitelist with real observation time and no private payloads',()=>{
 const t=towerWith({...active(),activation_receipt:{private:'SECRET_RECEIPT'}});t.files['CONTROL.json'].value.pin_hash='SECRET_PIN';
 const before=JSON.stringify(t),v=privateAutonomyView(t,at),raw=JSON.stringify(v);
 assert.deepEqual(Object.keys(v).sort(),['contract','status','observed_at','source_updated_at','tower_fingerprint','mandate','actions'].sort());
 assert.deepEqual(Object.keys(v.mandate).sort(),['id','revision','status']);
 assert.equal(v.observed_at,at);assert.equal(v.source_updated_at,t.updated_at);assert.equal(v.tower_fingerprint,t.revision);
 assert.deepEqual(v.actions,{approve:false,revoke:false});assert.doesNotMatch(raw,/SECRET_|OLYMPUS|BOARD|PEER|activation_receipt/);assert.equal(JSON.stringify(t),before);
});
test('browser validator rejects optimistic or malformed ACTIVE',()=>{
 const v=privateAutonomyView(towerWith(active()),at);
 for(const bad of [{status:'ACTIVE'},{...v,status:'ACTIVE'}, {...v,mandate:null},{...v,mandate:{...v.mandate,revision:'1'}},{...v,status:'PREPARED'},{...v,actions:{approve:true,revoke:false}},{...v,tower_fingerprint:'wrong'},{...v,observed_at:'invalid'},{...v,source_updated_at:null}])assert.equal(validAutonomyView(bad),false);
});
test('browser reads only exact same-origin private route without storage or mutation payload',async()=>{
 const signal=new AbortController().signal;const v=privateAutonomyView(towerWith(active()),at);let calls=0;
 const result=await loadAutonomyStatus(signal,async(url,init)=>{calls++;assert.equal(url,'/api/atlas-private/autonomy');assert.equal(init.method,'POST');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.body,'{}');assert.equal(init.signal,signal);return Response.json(v);});
 assert.deepEqual(result,v);assert.equal(calls,1);
 await assert.rejects(loadAutonomyStatus(signal,async()=>Response.json({status:'ACTIVE'})));
 await assert.rejects(loadAutonomyStatus(signal,async()=>Response.json(v,{status:401})),/AUTH_REQUIRED/);
});

test('even a structurally complete activation receipt is not authenticated by this projection',()=>{
 const value={...active(),approval_ref:'SYNTHETIC',last_proposal_sha256:'a'.repeat(64),activated_at:at,activation_receipt:{checks:{transport:true,writer:true,public_projection:true,prompts:true,quota:true},source_revision:'b'.repeat(40),tcc_revision:'c'.repeat(40),tower_fingerprint:'sha256:'+'d'.repeat(64),checked_at:at}};
 assert.equal(privateAutonomyView(towerWith(value),at).status,'ACTIVE_UNVERIFIED');
});
