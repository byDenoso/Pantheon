import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPin,
  makePinHash,
  verifyPin,
  constantTimeEqual,
  isSessionRecordValid,
  nextFailureBucket,
  isRateLimited,
  SESSION_TTL_MS,
  RATE_WINDOW_MS,
} from '../apps-script-auth/core.mjs';

const secret='test-secret-value-that-is-long-enough';

test('PIN accepts numeric values from 4 through 12 digits only',()=>{
  assert.equal(isValidPin('1234'),true);
  assert.equal(isValidPin('123456789012'),true);
  for(const value of ['123','1234567890123','12a4',' 1234','1234 '])assert.equal(isValidPin(value),false,value);
});

test('PIN hash is salted/secret-bound and wrong PIN fails closed',()=>{
  const encoded=makePinHash('123456','salt-1',secret);
  assert.match(encoded,/^hmac-sha256\$salt-1\$[a-f0-9]{64}$/);
  assert.equal(verifyPin('123456',encoded,secret),true);
  assert.equal(verifyPin('654321',encoded,secret),false);
  assert.equal(verifyPin('123456','malformed',secret),false);
  assert.equal(encoded.includes('123456'),false);
});

test('constant-time comparator rejects different lengths and bytes',()=>{
  assert.equal(constantTimeEqual('abcd','abcd'),true);
  assert.equal(constantTimeEqual('abcd','abce'),false);
  assert.equal(constantTimeEqual('abcd','abc'),false);
});

test('session record expires at the eight hour boundary',()=>{
  const now=1_000_000;
  assert.equal(SESSION_TTL_MS,8*60*60*1000);
  assert.equal(isSessionRecordValid({createdAt:now,expiresAt:now+SESSION_TTL_MS},now+SESSION_TTL_MS-1),true);
  assert.equal(isSessionRecordValid({createdAt:now,expiresAt:now+SESSION_TTL_MS},now+SESSION_TTL_MS),false);
  assert.equal(isSessionRecordValid(null,now),false);
});

test('per-browser limiter blocks the sixth failure inside fifteen minutes',()=>{
  const start=2_000_000;
  assert.equal(RATE_WINDOW_MS,15*60*1000);
  let bucket=null;
  for(let i=0;i<5;i++)bucket=nextFailureBucket(bucket,start+i*1000,start);
  assert.equal(isRateLimited(bucket,start+10_000,5),true);
  assert.equal(isRateLimited(bucket,start+RATE_WINDOW_MS+1,5),false);
});

test('global limiter blocks at fifty failures inside the window',()=>{
  const start=3_000_000;
  let bucket=null;
  for(let i=0;i<50;i++)bucket=nextFailureBucket(bucket,start+i,start);
  assert.equal(isRateLimited(bucket,start+1_000,50),true);
});
