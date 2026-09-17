import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

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

test('Apps Script persists eight-hour sessions in Script Properties, not the six-hour CacheService',async()=>{
  const code=await text('apps-script-auth/Code.gs');
  assert.match(code,/props\.setProperty\(nexoSessionKey_/);
  assert.match(code,/props\.getProperty\(key\)/);
  assert.match(code,/props\.deleteProperty\(nexoSessionKey_/);
  assert.doesNotMatch(code,/cache\.put\(nexoSessionKey_/);
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

test('Apps Script shell embeds safely and exposes only bounded auth RPCs',async()=>{
  const code=await text('apps-script-auth/Code.gs');
  const html=await text('apps-script-auth/Index.html');
  assert.match(code,/setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/);
  assert.match(code,/PropertiesService\.getScriptProperties\(\)/);
  assert.match(code,/CacheService\.getScriptCache\(\)/);
  assert.match(code,/function authStatus\(/);
  assert.match(code,/function authLogin\(/);
  assert.match(code,/function authLogout\(/);
  assert.match(code,/function setupNexoAuth\(/);
  assert.match(html,/google\.script\.run/);
  assert.match(html,/BRIDGE_READY/);
  assert.match(html,/window\.top\.postMessage/);
  assert.doesNotMatch(html,/postMessage\([^\n]*['"]\*['"]\)/);
  assert.doesNotMatch(html,/localStorage/);
  assert.doesNotMatch(code,/NEXO_PIN_HASH\s*[:=]\s*['"][^'"]+['"]/);
  assert.doesNotMatch(code,/NEXO_SESSION_SECRET\s*[:=]\s*['"][^'"]+['"]/);
});
