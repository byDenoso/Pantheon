// Visual geometry of the web. The eye should read a branching structure in depth (a few thick trunks, smaller branches that join them, diffuse
// knots, large voids) and not a ball of equal wires. Everything here is a REPRESENTATION of the real topology, and the UI says so:
//   - hierarchical bundling: the real hierarchy (domain > subdomain > campaign > test) is the skeleton. Every real dependency / contest is drawn
//     as a smooth curve that runs along that skeleton, from one test up to the common ancestor and down to the other (between two domains it goes
//     from one domain node to the other). Links that really join the same groups therefore share a corridor and give it mass; nothing crosses
//     the voids unless a real link does;
//   - one group of strands per real edge and never a strand without an edge: filters, replay, picking and selection keep addressing the records;
//   - a trunk gets more strands the more tests really hang below it; a thread to a single test gets few; nothing is sized by an invented metric;
//   - the visible matter is a CLOUD: soft density puffs of several sizes scattered around those strands, inside the real corridors and thicker
//     near the nodes. It is an artistic density guided by the network, not observed gas and not data. The strands themselves stay almost
//     invisible (they are the internal structure used for picking and are shown for the selected node);
//   - curves, offsets and grains are deterministic (hash of the edge id): the same web every frame, session and generation.
// Pure: typed arrays only, no DOM and no WebGL. The renderer draws all strands as one ribbon mesh and all grains as one point batch.
import {hash32} from './embed3d.ts';
import type {Scene, SceneEdge} from './scene.ts';

export type Lod = 'low' | 'high';
export interface Filaments {
  /** per ribbon vertex: point on the strand, strand tangent, side (-1 | +1), width in world units, position along the strand 0..1, brightness 0..1 */
  pos: Float32Array; tan: Float32Array; side: Float32Array; width: Float32Array; along: Float32Array; gain: Float32Array;
  index: Uint32Array;
  /** per edge: first ribbon vertex, vertex count */
  range: Uint32Array;
  /** per edge: AXIS + 1 points of the unoffset curve (the Canvas fallback strokes it) and the half-width of its group of strands, world units */
  axis: Float32Array; radius: Float32Array;
  /** cloud puffs: position, radius in world units, brightness; per edge: first puff, puff count */
  dust: Float32Array; dustSize: Float32Array; dustGain: Float32Array; dustRange: Uint32Array;
  strands: number; segments: number; lod: Lod;
  /** per strand: edge, lateral offset (2 coefficients, world units), twist; per grain: strand, position along it, scatter (3, world units) */
  recipe: Float32Array; dustRecipe: Float32Array;
}
const rnd = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
export const SEGMENTS: Record<Lod, number> = {low: 8, high: 16};
export const AXIS = 8;
/** grains per strand per unit of length, and the ceiling of the whole cloud */
export const DUST: Record<Lod, {perUnit: number; budget: number}> = {low: {perUnit: 0.3, budget: 12000}, high: {perUnit: 2.2, budget: 60000}};
/** Half-width of the cloud around the strands of an edge, in world units: a trunk is as wide as the tests below it justify. */
export const cloudSigma = (s: Scene, e: SceneEdge): number => { const c = bundleClass(s, e), u = unitOf(s); return u * (c === 0 ? 0.9 + 0.5 * Math.sqrt(s.nodes[e.b]!.leaves) : c === 1 ? 0.7 : 1.1); };
/** how strongly a link follows the hierarchy instead of going straight (Holten's bundling strength) */
export const BUNDLING = 0.86;
/** Short routes are bundled less: two tests of the same campaign are joined by a gentle arc toward it, not by a hairpin through it. */
export const bundlingOf = (routeNodes: number): number => (routeNodes <= 3 ? 0.4 : routeNodes <= 5 ? 0.7 : BUNDLING);
/** a route node pulls its control point at most this fraction of the chord away from the chord */
export const MAX_PULL = 0.7;
/** the pull grows smoothly from the two ends toward the middle of the route, so a link leaves its node heading for its target, not backwards */
export const EASE = 1;
/** largest lateral offset of a strand, as a fraction of the straight length of its edge */
export const MAX_OFFSET = 0.14;
const RECIPE = 4, DRECIPE = 5;

