import assert from 'node:assert/strict';
import test from 'node:test';
import { distance3, forceLayoutGraph3D, layoutGraph3D, resolveSelection3D } from '../src/viewmodels/graph3d.ts';

const fresh = { state: 'LIVE', observed_at: '2026-09-15T00:00:00Z', ttl_seconds: 3600 };
const node = (id, type, domain) => ({
  id,
  type,
  label: id,
  domain,
  state: 'LIVE',
  authority_class: 'DERIVED',
  source_ref: `source:${id}`,
  source_revision: '1',
  fingerprint: id,
  freshness: fresh,
  checked_at: '2026-09-15T00:00:00Z',
  summary: id,
});

const fixture = [
  node('domain:nexo', 'DOMAIN', 'NEXO'),
  node('domain:science', 'DOMAIN', 'SCIENCE'),
  node('domain:engineering', 'DOMAIN', 'ENGINEERING'),
  node('domain:olympus', 'DOMAIN', 'OLYMPUS'),
  node('science:provider', 'PROVIDER', 'SCIENCE'),
  node('science:capability', 'CAPABILITY', 'SCIENCE'),
  node('science:claim', 'CLAIM', 'SCIENCE'),
  node('science:test', 'TEST', 'SCIENCE'),
  node('engineering:provider', 'PROVIDER', 'ENGINEERING'),
];

test('NEXO anchors the galaxy at the origin and primary domains occupy unique near-core arm hubs', () => {
  const placed = layoutGraph3D(fixture);
  const byId = new Map(placed.map(n => [n.id, n]));
  const nexo = byId.get('domain:nexo');
  assert.deepEqual([nexo.x, nexo.y, nexo.z], [0, 0, 0]);

  const hubs = ['domain:science', 'domain:engineering', 'domain:olympus'].map(id => byId.get(id));
  assert.ok(hubs.every(h => distance3(h, nexo) >= 20 && distance3(h, nexo) <= 55));
  assert.equal(new Set(hubs.map(h => `${h.x}:${h.y}:${h.z}`)).size, hubs.length);
});

test('3D placement is deterministic even when input order changes', () => {
  const a = layoutGraph3D(fixture).map(({ id, x, y, z }) => ({ id, x, y, z }));
  const b = layoutGraph3D([...fixture].reverse()).map(({ id, x, y, z }) => ({ id, x, y, z }));
  assert.deepEqual(a, b);
});

test('providers and capabilities stay close to their domain while evidence occupies outer shells', () => {
  const placed = layoutGraph3D(fixture);
  const byId = new Map(placed.map(n => [n.id, n]));
  const hub = byId.get('domain:science');
  const provider = byId.get('science:provider');
  const capability = byId.get('science:capability');
  const claim = byId.get('science:claim');
  const evidence = byId.get('science:test');

  const inner = Math.max(distance3(provider, hub), distance3(capability, hub));
  assert.ok(distance3(claim, hub) > inner);
  assert.ok(distance3(evidence, hub) > distance3(claim, hub));
});

test('no non-domain nodes collide exactly and every coordinate is finite', () => {
  const placed = layoutGraph3D(fixture);
  const satellites = placed.filter(n => n.type !== 'DOMAIN');
  assert.equal(new Set(satellites.map(n => `${n.x}:${n.y}:${n.z}`)).size, satellites.length);
  assert.ok(placed.every(n => [n.x, n.y, n.z, n.radius].every(Number.isFinite)));
});

test('selection clears when filtering removes the selected node', () => {
  const olympusOnly = layoutGraph3D(fixture.filter(n => n.domain === 'OLYMPUS'));
  assert.equal(resolveSelection3D(olympusOnly, 'engineering:provider'), null);
  assert.equal(resolveSelection3D(olympusOnly, 'domain:olympus'), 'domain:olympus');
});

test('force layout keeps canonical hubs pinned while opening satellite spacing', () => {
  const edges = [{ id: 'edge:1', from: 'science:provider', to: 'engineering:provider', kind: 'SUPPORTS', weight: .7 }];
  const placed = forceLayoutGraph3D(fixture, edges);
  const byId = new Map(placed.map(n => [n.id, n]));
  assert.deepEqual([byId.get('domain:nexo').x, byId.get('domain:nexo').y, byId.get('domain:nexo').z], [0, 0, 0]);
  assert.ok(distance3(byId.get('science:provider'), byId.get('domain:science')) > 8);
  assert.ok(distance3(byId.get('engineering:provider'), byId.get('domain:engineering')) > 8);
});
