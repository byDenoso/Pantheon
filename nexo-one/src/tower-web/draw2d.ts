// 2D canvas of the Tower web. Two jobs, both pure over a 2D context:
//   drawFallback: the whole scene (threads + points) when WebGL2 is not available, from the same arrays and the same tokens as the shaders;
//   drawOverlay:  what sits on top of either renderer: observation box, selection / hover rings, birth pulses and labels.
import type {Camera} from './camera3d.ts';
import {project} from './camera3d.ts';
import {fogOf, projectScene, SELECTED_SIZE, type Scene, type Style} from './scene.ts';
import {rgba, TOKENS, type Theme} from './palette.ts';
import {AXIS, type Filaments} from './filaments.ts';

export const BIRTH_MS = 900;
export interface Frame2d {
  cam: Camera; w: number; h: number; dpr: number; theme: Theme; style: Style; selected: number | null; hover: number | null;
  /** age in ms of the births being shown, by node index (empty under reduced motion) */
  births: ReadonlyMap<number, number>;
  labels: boolean; box: boolean;
  /** 0 domains only, 1 + subdomains when close, 2 + campaigns when very close */
  labelLevel: 0 | 1 | 2;
}
const SANS = '"IBM Plex Sans", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
const A_BUCKETS = 6;
/** stroke widths of the fallback filaments, in px (a bundle is one curved stroke as wide as the bundle looks at its depth) */
export const FALLBACK_WIDTHS = [1, 2.2, 4.5, 8] as const;

