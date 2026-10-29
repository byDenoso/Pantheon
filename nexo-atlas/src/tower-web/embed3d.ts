// 3D embedding of the Tower graph as a cosmic web. No node is privileged: the Tower is the volume, not a point.
//  - domain centres: stress majorization (SMACOF) over the cross-domain quotient graph, target distance = halo radii + a LOGARITHMIC void
//  - everything else: bounded force relaxation (containment springs, sibling/halo repulsion, dependency springs) around those centres
//  - determinism: hash-seeded, id-sorted; stability: warm start from the previous generation's positions (existing nodes barely move)
import type {TowerGraph, TowerNode} from './model.ts';
import {pairKey} from './graph.ts';
import {voidGap} from './layout.ts';

export type V3 = {x: number; y: number; z: number};
export interface CosmosOptions {
  unit: number;            // spacing between neighbouring tests
  voidMin: number; voidMax: number; // void size in units, mapped through the log curve
  iterations: number;
  prev?: ReadonlyMap<string, V3>;
  /** max milliseconds for the relaxation phase (a Tower larger than the budget just relaxes less, never blocks) */
  budgetMs: number;
}
export const COSMOS_DEFAULTS: CosmosOptions = {unit: 14, voidMin: 0.15, voidMax: 1.2, iterations: 90, budgetMs: 600};

export interface CosmosVoid {from: string; to: string; isolation: number; gap: number; distance: number}
export interface CosmosLayout {
  pos: Map<string, V3>;
  /** radius of the halo of each container (domain / subdomain / campaign) */
  halo: Map<string, number>;
  voids: CosmosVoid[];
  /** metric scale factor: grows with the logarithm of the number of tests */
  expansion: number;
  /** centre of mass of the tests: a coordinate origin, never a node */
  center: V3;
  extent: number;
  domainIds: string[];
  /** half-sizes of the observation box when the layout was distributed on a grid volume (see gridify) */
  box?: {hx: number; hy: number; hz: number};
}

/** a(N): the universe expands with the logarithm of its content. a(0)=1. */
export const expansionFactor = (tests: number) => 1 + Math.log10(1 + Math.max(0, tests)) / 2;

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return h >>> 0;
}
/** Deterministic unit vector for an id (uniform on the sphere). */
export function unitVec(id: string, salt = 0): V3 {
  const a = hash32(`${id}#${salt}a`) / 4294967296, b = hash32(`${id}#${salt}b`) / 4294967296;
  const z = 2 * a - 1, r = Math.sqrt(1 - z * z), phi = 2 * Math.PI * b;
  return {x: r * Math.cos(phi), y: r * Math.sin(phi), z};
}
const add = (a: V3, b: V3, k = 1): V3 => ({x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k});
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Domain halos interpenetrate (one web, not islands): centre distance = OVERLAP * (Ri + Rj) + logarithmic void. */
export const OVERLAP = 0.3;
const RADIUS_K: Record<string, number> = {domain: 1.7, subdomain: 1.35, campaign: 1.1};
const haloOf = (n: TowerNode, unit: number) => unit * (RADIUS_K[n.kind] ?? 1) * Math.cbrt(Math.max(1, n.leaves));

/** SMACOF with unit weights, deterministic, warm-startable. */
function majorize(ids: string[], target: number[][], start: V3[], iters: number): V3[] {
  const n = ids.length; let X = start.map(p => ({...p}));
  if (n <= 1) return X;
  for (let it = 0; it < iters; it += 1) {
    const Y = X.map(() => ({x: 0, y: 0, z: 0}));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = dist(X[i]!, X[j]!) || 1e-9, t = target[i]![j]!;
        // Guttman transform: Y_i = (1/n) * sum_j [ X_j + t_ij * (X_i - X_j) / d_ij ]
        Y[i]!.x += X[j]!.x + t * (X[i]!.x - X[j]!.x) / d; Y[i]!.y += X[j]!.y + t * (X[i]!.y - X[j]!.y) / d; Y[i]!.z += X[j]!.z + t * (X[i]!.z - X[j]!.z) / d;
      }
      Y[i]!.x /= n - 1; Y[i]!.y /= n - 1; Y[i]!.z /= n - 1;
    }
    X = Y;
  }
  return X;
}

