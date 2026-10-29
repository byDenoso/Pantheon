import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../server/vercel-handler.mjs';

function reply(){const headers={};return {headers,setHeader(k,v){headers[k.toLowerCase()]=v;},end(body){this.body=body;}};}
test('Vercel adapter rejects anonymous private UI and does not call Redis',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 try {
  const res=reply();await handler({url:'/api/index?route=atlas-private-ui',method:'GET',headers:{}},res,'/api/atlas-private-ui');
  assert.equal(res.statusCode,403);assert.equal(JSON.parse(res.body).error,'AUTH_REQUIRED');assert.equal(calls,0);
 } finally {globalThis.fetch=original;}
});
