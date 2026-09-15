import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_NAME,
  toolDescriptor,
  parseExecutionClauses,
  executionSubject,
  scientificFingerprint,
  buildScientificTestSpec,
  buildTowerMutationRequest,
  createScientificMcpService,
  handleMcpRpc,
} from '../lib/scientific-mcp.mjs';

test('hosted MCP exposes the frozen scientific intake tool without credential fields', () => {
  const descriptor = toolDescriptor();
  assert.equal(TOOL_NAME, 'nexo_submit_scientific_tests_v1');
  assert.equal(descriptor.name, TOOL_NAME);
  const flattened = JSON.stringify(descriptor).toLowerCase();
  for (const forbidden of ['password', 'credential', 'github_token', 'tower_token']) {
    assert.equal(flattened.includes(forbidden), false);
  }
  assert.ok(descriptor.inputSchema.properties.utterance);
});

test('parser accepts explicit execution commands and rejects advisory language', () => {
  assert.deepEqual(
    parseExecutionClauses('Teste PEER sem SH0ES; Rode null global\nExecute holdout DESI'),
    ['Teste PEER sem SH0ES', 'Rode null global', 'Execute holdout DESI'],
  );
  assert.deepEqual(parseExecutionClauses('O que acha do teste PEER?'), []);
  assert.equal(executionSubject('Faça o teste de prior sensitivity'), 'de prior sensitivity');
});

test('parser splits comma-separated repeated commands without splitting scientific lists', () => {
  assert.deepEqual(
    parseExecutionClauses('Teste PEER com Planck, ACT e SPT, Teste PEER sem SH0ES'),
    ['Teste PEER com Planck, ACT e SPT', 'Teste PEER sem SH0ES'],
  );
});

test('fingerprint is stable under case/formatting and changes for scientific changes', () => {
  const a = buildScientificTestSpec('Teste PEER sem SH0ES', {
    datasets: ['DESI DR2', 'Planck'],
    rival: 'LCDM',
    decision_rule: 'p_global < 0.0027',
  });
  const b = buildScientificTestSpec('teste   peer sem sh0es', {
    datasets: ['planck', 'desi dr2'],
    rival: 'lcdm',
    decision_rule: 'P_GLOBAL < 0.0027',
  });
  const c = buildScientificTestSpec('Teste PEER com SH0ES', {
    datasets: ['DESI DR2', 'Planck', 'SH0ES'],
    rival: 'LCDM',
  });
  assert.equal(scientificFingerprint(a), scientificFingerprint(b));
  assert.notEqual(scientificFingerprint(a), scientificFingerprint(c));
});

test('Tower creation request is TEST create-v0 and preserves canonical fingerprint', () => {
  const spec = buildScientificTestSpec('Teste holdout DESI', { method: 'holdout' });
  const request = buildTowerMutationRequest(spec, { requestId: 'REQ-MCP-CANARY-001' });
  assert.equal(request.entity_kind, 'test');
  assert.equal(request.expected_version, 0);
  assert.equal(request.writer_role, 'EXECUTOR');
  assert.equal(request.event_type, 'TEST_CREATED');
  assert.equal(request.changes.kind, 'TEST');
  assert.equal(request.changes.status, 'READY');
  assert.equal(request.changes.scientific_fingerprint, scientificFingerprint(spec));
  assert.ok(request.changes.correlation_id.startsWith('CORR-'));
});

test('service persists and reads Tower before dispatching executable work', async () => {
  const calls = [];
  const gateway = {
    async findByFingerprint() { calls.push('find'); return null; },
    async persistTest(request) { calls.push('persist'); return { accepted: true, request_id: request.request_id }; },
    async readbackTest(testId) { calls.push('readback'); return { id: testId, status: 'READY', entity_version: 1 }; },
    async resolveCapability() { calls.push('capability'); return { capability_id: 'canary_v1', task_id: 'cosmology_benchmark', repository: 'byDenoso/TCC', source_revision: 'main', runtime_requirement: 'LIGHT', required_outputs: ['result.json'] }; },
    async dispatchTest() { calls.push('dispatch'); return 'github:commit:abc'; },
  };
  const service = createScientificMcpService({ gateway });
  const result = await service.submitUtterance('Teste canary sintético');
  assert.equal(result.accepted, true);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].state, 'DISPATCHED');
  assert.equal(result.tests[0].canonical_readback, true);
  assert.deepEqual(calls, ['find', 'persist', 'readback', 'capability', 'dispatch']);
});

test('failed Tower readback fails closed and never dispatches', async () => {
  const calls = [];
  const gateway = {
    async findByFingerprint() { return null; },
    async persistTest() { calls.push('persist'); return { accepted: true }; },
    async readbackTest() { calls.push('readback'); throw new Error('READBACK_MISSING'); },
    async resolveCapability() { calls.push('capability'); return {}; },
    async dispatchTest() { calls.push('dispatch'); return 'bad'; },
  };
  const service = createScientificMcpService({ gateway });
  await assert.rejects(() => service.submitUtterance('Teste canary sintético'), /READBACK_MISSING/);
  assert.deepEqual(calls, ['persist', 'readback']);
});

test('MCP JSON-RPC initialize, tools/list and tools/call share the same service', async () => {
  const service = {
    async submitUtterance(utterance, options) {
      assert.equal(utterance, 'Teste X');
      assert.equal(options.source, 'chat');
      return { accepted: true, tests: [{ test_id: 'T-1', state: 'CAPABILITY_GAP', canonical_readback: true }] };
    },
  };
  const init = await handleMcpRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { service });
  assert.equal(init.result.serverInfo.name, 'nexo-scientific-intake');
  const listed = await handleMcpRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { service });
  assert.equal(listed.result.tools[0].name, TOOL_NAME);
  const called = await handleMcpRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: TOOL_NAME, arguments: { utterance: 'Teste X', source: 'chat' } } }, { service });
  assert.equal(called.result.structuredContent.accepted, true);
  assert.equal(called.result.isError, false);
});
