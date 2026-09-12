import test from 'node:test';
import assert from 'node:assert/strict';
import {nexo} from '../server/adapters/nexo.mjs';

const now=Date.parse('2026-09-09T12:00:00Z');

test('NEXO Sheet transport liveness never re-stamps owner rows as LIVE',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const href=String(url);
    if(href.includes('api.vercel.com/v1/connect/token/google%2Fnexo-google')){
      return new Response(JSON.stringify({token:'connect-access'}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(href.includes('sheets.googleapis.com/v4/spreadsheets/ssot-fixture/values/')){
      assert.equal(options.headers.Authorization,'Bearer connect-access');
      return new Response(JSON.stringify({values:[
        ['record_type','record_id','status','title','detail','payload_json','source','updated_at'],
        ['state','old-state','ACTIVE','Old canonical state','Owner observation','','NEXO · SSOT CANONICAL','2026-09-01 12:00:00+00']
      ]}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    assert.fail(`Unexpected outbound request: ${href}`);
  };
  try{
    const result=await nexo({env:{GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',NEXO_SHEET_ID:'ssot-fixture'},now});
    assert.equal(result.items[0].observedAt,'2026-09-01T12:00:00.000Z');
    assert.equal(result.items[0].freshness.observedAt,'2026-09-01T12:00:00.000Z');
    assert.equal(result.items[0].freshness.state,'SNAPSHOT');
  }finally{
    globalThis.fetch=original;
  }
});
