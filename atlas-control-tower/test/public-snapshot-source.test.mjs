import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicSnapshotSource } from '../src/core/PublicSnapshotSource.ts';

function mockApi(overrides = {}) {
  return {
    graph: async () => ({ nodes: [], edges: [] }),
    state: async () => ({}),
    health: async () => ({ fingerprint: 'sha256:abc', sourceVersion: '2026-09-13T00:00:00Z', dataSource: { freshness: 'SNAPSHOT' } }),
    entity: async () => ({ entity: null }),
    lineage: async () => ({ nodes: [], edges: [] }),
    learning: async () => ({}),
    learningFor: async () => ({}),
    ops: async () => ({}),
    automationRuns: async () => [],
    audit: async () => ({}),
    files: async () => ({}),
    sync: async () => ({}),
    research: async () => ({}),
    ...overrides
  };
}

test('getDomains keeps only DOMAIN nodes and carries fingerprint/freshness from health()', async () => {
  const source = new PublicSnapshotSource(
    mockApi({
      graph: async () => ({
        nodes: [
          { id: 'domain:D1', type: 'DOMAIN', label: 'Cosmologia' },
          { id: 'system:NEXO', type: 'SYSTEM', label: 'NEXO' },
          { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha' }
        ]
      })
    })
  );
  const envelope = await source.getDomains();
  assert.equal(envelope.state, 'READY');
  assert.deepEqual(envelope.data.map(d => d.id), ['domain:D1']);
  assert.equal(envelope.fingerprint, 'sha256:abc');
  assert.equal(envelope.freshness, 'SNAPSHOT');
});

test('getDomains reads the science hierarchy instead of the system root', async () => {
  const calls = [];
  const source = new PublicSnapshotSource(
    mockApi({
      graph: async query => {
        calls.push(query.focus);
        return { nodes: [{ id: 'domain:D1', type: 'DOMAIN', label: 'Cosmologia' }] };
      }
    })
  );
  await source.getDomains();
  assert.deepEqual(calls, ['system:SCIENCE']);
});

test('getDomains returns EMPTY (not READY, not fabricated) when the source has no domains', async () => {
  const source = new PublicSnapshotSource(mockApi());
  const envelope = await source.getDomains();
  assert.equal(envelope.state, 'EMPTY');
  assert.deepEqual(envelope.data, []);
});

test('getDomains returns API_ERROR with an issue when the underlying reader throws', async () => {
  const source = new PublicSnapshotSource(mockApi({ graph: async () => { throw new Error('network down'); } }));
  const envelope = await source.getDomains();
  assert.equal(envelope.state, 'API_ERROR');
  assert.equal(envelope.data, null);
  assert.ok(envelope.issues.some(issue => issue.code === 'SOURCE_READ_FAILED'));
});

test('getDomainCampaigns keeps only CAMPAIGN nodes', async () => {
  const source = new PublicSnapshotSource(
    mockApi({
      graph: async () => ({
        nodes: [
          { id: 'domain:D1', type: 'DOMAIN', label: 'Cosmologia' },
          { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha 1' },
          { id: 'test:t1', type: 'TEST', label: 'Teste 1' }
        ]
      })
    })
  );
  const envelope = await source.getDomainCampaigns('D1');
  assert.deepEqual(envelope.data.map(c => c.id), ['campaign:c1']);
});

test('search never returns a graphId for TEST/CLAIM/DATASET/ARTIFACT kinds, only a targetRoute', async () => {
  const source = new PublicSnapshotSource(
    mockApi({
      graph: async () => ({
        nodes: [
          { id: 'test:t1', type: 'TEST', label: 'Does the Hubble tension...' },
          { id: 'campaign:c1', type: 'CAMPAIGN', label: 'Campanha 1' },
          { id: 'claim:x', type: 'CLAIM', label: 'Claim X' }
        ]
      })
    })
  );
  const envelope = await source.search('hubble');
  const test1 = envelope.data.find(r => r.id === 'test:t1');
  const campaign1 = envelope.data.find(r => r.id === 'campaign:c1');
  const claimX = envelope.data.find(r => r.id === 'claim:x');
  assert.equal(test1.graphId, undefined);
  assert.ok(test1.targetRoute.startsWith('/pesquisa/testes/'));
  assert.equal(campaign1.targetRoute, undefined);
  assert.equal(campaign1.graphId, 'campaign:c1');
  assert.ok(claimX.targetRoute);
  assert.equal(claimX.graphId, undefined);
});

test('search with an empty query returns EMPTY without calling the reader', async () => {
  let called = false;
  const source = new PublicSnapshotSource(mockApi({ graph: async () => { called = true; return { nodes: [] }; } }));
  const envelope = await source.search('   ');
  assert.equal(envelope.state, 'EMPTY');
  assert.equal(called, false);
});

test('getLearnerLayer is honest about the public snapshot not publishing scheduler state', async () => {
  const source = new PublicSnapshotSource(mockApi());
  const envelope = await source.getLearnerLayer();
  assert.equal(envelope.state, 'DATA_UNAVAILABLE');
  assert.deepEqual(envelope.data, []);
  assert.ok(envelope.issues.some(issue => issue.code === 'LEARNER_FIELD_NOT_PUBLISHED'));
});

test('getCampaign returns EMPTY when the entity reader has no record, never a fabricated detail', async () => {
  const source = new PublicSnapshotSource(mockApi({ entity: async () => ({ entity: null }) }));
  const envelope = await source.getCampaign('campaign:missing');
  assert.equal(envelope.state, 'EMPTY');
  assert.equal(envelope.data, null);
});
