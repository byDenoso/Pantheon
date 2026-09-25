import test from 'node:test';
import assert from 'node:assert/strict';
import {inboxDrop} from '../server/inbox-gateway.mjs';

const env={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SPOOL_ID:'spool-fixture',NEXO_INBOX_TOKEN:'read-only-secret'};
const req={headers:{host:'atlas.example','x-forwarded-proto':'https'}};
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
    if(u==='https://atlas.example/api/nexo-writer'){
      assert.equal(method,'POST');assert.equal(options.headers['X-Nexo-Writer-Id'],'run-1234');
      assert.match(options.headers['X-Nexo-Writer-Signature'],/^[0-9a-f]{64}$/);
      return new Response(JSON.stringify({status:'READY_TO_UPLOAD',applied:1,rejected:0,readback:'PASS'}),{status:200,headers:{'Content-Type':'application/json'}});
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
    const [pending,pendingStatus]=await inboxDrop(first,env,req);
    assert.equal(pendingStatus,202);assert.equal(pending.complete,false);assert.equal(pending.transport,'SHEET_SPOOL');
    const [saved,savedStatus]=await inboxDrop(second,env,req);
    assert.equal(savedStatus,201);assert.equal(saved.complete,true);assert.equal(saved.saved,'sheet:run-1234');assert.equal(saved.readback,'PASS');assert.equal(saved.writer.status,'READY_TO_UPLOAD');
  });
  const header=fx.rows[0],stable=header.indexOf('stable_id'),raw=header.indexOf('envelope_b64url');
  const savedRow=fx.rows.find(row=>row?.[stable]==='run-1234');
  assert.ok(savedRow);assert.deepEqual(JSON.parse(Buffer.from(savedRow[raw],'base64url').toString('utf8')),{...envelope,_via:'INBOX_GATEWAY_SHEET'});
  assert.equal(fx.seen.some(entry=>entry.u.includes('api.github.com')),false);
});
