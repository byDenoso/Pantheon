import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchAutonomyStatus, proposalDigest, canonicalProposal, reviewActivationReceipt, submitAutonomy} from '../src/atlas/autonomyControl.ts';
const at = '2026-10-08T12:00:00Z', fingerprint = 'a'.repeat(64);
const unavailable = () => ({available: false, blockers: ['Provas obrigatórias ainda pendentes.'], envelope: null, proposal_sha256: null});
const status = () => ({contract: 'NEXO_AUTONOMY_CONTROL_VIEW_V1', observed_at: at, tower_fingerprint: fingerprint, mandate: null,
  actions: {approve: unavailable(), revoke: unavailable()}, receipt: null});
const json = (body, code = 200) => new Response(JSON.stringify(body), {status: code, headers: {'content-type': 'application/json'}});
async function available(name = 'revoke') {
  const view = status(); view.mandate = {id: 'mandate-one', revision: 2, status: 'ACTIVE'};
  const envelope = {kind: 'OPERATOR_INTENT', source: 'DENER', created_at: at,
    payload: {action: 'REVOKE_AUTONOMY_MANDATE', mandate_id: 'mandate-one', expected_revision: 2, approval_ref: 'Confirmação sintética'}};
  if (name === 'approve') {
    view.mandate = null; envelope.payload.action = 'APPROVE_AUTONOMY_MANDATE'; envelope.payload.expected_revision = 0;
    envelope.payload.activation_receipt = {source_revision: 'b'.repeat(40), tcc_revision: 'c'.repeat(40), tower_fingerprint: fingerprint, checked_at: at,
      checks: {transport: true, writer: true, public_projection: true, prompts: true, quota: true}};
  }
  view.actions[name] = {available: true, blockers: [], envelope, proposal_sha256: await proposalDigest(envelope)};
  return view;
}
test('unavailable actions remain unavailable; private GET uses the existing same-origin cookie', async () => {
  let call;
  const view = await fetchAutonomyStatus(async (path, options) => {call = {path, options}; return json(status());});
  assert.equal(call.path, '/api/autonomy-status');
  assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
  assert.equal(view.actions.approve.available, false); assert.equal(view.actions.approve.envelope, null);
  assert.ok(Object.isFrozen(view.actions));
});
test('the status client rejects invalid contracts, unknown authority and incomplete blocked actions', async () => {
  for (const change of [{contract: 'OTHER'}, {observed_at: 'later'}, {tower_fingerprint: 'unknown'}, {receipt: {}},
    {mandate: {id: 'm', revision: -1, status: 'ACTIVE'}}, {actions: {approve: {...unavailable(), blockers: []}, revoke: unavailable()}},
    {actions: {approve: {...unavailable(), envelope: {}}, revoke: unavailable()}}]) {
    await assert.rejects(fetchAutonomyStatus(async () => json({...status(), ...change})), /CONTRACT/);
  }
});
test('exact proposal hashing preserves Unicode and order-independent identity; unsafe numbers are refused', async () => {
  const v = await available();
  const other = Object.fromEntries(Object.entries(v.actions.revoke.envelope).reverse());
  assert.equal(await proposalDigest(other), v.actions.revoke.proposal_sha256);
  assert.match(canonicalProposal(other), /Confirmação sintética/);
  assert.throws(() => canonicalProposal({x: 1.1}), /CONTRACT/);
  const view = await fetchAutonomyStatus(async () => json(v));
  assert.equal(view.actions.revoke.envelope.payload.approval_ref, 'Confirmação sintética');
  assert.throws(() => {view.actions.revoke.envelope.payload.expected_revision = 99;}, TypeError);
});
test('a revoke proposal must bind the active mandate, current revision, action and exact digest', async () => {
  for (const change of [{mandate_id: 'another-mandate'}, {expected_revision: 1}, {action: 'APPROVE_AUTONOMY_MANDATE'}]) {
    const v = await available(); Object.assign(v.actions.revoke.envelope.payload, change);
    v.actions.revoke.proposal_sha256 = await proposalDigest(v.actions.revoke.envelope);
    await assert.rejects(fetchAutonomyStatus(async () => json(v)), /CONTRACT/);
  }
  const v = await available(); v.actions.revoke.proposal_sha256 = 'f'.repeat(64);
  await assert.rejects(fetchAutonomyStatus(async () => json(v)), /CONTRACT/);
});
test('future approval requires the complete prepared proof; the client never manufactures a check', async () => {
  const ok = await fetchAutonomyStatus(async () => json(await available('approve')));
  assert.equal(ok.actions.approve.available, true);
  for (const key of ['transport', 'writer', 'public_projection', 'prompts', 'quota']) {
    const v = await available('approve'); delete v.actions.approve.envelope.payload.activation_receipt.checks[key];
    v.actions.approve.proposal_sha256 = await proposalDigest(v.actions.approve.envelope);
    await assert.rejects(fetchAutonomyStatus(async () => json(v)), /CONTRACT/);
  }
  const v = await available('approve'); v.actions.approve.envelope.payload.activation_receipt.tower_fingerprint = 'f'.repeat(64);
  v.actions.approve.proposal_sha256 = await proposalDigest(v.actions.approve.envelope);
  await assert.rejects(fetchAutonomyStatus(async () => json(v)), /CONTRACT/);
});
test('status bytes must be bounded valid UTF-8 JSON, with no redirect or HTML fallback', async () => {
  for (const response of [new Response('<html>fallback</html>', {headers: {'content-type': 'text/html'}}),
    new Response(new Uint8Array([0xff]), {headers: {'content-type': 'application/json'}}),
    new Response(' '.repeat(65537), {headers: {'content-type': 'application/json'}}), json([])]) {
    await assert.rejects(fetchAutonomyStatus(async () => response), /CONTRACT/);
  }
  const redirected = json(status()); Object.defineProperty(redirected, 'redirected', {value: true});
  await assert.rejects(fetchAutonomyStatus(async () => redirected), /CONTRACT/);
});
test('pasted task receipt is reviewed locally without producing checks or submitting it', async () => {
  const prepared = (await available('approve')).actions.approve;
  const raw = JSON.stringify({envelope: prepared.envelope, proposal_sha256: prepared.proposal_sha256});
  const action = await reviewActivationReceipt(raw, status());
  assert.deepEqual(action, prepared); assert.ok(Object.isFrozen(action.envelope.payload));
  for (const view of [{...status(), tower_fingerprint: 'f'.repeat(64)},
    {...status(), mandate: {id: 'mandate-one', revision: 1, status: 'REVOKED'}},
    {...status(), mandate: {id: 'mandate-one', revision: 0, status: 'ACTIVE'}}]) await assert.rejects(reviewActivationReceipt(raw, view), /CONTRACT/);
  await assert.rejects(reviewActivationReceipt(JSON.stringify({envelope: prepared.envelope, proposal_sha256: 'f'.repeat(64)}), status()), /CONTRACT/);
  const incomplete = structuredClone(prepared.envelope); delete incomplete.payload.activation_receipt.checks.prompts;
  await assert.rejects(reviewActivationReceipt(JSON.stringify({envelope: incomplete, proposal_sha256: await proposalDigest(incomplete)}), status()), /CONTRACT/);
});
test('POST sends only the exact reviewed envelope and digest; DELIVERED never means ACTIVE', async () => {
  const v = await available(), action = v.actions.revoke; let call, count = 0;
  const result = await submitAutonomy(async (path, options) => {
    call = {path, options}; count++;
    return json({stage: 'DELIVERED', readback: 'PASS', stable_id: 'human-synthetic', proposal_sha256: action.proposal_sha256}, 202);
  }, action);
  assert.equal(result.kind, 'delivered'); assert.equal(result.receipt.stage, 'DELIVERED'); assert.equal(result.receipt.active, undefined);
  assert.equal(count, 1); assert.equal(call.path, '/api/autonomy-control'); assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
  assert.deepEqual(JSON.parse(call.options.body), {envelope: action.envelope, confirmation_sha256: action.proposal_sha256});
});
test('uncertain submission is never retried automatically, including failed spool readback', async () => {
  const v = await available();
  for (const response of [json({stage: 'DELIVERED', readback: 'FAIL'}, 202), json({error: 'SPOOL_BODY_READBACK_FAILED'}, 503),
    new Response('fallback', {headers: {'content-type': 'text/html'}}), json({stage: 'ACTIVE'}, 200)]) {
    let calls = 0; const result = await submitAutonomy(async () => {calls++; return response;}, v.actions.revoke);
    assert.equal(result.kind, 'uncertain'); assert.equal(calls, 1);
  }
  let calls = 0; const result = await submitAutonomy(async () => {calls++; throw new TypeError('offline');}, v.actions.revoke);
  assert.equal(result.kind, 'uncertain'); assert.equal(calls, 1);
});
test('explicit session/origin/revision refusals are shown as refusals; unavailable actions do not POST', async () => {
  const v = await available();
  for (const code of [401, 403, 409]) assert.equal((await submitAutonomy(async () => json({error: 'HUMAN_SESSION_REQUIRED'}, code), v.actions.revoke)).kind, 'rejected');
  let calls = 0;
  assert.equal((await submitAutonomy(async () => {calls++; return json({});}, unavailable())).kind, 'rejected');
  assert.equal(calls, 0);
});
