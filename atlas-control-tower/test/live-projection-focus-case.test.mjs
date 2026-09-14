// Real behavior test for a confirmed regression: buildLiveProjection previously
// matched the focus node by exact string equality only. A focusId whose case
// differs from the real node id (e.g. session state carrying "domain:d1" against a
// real "domain:D1" node -- reproduced live at
// http://localhost:4412/mapa/system:SCIENCE/domain:d1) matched no node at all, so
// nothing got contextRole:'current' and the 3D/2D layouts never centered on the
// focus. Fixed by resolving focusId to the real node's own id (case-insensitively)
// before any comparison.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveProjection } from '../src/graph-engine/live-projection.ts';

function graph() {
  return {
    nodes: [
      { id: 'domain:D1', type: 'DOMAIN', label: 'H0 / acoustic ruler' },
      { id: 'CAMP-H0-RULER-ANCHOR', type: 'CAMPAIGN', domain: 'D1', label: 'core campaign' }
    ],
    edges: [{ source: 'domain:D1', target: 'CAMP-H0-RULER-ANCHOR', type: 'CONTAINS' }]
  };
}

test('a case-mismatched focusId still resolves the real node to contextRole "current"', () => {
  const projection = buildLiveProjection({ graph: graph(), focusId: 'domain:d1', path: [{ id: 'domain:d1' }] });
  const focusNode = projection.nodes.find(node => node.id === 'domain:D1');
  assert.ok(focusNode, 'the real (uppercase) node must be present');
  assert.equal(focusNode.contextRole, 'current');
});

test('a case-mismatched focusId still resolves hierarchy children (not left as "secondary")', () => {
  const projection = buildLiveProjection({ graph: graph(), focusId: 'DOMAIN:D1', path: [{ id: 'domain:D1' }] });
  const child = projection.nodes.find(node => node.id === 'CAMP-H0-RULER-ANCHOR');
  assert.equal(child.contextRole, 'primary');
});

test('an exact-cased focusId behaves identically to a mismatched one for the same graph', () => {
  const exact = buildLiveProjection({ graph: graph(), focusId: 'domain:D1', path: [{ id: 'domain:D1' }] });
  const mismatched = buildLiveProjection({ graph: graph(), focusId: 'domain:d1', path: [{ id: 'domain:d1' }] });
  const roles = projection => new Map(projection.nodes.map(node => [node.id, node.contextRole]));
  assert.deepEqual(roles(mismatched), roles(exact));
});

test('a focusId matching no node at all (not just a case mismatch) does not throw and centers nothing', () => {
  const projection = buildLiveProjection({ graph: graph(), focusId: 'domain:D9-NOT-PRESENT', path: [{ id: 'domain:D9-NOT-PRESENT' }] });
  assert.ok(!projection.nodes.some(node => node.contextRole === 'current'), 'no node should be falsely marked as current');
});
