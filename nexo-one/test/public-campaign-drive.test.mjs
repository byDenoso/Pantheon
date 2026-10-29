import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';
import {publicCampaignAtlas} from '../server/atlas/public-campaign-route.mjs';
import handler from '../server/handler.mjs';

const bi = value => ({'pt-BR': value, en: value});
const at = '2026-10-29T18:00:00Z';
const snapshot = () => createPublicCampaignSnapshot([{
  id:'campaign-1', questionId:'question-1', question:bi('Expansion history'),
  why:bi('Compare models'), method:bi('Frozen observations'), currentStage:bi('Under review'),
  nextStep:bi('Independent review'), limitations:[bi('Limited precision')],
  updatedAt:at, state:'ongoing', closure:null, references:[], testsCoverage:'COMPLETE',
  tests:[{id:'test-1',question:bi('PRIVATE_TEST_DETAIL'),method:bi('Internal method'),stage:'PLANNED',updatedAt:at,result:null,references:[]}],
}], {sourceRevision:'sha256:'+'a'.repeat(64),generatedAt:at,coverage:'PARTIAL'});

test('public campaign response contains summaries without individual tests', async t => {
  const dir=await mkdtemp(join(tmpdir(),'campaign-summary-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'snapshot.json'); await writeFile(file,JSON.stringify(snapshot()));
  const result=await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_FILE:file});
  assert.equal(result.status,200);
  assert.equal(result.body.campaigns[0].question.en,'Expansion history');
  assert.deepEqual(result.body.campaigns[0].tests,[]);
  assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_TEST_DETAIL|test-1/);
});

test('Drive reads use one server-configured file and existing readonly identity', async () => {
  const calls=[];
  const result=await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID:'approved-snapshot'}, {
    tokenProvider:async (_,signal,options)=>{assert.deepEqual(options.scopes,['https://www.googleapis.com/auth/drive.readonly']);return 'synthetic-credential';},
    fetcher:async (url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Bearer synthetic-credential');
      return new Response(JSON.stringify(url.includes('alt=media')?snapshot():{id:'approved-snapshot',mimeType:'application/json',size:'2000'}));},
  });
  assert.equal(result.status,200);assert.equal(calls.length,2);
  assert.ok(calls.every(url=>url.startsWith('https://www.googleapis.com/drive/v3/files/approved-snapshot?')));
  assert.deepEqual(result.body.campaigns[0].tests,[]);
  assert.doesNotMatch(JSON.stringify(result),/synthetic-credential|approved-snapshot|PRIVATE_TEST_DETAIL/);
});

test('Drive denial does not silently fall back to stale file or expose errors', async () => {
  const result=await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID:'approved-snapshot',NEXO_PUBLIC_CAMPAIGNS_FILE:'/missing'}, {
    tokenProvider:async()=> 'synthetic-credential',fetcher:async()=>new Response('private error',{status:403}),
  });
  assert.deepEqual(result,{status:503,body:{error:'PUBLIC_CAMPAIGNS_UNAVAILABLE'}});
});

test('mismatched file identity and oversized media are rejected', async () => {
  for(const wrongIdentity of [true,false]) {
    const result=await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID:'approved-snapshot'}, {
      tokenProvider:async()=> 'synthetic-credential',fetcher:async url=>new Response(JSON.stringify(url.includes('alt=media')?snapshot():{
        id:wrongIdentity?'another-file':'approved-snapshot',mimeType:'application/json',size:String(wrongIdentity?100:9*1024*1024),
      })),
    });
    assert.equal(result.status,503);
  }
});

test('a small declared file cannot stream an unbounded body', async () => {
  const result=await publicCampaignAtlas({NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID:'approved-snapshot'}, {
    tokenProvider:async()=> 'synthetic-credential',fetcher:async url=>url.includes('alt=media')
      ? new Response(new Uint8Array(8*1024*1024+1))
      : new Response(JSON.stringify({id:'approved-snapshot',mimeType:'application/json',size:'100'})),
  });
  assert.equal(result.status,503);
});

test('only the public catalogue receives cross-origin access; private routes still deny anonymous reads', async () => {
  for(const route of ['atlas-public','atlas-private','atlas-shadow']) {
    const headers={};let body;
    const res={setHeader:(k,v)=>{headers[k]=v;},end:value=>{body=value;}};
    await handler({url:`/api/${route}`,method:'GET',headers:{origin:'https://nexoresearch.org'}},res);
    assert.equal(res.statusCode,route==='atlas-public'?200:401);
    assert.equal(headers['Access-Control-Allow-Origin'],route==='atlas-public'?'https://nexoresearch.org':undefined);
    assert.equal(headers['Access-Control-Allow-Credentials'],undefined);
    if(route!=='atlas-public')assert.deepEqual(JSON.parse(body),{error:'AUTH_REQUIRED'});
  }
});

test('public Drive API uses the current Vercel request identity for Connect', async t => {
  const values={GOOGLE_CONNECTOR:'google/synthetic',NEXO_PUBLIC_CAMPAIGNS_DRIVE_FILE_ID:'approved-snapshot',VERCEL_OIDC_TOKEN:'stale-identity'};
  for(const [key,value] of Object.entries(values)) {
    const before=process.env[key];process.env[key]=value;
    t.after(()=>{if(before===undefined)delete process.env[key];else process.env[key]=before;});
  }
  let connected=false;
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    if(String(url).startsWith('https://api.vercel.com/v1/connect/token/')) {
      assert.equal(options.headers.Authorization,'Bearer current-identity');connected=true;
      return new Response(JSON.stringify({token:'synthetic-drive-token'}));
    }
    assert.equal(options.headers.Authorization,'Bearer synthetic-drive-token');
    return new Response(JSON.stringify(String(url).includes('alt=media')?snapshot():{id:'approved-snapshot',mimeType:'application/json',size:'2000'}));
  });
  let body;const res={setHeader:()=>{},end:value=>{body=JSON.parse(value);}};
  await handler({url:'/api/atlas-public',method:'GET',headers:{origin:'https://nexoresearch.org','x-vercel-oidc-token':'current-identity'}},res);
  assert.equal(res.statusCode,200);assert.equal(connected,true);
  assert.deepEqual(body.campaigns[0].tests,[]);
});
