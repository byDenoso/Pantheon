import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTableRows, toggleDomainExpansion, filterRows, filterAndAutoExpand, sortRows } from '../src/graph-engine/accessible-table-model.ts';

function fixture() {
  const nodes = [
    { id: 'domain:sci', label: 'Ciência', type: 'DOMAIN', status: 'ACTIVE' },
    { id: 'domain:eng', label: 'Engenharia', type: 'DOMAIN', status: 'ACTIVE' },
    { id: 'campaign:c1', label: 'Hubble Tension Corridor', type: 'CAMPAIGN', status: 'READY' },
    { id: 'campaign:c2', label: 'DESI Pilot', type: 'CAMPAIGN', status: 'CHECKPOINTED' },
    { id: 'campaign:orphan', label: 'Cross-domain synthesis', type: 'CAMPAIGN', status: 'READY' }
  ];
  const edges = [
    { id: 'e1', source: 'domain:sci', target: 'campaign:c1', type: 'CONTAINS' },
    { id: 'e2', source: 'domain:eng', target: 'campaign:c2', type: 'CONTAINS' }
  ];
  return { nodes, edges };
}

test('buildTableRows shows only domain rows (and top-level orphan campaigns) with no expansion', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set());
  assert.deepEqual(rows.map(r => r.id), ['domain:sci', 'domain:eng', 'campaign:orphan']);
});

test('expanding a domain inserts exactly its own campaigns directly after it', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set(['domain:sci']));
  assert.deepEqual(rows.map(r => r.id), ['domain:sci', 'campaign:c1', 'domain:eng', 'campaign:orphan']);
  assert.equal(rows.find(r => r.id === 'campaign:c1').isChildRow, true);
});

test('a campaign with no domain parent (Transversais case) is never gated by expansion state', () => {
  const { nodes, edges } = fixture();
  const collapsed = buildTableRows(nodes, edges, new Set());
  const expanded = buildTableRows(nodes, edges, new Set(['domain:sci', 'domain:eng']));
  assert.ok(collapsed.some(r => r.id === 'campaign:orphan'));
  assert.ok(expanded.some(r => r.id === 'campaign:orphan'));
});

test('toggleDomainExpansion adds then removes, and never mutates the input set', () => {
  const original = new Set(['domain:sci']);
  const added = toggleDomainExpansion(original, 'domain:eng');
  assert.deepEqual([...added].sort(), ['domain:eng', 'domain:sci']);
  assert.deepEqual([...original], ['domain:sci']); // unmutated
  const removed = toggleDomainExpansion(added, 'domain:sci');
  assert.deepEqual([...removed], ['domain:eng']);
});

test('filterRows matches label or id case-insensitively', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set(['domain:sci']));
  const byLabel = filterRows(rows, { query: 'hubble' });
  assert.deepEqual(byLabel.map(r => r.id), ['campaign:c1']);
  const byId = filterRows(rows, { query: 'DOMAIN:SCI' });
  assert.deepEqual(byId.map(r => r.id), ['domain:sci']);
});

test('filterRows by status keeps only exact matches', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set(['domain:sci', 'domain:eng']));
  const ready = filterRows(rows, { status: 'READY' });
  assert.deepEqual(ready.map(r => r.id).sort(), ['campaign:c1', 'campaign:orphan']);
});

test('filterAndAutoExpand reveals a matching campaign even in a collapsed domain, without the caller expanding it first', () => {
  const { nodes, edges } = fixture();
  const { rows, expandedDomainIds } = filterAndAutoExpand(nodes, edges, new Set(), { query: 'hubble' });
  assert.deepEqual(rows.map(r => r.id), ['campaign:c1']);
  assert.ok(expandedDomainIds.has('domain:sci'));
  assert.ok(!expandedDomainIds.has('domain:eng'));
});

test('filterAndAutoExpand with no query behaves exactly like buildTableRows + filterRows with the given expansion', () => {
  const { nodes, edges } = fixture();
  const { rows, expandedDomainIds } = filterAndAutoExpand(nodes, edges, new Set(['domain:eng']), {});
  assert.deepEqual(rows.map(r => r.id), ['domain:sci', 'domain:eng', 'campaign:c2', 'campaign:orphan']);
  assert.deepEqual([...expandedDomainIds], ['domain:eng']);
});

test('sortRows keeps each domain adjacent to its own expanded children while reordering domain blocks', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set(['domain:sci', 'domain:eng']));
  const descending = sortRows(rows, 'label', 'desc');
  // Descending by label: "Engenharia" > "Cross-domain synthesis" > "Ciência" -- each
  // domain's own child (e.g. campaign:c2 under domain:eng) must still immediately
  // follow it, proving the sort reorders blocks, not individual rows.
  assert.deepEqual(descending.map(r => r.id), ['domain:eng', 'campaign:c2', 'campaign:orphan', 'domain:sci', 'campaign:c1']);
});

test('sortRows never mutates the input array', () => {
  const { nodes, edges } = fixture();
  const rows = buildTableRows(nodes, edges, new Set(['domain:sci']));
  const snapshot = rows.map(r => r.id);
  sortRows(rows, 'label', 'desc');
  assert.deepEqual(rows.map(r => r.id), snapshot);
});
