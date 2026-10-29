// Canvas 2D drawing of the Tower web. Pure functions over a 2D context: no React, no globals, redraw only on demand.
import type {TowerGraph, TowerNode} from './model.ts';
import type {TowerLayout} from './layout.ts';

export type Theme = 'dark' | 'light';
export type View = {k: number; x: number; y: number};
export type Show = {contain: boolean; depends: boolean; critical: boolean; articulation: boolean; voids: boolean};
export type SceneNode = {id: string; node: TowerNode; x: number; y: number; rad: number; fill: string; ring: string};
export type Scene = {g: TowerGraph; layout: TowerLayout; nodes: SceneNode[]; byId: Map<string, SceneNode>; hue: Map<string, number>};
export type DrawState = {view: View; w: number; h: number; dpr: number; theme: Theme; show: Show; selected: string | null; hover: string | null; focus: Set<string>};

const hashHue = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 360; };
const FIXED_HUE: Record<string, number> = {SCIENCE: 205, ENGINEERING: 38, OLYMPUS: 285};
export const domainHue = (d: string) => FIXED_HUE[d] ?? hashHue(d);

const PAL = {
  dark: {bg: '#0b0e14', text: '#d8dee9', dim: '#7d8798', contain: 'rgba(160,175,200,0.16)', depends: 'rgba(120,190,255,0.30)', contests: 'rgba(255,150,110,0.45)', crit: '#ffd166', art: '#ff6b9a', sel: '#ffffff', wedge: 0.07, void: 'rgba(255,255,255,0.18)'},
  light: {bg: '#f6f7f9', text: '#1d2430', dim: '#5c6675', contain: 'rgba(60,75,100,0.20)', depends: 'rgba(20,100,190,0.32)', contests: 'rgba(200,80,30,0.5)', crit: '#c47d00', art: '#c2185b', sel: '#000000', wedge: 0.09, void: 'rgba(0,0,0,0.22)'},
};
const VERDICT: Record<string, [string, string]> = { // [dark, light]
  CONFIRMED: ['#4ade80', '#15803d'], REFUTED: ['#f87171', '#b91c1c'], REVIEW: ['#fbbf24', '#b45309'], PROVISIONAL: ['#93c5fd', '#2563eb'],
  READY: ['#a5b4fc', '#4f46e5'], RUNNING: ['#67e8f9', '#0e7490'], CHECKPOINTED: ['#c4b5fd', '#6d28d9'], BLOCKED: ['#f0abfc', '#a21caf'],
  REJECTED: ['#fda4af', '#9f1239'], DISCARDED: ['#9ca3af', '#6b7280'],
};
export const VERDICT_KEYS = Object.keys(VERDICT);
export const verdictColor = (v: string | null, theme: Theme) => (v && VERDICT[v] ? VERDICT[v]![theme === 'dark' ? 0 : 1] : theme === 'dark' ? '#6b7280' : '#9ca3af');
export const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/** Node radius: tests by log-scaled betweenness (so hubs read as hubs without dwarfing everything), containers by log leaves. */
export function nodeRadius(g: TowerGraph, n: TowerNode): number {
  if (n.kind === 'test') {
    let bMax = 0; for (const v of g.metrics.betweenness.values()) if (v > bMax) bMax = v;
    const b = g.metrics.betweenness.get(n.id) ?? 0;
    return 2.2 + 4.3 * (bMax > 0 ? Math.log1p(9 * b / bMax) / Math.log1p(9) : 0);
  }
  if (n.kind === 'root') return 9;
  return (n.kind === 'domain' ? 7 : n.kind === 'subdomain' ? 5.5 : 4.5) + 1.2 * Math.log10(1 + n.leaves);
}

export function buildScene(g: TowerGraph, layout: TowerLayout): Scene {
  const hue = new Map(g.domains.map(d => [d, domainHue(d)] as const));
  const nodes: SceneNode[] = [];
  for (const node of g.nodes) {
    const p = layout.pos.get(node.id); if (!p) continue;
    nodes.push({id: node.id, node, x: p.x, y: p.y, rad: nodeRadius(g, node), fill: '', ring: ''});
  }
  return {g, layout, nodes, byId: new Map(nodes.map(n => [n.id, n] as const)), hue};
}

export function fitView(scene: Scene, w: number, h: number): View {
  const ext = (scene.layout.extent || 100) + 40;
  const k = Math.max(0.05, Math.min(w, h) / (2 * ext));
  return {k, x: w / 2, y: h / 2};
}
export const toWorld = (v: View, sx: number, sy: number) => ({x: (sx - v.x) / v.k, y: (sy - v.y) / v.k});

/** Nearest visible node within a small screen-space radius (brute force: a few thousand nodes is well below a frame). */
export function hitTest(scene: Scene, v: View, sx: number, sy: number): string | null {
  const {x, y} = toWorld(v, sx, sy);
  const tol = 6 / v.k;
  let best: string | null = null, bd = Infinity;
  for (const n of scene.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.rad + tol && d - n.rad < bd) { bd = d - n.rad; best = n.id; }
  }
  return best;
}

