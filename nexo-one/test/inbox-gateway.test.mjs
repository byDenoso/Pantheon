import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inboxDrop,readSpool,submitScientificGatewayEnvelope} from '../server/inbox-gateway.mjs';
import {GOOGLE_SHEETS_SPOOL_CONSENT} from '../server/auth/google-drive-consent.mjs';
import {submit} from '../scripts/nexo-submit.mjs';
import {SPOOL_ID} from '../server/mcp/operational-queue.mjs';

const env={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SPOOL_ID:'spool-fixture'};
const envelope={kind:'LEARNING_SIGNAL',source:'TEST',payload:{evidence_kind:'INTEGRITY',evidence:'sheet ingress'}};
const encoded=Buffer.from(JSON.stringify(envelope),'utf8').toString('base64url');

async function withFetch(handler,fn){const original=globalThis.fetch;globalThis.fetch=handler;try{return await fn();}finally{globalThis.fetch=original;}}

function sheetFixture(spreadsheetId='spool-fixture'){
  const rows=[['','stable_id','created_at','role','envelope_b64url']];
  const seen=[];
  const fetch=async(url,options={})=>{
    const u=String(url),method=options.method||'GET';seen.push({u,method});
    if(u.includes('/v1/connect/token/'))return new Response(JSON.stringify({token:'sheets-write-token'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(u.includes(`/v4/spreadsheets/${spreadsheetId}?fields=`))return new Response(JSON.stringify({sheets:[{properties:{title:'Spool',index:0}}]}),{status:200,headers:{'Content-Type':'application/json'}});
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

test('scientific MCP ingress writes only the existing Writer spool and replays exact bytes',async()=>{
  const fx=sheetFixture(SPOOL_ID),localEnv={...env,NEXO_SPOOL_ID:SPOOL_ID};
  const envelope={kind:'TEST_BATTERY',source:'MCP_EXECUTOR',payload:{battery_id:'mcp-'+'a'.repeat(40),
    tests:[{test_id:'T-READY-001',recipe:'seed_bounds',params:{seed:17}}]}};
  const identity=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)
    ?'['+value.map(identity).join(',')+']'
    :'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+identity(value[key])).join(',')+'}';
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const stableId=`science-${hash(identity(envelope)).slice(0,48)}`;
  await withFetch(fx.fetch,async()=>{
    const first=await submitScientificGatewayEnvelope(stableId,envelope,localEnv,{});
    const second=await submitScientificGatewayEnvelope(stableId,envelope,localEnv,{});
    assert.equal(first.readback,'PASS');assert.equal(first.reused,false);
    assert.equal(second.readback,'PASS');assert.equal(second.reused,true);
    assert.equal(first.stable_id,stableId);assert.equal(second.body_sha256,first.body_sha256);
    assert.match(first.destination,new RegExp(SPOOL_ID));
  });
  const stable=fx.rows[0].indexOf('stable_id'),raw=fx.rows[0].indexOf('envelope_b64url');
  const saved=fx.rows.find(row=>row?.[stable]===stableId);
  assert.ok(saved);assert.deepEqual(JSON.parse(Buffer.from(saved[raw],'base64url').toString('utf8')),
    {...envelope,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
  const other=sheetFixture('other-spool');
  await assert.rejects(()=>withFetch(other.fetch,()=>submitScientificGatewayEnvelope(stableId,envelope,
    {...localEnv,NEXO_SPOOL_ID:'other-spool'},{})),error=>error.code==='SPOOL_DESTINATION_MISMATCH');
});

test('inbox-drop persists chunked envelopes through the Sheet spool without GitHub write access',async()=>{
  const fx=sheetFixture();
  let expectedHash;
  await withFetch(fx.fetch,async()=>{
    const first=new URL('https://atlas.example/api/inbox-drop?id=run-1234&i=1&n=2&d='+encoded.slice(0,Math.ceil(encoded.length/2)));
    const second=new URL('https://atlas.example/api/inbox-drop?id=run-1234&i=2&n=2&d='+encoded.slice(Math.ceil(encoded.length/2)));
    const [pending,pendingStatus]=await inboxDrop(first,env);
    assert.equal(pendingStatus,202);assert.equal(pending.complete,false);assert.equal(pending.transport,'SHEET_SPOOL');
    const [saved,savedStatus]=await inboxDrop(second,env);
    assert.equal(savedStatus,201);assert.equal(saved.complete,true);assert.equal(saved.saved,'sheet:run-1234');assert.equal(saved.readback,'PASS');
    expectedHash=saved.body_sha256;
    assert.equal(saved.verification,'BODY_HASH');assert.equal(saved.application_verification,'NOT_CHECKED');
  });
  const header=fx.rows[0],stable=header.indexOf('stable_id'),raw=header.indexOf('envelope_b64url');
  const savedRow=fx.rows.find(row=>row?.[stable]==='run-1234');
  assert.ok(savedRow);assert.deepEqual(JSON.parse(Buffer.from(savedRow[raw],'base64url').toString('utf8')),{...envelope,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
  await withFetch(fx.fetch,async()=>{
    const [found,foundStatus]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-1234&check=1'),env);
    assert.equal(foundStatus,200);assert.equal(found.complete,true);assert.equal(found.readback,'UNVERIFIED');assert.equal(found.saved,'sheet:run-1234');
    assert.equal(found.verification,'EXISTENCE_ONLY');assert.equal(found.application_verification,'NOT_CHECKED');
    const [verified,verifiedStatus]=await inboxDrop(new URL('https://atlas.example/api/inbox-drop?id=run-1234&check=1&body_sha256='+expectedHash),env);
    assert.equal(verifiedStatus,200);assert.equal(verified.readback,'PASS');assert.equal(verified.verification,'BODY_HASH');
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
    const replay=await submit(payload.stable_id,JSON.stringify(payload),{base:'https://atlas.example',fetchImpl});
    assert.equal(replay.ok,true);assert.equal(replay.gateway.reused,true);
    const changed=await submit(payload.stable_id,JSON.stringify({...payload,payload:{entries:[]}}),{base:'https://atlas.example',fetchImpl});
    assert.equal(changed.ok,false);assert.equal(changed.httpStatus,409);
  });
  const stable=fx.rows[0].indexOf('stable_id'),raw=fx.rows[0].indexOf('envelope_b64url');
  const row=fx.rows.find(candidate=>candidate?.[stable]===payload.stable_id);
  assert.ok(row);assert.deepEqual(JSON.parse(Buffer.from(row[raw],'base64url').toString('utf8')),{...payload,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.rows.filter(candidate=>candidate?.[stable]===payload.stable_id).length,1);
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
});

test('gateway check recognises a processed GitHub id without inventing body verification',async()=>{
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
    assert.equal(status,200);assert.equal(value.complete,true);assert.equal(value.readback,'UNVERIFIED');assert.equal(value.saved,path);
    assert.equal(value.verification,'EXISTENCE_ONLY');assert.equal(value.application_verification,'NOT_CHECKED');
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

test('spool requests the same granted profile as owner consent using the current request identity',async()=>{
  const fx=sheetFixture(),requests=[];
  const fetch=async(url,options={})=>{
    if(String(url).includes('/v1/connect/token/')){
      const body=JSON.parse(options.body);requests.push({body,authorization:options.headers.Authorization});
      if(JSON.stringify(body.scopes)!==JSON.stringify(GOOGLE_SHEETS_SPOOL_CONSENT.scopes))
        return Response.json({error:{code:'user_authorization_required'}},{status:403});
    }
    return fx.fetch(url,options);
  };
  await withFetch(fetch,async()=>{
    const result=await readSpool({...env,VERCEL_OIDC_TOKEN:'stale-build-identity'},
      {headers:{'x-vercel-oidc-token':'current-request-identity'}});
    assert.equal(result.title,'Spool');
  });
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].body,{subject:GOOGLE_SHEETS_SPOOL_CONSENT.subject,scopes:GOOGLE_SHEETS_SPOOL_CONSENT.scopes});
  assert.equal(requests[0].authorization,'Bearer current-request-identity');
  assert.equal(fx.seen.some(item=>item.method!=='GET'&&!item.u.includes('/connect/token/')),false);
});

test('a denied granted-profile request stops without another scope, identity or transport attempt',async()=>{
  const calls=[];
  await withFetch(async(url,options={})=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});
    return Response.json({error:{code:'user_authorization_required'}},{status:403});
  },async()=>{
    await assert.rejects(readSpool({...env,GOOGLE_REFRESH_TOKEN:'unused',NEXO_INBOX_TOKEN:'unused'},{}),
      error=>error.code==='AUTH_REQUIRED'&&error.googleDiagnostic==='CONNECT_USER_AUTHORIZATION_REQUIRED');
  });
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body,{subject:GOOGLE_SHEETS_SPOOL_CONSENT.subject,scopes:GOOGLE_SHEETS_SPOOL_CONSENT.scopes});
});