/** 0 trunk (both ends are containers), 1 thread from a campaign to a test, 2 dependency / contest */
export const bundleClass = (s: Scene, e: {a: number; b: number; kind: number}): 0 | 1 | 2 => (e.kind !== 0 ? 2 : s.nodes[e.a]!.kind !== 'test' && s.nodes[e.b]!.kind !== 'test' ? 0 : 1);
/** Strands of an edge: a trunk grows with the tests really below its child; a thread and a routed link are thin. */
export function strandCount(s: Scene, e: SceneEdge, lod: Lod): number {
  const c = bundleClass(s, e); const full = c === 0 ? Math.min(18, Math.round(3 + 3 * Math.log2(1 + s.nodes[e.b]!.leaves))) : c === 1 ? 2 : 2;
  return lod === 'high' ? full : Math.max(1, Math.round(full / 3));
}
/** The route of an edge through real nodes: a hierarchy edge is its two nodes; a link climbs from each test to the common ancestor (or to its domain). */
export function routeOf(s: Scene, e: SceneEdge): number[] {
  if (e.kind === 0) return [e.a, e.b];
  const chain = (i: number) => { const out = [i]; let p = s.nodes[i]!.parent; while (p) { const j = s.index.get(p); if (j === undefined) break; out.push(j); p = s.nodes[j]!.parent; } return out; };
  const up = chain(e.a), down = chain(e.b); const at = new Map(down.map((n, k) => [n, k] as const));
  for (let k = 0; k < up.length; k += 1) { const m = at.get(up[k]!); if (m !== undefined) return [...up.slice(0, k + 1), ...down.slice(0, m).reverse()]; }
  return [...up, ...down.reverse()]; // different domains: the route goes from one domain node straight to the other
}