const curve = (ctx: CanvasRenderingContext2D, a: SceneNode, b: SceneNode) => {
  const cx = (a.x + b.x) * 0.5 * 0.3, cy = (a.y + b.y) * 0.5 * 0.3; // pull toward the Tower: lightweight edge bundling
  ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y);
};

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, st: DrawState): void {
  const pal = PAL[st.theme]; const {g, layout} = scene; const {view} = st;
  ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, st.w, st.h);
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
  const px = 1 / view.k;
  const dim = st.focus.size > 0;
  const lit = (id: string) => !dim || st.focus.has(id);

  // domain wedges + voids
  const R0 = layout.opts.radii.domain - 24, R1 = layout.extent + 22;
  for (const s of layout.sectors) {
    ctx.beginPath(); ctx.arc(0, 0, R1, s.a0, s.a1); ctx.arc(0, 0, R0, s.a1, s.a0, true); ctx.closePath();
    ctx.fillStyle = hsl(scene.hue.get(s.domain) ?? 0, 70, st.theme === 'dark' ? 60 : 45, pal.wedge); ctx.fill();
  }
  if (st.show.voids) {
    ctx.strokeStyle = pal.void; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]);
    for (const v of layout.voids) { for (const a of [v.a0, v.a1]) { ctx.beginPath(); ctx.moveTo(R0 * Math.cos(a), R0 * Math.sin(a)); ctx.lineTo(R1 * Math.cos(a), R1 * Math.sin(a)); ctx.stroke(); } }
    ctx.setLineDash([]);
  }

  // containment tree
  if (st.show.contain) {
    ctx.beginPath();
    for (const e of g.edges) { const a = scene.byId.get(e.source), b = scene.byId.get(e.target); if (!a || !b) continue; if (dim && !(lit(a.id) && lit(b.id))) continue; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.strokeStyle = pal.contain; ctx.lineWidth = px; ctx.stroke();
  }
  // dependency / contest links (bundled curves)
  if (st.show.depends) {
    for (const kind of ['depends', 'contests'] as const) {
      ctx.beginPath();
      for (const e of g.links) { if (e.kind !== kind) continue; const a = scene.byId.get(e.source), b = scene.byId.get(e.target); if (!a || !b) continue; if (dim && !(lit(a.id) && lit(b.id))) continue; curve(ctx, a, b); }
      ctx.strokeStyle = kind === 'depends' ? pal.depends : pal.contests; ctx.lineWidth = 1.1 * px; ctx.setLineDash(kind === 'contests' ? [3 * px, 3 * px] : []); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (st.show.critical && g.metrics.criticalPath.length > 1) {
    ctx.beginPath(); const p = g.metrics.criticalPath;
    for (let i = 1; i < p.length; i += 1) { const a = scene.byId.get(p[i - 1]!), b = scene.byId.get(p[i]!); if (a && b) curve(ctx, a, b); }
    ctx.strokeStyle = pal.crit; ctx.lineWidth = 1.8 * px; ctx.stroke();
  }

  // nodes, batched by fill
  const batches = new Map<string, SceneNode[]>();
  for (const n of scene.nodes) {
    const fill = n.node.kind === 'test' ? verdictColor(n.node.verdict, st.theme)
      : n.node.kind === 'root' ? pal.text
      : hsl(scene.hue.get(n.node.domain) ?? 0, n.node.unpublished ? 15 : 70, st.theme === 'dark' ? (n.node.kind === 'domain' ? 62 : n.node.kind === 'subdomain' ? 55 : 48) : (n.node.kind === 'domain' ? 42 : n.node.kind === 'subdomain' ? 48 : 54));
    (batches.get(fill) ?? batches.set(fill, []).get(fill)!).push(n);
  }
  for (const [fill, list] of batches) {
    ctx.beginPath();
    for (const n of list) { if (!lit(n.id)) continue; ctx.moveTo(n.x + n.rad, n.y); ctx.arc(n.x, n.y, n.rad, 0, Math.PI * 2); }
    ctx.fillStyle = fill; ctx.fill();
  }
  if (dim) { ctx.globalAlpha = 0.18; for (const [fill, list] of batches) { ctx.beginPath(); for (const n of list) { if (lit(n.id)) continue; ctx.moveTo(n.x + n.rad, n.y); ctx.arc(n.x, n.y, n.rad, 0, Math.PI * 2); } ctx.fillStyle = fill; ctx.fill(); } ctx.globalAlpha = 1; }
  if (st.show.articulation) {
    ctx.beginPath();
    for (const id of g.metrics.articulation) { const n = scene.byId.get(id); if (n && lit(id)) { ctx.moveTo(n.x + n.rad + 2.2 * px * 2, n.y); ctx.arc(n.x, n.y, n.rad + 2.2 * px * 2, 0, Math.PI * 2); } }
    ctx.strokeStyle = pal.art; ctx.lineWidth = 1.4 * px; ctx.stroke();
  }
  for (const id of [st.hover, st.selected]) {
    const n = id ? scene.byId.get(id) : null; if (!n) continue;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.rad + 4 * px, 0, Math.PI * 2); ctx.strokeStyle = pal.sel; ctx.lineWidth = (id === st.selected ? 2 : 1.2) * px; ctx.stroke();
  }

  // labels (level of detail by zoom): domains/subdomains always, campaigns when zoomed, tests when strongly zoomed or active
  ctx.fillStyle = pal.text; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const label = (n: SceneNode, size: number) => { ctx.font = `${size * px}px system-ui, sans-serif`; ctx.fillText(n.node.label.length > 28 ? `${n.node.label.slice(0, 27)}…` : n.node.label, n.x, n.y - n.rad - 3 * px); };
  for (const n of scene.nodes) {
    const kind = n.node.kind; const active = n.id === st.selected || n.id === st.hover;
    if (kind === 'root' || kind === 'domain') label(n, kind === 'root' ? 13 : 12);
    else if (kind === 'subdomain' && (view.k > 0.55 || active)) label(n, 10.5);
    else if (kind === 'campaign' && (view.k > 1.4 || active)) label(n, 10);
    else if (kind === 'test' && (view.k > 4 || active)) label(n, 10);
  }
  ctx.restore();
}
