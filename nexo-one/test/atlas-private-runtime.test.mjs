import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeHolder, validateRuntime} from '../src/private-legacy/runtime.ts';
import {activeSource} from '../src/private-legacy/adapters.ts';
import {runtimeHolder} from '../src/private-legacy/state.ts';
import {FP, FP2, makeGalaxy, makeRuntime, makeSystem} from './helpers/synthetic-runtime.mjs';

const code = r => { const c = validateRuntime(r); return c.ok ? 'OK' : c.code; };

test('a consistent synthetic runtime is accepted and every section is retained', () => {
  const c = validateRuntime(makeRuntime());
  assert.equal(c.ok, true);
  assert.equal(c.runtime.system.bus.fingerprint, FP);
  assert.ok(c.runtime.system.graph.nodes.length > 0);
});

test('source_revision is opaque: non-hex, short and long values are all accepted', () => {
  for (const rev of ['opaque-1', 'x', 'release/2030-01', 'a'.repeat(100)]) assert.equal(code(makeRuntime({source_revision: rev, galaxy: makeGalaxy(FP, rev)})), 'OK', rev);
  assert.equal(code(makeRuntime({source_revision: ''})), 'ENVELOPE');
});

test('fails closed on every inconsistency, each with its own code', () => {
  const r = makeRuntime;
  assert.equal(code(null), 'NOT_OBJECT'); assert.equal(code([]), 'NOT_OBJECT');
  assert.equal(code(r({contract: 'OTHER'})), 'CONTRACT');
  assert.equal(code(r({access: 'PUBLIC'})), 'ACCESS');
  assert.equal(code(r({access: undefined})), 'ACCESS');
  assert.equal(code(r({generated_at: 'yesterday'})), 'ENVELOPE');
  assert.equal(code(r({fingerprint: ''})), 'ENVELOPE');
  assert.equal(code(r({system: {...makeSystem(), envelopes: 'x'}})), 'SYSTEM_INVALID');
  assert.equal(code(r({system: undefined})), 'SYSTEM_INVALID');
  assert.equal(code(r({system: makeSystem(FP2)})), 'FINGERPRINT_MISMATCH');
  assert.equal(code(r({world: {version: '2', items: [], providers: []}})), 'WORLD_INVALID');
  assert.equal(code(r({world: undefined})), 'WORLD_INVALID');
  assert.equal(code(r({publication: {contract: 'X', build_meta: {}, manifest: {}}})), 'PUBLICATION_INVALID');
  const p = r().publication;
  assert.equal(code(r({publication: {...p, manifest: {projection_fingerprint: FP2}}})), 'PUBLICATION_INVALID');
  assert.equal(code(r({publication: {...p, build_meta: {projection_fingerprint: FP2}}})), 'PUBLICATION_INVALID');
  assert.equal(code(r({publication: 'x'})), 'PUBLICATION_INVALID');
  assert.equal(code(r({topology: {source: {projection_fingerprint: FP2}}})), 'TOPOLOGY_INVALID');
  assert.equal(code(r({topology: []})), 'TOPOLOGY_INVALID');
  assert.equal(code(r({galaxy: makeGalaxy(FP2)})), 'GALAXY_INVALID');
  assert.equal(code(r({galaxy: {contract: 'NEXO_ONE_GALAXY_V1'}})), 'GALAXY_INVALID');
});

test('an envelope that claims authority or lacks provenance is rejected (legacy boundary kept)', () => {
  const s = makeSystem(); s.envelopes[0].authoritative = true;
  assert.equal(code(makeRuntime({system: s})), 'SYSTEM_INVALID');
  const t = makeSystem(); delete t.envelopes[0].source_ref;
  assert.equal(code(makeRuntime({system: t})), 'SYSTEM_INVALID');
});

test('absent topology/publication/galaxy stay absent: never replaced by a success-looking default', () => {
  const c = validateRuntime(makeRuntime({topology: null, publication: null, galaxy: undefined}));
  assert.equal(c.ok, true);
  assert.equal(c.runtime.topology, null); assert.equal(c.runtime.publication, null); assert.equal(c.runtime.galaxy, null);
});

