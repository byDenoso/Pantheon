import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRetrievalFailure} from '../worker/retrieval/errors.mjs';

test('retrieval failures distinguish caller input, stale views and unavailable indexes',()=>{
  for(const [cause,status,code] of [
    ['INVALID_QUERY',400,'INVALID_ARGUMENT'],['AUTHORIZATION_REQUIRED',401,'AUTHORIZATION_REQUIRED'],
    ['IMPORTED_GENERATION_STALE',409,'STALE_INDEX'],['AUTHORIZED_INDEX_UNAVAILABLE',503,'INDEX_UNAVAILABLE'],
    ['MANIFEST_HASH_INVALID',503,'SOURCE_UNAVAILABLE']
  ]){
    const result=classifyRetrievalFailure(new Error(cause));
    assert.equal(result.status,status);
    assert.equal(result.body.error_code,code);
    assert.equal(result.body.diagnostic,cause);
    assert.equal(result.body.available,false);
  }
});

test('MCP and browser retrieval can report real connector reauthentication without disclosing source data',()=>{
  const error=Object.assign(new Error('CONNECTOR_LIST_FILE_REVISIONS_FAILED'),{connectorStatus:'reauthentication_required',retryAfter:30,body:'secret-canary'});
  const result=classifyRetrievalFailure(error);
  assert.equal(result.status,503);
  assert.equal(result.body.error_code,'SOURCE_REAUTHENTICATION_REQUIRED');
  assert.equal(result.body.connectorStatus,'reauthentication_required');
  assert.equal(result.body.recovery,'REAUTHORIZE_CONNECTOR');
  assert.equal(result.body.retryAfter,undefined);
  assert(!JSON.stringify(result).includes('secret-canary'));
});

test('retrieval diagnostics reject arbitrary messages and connector states and retain bounded throttling',()=>{
  for(const error of [new Error('secret-canary'),Object.assign(new Error('secret-canary'),{code:'secret-canary',connectorStatus:'secret-canary',retryAfter:90000})]){
    const result=classifyRetrievalFailure(error);
    assert.equal(result.body.error_code,'SOURCE_UNAVAILABLE');
    assert.equal(result.body.diagnostic,'RETRIEVAL_UNAVAILABLE');
    assert(!JSON.stringify(result).includes('secret-canary'));
  }
  const rate=classifyRetrievalFailure(Object.assign(new Error('CONNECTOR_LIST_FILE_REVISIONS_FAILED'),{connectorStatus:'rate_limited',retryAfter:30}));
  assert.equal(rate.body.error_code,'RATE_LIMITED');
  assert.equal(rate.body.retryAfter,30);
});
