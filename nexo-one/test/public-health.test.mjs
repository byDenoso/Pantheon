import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTruthGraph } from '../server/compiler/truthgraph.mjs';

const NOW = Date.parse('2026-09-16T09:00:00Z');
const refs = {
  authority: 'https://docs.google.com/spreadsheets/d/action/edit#gid=1',
  capability: 'https://docs.google.com/spreadsheets/d/action/edit#gid=2',
  ssot: 'https://docs.google.com/spreadsheets/d/ssot/edit#gid=3',
};
const authority = (domain, canonical_truth) => ({
  domain, canonical_truth, operational_truth: 'runtime', chat_role: 'context', conflict_rule: 'canonical wins', notes: '',
});
const truth = (record_id, title, updated_at = '2026-09-01T00:00:00Z') => ({
  record_type: 'truth', record_id, status: 'ACTIVE', title, detail: 'aligned', source: 'NEXO · SSOT CANONICAL', updated_at,
});
const provider = (id, status = 'AVAILABLE', partial = false) => ({
  id, status, partial, checkedAt: '2026-09-16T08:59:00Z', lastSuccessAt: status === 'AVAILABLE' ? '2026-09-16T08:59:00Z' : null,
});

function byDomain(result) {
  return new Map(result.results.map(row => [row.domain, row]));
}

test('public TruthGraph distinguishes projection limits from material degradation', () => {
  const science = truth('SCIENCE', 'Google Sheets:NEXO · SSOT CANONICAL / Science');
  science.detail = 'Science truth hot index; evidence remains in Drive';
  const graph = buildTruthGraph({
    access: 'PUBLIC', now: NOW, refs,
    authorityRows: [
      authority('NEXO', 'NEXO · SSOT CANONICAL'),
      authority('SCIENCE', 'PEER Control Tower + SCIENCE skill'),
      authority('ENGINEERING', 'Git/GitHub for versioned code'),
      authority('OLYMPUS', 'NEXO · SSOT CANONICAL / Olympus'),
    ],
    truthRows: [
      truth('NEXO', 'Google Sheets:NEXO · SSOT CANONICAL / NEXO'),
      science,
      truth('ENGINEERING', 'GitHub:byDenoso/Pantheon + real runtime', '2026-09-01T00:00:00Z'),
      truth('OLYMPUS', 'Google Sheets:NEXO · SSOT CANONICAL / Olympus'),
    ],
    capabilityRows: [
      { capability_id: 'CAP-OPTIONAL-UNVERIFIED', domain: 'NEXO', status: 'UNVERIFIED' },
      { capability_id: 'CAP-GITHUB-READ', domain: 'ENGINEERING', status: 'PASS' },
    ],
    providers: [provider('nexo', 'AVAILABLE', true), provider('drive', 'AUTH_REQUIRED'), provider('github')],
  });
  const rows = byDomain(graph);

  assert.equal(rows.get('NEXO').status, 'SNAPSHOT');
  assert.equal(rows.get('SCIENCE').status, 'SNAPSHOT');
  assert.equal(rows.get('ENGINEERING').status, 'LIVE');
  assert.equal(rows.get('OLYMPUS').status, 'SNAPSHOT');
  assert.equal(rows.get('NEXO').material, false);
  assert.equal(rows.get('SCIENCE').material, false);
});

test('GitHub Pages compiles SystemState locally instead of inheriting Vercel health', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/nexo-one-pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /build-pages-system\.mjs/);
  assert.doesNotMatch(workflow, /nexo-one-two\.vercel\.app\/api\/system/);
});
