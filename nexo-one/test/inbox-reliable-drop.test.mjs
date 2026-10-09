import test from 'node:test';
import assert from 'node:assert/strict';
import {createReliableInboxDrop} from '../server/inbox-reliable-drop.mjs';
const env = {GOOGLE_CONNECTOR: 'authorized-fixture'};
const body = {kind:'BOARD_POST',source:'ADVISOR',payload:{message:'fixture'}};
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const request = (d, extra = {}) => new URL('https://fixture.invalid/api/inbox-drop?' + new URLSearchParams({id:'fixture-operation',d,...extra}));
function harness() {
  const state = {rows: [], writes: 0, reads: 0, timeout: false, corrupt: false, failRead: false, spoolId:'fixture-spool'};
  const drop = createReliableInboxDrop({
    spoolId:'fixture-spool', isOperationalEnvelope: value => value?.contract === 'NEXO_OPERATIONAL_INTENT_V1',
    readSpool: async () => {
      state.reads++;
      if (state.failRead) throw new Error('sensitive-url-token-must-not-escape');
      return {spreadsheetId:state.spoolId,columns:{stable:0,envelope:3},partBase:4,rows:structuredClone(state.rows)};
    },
    fullSpoolRow: (_, {stableId,envelope}) => [stableId,'','',encoded(envelope)],
    appendSpoolRow: async (_, row) => {
      state.writes++; state.rows.push(structuredClone(row));
      if (state.corrupt && row[0]) state.rows.at(-1)[3] = encoded({...body,payload:{message:'tampered'}});
      if (state.timeout) { state.timeout=false; throw new Error('TIMEOUT'); }
    },
    legacyDrop: async () => [{ok:true,found:true,readback:'PASS'},200],
  });
  return {state, drop};
}
test('delivery and identical retry produce one envelope, never APPLIED', async () => {
  const {state,drop}=harness();
  const [a,code]=await drop(request(encoded(body)),env,{});
  assert.equal(code,201); assert.equal(a.stage,'DELIVERED'); assert.equal(a.application_verification,'NOT_CHECKED');
  const [b,retry]=await drop(request(encoded(body)),env,{});
  assert.equal(retry,200); assert.equal(b.reused,true); assert.equal(state.writes,1); assert.equal(a.body_sha256,b.body_sha256);
});
test('same ID with different payload is rejected before append', async () => {
  const {state,drop}=harness(); await drop(request(encoded(body)),env,{});
  const [result,status]=await drop(request(encoded({...body,payload:{message:'changed'}})),env,{});
  assert.equal(status,409); assert.equal(result.error,'SPOOL_IDENTITY_CONFLICT'); assert.equal(state.writes,1);
});
test('commit followed by timeout is recovered using the same durable identity', async () => {
  const {state,drop}=harness(); state.timeout=true;
  const [first]=await drop(request(encoded(body)),env,{}); assert.equal(first.stage,'OUTCOME_UNKNOWN');
  const [second,status]=await drop(request(encoded(body)),env,{});
  assert.equal(status,200); assert.equal(second.reused,true); assert.equal(state.writes,1);
});
test('out-of-order multipart is recovered without clearing shared rows', async () => {
  const {state,drop}=harness(), raw=encoded(body), cut=Math.floor(raw.length/2);
  assert.equal((await drop(request(raw.slice(cut),{i:'2',n:'2'}),env,{}))[1],202);
  assert.equal((await drop(request(raw.slice(0,cut),{i:'1',n:'2'}),env,{}))[1],201);
  assert.equal((await drop(request(raw.slice(cut),{i:'2',n:'2'}),env,{}))[1],200);
  assert.equal(state.writes,3); assert.equal(state.rows.length,3);
});
test('conflicting chunks and fractional indices fail closed', async () => {
  const {drop}=harness(); await drop(request('abcd',{i:'1',n:'2'}),env,{});
  assert.equal((await drop(request('efgh',{i:'1',n:'2'}),env,{}))[1],409);
  assert.equal((await drop(request('abcd',{i:'1.5',n:'2'}),env,{}))[1],400);
});
test('conflicting duplicate stored identities are not silently acknowledged', async () => {
  const {state,drop}=harness(); await drop(request(encoded(body)),env,{});
  state.rows.push(['fixture-operation','','',encoded({...body,payload:{bad:true}})]);
  assert.equal((await drop(request(encoded(body)),env,{}))[1],409);
});
test('corrupted body readback is not delivery success', async () => {
  const {state,drop}=harness(); state.corrupt=true;
  assert.equal((await drop(request(encoded(body)),env,{}))[1],409);
});
test('check-only separates existence from payload verification', async () => {
  const {drop}=harness(); const [saved]=await drop(request(encoded(body)),env,{});
  const [presence]=await drop(request('',{check:'1'}),env,{}); assert.equal(presence.readback,'UNVERIFIED');
  const [verified]=await drop(request('',{check:'1',body_sha256:saved.body_sha256}),env,{}); assert.equal(verified.readback,'PASS');
  assert.equal((await drop(request('',{check:'1',body_sha256:'0'.repeat(64)}),env,{}))[1],409);
});
test('legacy lookup cannot upgrade existence to verified application', async () => {
  const {drop}=harness(); const [value]=await drop(request('',{check:'1'}),{},{});
  assert.equal(value.readback,'UNVERIFIED'); assert.equal(value.application_verification,'NOT_CHECKED');
  assert.equal((await drop(request(encoded(body)),{},{}))[1],503);
});
test('wrong spool and unreadable spool never create or fall back to Git writes', async () => {
  const {state,drop}=harness(); state.spoolId='other';
  assert.equal((await drop(request(encoded(body)),env,{}))[1],503); assert.equal(state.writes,0);
  state.spoolId='fixture-spool'; state.failRead=true;
  const [value,status]=await drop(request(encoded(body)),env,{});
  assert.equal(status,502); assert.ok(!JSON.stringify(value).includes('sensitive-url')); assert.equal(state.writes,0);
});
test('nested gates, operational envelopes and malformed payloads retain boundaries', async () => {
  const {state,drop}=harness();
  for (const value of [
    {kind:'BATCH',payload:{items:[{kind:'operator-intent',payload:{action:'CANONIZE'}}]}},
    {contract:'NEXO_OPERATIONAL_INTENT_V1'},
  ]) assert.equal((await drop(request(encoded(value)),env,{}))[1],403);
  for (const value of [null,[],42]) assert.equal((await drop(request(encoded(value)),env,{}))[1],422);
  assert.equal(state.writes,0);
});
