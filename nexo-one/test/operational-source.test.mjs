import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalSource,OPERATIONAL_READ_SCOPES} from '../server/mcp/operational-runtime.mjs';

test('role context requests only the existing Drive readonly scope',()=>{
  assert.deepEqual(OPERATIONAL_READ_SCOPES,['https://www.googleapis.com/auth/drive.readonly']);
  assert.equal(Object.isFrozen(OPERATIONAL_READ_SCOPES),true);
});

test('operational diagnostics retain a safe cause without logging provider bodies',async()=>{
  const original=console.warn,logs=[];
  console.warn=value=>logs.push(JSON.parse(value));
  try{
    await assert.rejects(()=>operationalSource('READ_CANONICAL_CONTEXT',()=>{throw new Error('TOWER_METADATA_INVALID');}),{code:'TOWER_METADATA_INVALID'});
    await assert.rejects(()=>operationalSource('WRITE_PRIVATE_INTENT',()=>{throw new Error('Bearer private-token body=private-data');}),{code:'OPERATIONAL_SOURCE_UNAVAILABLE'});
    assert.deepEqual(logs,[
      {component:'NEXO_OPERATIONAL_RUNTIME',stage:'READ_CANONICAL_CONTEXT',code:'TOWER_METADATA_INVALID'},
      {component:'NEXO_OPERATIONAL_RUNTIME',stage:'WRITE_PRIVATE_INTENT',code:'OPERATIONAL_SOURCE_UNAVAILABLE'}
    ]);
    assert.equal(JSON.stringify(logs).includes('private-token'),false);
    assert.equal(await operationalSource('READ_CANONICAL_CONTEXT',async()=>42),42);
  }finally{console.warn=original;}
});

test('Google operational diagnostics are allowlisted and not returned to clients',async()=>{
  const original=console.warn,logs=[];
  console.warn=value=>logs.push(JSON.parse(value));
  try{
    for(const diagnostic of ['OIDC_MISSING','CONNECT_USER_AUTHORIZATION_REQUIRED','private-token:user@example.test']){
      const error=Object.assign(new Error('private-provider-body'),{code:'AUTH_REQUIRED',googleDiagnostic:diagnostic});
      await assert.rejects(()=>operationalSource('READ_CANONICAL_CONTEXT',()=>{throw error;}),out=>
        out.code==='AUTH_REQUIRED'&&out.message==='AUTH_REQUIRED'&&out.googleDiagnostic===undefined);
    }
    assert.deepEqual(logs.map(x=>x.diagnostic),['OIDC_MISSING','CONNECT_USER_AUTHORIZATION_REQUIRED',undefined]);
    assert.equal(JSON.stringify(logs).includes('private-'),false);
  }finally{console.warn=original;}
});
