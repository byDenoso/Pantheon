import test from 'node:test';
import assert from 'node:assert/strict';
import {googleToken} from '../server/adapters/google.mjs';

test('legacy OAuth tokens stay bound to the credentials that obtained them',async()=>{
  const original=globalThis.fetch;
  let refreshes=0;
  globalThis.fetch=async(_url,options)=>{
    refreshes++;
    const refresh=new URLSearchParams(options.body).get('refresh_token');
    return Response.json({access_token:`access-${refresh}`,expires_in:3600});
  };
  try{
    const one={GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-owner-one'};
    const two={...one,GOOGLE_REFRESH_TOKEN:'synthetic-owner-two'};
    assert.equal(await googleToken(one),'access-synthetic-owner-one');
    assert.equal(await googleToken(two),'access-synthetic-owner-two');
    assert.equal(await googleToken({...one}),'access-synthetic-owner-one');
    assert.equal(refreshes,2);
  }finally{globalThis.fetch=original;}
});
