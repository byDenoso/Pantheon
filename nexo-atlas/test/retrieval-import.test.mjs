import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {beginGeneration,appendShards,verifyGeneration,publishGeneration} from '../worker/retrieval/import.mjs';
import {VerifiedD1View} from '../worker/retrieval/storage.mjs';
import {createTrustedLexicalAdapter} from '../worker/retrieval/adapter.mjs';
import {sha256,identity,bucket,utf8,TOWER_ID,POLICY,SCHEMA,ENGINE_CONFIG,ENGINE_CODE,CHUNKER,ENGINE_VERSION} from '../worker/retrieval/integrity.mjs';
import {TOKENIZER_SHA256,CHUNKER_SHA256} from '../worker/retrieval/bindings.mjs';
import {database,fixture,stage} from './helpers/retrieval-import.fixture.mjs';
test('trusted staged import verifies all shards, publishes atomically, and serves only after server checks',async()=>{
 const {db,sqlite}=database(),f=await fixture();try{
  await stage(db,f);await assert.rejects(()=>VerifiedD1View.open(db,f.generation,f.manifestHash),/GENERATION_NOT_VERIFIED/);
  let sourceChecks=0;const verified=await verifyGeneration(db,f.generation,f.manifestHash,async()=>sourceChecks++);
  assert.equal(sourceChecks,2);assert.equal(verified.verified_shards,f.rows.length);
  await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  assert.equal((await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER',expectedGeneration:'old-before-commit'})).reused,true);
  await assert.rejects(()=>appendShards(db,f.generation,[{...f.rows[0],lookup_key:'new'}]),/GENERATION_IMMUTABLE/);
  assert.throws(()=>sqlite.exec(`DELETE FROM retrieval_shards WHERE generation='${f.generation}'`),/GENERATION_IMMUTABLE/);
  let authChecks=0;const search=createTrustedLexicalAdapter({db,enabled:true,allowSyntheticFixtures:true,authorize:async()=>{authChecks++;return {authorized:true,pin_valid:true,owner:true,subject:'owner',session_id:'session',session_epoch:'1',role:'LEARNER',policy:POLICY,now:'2026-06-01T00:00:00Z'};},checkSource:async()=>sourceChecks++});
  const result=await search({query:'hello',k:5});assert.equal(authChecks,2);assert.equal(sourceChecks,4);assert.equal(result.hits[0].citation.json_pointer,'/record');
 }finally{sqlite.close();}
});
test('missing, corrupt, mixed-generation and changed staging cannot be verified or published',async()=>{
 for(const fault of ['missing','corrupt','mixed','changed','extra_catalog']){
  const {db,sqlite}=database(),f=await fixture(fault);try{await stage(db,f);
   if(fault==='extra_catalog')await appendShards(db,f.generation,[{...f.rows.at(-1),lookup_key:'unexpected'}]);
   if(fault==='missing')sqlite.prepare("DELETE FROM retrieval_shards WHERE generation=? AND family='term'").run(f.generation);
   if(fault==='corrupt')sqlite.prepare("UPDATE retrieval_shards SET payload=? WHERE generation=? AND family='term'").run(utf8('{}'),f.generation);
   if(fault==='mixed')sqlite.prepare("UPDATE retrieval_shards SET payload=? WHERE generation=? AND family='term'").run(utf8(JSON.stringify({generation:'another',family:'term',key:'hello',data:{df:1,rows:[[0,1]]}})),f.generation);
   let calls=0;await assert.rejects(()=>verifyGeneration(db,f.generation,f.manifestHash,async()=>{if(fault==='changed'&&++calls===2)await appendShards(db,f.generation,[{...f.rows[0],lookup_key:'concurrent'}]);}));
   assert.equal(sqlite.prepare('SELECT state FROM retrieval_generations').get().state,'staging');
   await assert.rejects(()=>publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'}),/GENERATION_NOT_VERIFIED/);
  }finally{sqlite.close();}
 }
});
test('head replacement during a query is rejected after source/session checks',async()=>{
 const {db,sqlite}=database(),a=await fixture('head-a'),b=await fixture('head-b');try{
  for(const f of [a,b]){await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});}
  await publishGeneration(db,{generation:a.generation,manifestHash:a.manifestHash,role:'LEARNER'});let calls=0;
  const search=createTrustedLexicalAdapter({db,enabled:true,allowSyntheticFixtures:true,authorize:async()=>({authorized:true,pin_valid:true,owner:true,subject:'owner',session_id:'session',session_epoch:'1',role:'LEARNER',policy:POLICY,now:'2026-06-01T00:00:00Z'}),checkSource:async()=>{if(++calls===2)await publishGeneration(db,{generation:b.generation,manifestHash:b.manifestHash,role:'LEARNER',expectedGeneration:a.generation});}});
  await assert.rejects(()=>search({query:'hello'}),/GENERATION_CHANGED_DURING_QUERY/);
 }finally{sqlite.close();}
});

test('shards require an existing staging generation even with foreign keys disabled',async()=>{
 const {db,sqlite}=database(),f=await fixture('orphan');try{sqlite.exec('PRAGMA foreign_keys=OFF');
  await assert.rejects(()=>appendShards(db,f.generation,[f.rows[0]]),/GENERATION_IMMUTABLE/);
 }finally{sqlite.close();}
});

test('interrupted import resumes idempotently and rejects conflicting manifests or bytes',async()=>{
 const {db,sqlite}=database(),f=await fixture('resume');try{
  await beginGeneration(db,f.manifestJson,f.manifestHash);await appendShards(db,f.generation,f.rows.slice(0,50));
  const sequence=sqlite.prepare('SELECT mutation_seq FROM retrieval_generations').get().mutation_seq;
  await beginGeneration(db,f.manifestJson,f.manifestHash);await appendShards(db,f.generation,f.rows.slice(0,50));
  assert.equal(sqlite.prepare('SELECT mutation_seq FROM retrieval_generations').get().mutation_seq,sequence);
  for(let i=50;i<f.rows.length;i+=100)await appendShards(db,f.generation,f.rows.slice(i,i+100));
  await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});
  assert.equal((await verifyGeneration(db,f.generation,f.manifestHash,async()=>{})).reused,true);
  await beginGeneration(db,f.manifestJson,f.manifestHash);await appendShards(db,f.generation,f.rows.slice(0,100));
  await assert.rejects(()=>appendShards(db,f.generation,[{...f.rows[0],payload:utf8('different')}]),/SHARD_CONTENT_CONFLICT/);
  const conflict=JSON.stringify({...f.manifest,role:'OTHER'});
  const conflictHash=await sha256(conflict);await assert.rejects(()=>beginGeneration(db,conflict,conflictHash),/GENERATION_CONTENT_CONFLICT/);
  await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  const retry=await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});assert.equal(retry.reused,true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM retrieval_heads').get().n,1);
 }finally{sqlite.close();}
});
test('shared mutable authorization objects cannot hide role/session changes across awaits',async()=>{
 for(const changed of ['session_id','session_epoch','role']){
  const {db,sqlite}=database(),f=await fixture('shared-'+changed);try{
   await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
   const auth={authorized:true,pin_valid:true,owner:true,subject:'owner',session_id:'session',session_epoch:'1',role:'LEARNER',policy:POLICY,now:'2026-06-01T00:00:00Z'};let calls=0;
   const search=createTrustedLexicalAdapter({db,enabled:true,allowSyntheticFixtures:true,authorize:async()=>{if(++calls===2)auth[changed]='changed';return auth;},checkSource:async()=>{}});
   await assert.rejects(()=>search({query:'hello'}),/AUTHORIZATION_CHANGED_DURING_QUERY/);
  }finally{sqlite.close();}
 }
});

test('session revocation during final head lookup is checked before response release',async()=>{
 const {db,sqlite}=database(),f=await fixture('last-read-revocation');try{
  await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});
  await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  let authorized=true;const prepare=db.prepare.bind(db);
  db.prepare=sql=>{
   const query=prepare(sql);
   if(!sql.startsWith('SELECT generation FROM retrieval_heads'))return query;
   return {bind(...args){const bound=query.bind(...args);return {...bound,async first(){const row=await bound.first();authorized=false;return row;}};}};
  };
  const search=createTrustedLexicalAdapter({db,enabled:true,allowSyntheticFixtures:true,
   authorize:async()=>({authorized,pin_valid:authorized,owner:true,subject:'owner',session_id:'session',session_epoch:'1',role:'LEARNER',policy:POLICY,now:'2026-06-01T00:00:00Z'}),checkSource:async()=>{}});
  await assert.rejects(()=>search({query:'hello'}),/AUTHORIZATION_REQUIRED/);
 }finally{sqlite.close();}
});
