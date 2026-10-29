import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.mjs';
import {cosmologyPublicProjection} from '../worker/public-cosmology.mjs';
import {visualPublicProjection} from '../worker/public-visuals.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {readPublicSnapshot} from '../worker/public-response-cache.mjs';
const fresh=()=>cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection()))));
const request=headers=>new Request('https://nexoresearch.org/api/atlas-public',{headers});
test('repeated public responses preserve the entire reviewed catalog and never consult visitor/private sources',async()=>{
 let privateReads=0;
 const worker=createWorker({readSource:async()=>{privateReads++;throw Error('must not read private');}});
 const env={DB:{prepare(){throw Error('must not read identity');}}};
 const expected=fresh();
 for(const headers of [{},{cookie:'__Host-atlas_session='+'a'.repeat(64),'oai-authenticated-user-id':'synthetic-user'},{authorization:'Bearer synthetic'}]){
  const response=await worker.fetch(request(headers),env);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.match(response.headers.get('vary'),/Cookie, Authorization, Origin/);
 }
 assert.equal(privateReads,0);
 const denied=await worker.fetch(new Request('https://nexoresearch.org/api/atlas-public',{method:'POST'}),env);
 assert.equal(denied.status,405);
});
test('future publication timestamps and backward clock changes invalidate public output at the exact boundary',()=>{
 const publication=Date.parse('2026-10-11T15:00:00Z'),updated=publication+1000;
 let now=publication-1,builds=0;
 const build=()=>{builds++;return {published_at:now>=publication?new Date(publication).toISOString():null,
  updated_at:now>=updated?new Date(updated).toISOString():null};};
 let snapshot=readPublicSnapshot(build,null,[publication,updated],now);
 assert.deepEqual(JSON.parse(snapshot.body),{published_at:null,updated_at:null});
 assert.equal(readPublicSnapshot(build,snapshot,[publication,updated],now),snapshot);assert.equal(builds,1);
 now=publication;snapshot=readPublicSnapshot(build,snapshot,[publication,updated],now);
 assert.deepEqual(JSON.parse(snapshot.body),{published_at:new Date(publication).toISOString(),updated_at:null});
 now=updated;snapshot=readPublicSnapshot(build,snapshot,[publication,updated],now);
 assert.equal(JSON.parse(snapshot.body).updated_at,new Date(updated).toISOString());
 now=publication-1;snapshot=readPublicSnapshot(build,snapshot,[publication,updated],now);
 assert.deepEqual(JSON.parse(snapshot.body),{published_at:null,updated_at:null});assert.equal(builds,4);
 assert.throws(()=>readPublicSnapshot(()=>{throw Error('PUBLIC_PROJECTION_INVALID');},snapshot,[publication,updated],now-1),/PUBLIC_PROJECTION_INVALID/);
});
