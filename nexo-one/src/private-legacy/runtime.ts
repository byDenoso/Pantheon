// Private runtime envelope: validation + single in-memory holder. One generation
// feeds every adapter. Nothing here touches storage or the network.
import {assertSystemState} from '../data/adapters/source.ts';
import type {SystemState} from '../contracts/system.ts';
import type {WorldState} from '../contracts/world.ts';
import {isIsoTime, isObj} from '../atlas/api.ts';

export const RUNTIME_CONTRACT = 'NEXO_ATLAS_PRIVATE_RUNTIME_V1';
/** Canonical private publication contract. The legacy store literal is aliased to this at build time (see vite.private.config.ts). */
export const PUBLICATION_CONTRACT = 'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1';
export const GALAXY_CONTRACT = 'NEXO_ONE_GALAXY_V1';

export type PrivateRuntime = {
  contract: typeof RUNTIME_CONTRACT;
  access: 'PRIVATE';
  generated_at: string;
  /** opaque string; may or may not be a Git revision */
  source_revision: string;
  fingerprint: string;
  system: SystemState;
  world: WorldState;
  topology: Record<string, unknown> | null;
  publication: Record<string, unknown> | null;
  galaxy: Record<string, unknown> | null;
};

export type RuntimeCheck = {ok: true; runtime: PrivateRuntime} | {ok: false; code: RuntimeFailure};
export type RuntimeFailure =
  | 'NOT_OBJECT' | 'CONTRACT' | 'ACCESS' | 'ENVELOPE' | 'SYSTEM_INVALID' | 'WORLD_INVALID'
  | 'FINGERPRINT_MISMATCH' | 'PUBLICATION_INVALID' | 'TOPOLOGY_INVALID' | 'GALAXY_INVALID';

const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 512;
const same = (a: unknown, b: unknown) => str(a) && str(b) && a.toLowerCase() === b.toLowerCase();
const optObj = (v: unknown): Record<string, unknown> | null | undefined => (v === null || v === undefined ? null : isObj(v) ? v : undefined);

/** Fails closed on any inconsistency. Absent (null) topology/publication/galaxy stay absent: never faked. */
export function validateRuntime(raw: unknown): RuntimeCheck {
  if (!isObj(raw)) return {ok: false, code: 'NOT_OBJECT'};
  if (raw.contract !== RUNTIME_CONTRACT) return {ok: false, code: 'CONTRACT'};
  if (raw.access !== 'PRIVATE') return {ok: false, code: 'ACCESS'};
  if (!isIsoTime(raw.generated_at) || !str(raw.source_revision) || !str(raw.fingerprint)) return {ok: false, code: 'ENVELOPE'};
  if (isObj(raw.system) && raw.system.access !== undefined && raw.system.access !== 'PRIVATE') return {ok: false, code: 'SYSTEM_INVALID'};
  let system: SystemState;
  try { system = assertSystemState(raw.system); } catch { return {ok: false, code: 'SYSTEM_INVALID'}; }
  if (!same(system.bus.fingerprint, raw.fingerprint)) return {ok: false, code: 'FINGERPRINT_MISMATCH'};
  const world = raw.world;
  if (!isObj(world) || world.version !== '1' || world.access !== 'PRIVATE' || !Array.isArray(world.items) || !Array.isArray(world.providers)) return {ok: false, code: 'WORLD_INVALID'};

  const publication = optObj(raw.publication);
  if (publication === undefined) return {ok: false, code: 'PUBLICATION_INVALID'};
  if (publication) {
    const manifest = publication.manifest, meta = publication.build_meta;
    if (publication.contract !== PUBLICATION_CONTRACT || publication.access !== 'PRIVATE' || !isObj(manifest) || manifest.access !== 'PRIVATE' || !isObj(meta)
      || !same(manifest.projection_fingerprint, raw.fingerprint) || !same(meta.projection_fingerprint, raw.fingerprint)) return {ok: false, code: 'PUBLICATION_INVALID'};
  }
  const topology = optObj(raw.topology);
  if (topology === undefined) return {ok: false, code: 'TOPOLOGY_INVALID'};
  if (topology) {
    if (topology.contract !== 'NEXO_MCP_TOPOLOGY_V1' || topology.access !== 'PRIVATE') return {ok: false, code: 'TOPOLOGY_INVALID'};
    const src = topology.source;
    if (isObj(src) && src.projection_fingerprint !== undefined && !same(src.projection_fingerprint, raw.fingerprint)) return {ok: false, code: 'TOPOLOGY_INVALID'};
  }
  const galaxy = optObj(raw.galaxy);
  if (galaxy === undefined) return {ok: false, code: 'GALAXY_INVALID'};
  if (galaxy) {
    const prov = galaxy.provenance;
    // PRIVATE galaxy bound to this exact generation. No PUBLIC marker and no TOWER_V06 authority are required or invented;
    // tower_revision is the OPAQUE source_revision (never a Git SHA requirement).
    if (galaxy.contract !== GALAXY_CONTRACT || galaxy.access !== 'PRIVATE' || galaxy.tower_revision !== raw.source_revision
      || !isObj(prov) || prov.source_contract !== RUNTIME_CONTRACT || !same(prov.source_fingerprint, raw.fingerprint)) return {ok: false, code: 'GALAXY_INVALID'};
  }
  return {ok: true, runtime: {
    contract: RUNTIME_CONTRACT, access: 'PRIVATE', generated_at: raw.generated_at, source_revision: raw.source_revision as string,
    fingerprint: raw.fingerprint as string, system, world: world as unknown as WorldState, topology, publication, galaxy,
  }};
}

export type RuntimeHolder = {get(): PrivateRuntime | null; set(r: PrivateRuntime): void; clear(): void; generation(): number};
export function createRuntimeHolder(): RuntimeHolder {
  let cur: PrivateRuntime | null = null; let gen = 0;
  return {get: () => cur, set: r => { cur = r; gen += 1; }, clear: () => { cur = null; gen += 1; }, generation: () => gen};
}