export function buildFilaments(s: Scene, lod: Lod): Filaments {
  const S = SEGMENTS[lod], E = s.edges.length; const counts = s.edges.map(e => strandCount(s, e, lod)); const strands = counts.reduce((a, b) => a + b, 0), V = strands * (S + 1) * 2;
  const u = unitOf(s); const recipe = new Float32Array(strands * RECIPE), side = new Float32Array(V), width = new Float32Array(V), along = new Float32Array(V), gain = new Float32Array(V), index = new Uint32Array(strands * S * 6), range = new Uint32Array(E * 2);
  // grains: an estimate of each strand's length (along its route) decides how many it carries, scaled down to the budget
  const lens = s.edges.map(e => { const r = routeOf(s, e); let l = 0; for (let k = 1; k < r.length; k += 1) l += Math.hypot(s.xyz[3 * r[k]!]! - s.xyz[3 * r[k - 1]!]!, s.xyz[3 * r[k]! + 1]! - s.xyz[3 * r[k - 1]! + 1]!, s.xyz[3 * r[k]! + 2]! - s.xyz[3 * r[k - 1]! + 2]!); return l; });
  const want = s.edges.map((_, i) => Math.max(2, Math.min(90, Math.round(lens[i]! / u * DUST[lod].perUnit)))); const wantAll = want.reduce((a, w, i) => a + w * counts[i]!, 0), scale = wantAll > DUST[lod].budget ? DUST[lod].budget / wantAll : 1;
  const per = want.map(w => Math.max(1, Math.round(w * scale))); const grains = per.reduce((a, w, i) => a + w * counts[i]!, 0);
  const dustRecipe = new Float32Array(grains * DRECIPE), dustSize = new Float32Array(grains), dustGain = new Float32Array(grains), dustRange = new Uint32Array(E * 2);
  let v = 0, ii = 0, k = 0, d = 0;
  s.edges.forEach((e, ei) => {
    const c = bundleClass(s, e), r = rnd(hash32(e.id)); range[2 * ei] = v; dustRange[2 * ei] = d;
    // half-width of the group of strands: a trunk is as wide as the tests below it justify; a link spreads inside the corridor it travels
    const spread = u * (c === 0 ? 0.5 + 0.55 * Math.sqrt(s.nodes[e.b]!.leaves) : c === 1 ? 0.3 : 1.5);
    for (let j = 0; j < counts[ei]!; j += 1) {
      const o = k * RECIPE, rad = spread * Math.sqrt(r()), ang = r() * Math.PI * 2; recipe[o] = ei; recipe[o + 1] = Math.cos(ang) * rad; recipe[o + 2] = Math.sin(ang) * rad; recipe[o + 3] = (r() - 0.5) * 1.6;
      const w = u * (c === 0 ? 0.9 + 0.8 * r() : c === 1 ? 0.4 + 0.3 * r() : 0.4 + 0.3 * r()), g = c === 0 ? 0.62 + 0.38 * r() : c === 1 ? 0.32 + 0.22 * r() : 0.4 + 0.25 * r(); // trunks carry the light; threads and single links are faint
      for (let q = 0; q <= S; q += 1) for (const sd of [-1, 1]) { side[v] = sd; width[v] = w; along[v] = q / S; gain[v] = g; v += 1; }
      const base = v - (S + 1) * 2; for (let q = 0; q < S; q += 1) { const a = base + 2 * q; index[ii++] = a; index[ii++] = a + 1; index[ii++] = a + 2; index[ii++] = a + 1; index[ii++] = a + 3; index[ii++] = a + 2; }
      // puffs of three scales around the strand: a few wide, faint ones make the body of the cloud, more medium ones its texture, many small
      // ones its grain. More of them sit near the two nodes, where the real structure is denser. Scatter and size stay inside the corridor.
      const sig = cloudSigma(s, e);
      for (let p = 0; p < per[ei]!; p += 1) {
        // scatter is tight around the strands, so branches stay legible inside the cloud
        const q = d * DRECIPE, pick = r(), scale = pick < 0.1 ? 2 : pick < 0.42 ? 1 : 0; let t = r(); if (r() < 0.18) { const near = r() * r() * 0.5; t = r() < 0.5 ? near : 1 - near; }
        const sc = sig * (scale === 2 ? 0.36 : scale === 1 ? 0.24 : 0.15); dustRecipe[q] = k; dustRecipe[q + 1] = t; dustRecipe[q + 2] = gauss(r) * sc; dustRecipe[q + 3] = gauss(r) * sc; dustRecipe[q + 4] = gauss(r) * sc;
        dustSize[d] = scale === 2 ? sig * (0.9 + 0.8 * r()) : scale === 1 ? sig * (0.3 + 0.3 * r()) : u * (0.18 + 0.26 * r());
        dustGain[d] = (scale === 2 ? 0.1 : scale === 1 ? 0.55 : 1) * (0.6 + 0.4 * r()) * (c === 0 ? 1 : c === 1 ? 0.6 : 0.7); d += 1;
      }
      k += 1;
    }
    range[2 * ei + 1] = v - range[2 * ei]!; dustRange[2 * ei + 1] = d - dustRange[2 * ei]!;
  });
  const f: Filaments = {pos: new Float32Array(V * 3), tan: new Float32Array(V * 3), side, width, along, gain, index, range, axis: new Float32Array(E * (AXIS + 1) * 3), radius: new Float32Array(E),
    dust: new Float32Array(grains * 3), dustSize, dustGain, dustRange, strands, segments: S, lod, recipe, dustRecipe};
  s.edges.forEach((e, ei) => { const c = bundleClass(s, e); f.radius[ei] = u * (c === 0 ? 0.5 + 0.55 * Math.sqrt(s.nodes[e.b]!.leaves) : c === 1 ? 0.3 : 0.45); });
  updateFilaments(f, s); return f;
}
const unitOf = (s: Scene) => Math.max(0.05, s.layout.extent * 0.011);

