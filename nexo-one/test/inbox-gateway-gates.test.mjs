import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inboxDrop} from '../server/inbox-gateway.mjs';
import {atlasBoundary} from '../server/atlas/boundary.mjs';

const env={GOOGLE_CONNECTOR:'google/audit-fixture',VERCEL_OIDC_TOKEN:'synthetic-provider-identity',NEXO_SPOOL_ID:'audit-spool'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const safe={kind:'LEARNING_SIGNAL',source:'TEST',payload:{evidence_kind:'INTEGRITY',evidence:'synthetic'}};
const gate=action=>({kind:'OPERATOR_INTENT',source:'DENER',payload:{action,roadmap_id:'synthetic-roadmap'}});
const batch=items=>({kind:'BATCH',source:'EXECUTOR',payload:{items}});

function fixture(){
  const rows=[['','stable_id','created_at','role','envelope_b64url']],seen=[];
  return {rows,seen,fetch:async(url,options={})=>{
    const u=String(url);seen.push({url:u,method:options.method||'GET'});
    if(u==='https://api.vercel.com/v1/connect/token/google%2Faudit-fixture')return Response.json({token:'synthetic-sheets-token'});
    if(u==='https://sheets.googleapis.com/v4/spreadsheets/audit-spool?fields=sheets.properties(title,index)')return Response.json({sheets:[{properties:{title:'Fixture',index:0}}]});
    if(u==='https://sheets.googleapis.com/v4/spreadsheets/audit-spool/values/%27Fixture%27!A%3AK?majorDimension=ROWS')return Response.json({values:rows});
    if(u==='https://sheets.googleapis.com/v4/spreadsheets/audit-spool/values/%27Fixture%27!A%3AK:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'){
      assert.equal(options.method,'POST');rows.push(...JSON.parse(options.body).values);return Response.json({updates:{updatedRows:1}});
    }
    if(u==='https://sheets.googleapis.com/v4/spreadsheets/audit-spool/values:batchClear'){
      for(const range of JSON.parse(options.body).ranges){const match=range.match(/!A(\d+):K\1$/);assert.ok(match);rows[Number(match[1])-1]=[];}
      return Response.json({});
    }
    assert.fail(`Unexpected synthetic request: ${u}`);
  }};
}
async function withFetch(fetcher,fn){const previous=globalThis.fetch;globalThis.fetch=fetcher;try{return await fn();}finally{globalThis.fetch=previous;}}
const drop=(value,id='test-gate')=>new URL(`https://synthetic.invalid/api/inbox-drop?id=${id}&i=1&n=1&d=${Buffer.from(JSON.stringify(value)).toString('base64url')}`);
const completeRows=fx=>fx.rows.slice(1).filter(row=>row[1]&&row[4]);

test('anonymous gateway ingress is denied by the current boundary before any provider request',async()=>{
  await withFetch(()=>assert.fail('Anonymous authentication must not contact a provider'),async()=>{
    const result=await atlasBoundary({method:'GET',headers:{}},env,{route:'inbox-drop'});
    assert.deepEqual(result,{status:401,body:{error:'AUTH_REQUIRED'}});
  });
});

test('existing trusted machine key remains authorized at the gateway boundary',async()=>{
  await withFetch(()=>assert.fail('Synthetic machine key requires no provider call'),async()=>{
    const result=await atlasBoundary({method:'GET',headers:{authorization:'Bearer synthetic-machine-key'}},
      {...env,NEXO_MCP_ACCESS_KEY_SHA256:hash('synthetic-machine-key')},{route:'inbox-drop'});
    assert.equal(result,null);
  });
});

for(const action of ['APPROVE_CHARTER','REJECT_CHARTER','CANONIZE','REJECT_CANARY']){
  for(const [shape,wrap] of [
    ['direct',value=>value],
    ['batch',value=>batch([safe,value])],
    ['nested batch',value=>batch([safe,batch([value])])],
    ['lowercase batch',value=>({...batch([value]),kind:'batch'})],
    ['alias',value=>({...value,kind:'INTENT'})],
    ['normalized kind',value=>({...value,kind:'operator-intent'})],
    ['bare payload',value=>({kind:value.kind,source:value.source,...value.payload})],
    ['payload kind',value=>({source:value.source,payload:{kind:'OPERATOR_INTENT',...value.payload}})],
  ])test(`gateway rejects ${action} in ${shape}`,async()=>{
    const fx=fixture();
    await withFetch(fx.fetch,async()=>{
      const [body,status]=await inboxDrop(drop(wrap(gate(action))),env);
      assert.equal(status,403);assert.equal(body.error,'GATE_ACTIONS_ONLY_IN_CONVERSATION');
      assert.equal(completeRows(fx).length,0,'No complete proposal can enter the Writer spool');
    });
  });
}

test('operational intents remain denied inside arbitrary nested objects',async()=>{
  const fx=fixture();
  await withFetch(fx.fetch,async()=>{
    const [body,status]=await inboxDrop(drop({...safe,payload:{nested:{kind:'OPERATIONAL_INTENT'}}}),env);
    assert.equal(status,403);assert.equal(body.error,'GATE_ACTIONS_ONLY_IN_CONVERSATION');
    assert.equal(completeRows(fx).length,0);
  });
});

test('safe learning and non-gate operator notes remain accepted',async()=>{
  const fx=fixture(),value=batch([safe,{kind:'OPERATOR_INTENT',source:'CHATGPT',payload:{action:'SUGGEST_REVIEW'}}]);
  await withFetch(fx.fetch,async()=>{
    const [body,status]=await inboxDrop(drop(value),env);
    assert.equal(status,201);assert.equal(body.readback,'PASS');
    assert.deepEqual(JSON.parse(Buffer.from(completeRows(fx)[0][4],'base64url')),{...value,_via:'INBOX_GATEWAY_SHEET'});
  });
});

test('safe multipart compatibility remains accepted',async()=>{
  const fx=fixture(),encoded=Buffer.from(JSON.stringify(batch([safe,safe]))).toString('base64url');
  const middle=Math.floor(encoded.length/2);
  await withFetch(fx.fetch,async()=>{
    const [pending,pendingStatus]=await inboxDrop(new URL(`https://synthetic.invalid/api/inbox-drop?id=safe-parts&i=1&n=2&d=${encoded.slice(0,middle)}`),env);
    assert.equal(pendingStatus,202);assert.equal(pending.complete,false);
    const [complete,completeStatus]=await inboxDrop(new URL(`https://synthetic.invalid/api/inbox-drop?id=safe-parts&i=2&n=2&d=${encoded.slice(middle)}`),env);
    assert.equal(completeStatus,201);assert.equal(complete.readback,'PASS');assert.equal(completeRows(fx).length,1);
  });
});
