// In-memory continuity of the Tower web across generations of the authenticated runtime: positions by id, the id set and a short
// size history. It holds ids and coordinates derived from private data, so it lives in memory only and is cleared on teardown, logout
// and any failed/closed phase (see Host.tsx). Never persisted, never sent anywhere.
import type {V3} from './embed3d.ts';
import type {Camera} from './camera3d.ts';

/** What the viewer was looking at: carried across a new generation (the view remounts), never persisted. */
export interface ViewState {cam: Camera; selected: string | null}

export interface GenerationPoint {at: string; tests: number; born: number; died: number}
export const HISTORY_MAX = 64;

export interface Memory {
  /** positions of the last committed layout */
  positions(): ReadonlyMap<string, V3> | undefined;
  ids(): ReadonlySet<string> | undefined;
  history(): readonly GenerationPoint[];
  /** ids new relative to the committed snapshot (empty on the first view: nothing is a birth without a "before") */
  newcomers(ids: Iterable<string>): string[];
  /** a generation counts once: re-committing the same `at` only refreshes positions */
  commit(at: string, pos: ReadonlyMap<string, V3>, testIds: ReadonlySet<string>): GenerationPoint | null;
  /** ΛCDM scale factor reached by the motion model (a number, no private content); carried so a new generation does not restart the expansion */
  scale(): number | undefined;
  setScale(a: number): void;
  view(): ViewState | undefined;
  setView(v: ViewState): void;
  clear(): void;
}

export function createMemory(): Memory {
  let pos: Map<string, V3> | undefined, ids: Set<string> | undefined; let hist: GenerationPoint[] = []; let a: number | undefined; let vw: ViewState | undefined;
  return {
    view: () => vw, setView(v) { vw = {cam: {...v.cam, target: {...v.cam.target}}, selected: v.selected}; },
    scale: () => a, setScale(v) { if (Number.isFinite(v)) a = v; },
    positions: () => pos, ids: () => ids, history: () => hist,
    newcomers(next) { if (!ids) return []; const out: string[] = []; for (const id of next) if (!ids.has(id)) out.push(id); return out; },
    commit(at, p, testIds) {
      const born = ids ? [...testIds].filter(i => !ids!.has(i)).length : 0, died = ids ? [...ids].filter(i => !testIds.has(i)).length : 0;
      pos = new Map([...p].map(([k, v]) => [k, {...v}])); ids = new Set(testIds);
      if (hist.length && hist[hist.length - 1]!.at === at) return null;
      const pt = {at, tests: testIds.size, born, died}; hist = [...hist, pt].slice(-HISTORY_MAX); return pt;
    },
    clear() { pos = undefined; ids = undefined; hist = []; a = undefined; vw = undefined; },
  };
}
/** The one memory of this frame. */
export const towerMemory: Memory = createMemory();