/** Recomputes every curve and grain from the current node positions (same topology, same recipe). Called when the illustrative motion moves the nodes. */
export function updateFilaments(f: Filaments, s: Scene): void {
  const S = f.segments, P = s.xyz, E = s.edges.length; const first = new Uint32Array(E + 1); { let k = 0; s.edges.forEach((e, i) => { first[i] = k; k += strandCount(s, e, f.lod); }); first[E] = k; }
  const ctl: number[] = [], line = new Float32Array((S + 1) * 3), t3 = [0, 0, 1];
  // clamped uniform cubic B-spline through the (straightened) route: smooth everywhere, exactly at the two end nodes
  const evalAt = (n: number, t: number, o: Float32Array | number[], oo: number) => {
    const segs = n - 3, x = Math.min(segs - 1e-9, Math.max(0, t * segs)), i = Math.floor(x), w = x - i, w2 = w * w, w3 = w2 * w;
    const b0 = (1 - 3 * w + 3 * w2 - w3) / 6, b1 = (3 * w3 - 6 * w2 + 4) / 6, b2 = (-3 * w3 + 3 * w2 + 3 * w + 1) / 6, b3 = w3 / 6;
    for (let c = 0; c < 3; c += 1) o[oo + c] = b0 * ctl[3 * i + c]! + b1 * ctl[3 * (i + 1) + c]! + b2 * ctl[3 * (i + 2) + c]! + b3 * ctl[3 * (i + 3) + c]!;
  };
  for (let ei = 0; ei < E; ei += 1) {
    const e = s.edges[ei]!, route = routeOf(s, e), n = route.length; const a = route[0]!, b = route[n - 1]!;
    const ax = P[3 * a]!, ay = P[3 * a + 1]!, az = P[3 * a + 2]!; let dx = P[3 * b]! - ax, dy = P[3 * b + 1]! - ay, dz = P[3 * b + 2]! - az; const len = Math.hypot(dx, dy, dz) || 1e-6;
    // frame across the chord, deterministic
    const r = rnd(hash32(`${e.id}|axis`)); const ux = dx / len, uy = dy / len, uz = dz / len; let px = r() - 0.5, py = r() - 0.5, pz = r() - 0.5; const dd = px * ux + py * uy + pz * uz; px -= dd * ux; py -= dd * uy; pz -= dd * uz; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
    // control polygon: the route nodes pulled toward the straight chord by (1 - BUNDLING); a two-node route gets one bowed middle point
    const pts: number[] = [];
    if (n === 2) { const bow = len * (0.07 + 0.09 * r()); pts.push(ax, ay, az, ax + dx / 2 + px * bow, ay + dy / 2 + py * bow, az + dz / 2 + pz * bow, ax + dx, ay + dy, az + dz); }
    else {
      // each route node pulls its control point SIDEWAYS from the straight chord (never along it, so a curve keeps advancing and cannot double back),
      // more in the middle of the route than at its ends, at most a fraction of the chord; the pulls are then smoothed so the curve does not zigzag
      const beta = bundlingOf(n), dsp = new Float32Array(n * 3);
      for (let k = 1; k < n - 1; k += 1) { const m = k / (n - 1), j = route[k]!, ease = Math.sin(Math.PI * m) ** EASE; let vx = (P[3 * j]! - (ax + dx * m)) * beta * ease, vy = (P[3 * j + 1]! - (ay + dy * m)) * beta * ease, vz = (P[3 * j + 2]! - (az + dz * m)) * beta * ease;
        const al = vx * ux + vy * uy + vz * uz; vx -= al * ux; vy -= al * uy; vz -= al * uz; const vl = Math.hypot(vx, vy, vz), cap = len * MAX_PULL * ease; if (vl > cap) { vx *= cap / vl; vy *= cap / vl; vz *= cap / vl; } dsp[3 * k] = vx; dsp[3 * k + 1] = vy; dsp[3 * k + 2] = vz; }
      for (let pass = 0; pass < 2; pass += 1) { const prev = Float32Array.from(dsp); for (let k = 1; k < n - 1; k += 1) for (let c = 0; c < 3; c += 1) dsp[3 * k + c] = 0.25 * prev[3 * (k - 1) + c]! + 0.5 * prev[3 * k + c]! + 0.25 * prev[3 * (k + 1) + c]!; }
      for (let k = 0; k < n; k += 1) { const m = k / (n - 1); pts.push(ax + dx * m + dsp[3 * k]!, ay + dy * m + dsp[3 * k + 1]!, az + dz * m + dsp[3 * k + 2]!); }
    }
    const m = pts.length / 3; ctl.length = 0; for (const rep of [0, 0]) ctl.push(pts[3 * rep]!, pts[3 * rep + 1]!, pts[3 * rep + 2]!); ctl.push(...pts); for (let rep = 0; rep < 2; rep += 1) ctl.push(pts[3 * (m - 1)]!, pts[3 * (m - 1) + 1]!, pts[3 * (m - 1) + 2]!);
    const cn = ctl.length / 3; for (let q = 0; q <= AXIS; q += 1) evalAt(cn, q / AXIS, f.axis, (ei * (AXIS + 1) + q) * 3);
    for (let k = first[ei]!; k < first[ei + 1]!; k += 1) {
      const o = k * RECIPE, tw = f.recipe[o + 3]!; let o1 = f.recipe[o + 1]!, o2 = f.recipe[o + 2]!; let v = k * (S + 1) * 2;
      // a strand never wanders further from its axis than a fraction of the edge length (short edges stay slim instead of curling)
      { const ol = Math.hypot(o1, o2), cap = len * MAX_OFFSET; if (ol > cap) { o1 *= cap / ol; o2 *= cap / ol; } }
      for (let q = 0; q <= S; q += 1) { const t = q / S; evalAt(cn, t, line, 3 * q); const e0 = Math.min(1, t / 0.34), e1 = Math.min(1, (1 - t) / 0.34), env = e0 * e0 * (3 - 2 * e0) * e1 * e1 * (3 - 2 * e1), // smooth plateau: zero slope at both nodes, so strands part and rejoin without a kink
           ca = Math.cos(tw * t), sa = Math.sin(tw * t), c1 = (o1 * ca - o2 * sa) * env, c2 = (o1 * sa + o2 * ca) * env; line[3 * q] += c1 * px + c2 * qx; line[3 * q + 1] += c1 * py + c2 * qy; line[3 * q + 2] += c1 * pz + c2 * qz; }
      for (let q = 0; q <= S; q += 1) {
        const i0 = Math.max(0, q - 1), i1 = Math.min(S, q + 1); const tx = line[3 * i1]! - line[3 * i0]!, ty = line[3 * i1 + 1]! - line[3 * i0 + 1]!, tz = line[3 * i1 + 2]! - line[3 * i0 + 2]!, tl = Math.hypot(tx, ty, tz); if (tl > 1e-9) { t3[0] = tx / tl; t3[1] = ty / tl; t3[2] = tz / tl; }
        for (let sd = 0; sd < 2; sd += 1) { f.pos[3 * v] = line[3 * q]!; f.pos[3 * v + 1] = line[3 * q + 1]!; f.pos[3 * v + 2] = line[3 * q + 2]!; f.tan[3 * v] = t3[0]!; f.tan[3 * v + 1] = t3[1]!; f.tan[3 * v + 2] = t3[2]!; v += 1; }
      }
    }
  }
  // grains ride their strand: a point of its centre line plus a small fixed scatter (so they stay inside the corridor)
  const G = f.dustSize.length, per = (S + 1) * 2;
  for (let g = 0; g < G; g += 1) { const q = g * DRECIPE, k = f.dustRecipe[q]!, x = f.dustRecipe[q + 1]! * S, i = Math.min(S - 1, Math.floor(x)), w = x - i, v0 = (k * per + 2 * i) * 3, v1 = v0 + 6;
    for (let c = 0; c < 3; c += 1) f.dust[3 * g + c] = f.pos[v0 + c]! * (1 - w) + f.pos[v1 + c]! * w + f.dustRecipe[q + 2 + c]!; }
}