export function layoutCosmos(g: TowerGraph, partial: Partial<CosmosOptions> = {}): CosmosLayout {
  const o: CosmosOptions = {...COSMOS_DEFAULTS, ...partial};
  const prev = o.prev;
  const nodes = g.nodes.filter(n => n.kind !== 'root').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const expansion = expansionFactor(g.counts.tests);
  const pos = new Map<string, V3>(); const halo = new Map<string, number>();
  const doms = nodes.filter(n => n.kind === 'domain');
  const domIds = doms.map(d => d.id);

  // ---- 1. domain centres: log voids between halos
  const radii = doms.map(d => haloOf(d, o.unit));
  const iso = (i: number, j: number) => (doms[i]!.leaves + doms[j]!.leaves) / (1 + (g.domainLinks.get(pairKey(doms[i]!.domain, doms[j]!.domain)) ?? 0));
  let isoMax = 0; for (let i = 0; i < doms.length; i += 1) for (let j = i + 1; j < doms.length; j += 1) isoMax = Math.max(isoMax, iso(i, j));
  const voids: CosmosVoid[] = []; const target = doms.map(() => doms.map(() => 0));
  for (let i = 0; i < doms.length; i += 1) for (let j = i + 1; j < doms.length; j += 1) {
    const gap = voidGap(iso(i, j), isoMax, o.voidMin, o.voidMax) * o.unit * expansion;
    const d = (radii[i]! + radii[j]!) * OVERLAP + gap; target[i]![j] = target[j]![i] = d;
    voids.push({from: doms[i]!.domain, to: doms[j]!.domain, isolation: iso(i, j), gap, distance: d});
  }
  const meanT = voids.length ? voids.reduce((s, v) => s + v.distance, 0) / voids.length : 0;
  const start = doms.map(d => { const p = prev?.get(d.id); if (p) return {...p}; const u = unitVec(d.id, 7); return {x: u.x * meanT * 0.5, y: u.y * meanT * 0.5, z: u.z * meanT * 0.5}; });
  const centres = majorize(domIds, target, start, doms.length > 1 ? 160 : 0);
  if (!prev && doms.length === 1) centres[0] = {x: 0, y: 0, z: 0};
  doms.forEach((d, i) => { pos.set(d.id, centres[i]!); halo.set(d.id, radii[i]!); });

  // ---- 2. containers and tests: initial placement (warm from the previous generation), then bounded relaxation
  const mobility = new Map<string, number>();
  const rest = new Map<string, number>(); // preferred distance to the parent
  for (const n of nodes) {
    if (n.kind === 'domain') { mobility.set(n.id, 0); continue; }
    const par = g.byId.get(n.parent!)!; const pPos = pos.get(par.id) ?? {x: 0, y: 0, z: 0};
    const pr = haloOf(par, o.unit);
    const d0 = n.kind === 'test' ? pr * 0.8 : pr * 0.62;
    rest.set(n.id, d0);
    const old = prev?.get(n.id);
    if (old) { pos.set(n.id, {...old}); mobility.set(n.id, 0.04); }
    else { pos.set(n.id, add(pPos, unitVec(n.id), d0 * (n.kind === 'test' ? 0.5 + 0.5 * ((hash32(n.id) % 1000) / 1000) : 1))); mobility.set(n.id, 1); }
    if (n.kind !== 'test') halo.set(n.id, haloOf(n, o.unit));
  }
  const subs = nodes.filter(n => n.kind === 'subdomain'), camps = nodes.filter(n => n.kind === 'campaign');
  const tests = nodes.filter(n => n.kind === 'test');
  const dep = g.links.filter(l => l.kind === 'depends' || l.kind === 'contests');
  const cell = o.unit * 2.6;
  const t0 = Date.now();
  const moveable = nodes.filter(n => n.kind !== 'domain');
  const fx = new Map<string, V3>();
  for (let it = 0; it < o.iterations && Date.now() - t0 < o.budgetMs; it += 1) {
    const alpha = 1 - 0.85 * (it / o.iterations);
    for (const n of moveable) fx.set(n.id, {x: 0, y: 0, z: 0});
    const push = (id: string, v: V3, k: number) => { const f = fx.get(id); if (f) { f.x += v.x * k; f.y += v.y * k; f.z += v.z * k; } };
    // containment springs
    for (const n of moveable) {
      const p = pos.get(n.id)!, q = pos.get(n.parent!)!; const d = dist(p, q) || 1e-9; const k = 0.10 * (d - rest.get(n.id)!) / d;
      push(n.id, {x: q.x - p.x, y: q.y - p.y, z: q.z - p.z}, k);
    }
    // container repulsion (halo against halo), across ALL domains so the lobes blend into a single web
    for (const list of [subs, camps]) {
      if (list.length < 2) continue;
      const hmax = Math.max(...list.map(n => halo.get(n.id)!)); const cc = Math.max(o.unit, 2 * hmax);
      const cg = new Map<string, TowerNode[]>();
      for (const n of list) { const p = pos.get(n.id)!; const key = `${Math.floor(p.x / cc)},${Math.floor(p.y / cc)},${Math.floor(p.z / cc)}`; (cg.get(key) ?? cg.set(key, []).get(key)!).push(n); }
      for (const n of list) {
        const pa = pos.get(n.id)!; const cx = Math.floor(pa.x / cc), cy = Math.floor(pa.y / cc), cz = Math.floor(pa.z / cc);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
          const l2 = cg.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!l2) continue;
          for (const m of l2) {
            if (m.id <= n.id) continue; const pb = pos.get(m.id)!; const d = dist(pa, pb) || 1e-9; const want = (halo.get(n.id)! + halo.get(m.id)!) * 0.8;
            if (d < want) { const k = 0.3 * (want - d) / d; push(n.id, {x: pa.x - pb.x, y: pa.y - pb.y, z: pa.z - pb.z}, k); push(m.id, {x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z}, k); }
          }
        }
      }
    }
    // test repulsion through a uniform grid
    const grid = new Map<string, TowerNode[]>();
    for (const n of tests) { const p = pos.get(n.id)!; const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`; (grid.get(key) ?? grid.set(key, []).get(key)!).push(n); }
    for (const n of tests) {
      const p = pos.get(n.id)!; const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!list) continue;
        for (const m of list) {
          if (m.id <= n.id) continue; const q = pos.get(m.id)!; const d = dist(p, q) || 1e-9;
          if (d < cell) { const k = 0.5 * (cell - d) / d; push(n.id, {x: p.x - q.x, y: p.y - q.y, z: p.z - q.z}, k); push(m.id, {x: q.x - p.x, y: q.y - p.y, z: q.z - p.z}, k); }
        }
      }
    }
    // dependency springs (same-domain only; cross-domain links are drawn as filaments, they must not drag the superclusters)
    for (const l of dep) {
      const p = pos.get(l.source)!, q = pos.get(l.target)!; const d = dist(p, q) || 1e-9; const same = g.byId.get(l.source)!.domain === g.byId.get(l.target)!.domain; const k = (same ? 0.09 : 0.03) * (d - o.unit * (same ? 2.6 : 5)) / d;
      push(l.source, {x: q.x - p.x, y: q.y - p.y, z: q.z - p.z}, k); push(l.target, {x: p.x - q.x, y: p.y - q.y, z: p.z - q.z}, k);
    }
    for (const n of moveable) {
      const f = fx.get(n.id)!; const p = pos.get(n.id)!; const m = mobility.get(n.id)! * alpha; const mag = Math.hypot(f.x, f.y, f.z); const cap = o.unit * 1.5; const s = mag > cap ? cap / mag : 1;
      p.x += f.x * s * m; p.y += f.y * s * m; p.z += f.z * s * m;
    }
  }

  // ---- 3. measured halos (contain every child), centre of mass of the tests, extent
  for (const n of [...nodes].reverse()) {
    if (n.kind === 'test' || n.kind === 'domain') continue;
    const c = pos.get(n.id)!; let r = 0;
    for (const ch of n.children) { const q = pos.get(ch); if (q) r = Math.max(r, dist(c, q) + (g.byId.get(ch)!.kind === 'test' ? o.unit * 0.4 : halo.get(ch) ?? 0)); }
    halo.set(n.id, Math.max(r, o.unit * 0.8));
  }
  for (const d of doms) {
    const c = pos.get(d.id)!; let r = halo.get(d.id)!;
    for (const ch of d.children) { const q = pos.get(ch); if (q) r = Math.max(r, dist(c, q) + (halo.get(ch) ?? 0)); }
    halo.set(d.id, r);
  }
  const center = {x: 0, y: 0, z: 0};
  for (const n of tests) { const p = pos.get(n.id)!; center.x += p.x; center.y += p.y; center.z += p.z; }
  if (tests.length) { center.x /= tests.length; center.y /= tests.length; center.z /= tests.length; }
  let extent = 1; for (const n of nodes) { const p = pos.get(n.id)!; extent = Math.max(extent, dist(p, center) + (n.kind === 'domain' ? halo.get(n.id)! * 0.2 : 0)); }
  return {pos, halo, voids, expansion, center, extent, domainIds: domIds};
}

/** Mean displacement of the surviving nodes between two layouts, as a fraction of the new extent. 0 = nothing moved. */
export function drift(prev: ReadonlyMap<string, V3>, next: CosmosLayout): number {
  let s = 0, n = 0;
  for (const [id, p] of prev) { const q = next.pos.get(id); if (!q) continue; s += dist(p, q); n += 1; }
  return n ? s / n / next.extent : 0;
}

export interface GridOptions {
  /** relative edge lengths of the box (the N-body reference is a 2:1:1 cuboid) */
  aspect?: [number, number, number];
  /** 0 = keep the embedding as is, 1 = fully uniform marginals (every axis is rank-equalised) */
  strength?: number;
}
/**
 * Distributes the embedding through a cuboid observation volume: each axis is monotonically remapped so the tests fill the box evenly
 * (a blend of the linear and the rank/quantile map) and the ball-shaped cloud is stretched onto the cube so the corners fill as well; the longest raw axis
 * takes the longest box edge. Smooth and deterministic, neighbours stay neighbours; the voids shrink but never vanish (strength < 1). The raw layout stays the
 * coordinate system of the warm start and memory: apply this after layoutCosmos, never feed its output back.
 */
export function gridify(raw: CosmosLayout, opt: GridOptions = {}): CosmosLayout {
  const aspect = opt.aspect ?? [2, 1, 1], s = Math.max(0, Math.min(1, opt.strength ?? 0.8));
  const pts = [...raw.pos.entries()]; if (pts.length === 0) return raw;
  const keys = ['x', 'y', 'z'] as const;
  const axes = keys.map(k => { const v = pts.map(([, p]) => p[k]).sort((a, b) => a - b); return {k, v, lo: v[0]!, hi: v[v.length - 1]!}; });
  const range = axes.map(a => Math.max(1e-6, a.hi - a.lo)); const vol = range[0]! * range[1]! * range[2]!;
  const order = [0, 1, 2].sort((i, j) => range[j]! - range[i]!); const asp = [...aspect].sort((a, b) => b - a);
  const k = Math.cbrt(vol / (asp[0]! * asp[1]! * asp[2]!)); const half: number[] = [0, 0, 0]; order.forEach((ax, r) => { half[ax] = asp[r]! * k / 2; });
  const rank = (a: typeof axes[number], x: number) => { const v = a.v; if (x <= v[0]!) return 0; if (x >= v[v.length - 1]!) return 1; let lo = 0, hi = v.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m]! <= x) lo = m; else hi = m; } const w = v[hi]! > v[lo]! ? (x - v[lo]!) / (v[hi]! - v[lo]!) : 0; return (lo + w) / (v.length - 1); };
  const c = raw.center; const mid = [c.x, c.y, c.z];
  // 1) per-axis blend of linear and rank map -> u in [-1, 1]^3 (a roughly ball-shaped cloud); 2) ball -> cube: u * |u|2 / |u|inf, so the corners fill too
  const map = (p: V3): V3 => {
    const u = axes.map((a, i) => 2 * ((1 - s) * ((p[a.k] - a.lo) / range[i]!) + s * rank(a, p[a.k])) - 1);
    const inf = Math.max(Math.abs(u[0]!), Math.abs(u[1]!), Math.abs(u[2]!)), l2 = Math.hypot(u[0]!, u[1]!, u[2]!), f = inf > 1e-9 ? 1 + s * (l2 / inf - 1) : 1;
    // l2/inf in [1, sqrt(3)]: scaling by it pushes a ball onto a cube; clamp keeps everything inside the box
    const o = u.map((v, i) => mid[i]! + Math.max(-1, Math.min(1, v * f)) * half[i]!);
    return {x: o[0]!, y: o[1]!, z: o[2]!};
  };
  const pos = new Map(pts.map(([id, p]) => [id, map(p)] as const));
  const sc = Math.cbrt((8 * half[0]! * half[1]! * half[2]!) / vol) * 0.8;
  const halo = new Map([...raw.halo].map(([id, r]) => [id, r * sc] as const));
  const hd = Math.hypot(half[0]!, half[1]!, half[2]!);
  return {...raw, pos, halo, voids: raw.voids.map(v => ({...v, gap: v.gap * sc, distance: v.distance * sc})), extent: hd * 1.24, box: {hx: half[0]!, hy: half[1]!, hz: half[2]!}};
}
