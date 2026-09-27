import type { SystemState } from '../contracts/system.ts';

/** Connectome read model. Every position and every encoding here is derived from the
 * published graph: nothing is placed by hand and nothing is decorative.
 *
 * Mapping:
 *   soma      = domain, sized by the subtree it owns
 *   dendrite  = OWNS hierarchy, thickness by carried mass
 *   myelin    = completed test, rationed by the canonical lane count
 *   growth cone = READY test, a tip still looking for a connection
 *   pruned    = BLOCKED test, visible but no longer conducting
 *   axon      = filament between two domains, traffic by measured weight
 *   collateral synapse = SUPPORTS edge
 *   burst     = soma waiting for a human decision; it does not stop on its own
 */

export const CONNECTOME_DOMAINS = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'] as const;
export type ConnectomeDomain = typeof CONNECTOME_DOMAINS[number];

/** Lightness-equalised: the published palette spans 16 CIE L* points, which makes
 * lighter domains read as more important than darker ones regardless of the data.
 * These four sit within 1.2 points of each other and keep their hues. */
export const CONNECTOME_RGB: Record<ConnectomeDomain, [number, number, number]> = {
  NEXO: [223, 170, 83], SCIENCE: [99, 187, 250], ENGINEERING: [93, 199, 145], OLYMPUS: [255, 139, 189],
};

export const AXON_CONDUCTION = { ESTABLISHED: 1, PROVISIONAL: 0.5, TESTING: 0.24 } as const;

export interface LaneCounts { tests: number; done: number; running: number; ready: number }

export interface ConnectomeNode {
  id: string;
  type: string;
  domain: ConnectomeDomain;
  status: 'DONE' | 'READY' | 'BLOCKED' | 'OTHER';
  label: string;
  x: number;
  y: number;
  z: number;
  mass: number;
  parent: number;
  children: number[];
  myelinated: boolean;
}

export interface ConnectomeAxon {
  from: ConnectomeDomain;
  to: ConnectomeDomain;
  a: number;
  b: number;
  weight: number;
  conduction: number;
  status: string;
}

export interface ConnectomeModel {
  nodes: ConnectomeNode[];
  axons: ConnectomeAxon[];
  supports: Array<[number, number]>;
  somata: Partial<Record<ConnectomeDomain, number>>;
  lanes: Partial<Record<ConnectomeDomain, LaneCounts>>;
  attention: Partial<Record<ConnectomeDomain, boolean>>;
  selfLoops: number;
}

const LANE_RE = /(\d+)\s+testes\D+(\d+)\s+conclu\D+(\d+)\s+em andamento\D+(\d+)\s+prontos/;

export function parseLane(text: string): LaneCounts | null {
  const m = String(text ?? '').match(LANE_RE);
  return m ? { tests: +m[1], done: +m[2], running: +m[3], ready: +m[4] } : null;
}

function asDomain(value: unknown): ConnectomeDomain {
  const d = String(value ?? '').toUpperCase();
  return (CONNECTOME_DOMAINS as readonly string[]).includes(d) ? d as ConnectomeDomain : 'NEXO';
}

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

