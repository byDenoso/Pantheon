import test from 'node:test';
import assert from 'node:assert/strict';
import {readResearchSnapshot} from '../server/adapters/research-snapshot.mjs';

test('an already aborted publication consumer performs no upstream read',async()=>{
  const original=globalThis.fetch;
  let reads=0;
  globalThis.fetch=async()=>{reads++;return Response.json({});};
  try{
    const signal=AbortSignal.abort();
    await assert.rejects(()=>readResearchSnapshot({env:{NEXO_PUBLIC_PUBLICATION_URL:'https://publication.test/pre-aborted'},signal}));
    assert.equal(reads,0);
  }finally{globalThis.fetch=original;}
});

test('publication URLs reject embedded credentials before fetching',async()=>{
  const original=globalThis.fetch;
  let reads=0;
  globalThis.fetch=async()=>{reads++;return Response.json({});};
  try{
    for(const url of ['https://synthetic-user:synthetic-password@publication.test/data','http://publication.test/data','not-a-url'])
      await assert.rejects(()=>readResearchSnapshot({env:{NEXO_PUBLIC_PUBLICATION_URL:url}}),/PUBLICATION_URL_INVALID/);
    assert.equal(reads,0);
  }finally{globalThis.fetch=original;}
});

test('publication stream is cancelled as soon as the byte limit is crossed',async()=>{
  const original=globalThis.fetch;
  let pulls=0,cancelled=false;
  const chunk=new Uint8Array(1024*1024);
  globalThis.fetch=async()=>new Response(new ReadableStream({
    pull(controller){pulls++;if(pulls>20){controller.close();return;}controller.enqueue(chunk);},
    cancel(){cancelled=true;}
  },{highWaterMark:0}));
  try{
    await assert.rejects(()=>readResearchSnapshot({env:{NEXO_PUBLIC_PUBLICATION_URL:'https://publication.test/too-large'}}),/PUBLICATION_TOO_LARGE/);
    assert.equal(cancelled,true);
    assert.equal(pulls,17);
  }finally{globalThis.fetch=original;}
});

test('publication HTTP failures retain safe authorization and rate limit codes',async()=>{
  const original=globalThis.fetch;
  try{
    for(const [status,code] of [[401,'AUTH_REQUIRED'],[403,'AUTH_REQUIRED'],[429,'RATE_LIMITED'],[503,'UNAVAILABLE']]){
      globalThis.fetch=async()=>new Response('secret-canary',{status});
      await assert.rejects(()=>readResearchSnapshot({env:{NEXO_PUBLIC_PUBLICATION_URL:`https://publication.test/status-${status}`}}),error=>error.message==='PUBLICATION_UNAVAILABLE'&&error.code===code);
    }
  }finally{globalThis.fetch=original;}
});