export function drawFallback(ctx: CanvasRenderingContext2D, s: Scene, f: Frame2d, fil: Filaments): void {
  const t = TOKENS[f.theme]; projectScene(s, f.cam, f.w, f.h); const {sx, sy, sz} = s.proj;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = t.bg; ctx.fillRect(0, 0, f.w, f.h);
  const ext = s.layout.extent, dmin = f.cam.dist - ext, span = Math.max(1, 2 * ext); const base = f.theme === 'dark' ? 0.3 : 0.24;
  // filaments: the same routed axis as the WebGL strands, one smooth stroke per real edge, bucketed by width x opacity (a handful of strokes in all)
  const W = FALLBACK_WIDTHS, buckets: number[][] = Array.from({length: W.length * A_BUCKETS}, () => []); const A1 = AXIS + 1; const ax = new Float32Array(s.edges.length * A1 * 2);
  s.edges.forEach((e, i) => {
    const a = f.style.edge[i]!; if (a <= 0) return; let scale = 0, depth = 0;
    for (let q = 0; q < A1; q += 1) { const o = (i * A1 + q) * 3, c = project(f.cam, {x: fil.axis[o]!, y: fil.axis[o + 1]!, z: fil.axis[o + 2]!}, f.w, f.h); if (!c) return; ax[(i * A1 + q) * 2] = c.x; ax[(i * A1 + q) * 2 + 1] = c.y; if (q === A1 >> 1) { scale = c.scale; depth = c.depth; } }
    const px = 2 * fil.radius[i]! * scale; let wi = 0; while (wi < W.length - 1 && px > (W[wi]! + W[wi + 1]!) / 2) wi += 1;
    const k = Math.min(1, a) * fogOf(depth, dmin, span) * (wi === 0 ? Math.max(0.3, Math.min(1, px)) : 1); buckets[wi * A_BUCKETS + Math.min(A_BUCKETS - 1, Math.floor(k * A_BUCKETS))]!.push(i);
  });
  ctx.strokeStyle = t.mark; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // without WebGL there are no puffs: each corridor is two soft strokes, a wide faint one for the body of the cloud and a narrower one for its core
  for (const pass of [0, 1]) buckets.forEach((list, b) => { if (!list.length) return; const wi = Math.floor(b / A_BUCKETS), ai = b % A_BUCKETS; ctx.lineWidth = W[wi]! * (pass === 0 ? 4 : 1.4); ctx.globalAlpha = base * ((ai + 0.5) / A_BUCKETS) / (1 + 0.5 * wi) * (pass === 0 ? 0.22 : 0.55); ctx.beginPath(); for (const i of list) { const o = i * A1 * 2; ctx.moveTo(ax[o]!, ax[o + 1]!); for (let q = 1; q < A1; q += 1) ctx.lineTo(ax[o + 2 * q]!, ax[o + 2 * q + 1]!); } ctx.stroke(); });
  // points
  const ptBuckets: number[][] = Array.from({length: A_BUCKETS}, () => []);
  for (let i = 0; i < s.nodes.length; i += 1) { const a = f.style.node[i]!; if (a <= 0 || sz[i]! < 0 || i === f.selected) continue; ptBuckets[Math.min(A_BUCKETS - 1, Math.floor(a * (i === f.hover ? 1 : fogOf(sz[i]!, dmin, span)) * A_BUCKETS))]!.push(i); }
  ctx.fillStyle = t.mark;
  ptBuckets.forEach((list, b) => { if (!list.length) return; ctx.globalAlpha = 0.75 * (b + 0.5) / A_BUCKETS; ctx.beginPath(); for (const i of list) { const r = Math.max(0.75, s.size[i]! * 0.8); ctx.moveTo(sx[i]! + r, sy[i]!); ctx.arc(sx[i]!, sy[i]!, r, 0, Math.PI * 2); } ctx.fill(); });
  if (f.selected !== null && sz[f.selected]! >= 0 && f.style.node[f.selected]! > 0) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(sx[f.selected]!, sy[f.selected]!, SELECTED_SIZE / 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

/** Returns true while a birth pulse is still running. `clear` wipes the canvas first (the WebGL layer shows through). */
export function drawOverlay(ctx: CanvasRenderingContext2D, s: Scene, f: Frame2d, clear: boolean): boolean {
  const t = TOKENS[f.theme]; projectScene(s, f.cam, f.w, f.h); const {sx, sy, sz} = s.proj;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; if (clear) ctx.clearRect(0, 0, f.w, f.h);
  if (f.box && s.layout.box) {
    const b = s.layout.box, c = s.layout.center, m = 1.32; const P = Array.from({length: 8}, (_, i) => project(f.cam, {x: c.x + (i & 1 ? b.hx : -b.hx) * m, y: c.y + (i & 2 ? b.hy : -b.hy) * m, z: c.z + (i & 4 ? b.hz : -b.hz) * m}, f.w, f.h));
    ctx.beginPath(); for (let i = 0; i < 8; i += 1) for (const bit of [1, 2, 4]) { if (i & bit) continue; const p = P[i], q = P[i | bit]; if (p && q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); } }
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(t.secondary, f.theme === 'dark' ? 0.28 : 0.34); ctx.stroke();
  }
  let animating = false;
  for (const [i, age] of f.births) { if (age >= BIRTH_MS || sz[i]! < 0 || f.style.node[i]! <= 0) continue; animating = true; const k = age / BIRTH_MS; ctx.beginPath(); ctx.arc(sx[i]!, sy[i]!, s.size[i]! / 2 + 2 + 7 * k, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = rgba(t.ring, (1 - k) * 0.7); ctx.stroke(); }
  if (f.hover !== null && f.hover !== f.selected && sz[f.hover]! >= 0) { ctx.beginPath(); ctx.arc(sx[f.hover]!, sy[f.hover]!, s.size[f.hover]! / 2 + 4, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = rgba(t.ring, 0.6); ctx.stroke(); }
  if (f.selected !== null && sz[f.selected]! >= 0) { ctx.beginPath(); ctx.arc(sx[f.selected]!, sy[f.selected]!, SELECTED_SIZE / 2 + 4, 0, Math.PI * 2); ctx.lineWidth = 1.25; ctx.strokeStyle = t.ring; ctx.stroke(); }
  if (f.labels) {
    const ext = s.layout.extent; const text = (str: string, x: number, y: number, font: string, color: string) => { ctx.font = font; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(t.bg, 0.88); ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y); };
    const cut = (l: string) => (l.length > 30 ? `${l.slice(0, 29)}…` : l); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const done = new Set<number>(); const label = (i: number, strong: boolean) => {
      if (done.has(i) || sz[i]! < 0 || f.style.node[i]! <= 0) return; done.add(i); const n = s.nodes[i]!; const x = sx[i]! + s.size[i]! / 2 + 7, y = sy[i]!;
      text(cut(n.label), x, y, `${strong ? 600 : 500} 13px ${SANS}`, strong ? t.text : t.secondary);
      if (n.kind !== 'test') { const w = ctx.measureText(cut(n.label))?.width ?? 0; text(String(n.leaves), x + w + 7, y + 0.5, `11px ${MONO}`, t.secondary); }
    };
    if (f.selected !== null) label(f.selected, true);
    if (f.hover !== null) label(f.hover, true);
    s.nodes.forEach((n, i) => { if (n.kind === 'domain' || (n.kind === 'subdomain' && f.labelLevel >= 1 && f.cam.dist < ext * 1.5) || (n.kind === 'campaign' && f.labelLevel >= 2 && f.cam.dist < ext * 0.8)) label(i, n.kind === 'domain'); });
    if (f.selected !== null && s.adj[f.selected]!.length <= 12) for (const j of s.adj[f.selected]!) label(j, false);
  }
  return animating;
}