export function buildConnectome(state: Pick<SystemState, 'graph' | 'filaments' | 'lanes' | 'guardian'>,
                                { iterations = 520, radius = 150, seed = 7 } = {}): ConnectomeModel {
  const rnd = seeded(seed);
  const src = state.graph?.nodes ?? [];
  const id2i = new Map<string, number>();
  src.forEach((n, i) => id2i.set(n.id, i));
  const n = src.length;

  const nodes: ConnectomeNode[] = src.map(g => {
    const group = String(g.status_group ?? '').toUpperCase();
    return {
      id: g.id, type: String(g.type), domain: asDomain(g.domain), label: String(g.label ?? g.id),
      status: group === 'DONE' ? 'DONE' : group === 'READY' ? 'READY' : group === 'BLOCKED' ? 'BLOCKED' : 'OTHER',
      x: 0, y: 0, z: 0, mass: 1, parent: -1, children: [], myelinated: false,
    };
  });

  /* edges: OWNS binds a child to its parent; SUPPORTS is a weaker cross-link that
     must not collapse the hierarchy */
  const springs: Array<{ a: number; b: number; w: number }> = [];
  const supports: Array<[number, number]> = [];
  for (const e of state.graph?.edges ?? []) {
    const a = id2i.get(e.from), b = id2i.get(e.to);
    if (a === undefined || b === undefined) continue;
    if (e.kind === 'OWNS') {
      nodes[a].children.push(b);
      if (nodes[b].parent < 0) nodes[b].parent = a;
      springs.push({ a, b, w: 1.0 });
    } else if (e.kind === 'SUPPORTS') {
      supports.push([a, b]);
      springs.push({ a, b, w: 0.35 });
    }
  }

  const somata: Partial<Record<ConnectomeDomain, number>> = {};
  nodes.forEach((node, i) => { if (node.type === 'DOMAIN' && somata[node.domain] === undefined) somata[node.domain] = i; });

  /* filaments between two domains become springs, aggregated per pair and damped by
     sqrt(count): sixteen parallel filaments would otherwise fuse the pair into one blob */
  const axons: ConnectomeAxon[] = [];
  const agg = new Map<string, { a: number; b: number; sum: number; n: number }>();
  let selfLoops = 0;
  for (const f of state.filaments ?? []) {
    const from = asDomain(f.from_domain ?? f.domain), to = asDomain(f.to_domain ?? f.domain);
    if (from === to) { selfLoops++; continue; }
    const a = somata[from], b = somata[to];
    if (a === undefined || b === undefined) continue;
    const status = String(f.status);
    const conduction = (AXON_CONDUCTION as Record<string, number>)[status] ?? 0.24;
    axons.push({ from, to, a, b, weight: Number(f.weight) || 0.5, conduction, status });
    const key = Math.min(a, b) + ':' + Math.max(a, b);
    const g = agg.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), sum: 0, n: 0 };
    g.sum += Number(f.weight) || 0.5; g.n++; agg.set(key, g);
  }
  agg.forEach(g => springs.push({ a: g.a, b: g.b, w: Math.min(2.0, (g.sum / g.n) * Math.sqrt(g.n)) }));

  /* subtree mass over OWNS, iterative post-order */
  const order: number[] = [], seen = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    if (nodes[r].parent >= 0) continue;
    const stack = [r];
    while (stack.length) {
      const v = stack.pop()!;
      if (seen[v]) continue;
      seen[v] = 1; order.push(v);
      for (const c of nodes[v].children) if (!seen[c]) stack.push(c);
    }
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const v = order[k];
    for (const c of nodes[v].children) nodes[v].mass += nodes[c].mass;
  }

  /* force-directed layout */
  const P = new Float64Array(n * 3), F = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const rr = radius * (nodes[i].type === 'DOMAIN' ? 0.9 : 1.5) * (0.4 + rnd() * 0.6);
    const th = rnd() * 6.2831853, ph = Math.acos(rnd() * 2 - 1);
    P[i * 3] = rr * Math.sin(ph) * Math.cos(th); P[i * 3 + 1] = rr * Math.cos(ph); P[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
  }
  const K = radius * 0.55;
  for (let it = 0; it < iterations; it++) {
    F.fill(0);
    const temp = 1 - it / iterations;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-3, d = Math.sqrt(d2);
        let rep = K * K * Math.sqrt(nodes[a].mass * nodes[b].mass) / d2;
        /* domains are extended somata, not points: they keep clear of each other */
        if (nodes[a].type === 'DOMAIN' && nodes[b].type === 'DOMAIN') rep *= 3.4;
        if (rep > K * 3) rep = K * 3;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        F[a * 3] += ux * rep; F[a * 3 + 1] += uy * rep; F[a * 3 + 2] += uz * rep;
        F[b * 3] -= ux * rep; F[b * 3 + 1] -= uy * rep; F[b * 3 + 2] -= uz * rep;
      }
    }
    for (const s of springs) {
      const dx = P[s.a * 3] - P[s.b * 3], dy = P[s.a * 3 + 1] - P[s.b * 3 + 1], dz = P[s.a * 3 + 2] - P[s.b * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const att = s.w * (d - K / (0.6 + s.w)) * 0.06;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      F[s.a * 3] -= ux * att; F[s.a * 3 + 1] -= uy * att; F[s.a * 3 + 2] -= uz * att;
      F[s.b * 3] += ux * att; F[s.b * 3 + 1] += uy * att; F[s.b * 3 + 2] += uz * att;
    }
    const step = radius * 0.055 * temp + radius * 0.004;
    for (let i = 0; i < n; i++) {
      const inv = 1 / Math.sqrt(nodes[i].mass);
      const fx = F[i * 3] * inv, fy = F[i * 3 + 1] * inv, fz = F[i * 3 + 2] * inv;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) + 1e-9, cap = Math.min(fl, step) / fl;
      P[i * 3] += fx * cap; P[i * 3 + 1] += fy * cap; P[i * 3 + 2] += fz * cap;
      P[i * 3 + 1] *= 0.9975;
    }
  }
  let bx = 0, by = 0, bz = 0, M = 0;
  for (let i = 0; i < n; i++) { bx += P[i * 3] * nodes[i].mass; by += P[i * 3 + 1] * nodes[i].mass; bz += P[i * 3 + 2] * nodes[i].mass; M += nodes[i].mass; }
  if (M) { bx /= M; by /= M; bz /= M; }
  nodes.forEach((node, i) => { node.x = P[i * 3] - bx; node.y = P[i * 3 + 1] - by; node.z = P[i * 3 + 2] - bz; });

  /* completion comes from the Tower lanes, never from graph status_group, which
     collapses CHECKPOINTED into DONE */
  const lanes: Partial<Record<ConnectomeDomain, LaneCounts>> = {};
  for (const l of state.lanes ?? []) {
    const c = parseLane(l.current_state);
    if (c) lanes[asDomain(l.domain)] = c;
  }
  const budget: Record<string, number> = {};
  CONNECTOME_DOMAINS.forEach(d => { budget[d] = lanes[d]?.done ?? 0; });
  for (const node of nodes) {
    if (node.type === 'TEST' && node.status === 'DONE' && budget[node.domain] > 0) { node.myelinated = true; budget[node.domain]--; }
  }

  const attention: Partial<Record<ConnectomeDomain, boolean>> = {};
  if ((state.guardian?.failing_areas ?? []).length) attention.NEXO = true;
  CONNECTOME_DOMAINS.forEach(d => { const q = lanes[d]; if (q && q.tests > 0 && q.done === 0 && q.ready === 0) attention[d] = true; });

  return { nodes, axons, supports, somata, lanes, attention, selfLoops };
}

/** Distance between two domain somata in layout space. */
export function somaDistance(model: ConnectomeModel, a: ConnectomeDomain, b: ConnectomeDomain): number {
  const i = model.somata[a], j = model.somata[b];
  if (i === undefined || j === undefined) return NaN;
  const p = model.nodes[i], q = model.nodes[j];
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
