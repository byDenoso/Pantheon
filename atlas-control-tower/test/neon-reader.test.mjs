import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanonical} from '../lib/neon-reader.mjs';

test('Neon reader authenticates with Vercel OIDC and reads science_v1 + learning_v1',async()=>{
  const seen=[];
  const fakeFetch=async(url,opts={})=>{
    seen.push({url:String(url),headers:opts.headers||{}});
    const u=String(url);
    const body=u.includes('/entities?')?[{entity_id:'T1'}]:u.includes('/import_batches?')?[{source_observed_at:'2026-09-06T13:20:50.848Z',status:'AUDITED'}]:[];
    return {ok:true,json:async()=>body};
  };
  const out=await readCanonical({fetchImpl:fakeFetch,token:'oidc-test',baseUrl:'https://example.test/rest/v1'});
  assert.equal(out.science.entities[0].entity_id,'T1');
  assert.equal(out.observedAt,'2026-09-06T13:20:50.848Z');
  assert.ok(seen.some(x=>x.headers.Authorization==='Bearer oidc-test'&&x.headers['Accept-Profile']==='science_v1'));
  assert.ok(seen.some(x=>x.headers.Authorization==='Bearer oidc-test'&&x.headers['Accept-Profile']==='learning_v1'));
});
