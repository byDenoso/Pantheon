import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Action Broker browser client stays same-origin and uses separated plan/execute/readback routes', async () => {
  const text = await read('src/data/actionBroker.ts');
  assert.match(text, /\/api\/\$\{route\}/);
  assert.match(text, /actions-plan/);
  assert.match(text, /actions-execute/);
  assert.match(text, /actions-readback/);
  assert.match(text, /credentials: 'same-origin'/);
  assert.doesNotMatch(text, /googleapis\.com|api\.github\.com|api\.vercel\.com/);
});

test('action drawer requires explicit target and plans before confirmation execution', async () => {
  const panel = await read('src/features/system/ActionBrokerPanel.tsx');
  const app = await read('src/app/App.tsx');
  assert.match(panel, /Alvo explícito/);
  assert.match(panel, /1 · Planejar/);
  assert.match(panel, /STRONG_CONFIRM/);
  assert.match(panel, /capability\?\.status === 'PASS'/);
  assert.match(panel, /!target\.trim\(\)/);
  assert.match(app, /<ActionBrokerPanel/);
  assert.match(app, /authenticated=\{session\.session\.authenticated\}/);
});

test('Human Inbox and Execution surface broker confirmations and full receipt trace', async () => {
  const operations = await read('src/features/system/Operations.tsx');
  const evidence = await read('src/features/system/BrokerEvidence.tsx');
  assert.match(operations, /<BrokerPendingConfirmations/);
  assert.match(operations, /<BrokerRecentExecutions/);
  for (const stage of ['PLANNED', 'GATED', 'CONFIRMED', 'DISPATCHED', 'PROVIDER_ACK', 'READBACK', 'FINAL']) {
    assert.match(evidence, new RegExp(`['\"]${stage}['\"]`));
  }
});

test('degraded Projection Bus names concrete source, provider, capability and envelope gaps', async () => {
  const diagnostics = await read('src/features/system/ProjectionDiagnostics.tsx');
  const overview = await read('src/features/system/Overview.tsx');
  assert.match(diagnostics, /sources\.filter\(source => source\.state !== 'LIVE'\)/);
  assert.match(diagnostics, /providers\.filter\(provider => provider\.state !== 'LIVE'\)/);
  assert.match(diagnostics, /capabilities\.filter\(capability => capability\.status !== 'PASS'\)/);
  assert.match(diagnostics, /envelopes\.filter\(envelope => envelope\.state !== 'LIVE'\)/);
  assert.match(overview, /<ProjectionDiagnostics state=\{state\}/);
});
