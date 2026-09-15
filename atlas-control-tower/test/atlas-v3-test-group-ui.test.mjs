import test from 'node:test';
import assert from 'node:assert/strict';

import { isTerminalTestGroup, testGroupHref, testsForGroup } from '../src/atlas-v3/test-groups.mjs';

test('TEST_GROUP is terminal and routes to a separate registry surface', () => {
  assert.equal(isTerminalTestGroup({ type: 'TEST_GROUP' }), true);
  assert.equal(isTerminalTestGroup({ type: 'TEST' }), false);
  assert.equal(
    testGroupHref('TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY'),
    '?testGroup=TEST_GROUP%3A%3ACAMP-GROWTH-LSS%3A%3AGZ01-EROSITA-SUPERBATTERY'
  );
});

test('testsForGroup returns only canonical live tests owned by the exact group', () => {
  const snapshot = {
    testing: {
      tests: [
        { id: 'T1', testGroupId: 'G1' },
        { id: 'T2', testGroupId: 'G2' },
        { id: 'T3', testGroupId: 'G1' }
      ]
    }
  };
  assert.deepEqual(testsForGroup(snapshot, 'G1').map(test => test.id), ['T1', 'T3']);
  assert.deepEqual(testsForGroup(snapshot, 'missing'), []);
});
