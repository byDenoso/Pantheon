import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectGithubCanonical } from '../lib/github-canonical-projection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function snapshotState() {
  return {
    authority: {
      repository: 'byDenoso/Pantheon',
      ref: 'main',
      projection: { transportPath: 'atlas-control-tower/data/nexo-drive-projection.json' },
    },
    fingerprint: 'sha256:test',
    payload: {
      meta: { kind: 'LEGACY_GOOGLE_DRIVE_SNAPSHOT', authority: 'GOOGLE_DRIVE' },
      science: [], engineering: [], olympus: [], actions: [], learning: [], crossDomain: [], integrity: [],
    },
  };
}

test('published Atlas authority fingerprint matches the projection it authorizes', () => {
  const authority = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nexo-one/data/canonical.json'), 'utf8'));
  const projection = JSON.parse(fs.readFileSync(path.join(repoRoot, 'atlas-control-tower/data/nexo-drive-projection.json'), 'utf8'));
  assert.equal(authority.projection.fingerprint, projection.meta.fingerprint);
});

test('legacy Google Drive projection is reported as SNAPSHOT rather than LIVE', () => {
  const health = projectGithubCanonical(snapshotState(), 'health');
  assert.equal(health.dataSource.freshness, 'SNAPSHOT');
});
