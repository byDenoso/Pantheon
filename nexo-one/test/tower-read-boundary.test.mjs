import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readVerifiedCanonicalTower,TOWER_ID} from '../server/mcp/operational-state.mjs';
import {operationalSource} from '../server/mcp/operational-runtime.mjs';

const tower={contract:'NEXO_TOWER_LIVE_V1',stable_file_id:TOWER_ID,storage:'GOOGLE_DRIVE_PRIVATE',
  revision:'sha256:'+'a'.repeat(64),state_fingerprint:'sha256:'+'a'.repeat(64),files:{}};
const raw=JSON.stringify(tower);
const metadata={id:TOWER_ID,headRevisionId:'synthetic-revision',md5Checksum:createHash('md5').update(raw).digest('hex'),size:String(Buffer.byteLength(raw))};

test('the complete Tower verification shares one bounded deadline with caller cancellation',async()=>{
  for(const callerSignal of [undefined,new AbortController().signal]){
    const signals=[];
    await readVerifiedCanonicalTower({token:'synthetic',signal:callerSignal,fetchImpl:async(url,init)=>{
      signals.push(init.signal);
      return String(url).includes('alt=media')?new Response(raw):Response.json(metadata);
    }});
    assert.equal(signals.length,3);
    assert.equal(new Set(signals).size,1);
    assert.notEqual(signals[0],callerSignal,'a caller signal must not remove the server deadline');
  }
});

test('Tower verification keeps safe authorization and throttling failures at every phase',async()=>{
  for(const failedPhase of [1,2,3])for(const [status,expected] of [[401,'AUTH_REQUIRED'],[429,'RATE_LIMITED']]){
    let phase=0;
    await assert.rejects(()=>readVerifiedCanonicalTower({token:'synthetic',fetchImpl:async(url)=>{
      phase++;
      if(phase===failedPhase)return new Response('secret-canary',{status});
      return String(url).includes('alt=media')?new Response(raw):Response.json(metadata);
    }}),error=>error.message===expected&&!error.message.includes('secret-canary'));
    assert.equal(phase,failedPhase);
  }
});

test('an already cancelled Tower reader never requests metadata or content',async()=>{
  let requests=0;
  await assert.rejects(()=>readVerifiedCanonicalTower({token:'synthetic',signal:AbortSignal.abort(),fetchImpl:async()=>{requests++;return Response.json(metadata);}}));
  assert.equal(requests,0);
});

test('operational diagnostics retain deadlines and cancellation without disclosing the cause',async()=>{
  const original=console.warn,logs=[];
  console.warn=value=>logs.push(JSON.parse(value));
  try{
    for(const [name,code] of [['TimeoutError','TIMEOUT'],['AbortError','CANCELLED']])
      await assert.rejects(()=>operationalSource('READ_CANONICAL_CONTEXT',()=>{throw new DOMException('secret-canary',name);}),{message:code,code});
    assert.deepEqual(logs.map(row=>row.code),['TIMEOUT','CANCELLED']);
    assert(!JSON.stringify(logs).includes('secret-canary'));
  }finally{console.warn=original;}
});
