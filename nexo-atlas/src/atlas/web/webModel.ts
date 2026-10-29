// Synthetic, seeded "cosmic web" for the public hero. Purely decorative: it carries
// no data and no names. Positions come from a PRNG, never from any API.
export type WebQuality = {nodes: number; arcs: number; dprCap: number; glow: boolean};
export const QUALITY: Record<'high' | 'medium' | 'low', WebQuality> = {
  high: {nodes: 420, arcs: 520, dprCap: 2, glow: true},
  medium: {nodes: 240, arcs: 280, dprCap: 1.5, glow: true},
  low: {nodes: 110, arcs: 120, dprCap: 1, glow: false},
};
export const HARD_LIMITS = {nodes: 500, arcs: 600} as const;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Node3 = {x: number; y: number; z: number; r: number};
export type Web = {nodes: Node3[]; arcs: [number, number][]};

export function buildWeb(seed: number, q: WebQuality): Web {
  const rnd = mulberry32(seed);
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
  const total = Math.min(q.nodes, HARD_LIMITS.nodes);
  const hubs = Math.max(4, Math.round(total / 40));
  const hubPos: Node3[] = [];
  for (let i = 0; i < hubs; i++) hubPos.push({x: (rnd() - 0.5) * 2.2, y: (rnd() - 0.5) * 1.4, z: (rnd() - 0.5) * 2.2, r: 2.2});
  const nodes: Node3[] = hubPos.slice();
  while (nodes.length < total) {
    const h = hubPos[Math.floor(rnd() * hubs)]!;
    nodes.push({x: h.x + gauss() * 0.28, y: h.y + gauss() * 0.2, z: h.z + gauss() * 0.28, r: 0.7 + rnd() * 0.9});
  }
  const arcs: [number, number][] = [];
  const maxArcs = Math.min(q.arcs, HARD_LIMITS.arcs);
  const seen = new Set<number>();
  for (let i = 0; i < nodes.length && arcs.length < maxArcs; i++) {
    // nearest two among a bounded window keeps construction O(n * window)
    let b1 = -1, b2 = -1, d1 = Infinity, d2 = Infinity;
    for (let k = 1; k <= 24; k++) {
      const j = (i + k * 7) % nodes.length;
      if (j === i) continue;
      const a = nodes[i]!, b = nodes[j]!;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
      if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j; } else if (d < d2) { d2 = d; b2 = j; }
    }
    for (const j of [b1, b2]) {
      if (j < 0 || arcs.length >= maxArcs) continue;
      const key = Math.min(i, j) * 100000 + Math.max(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      arcs.push([i, j]);
    }
  }
  return {nodes, arcs};
}

export function project(n: Node3, angle: number, w: number, h: number, cx = w / 2) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = n.x * c - n.z * s;
  const z = n.x * s + n.z * c;
  const persp = 1 / (1 + (z + 1.6) * 0.32);
  const scale = Math.min(w, h) * 0.55;
  return {sx: cx + x * scale * persp, sy: h / 2 + n.y * scale * persp, depth: persp};
}

/** EMA of frame cost; downgrades one step when above budget. */
export function nextQuality(cur: keyof typeof QUALITY, emaMs: number, budgetMs = 10): keyof typeof QUALITY {
  if (emaMs <= budgetMs) return cur;
  return cur === 'high' ? 'medium' : 'low';
}
export function initialQuality(width: number, cores: number | undefined, mem: number | undefined): keyof typeof QUALITY {
  if (width < 520 || (cores !== undefined && cores <= 2) || (mem !== undefined && mem <= 2)) return 'low';
  if (width < 900 || (cores !== undefined && cores <= 4)) return 'medium';
  return 'high';
}