test('optional functional system fields and ALL domains are retained untouched (no filtering, no relabel)', () => {
  const s = makeSystem();
  s.read_model = {marker: 'rm'}; s.projected_work = [{id: 'w'}]; s.science_projection_v1 = {k: 1}; s.evolution = {e: 1}; s.guardian = {g: 1}; s.cosmology_state = {c: 1};
  const before = JSON.stringify(s);
  const c = validateRuntime(makeRuntime({system: s}));
  assert.equal(c.ok, true);
  assert.equal(JSON.stringify(c.runtime.system), before);
  const domains = new Set(s.envelopes.map(e => e.domain));
  assert.deepEqual(new Set(c.runtime.system.envelopes.map(e => e.domain)), domains);
  assert.equal(c.runtime.access, 'PRIVATE');
});

test('holder: one generation at a time, bumps on set/clear', () => {
  const h = createRuntimeHolder(); const g0 = h.generation();
  const a = validateRuntime(makeRuntime()).runtime;
  h.set(a); assert.equal(h.get(), a); assert.ok(h.generation() > g0);
  h.clear(); assert.equal(h.get(), null);
});

test('system adapter: serves a clone of the in-memory generation, UNAUTHORIZED when empty or aborted', async () => {
  runtimeHolder.clear();
  await assert.rejects(activeSource.load({}), e => e.code === 'UNAUTHORIZED');
  const rt = validateRuntime(makeRuntime()).runtime;
  runtimeHolder.set(rt);
  const s = await activeSource.load({});
  assert.deepEqual(s, rt.system); assert.notEqual(s, rt.system);
  const ac = new AbortController(); ac.abort();
  await assert.rejects(activeSource.load({signal: ac.signal}), e => e.name === 'AbortError');
  assert.equal(activeSource.kind, 'remote');
  runtimeHolder.clear();
});

test('private publication/galaxy: PRIVATE markers, opaque revision, bound to the same generation', () => {
  const r = makeRuntime();
  assert.equal(r.publication.contract, 'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1');
  assert.equal(r.publication.access, 'PRIVATE');
  assert.equal(r.galaxy.access, 'PRIVATE');
  assert.equal(r.galaxy.provenance.source_contract, 'NEXO_ATLAS_PRIVATE_RUNTIME_V1');
  assert.equal(r.galaxy.provenance.authority, undefined, 'no authority is invented for the private galaxy');
  assert.equal(validateRuntime(r).ok, true);
  assert.equal(validateRuntime(makeRuntime({source_revision: 'rev_opaco_não-git/42'})).ok, false, 'galaxy tower_revision must equal the runtime source_revision');
  assert.equal(validateRuntime(makeRuntime({source_revision: 'opaque_#7', galaxy: makeGalaxy(FP, 'opaque_#7')})).ok, true);
});

test('a PUBLIC-marked publication or galaxy is rejected, never relabelled', () => {
  const code = x => validateRuntime(x).code;
  const p = makeRuntime().publication;
  assert.equal(code(makeRuntime({publication: {...p, contract: 'NEXO_PUBLIC_PROJECTION_PUBLICATION_V1'}})), 'PUBLICATION_INVALID');
  assert.equal(code(makeRuntime({publication: {...p, access: 'PUBLIC'}})), 'PUBLICATION_INVALID');
  assert.equal(code(makeRuntime({publication: {...p, access: undefined}})), 'PUBLICATION_INVALID');
  const g = makeGalaxy();
  assert.equal(code(makeRuntime({galaxy: {...g, access: 'PUBLIC'}})), 'GALAXY_INVALID');
  assert.equal(code(makeRuntime({galaxy: {...g, access: undefined}})), 'GALAXY_INVALID');
  assert.equal(code(makeRuntime({galaxy: {...g, provenance: {authority: 'TOWER_V06', source_fingerprint: FP}}})), 'GALAXY_INVALID');
  assert.equal(code(makeRuntime({galaxy: {...g, provenance: {...g.provenance, source_contract: 'OTHER'}}})), 'GALAXY_INVALID');
  assert.equal(code(makeRuntime({galaxy: {...g, tower_revision: 'another-revision'}})), 'GALAXY_INVALID');
  assert.equal(code(makeRuntime({galaxy: {...g, contract: 'OTHER'}})), 'GALAXY_INVALID');
});
