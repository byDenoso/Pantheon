import test from 'node:test';
import assert from 'node:assert/strict';
import {inboxDrop} from '../server/inbox-gateway.mjs';
import {submit} from '../scripts/nexo-submit.mjs';

const env={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SPOOL_ID:'spool-fixture'};
const envelope={kind:'LEARNING_SIGNAL',source:'TEST',payload:{evidence_kind:'INTEGRITY',evidence:'sheet ingress'}};
const encoded=Buffer.from(JSON.stringify(envelope),'utf8').toString('base64url');

async function withFetch(handler,fn){const original=globalThis.fetch;globalThis.fetch=handler;try{return await fn();}finally{globalThis.fetch=original;}}

function sheetFixture(){
  const rows=[['','stable_id','created_at','role','envelope_b64url']];
  const seen=[];
  const fetch=async(url,options={})=>{
    const u=String(url),method=options.method||'GET';seen.push({u,method});
    if(u.includes('/v1/connect/token/'))return new Response(JSON.stringify({token:'sheets-write-token'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(u.includes('/v4/spreadsheets/spool-fixture?fields='))return new Response(JSON.stringify({sheets:[{properties:{title:'Spool',index:0}}]}),{status:200,headers:{'Content-Type':'application/json'}});
    if(u.includes('/values/%27Spool%27!A%3AK?majorDimension=ROWS'))return new Response(JSON.stringify({values:rows}),{status:200,headers:{'Content-Type':'application/json'}});
    if(u.includes('/values/%27Spool%27!A%3AK:append')){
      assert.equal(method,'POST');assert.equal(options.headers.Authorization,'Bearer sheets-write-token');
      const body=JSON.parse(options.body);for(const row of body.values)rows.push(row);
      return new Response(JSON.stringify({updates:{updatedRows:body.values.length}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(u.includes('/values:batchClear')){
      const body=JSON.parse(options.body);
      for(const range of body.ranges){
        const match=range.match(/!A(\d+):K\1$/);if(match)rows[Number(match[1])-1]=[];
      }
      return new Response(JSON.stringify({clearedRanges:body.ranges}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    assert.fail(`Unexpected request ${u}`);
  };
  return {rows,seen,fetch};
}

test('inbox-drop persists chunked envelopes through the Sheet spool without GitHub write access',async()=>{
  const fx=sheetFixture();
  await withFetch(fx.fetch,async()=>{
    const first=new URL('https://atlas.example/api/inbox-drop?id=run-1234&i=1&n=2&d='+encoded.slice(0,Math.ceil(encoded.length/2)));
    const second=new URL('https://atlas.example/api/inbox-drop?id=run-1234&i=2&n=2&d='+encoded.slice(Math.ceil(encoded.length/2)));
    const [pending,pendingStatus]=await inboxDrop(first,env);
    assert.equal(pendingStatus,202);assert.equal(pending.complete,false);assert.equal(pending.transport,'SHEET_SPOOL');
    const [saved,savedStatus]=await inboxDrop(second,env);
    assert.equal(savedStatus,201);assert.equal(saved.complete,true);assert.equal(saved.saved,'sheet:run-1234');assert.equal(saved.readback,'PASS');
  });
  const header=fx.rows[0],stable=header.indexOf('stable_id'),raw=header.indexOf('envelope_b64url');
  const savedRow=fx.rows.find(row=>row?.[stable]==='run-1234');
  assert.ok(savedRow);assert.deepEqual(JSON.parse(Buffer.from(savedRow[raw],'base64url').toString('utf8')),{...envelope,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
  await withFetch(fx.fetch,async()=>{
    const [found,foundStatus]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-1234&check=1'),env);
    assert.equal(foundStatus,200);assert.equal(found.complete,true);assert.equal(found.readback,'PASS');assert.equal(found.saved,'sheet:run-1234');
    const [absent,absentStatus]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-5678&check=1'),env);
    assert.equal(absentStatus,200);assert.equal(absent.complete,false);assert.equal(absent.found,false);
  });
});

test('Executor client durably submits through inbox-drop and receives readback in the same run',async()=>{
  const fx=sheetFixture(),payload={stable_id:'executor-batch-20260927',kind:'NEXO_THOUGHT',source:'EXECUTOR',payload:{entries:[{kind:'QUESTION',text:'Resultado de teste'}]}};
  await withFetch(fx.fetch,async()=>{
    const fetchImpl=async url=>{
      const request=new URL(url);
      if(request.pathname==='/api/inbox-drop'){
        const [value,status]=await inboxDrop(request,env);
        return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
      }
      return fx.fetch(url);
    };
    const result=await submit(payload.stable_id,JSON.stringify(payload),{base:'https://atlas.example',fetchImpl});
    assert.equal(result.ok,true);assert.equal(result.gateway.readback,'PASS');assert.equal(result.gateway.saved,`sheet:${payload.stable_id}`);
  });
  const stable=fx.rows[0].indexOf('stable_id'),raw=fx.rows[0].indexOf('envelope_b64url');
  const row=fx.rows.find(candidate=>candidate?.[stable]===payload.stable_id);
  assert.ok(row);assert.deepEqual(JSON.parse(Buffer.from(row[raw],'base64url').toString('utf8')),{...payload,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
});

test('gateway check recognises a processed GitHub id without resubmitting it',async()=>{
  const id='batch-processed',file=`20260927-NEXO_THOUGHT-gw-${id}.json`,path=`processed/${file}`;
  const fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/contents/inbox?ref=nexo-inbox'))return new Response('[]',{status:200});
    if(value.endsWith('/contents/processed?ref=nexo-inbox'))return new Response(JSON.stringify([{name:file,path,type:'file'}]),{status:200});
    if(value.endsWith(`/contents/${path}?ref=nexo-inbox`))return new Response(JSON.stringify({name:file,path,content:Buffer.from('{}').toString('base64')}),{status:200});
    assert.fail(`Unexpected request ${value}`);
  };
  await withFetch(fetch,async()=>{
    const [value,status]=await inboxDrop(new URL(`https://atlas.example/api/inbox-drop?id=${id}&check=1`),{NEXO_INBOX_TOKEN:'fixture-read-token'});
    assert.equal(status,200);assert.equal(value.complete,true);assert.equal(value.readback,'PASS');assert.equal(value.saved,path);
  });
});


test('inbox-drop uses the per-request Vercel OIDC token when the env token is absent',async()=>{
  const fx=sheetFixture();
  let connectAuthorization=null;
  const wrapped=async(url,options={})=>{
    if(String(url).includes('/v1/connect/token/')) connectAuthorization=options.headers?.Authorization;
    return fx.fetch(url,options);
  };
  const req={headers:{'x-vercel-oidc-token':'oidc-from-request'}};
  const localEnv={GOOGLE_CONNECTOR:'google/nexo-google',NEXO_SPOOL_ID:'spool-fixture'};
  await withFetch(wrapped,async()=>{
    const [saved,status]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-oidc-1&i=1&n=1&d='+encoded),localEnv,req);
    assert.equal(status,201);
    assert.equal(saved.readback,'PASS');
  });
  assert.equal(connectAuthorization,'Bearer oidc-from-request');
});

test('read-only GitHub token is not used as a write fallback when the Sheet spool fails',async()=>{
  const seen=[];
  const fetch=async(url,options={})=>{
    const u=String(url);seen.push({u,method:options.method||'GET'});
    if(u.includes('/v1/connect/token/'))return new Response(JSON.stringify({error:'denied'}),{status:403,headers:{'Content-Type':'application/json'}});
    if(u.includes('api.github.com'))assert.fail('read-only GitHub token must not be used for gateway writes');
    return new Response('{}',{status:500,headers:{'Content-Type':'application/json'}});
  };
  const localEnv={GOOGLE_CONNECTOR:'google/nexo-google',NEXO_INBOX_TOKEN:'read-only-token',NEXO_SPOOL_ID:'spool-fixture'};
  const req={headers:{'x-vercel-oidc-token':'oidc-from-request'}};
  await withFetch(fetch,async()=>{
    const [value,status]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-fail-1&i=1&n=1&d='+encoded),localEnv,req);
    assert.equal(status,502);
    assert.equal(value.error,'SHEET_SPOOL_WRITE_FAILED');
    assert.equal(value.github_token_role,'READ_ONLY_COMPATIBILITY');
  });
  assert.equal(seen.some(entry=>entry.u.includes('api.github.com')),false);
});
