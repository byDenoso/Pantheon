import test from 'node:test';
import assert from 'node:assert/strict';

const state = {
  global_state: 'BLOCKED',
  bus: { state: 'LIVE' },
  findings: [
    { domain: 'NEXO', status: 'BLOCKED', severity: 'P2', explanation: 'old' },
    { domain: 'SCIENCE', status: 'DEGRADED', severity: 'P2', explanation: 'old' },
    { domain: 'ENGINEERING', status: 'STALE_DECLARATION', severity: 'P2', explanation: 'old' },
    { domain: 'OLYMPUS', status: 'STALE_DECLARATION', severity: 'P2', explanation: 'old' },
  ],
  lanes: ['NEXO','SCIENCE','ENGINEERING','OLYMPUS'].map(domain => ({ domain, state: 'BLOCKED', current_state: 'old' })),
  providers: [
    { id: 'nexo', state: 'DEGRADED' },
    { id: 'drive', state: 'BLOCKED' },
    { id: 'github', state: 'LIVE' },
  ],
  graph: { nodes: [
    ...['NEXO','SCIENCE','ENGINEERING','OLYMPUS'].map(domain => ({ id: `domain:${domain}`, type: 'DOMAIN', state: 'BLOCKED' })),
    { id: 'provider:nexo', type: 'PROVIDER', state: 'DEGRADED' },
    { id: 'provider:drive', type: 'PROVIDER', state: 'BLOCKED' },
    { id: 'provider:github', type: 'PROVIDER', state: 'LIVE' },
  ], edges: [] },
};
const world = {
  access: 'PUBLIC',
  providers: [
    { id: 'nexo', status: 'AVAILABLE', partial: true },
    { id: 'drive', status: 'AUTH_REQUIRED', partial: false },
    { id: 'github', status: 'AVAILABLE', partial: false },
  ],
  truthGraph: { results: [
    { domain: 'NEXO', status: 'SNAPSHOT', explanation: 'snapshot nexo' },
    { domain: 'SCIENCE', status: 'SNAPSHOT', explanation: 'snapshot science' },
    { domain: 'ENGINEERING', status: 'LIVE', explanation: 'github live' },
    { domain: 'OLYMPUS', status: 'SNAPSHOT', explanation: 'snapshot olympus' },
  ] },
};

test('public SystemState keeps projection limits as SNAPSHOT rather than degraded health', async () => {
  const { normalizePublicSystemState } = await import('../server/compiler/public-system-state.mjs');
  const out = normalizePublicSystemState(structuredClone(state), world);
  const findings = new Map(out.findings.map(x => [x.domain, x]));
  const lanes = new Map(out.lanes.map(x => [x.domain, x]));
  const providers = new Map(out.providers.map(x => [x.id, x]));

  assert.equal(out.global_state, 'SNAPSHOT');
  assert.equal(findings.get('NEXO').status, 'SNAPSHOT');
  assert.equal(findings.get('SCIENCE').status, 'SNAPSHOT');
  assert.equal(findings.get('ENGINEERING').status, 'LIVE');
  assert.equal(findings.get('OLYMPUS').status, 'SNAPSHOT');
  assert.equal(lanes.get('ENGINEERING').state, 'LIVE');
  assert.equal(providers.get('drive').state, 'SNAPSHOT');
  assert.equal(providers.get('nexo').state, 'SNAPSHOT');
});
