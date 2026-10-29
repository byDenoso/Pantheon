// Deterministic radial layout of the Tower hierarchy. No physics, no randomness: same graph => same picture.
//  * angle share of a node ∝ sqrt(1 + leaves) (large domains grow, but sub-linearly)
//  * domains are ordered greedily so strongly dependent domains sit next to each other (quotient-graph heuristic)
//  * the VOID between two neighbouring domains is a logarithmic function of how isolated they are, so a sparse pair can
//    never open an arbitrarily large hole:   gap = min + (max - min) · ln(1 + iso) / ln(1 + isoMax)
//  * tests fill their campaign's arc in rows, ordered by dependency layer (prerequisites toward the inside)
import {pairKey} from './graph.ts';
import type {TowerGraph, TowerNode} from './model.ts';

export type LayoutOptions = {
  gapMin: number; gapMax: number; gapBudget: number;
  radii: {domain: number; subdomain: number; campaign: number; test: number};
  minSpacing: number; rowGap: number; innerPad: number;
};
export const DEFAULTS: LayoutOptions = {
  gapMin: 0.035, gapMax: 0.28, gapBudget: 0.35, // radians; the budget caps all voids at 35% of the circle
  radii: {domain: 120, subdomain: 205, campaign: 290, test: 385}, minSpacing: 10, rowGap: 11, innerPad: 0.012,
};

/** Logarithmic void size. Monotonic in `iso`, equal to `min` at 0 and to `max` at `isoMax`; never outside [min, max] for iso in [0, isoMax]. */
export function voidGap(iso: number, isoMax: number, min: number, max: number): number {
  if (!(isoMax > 0) || !(iso > 0)) return min;
  const t = Math.log1p(Math.min(iso, isoMax)) / Math.log1p(isoMax);
  return min + (max - min) * t;
}

export interface Placed {x: number; y: number; r: number; a: number; a0: number; a1: number}
export interface Void {from: string; to: string; a0: number; a1: number; isolation: number; gap: number}
export interface TowerLayout {
  pos: Map<string, Placed>;
  sectors: Array<{domain: string; a0: number; a1: number}>;
  voids: Void[];
  order: string[];
  extent: number;
  opts: LayoutOptions;
}

const TAU = Math.PI * 2;
const weight = (n: TowerNode) => Math.sqrt(1 + n.leaves);

function orderDomains(g: TowerGraph): string[] {
  const doms = g.nodes.filter(n => n.kind === 'domain');
  if (doms.length <= 2) return doms.map(d => d.domain).sort((a, b) => (g.byId.get(`domain:${b}`)!.leaves - g.byId.get(`domain:${a}`)!.leaves) || a.localeCompare(b));
  const left = new Set(doms.map(d => d.domain));
  const leaves = (d: string) => g.byId.get(`domain:${d}`)!.leaves;
  const first = [...left].sort((a, b) => leaves(b) - leaves(a) || a.localeCompare(b))[0]!;
  const out = [first]; left.delete(first);
  while (left.size) {
    const last = out[out.length - 1]!;
    const next = [...left].sort((a, b) => (g.domainLinks.get(pairKey(last, b)) ?? 0) - (g.domainLinks.get(pairKey(last, a)) ?? 0) || leaves(b) - leaves(a) || a.localeCompare(b))[0]!;
    out.push(next); left.delete(next);
  }
  return out;
}

export function layoutTower(g: TowerGraph, partial: Partial<LayoutOptions> = {}): TowerLayout {
  const o: LayoutOptions = {...DEFAULTS, ...partial, radii: {...DEFAULTS.radii, ...partial.radii}};
  const pos = new Map<string, Placed>();
  const put = (id: string, r: number, a: number, a0: number, a1: number) => pos.set(id, {x: r * Math.cos(a), y: r * Math.sin(a), r, a, a0, a1});
  put('tower', 0, 0, 0, TAU);
  const order = orderDomains(g);
  const n = order.length;
  const sectors: TowerLayout['sectors'] = []; const voids: Void[] = [];
  if (n === 0) return {pos, sectors, voids, order, extent: 0, opts: o};

  // --- voids between consecutive domains (cyclic), logarithmic in isolation
  const dom = (d: string) => g.byId.get(`domain:${d}`)!;
  const pairs = n === 1 ? [] : order.map((d, i) => [d, order[(i + 1) % n]!] as const);
  const iso = pairs.map(([a, b]) => (dom(a).leaves + dom(b).leaves) / (1 + (g.domainLinks.get(pairKey(a, b)) ?? 0)));
  const isoMax = Math.max(0, ...iso);
  let gaps = iso.map(v => voidGap(v, isoMax, o.gapMin, o.gapMax));
  const total = gaps.reduce((s, v) => s + v, 0);
  const cap = TAU * o.gapBudget;
  if (total > cap) gaps = gaps.map(v => v * (cap / total));
  const avail = TAU - gaps.reduce((s, v) => s + v, 0);
  const sumW = order.reduce((s, d) => s + weight(dom(d)), 0);

  let cursor = -Math.PI / 2 + (gaps[n - 1] ?? 0) / 2; // start just after the last void, first sector at the top
  const assign = (node: TowerNode, a0: number, a1: number, depth: number) => {
    const mid = (a0 + a1) / 2;
    const ring = depth === 1 ? o.radii.domain : depth === 2 ? o.radii.subdomain : o.radii.campaign;
    if (node.kind === 'test') return;
    put(node.id, ring, mid, a0, a1);
    if (node.kind === 'campaign') { placeTests(node, a0, a1); return; }
    const kids = node.children.map(c => g.byId.get(c)!).sort((a, b) => Number(a.unpublished) - Number(b.unpublished) || b.leaves - a.leaves || a.id.localeCompare(b.id));
    const k = kids.length; if (!k) return;
    const pad = k > 1 ? Math.min(o.innerPad, ((a1 - a0) * 0.1) / (k - 1)) : 0;
    const room = (a1 - a0) - pad * (k - 1);
    const sw = kids.reduce((s, c) => s + weight(c), 0);
    let c0 = a0;
    for (const c of kids) { const w = room * weight(c) / sw; assign(c, c0, c0 + w, depth + 1); c0 += w + pad; }
  };
  const placeTests = (camp: TowerNode, a0: number, a1: number) => {
    const tests = camp.children.map(c => g.byId.get(c)!).sort((a, b) => (g.metrics.layer.get(a.id) ?? 0) - (g.metrics.layer.get(b.id) ?? 0) || a.id.localeCompare(b.id));
    const k = tests.length; if (!k) return;
    const arc = Math.max(1e-6, (a1 - a0) * o.radii.test);
    const cap = Math.max(1, Math.floor(arc / o.minSpacing));
    const rows = Math.ceil(k / cap), per = Math.ceil(k / rows);
    tests.forEach((t, i) => {
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, k - row * per);
      const a = a0 + ((col + 0.5) / inRow) * (a1 - a0);
      put(t.id, o.radii.test + row * o.rowGap, a, a0, a1);
    });
  };

  order.forEach((d, i) => {
    const w = avail * weight(dom(d)) / sumW;
    sectors.push({domain: d, a0: cursor, a1: cursor + w});
    assign(dom(d), cursor, cursor + w, 1);
    cursor += w;
    if (n > 1) { voids.push({from: d, to: pairs[i]![1], a0: cursor, a1: cursor + gaps[i]!, isolation: iso[i]!, gap: gaps[i]!}); cursor += gaps[i]!; }
  });
  let extent = 0;
  for (const p of pos.values()) extent = Math.max(extent, p.r);
  return {pos, sectors, voids, order, extent, opts: o};
}
