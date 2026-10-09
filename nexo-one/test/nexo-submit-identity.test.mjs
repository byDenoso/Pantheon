import test from 'node:test';
import assert from 'node:assert/strict';
import {alreadyLanded,submit} from '../scripts/nexo-submit.mjs';
const response = body => Response.json(body);
test('existence-only lookup cannot be mistaken for absence or verified delivery',async()=>{
  for(const readback of ['UNVERIFIED','PASS']) {
    await assert.rejects(()=>alreadyLanded('stable-operation',async()=>response({complete:true,found:true,readback,verification:'EXISTENCE_ONLY'})),/INBOX_BODY_UNVERIFIED/);
  }
});
test('explicit absence and compatible verified delivery remain distinguishable',async()=>{
  assert.equal(await alreadyLanded('stable-operation',async()=>response({complete:false,found:false})),null);
  assert.equal(await alreadyLanded('stable-operation',async()=>response({complete:true,readback:'PASS',verification:'BODY_HASH',saved:'sheet:stable-operation'})),'sheet:stable-operation');
});
test('unverified preflight resends the same identity and exact body for gateway reconciliation',async()=>{
  const body=JSON.stringify({kind:'BOARD_POST',payload:{message:'fixture'}}),calls=[];
  const result=await submit('stable-operation',body,{base:'https://fixture.invalid',fetchImpl:async target=>{
    const url=new URL(target);calls.push(url);
    if(url.searchParams.get('check'))return response({complete:true,readback:'UNVERIFIED',verification:'EXISTENCE_ONLY'});
    assert.equal(url.searchParams.get('id'),'stable-operation');
    assert.equal(Buffer.from(url.searchParams.get('d'),'base64url').toString('utf8'),body);
    return response({complete:true,readback:'PASS',verification:'BODY_HASH',reused:true});
  }});
  assert.equal(result.ok,true);assert.equal(result.status,'ALREADY_PERSISTED');assert.equal(calls.length,2);
});
