import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSanctionedProjection } from '../scripts/build-pages-system.mjs';

test('Atlas accepts live Tower file identity without generation or commit state identity', () => {
  const manifest = {
    authority: 'TOWER_V06',
    projection_only: true,
    writeback: 'FORBIDDEN',
    tower_file_id: '1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z',
    tower_revision: 'sha256:' + 'a'.repeat(64),
    tower_commit: null,
    event_cursor: '20260923T120000000000Z-abc',
    projection_fingerprint: 'sha256:' + 'b'.repeat(64),
  };
  const projection = {
    contract: 'NEXO_PUBLIC_PROJECTION_V1',
    manifest,
    event_cursor: manifest.event_cursor,
    work: [],
    tests: [],
    campaigns: [],
    capabilities: {},
  };

  assert.equal(validateSanctionedProjection(projection), manifest);
});
