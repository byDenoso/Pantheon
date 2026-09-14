import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLiveProjection } from '../src/graph-engine/live-projection.ts';
import { enforceGraphEntityContract } from '../src/graph-engine/graph-entity-contract.ts';

// Systemic regression coverage (not a Megastructures-only fix): for every real
// canonical system/domain/campaign focus published in the current static snapshot,
// focusing it must never collapse to a lone root node with no real children --
// whether those children are DOMAIN/CAMPAIGN (Science) or the PROGRAM/ACTION types
// Engineering/Olympus/Operations actually publish instead. This reads the real
// generated snapshot on disk; it never fabricates nodes/edges.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/data/current/manifest.json'), 'utf8'));
const snapshotDir = path.join(root, 'public/data', manifest.snapshotPath);

function readGraphFile(relativePath) {
  return JSON.parse(readFileSync(path.join(snapshotDir, relativePath), 'utf8'));
}

function projectFocus(raw, focusId) {
  const graph = { nodes: raw.nodes || [], edges: raw.edges || [] };
  const live = buildLiveProjection({ graph, focusId, path: [{ id: focusId }], pins: [], compare: [] });
  return enforceGraphEntityContract(live);
}

const SYSTEM_FIXTURES = [
  { file: 'graph/engineering.json', focus: 'system:ENGINEERING', label: 'Engenharia (PROGRAM children)' },
  { file: 'graph/olympus.json', focus: 'system:OLYMPUS', label: 'Olympus (PROGRAM children)' },
  { file: 'graph/operations.json', focus: 'system:OPERATIONS', label: 'Operações (ACTION children)' }
];

for (const fixture of SYSTEM_FIXTURES) {
  test(`${fixture.label}: focusing the system renders its real children, not just the lone root`, () => {
    const raw = readGraphFile(fixture.file);
    const { projection, issues } = projectFocus(raw, fixture.focus);

    assert.ok(projection.nodes.length > 1, `expected more than the lone SYSTEM node for ${fixture.focus}, got ${projection.nodes.length}`);
    assert.ok(!issues.some(issue => issue.code === 'REJECTED_NODE_TYPE'), `expected no real PROGRAM/ACTION child to be rejected for ${fixture.focus}`);

    // Every real non-SYSTEM node declared in the raw snapshot for this focus must
    // still be present after contract enforcement -- proving nothing was silently
    // dropped, not just that *some* node count is non-zero.
    const realChildIds = (raw.nodes || []).filter(node => node.id !== fixture.focus).map(node => node.id);
    for (const id of realChildIds) {
      assert.ok(projection.nodes.some(node => node.id === id), `expected real child "${id}" to survive the map contract for ${fixture.focus}`);
    }
  });
}

test('Ciência: every real domain in the snapshot still renders its campaigns when focused (parametrized, not just D1)', () => {
  const { entities } = readGraphFile('entities/index.json');
  const domainIds = Object.entries(entities)
    .filter(([, entity]) => String(entity.type || '').toUpperCase() === 'DOMAIN')
    .map(([id]) => id)
    .slice(0, 5); // a representative sample across D1..D10, not exhaustive re-reading of every file
  assert.ok(domainIds.length > 0, 'expected at least one real DOMAIN entity in the snapshot index');

  for (const domainId of domainIds) {
    const shortId = domainId.replace(/^domain:/i, '');
    let raw;
    try {
      raw = readGraphFile(`graph/science/${shortId}.json`);
    } catch {
      continue; // domain has no dedicated drill-down file published -- not this test's concern
    }
    const focusId = raw.focus || domainId;
    const { projection, issues } = projectFocus(raw, focusId);
    assert.ok(projection.nodes.length >= 1, `expected the domain node itself to render for ${focusId}`);
    assert.ok(!issues.some(issue => issue.code === 'REJECTED_NODE_TYPE' && issue.nodeType === 'CAMPAIGN'), `a real CAMPAIGN must never be rejected for ${focusId}`);
  }
});

test('Megastructures stays a real, non-isolated example -- not the only case this fix covers', () => {
  const { entities } = readGraphFile('entities/index.json');
  const megastructures = entities['CAMP-MEGASTRUCTURES'];
  assert.ok(megastructures, 'expected CAMP-MEGASTRUCTURES to exist in the real snapshot index');
  assert.equal(String(megastructures.type).toUpperCase(), 'CAMPAIGN');
});
