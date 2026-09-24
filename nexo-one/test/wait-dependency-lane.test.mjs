import test from 'node:test';
import assert from 'node:assert/strict';

test('WAIT_DEPENDENCY stays waiting and does not block the domain lane', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_commit: 'b'.repeat(40),
    event_cursor: '20260924T140000000000Z-waiting',
    projection_fingerprint: 'sha256:' + 'c'.repeat(64),
    generated_at: '2026-09-24T14:00:00Z',
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [
      { id: 'WORK-SCI-WAIT', title: 'Scientific dependency', domain: 'SCIENCE', status: 'WAIT_DEPENDENCY' },
      { id: 'WORK-ENG-BLOCK', title: 'Actual blocker', domain: 'ENGINEERING', status: 'BLOCKED' },
    ],
    tests: [],
    capabilities: {},
    counts: { active_work: 2, tests: 0, capabilities: 0, needs_dener: 0 },
  };

  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  const science = system.lanes.find(lane => lane.domain === 'SCIENCE');
  const engineering = system.lanes.find(lane => lane.domain === 'ENGINEERING');

  assert.ok(science);
  assert.equal(science.state, 'SNAPSHOT');
  assert.deepEqual(science.blockers, []);
  assert.equal(system.graph.nodes.find(node => node.id === 'work:WORK-SCI-WAIT').operational_status, 'WAIT_DEPENDENCY');

  assert.ok(engineering);
  assert.equal(engineering.state, 'BLOCKED');
  assert.deepEqual(engineering.blockers, ['WORK-ENG-BLOCK: BLOCKED']);
});
