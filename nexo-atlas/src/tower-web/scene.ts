// The Tower web as a drawable scene: every node (domain, subdomain, campaign, test) is one point, every REAL edge (hierarchy, dependency,
// contest) is one segment. Nothing else is drawn: no nearest-neighbour edges, no aggregate trunks, no decorative particles, no inferred mass.
// Pure: no DOM, no WebGL. Filters, search and sampling change VISIBILITY only, never positions.
import type {TowerGraph, TowerNode} from './model.ts';
import {hash32, type CosmosLayout} from './embed3d.ts';
import {projectAll, type Camera} from './camera3d.ts';

export const KINDS = ['domain', 'subdomain', 'campaign', 'test'] as const;
export type SceneKind = typeof KINDS[number];
/** 0 hierarchy (contains), 1 dependency, 2 contest */
export type SceneEdgeKind = 0 | 1 | 2;
export interface SceneEdge {a: number; b: number; kind: SceneEdgeKind; id: string}
export interface Scene {
  g: TowerGraph; layout: CosmosLayout;
  nodes: TowerNode[]; index: Map<string, number>;
  /** live positions, flattened xyz (the illustrative motion may move them; layout.pos is never mutated) */
  xyz: Float32Array;
  /** index into KINDS */
  kind: Uint8Array;
  /** number of real edges incident to the node */
  degree: Uint16Array; maxDegree: number;
  /** point diameter in CSS px, from the real degree, capped */
  size: Float32Array;
  edges: SceneEdge[]; adj: number[][];
  proj: {sx: Float32Array; sy: Float32Array; sz: Float32Array; ss: Float32Array}; sig: string;
}

/** Diameter in px: 1.5-3 for ordinary nodes (degree <= 4), 3-5 for hubs, growing with the real degree up to a ceiling. */
export const HUB_DEGREE = 4, DEGREE_CAP = 16;
export function sizeOf(degree: number): number {
  if (degree <= HUB_DEGREE) return 1.5 + 1.5 * Math.max(0, degree) / HUB_DEGREE;
  return 3 + 2 * Math.min(1, (degree - HUB_DEGREE) / (DEGREE_CAP - HUB_DEGREE));
}
export const SELECTED_SIZE = 6;

export function buildScene(g: TowerGraph, layout: CosmosLayout): Scene {
  const nodes = g.nodes.filter(n => n.kind !== 'root' && layout.pos.has(n.id)); const N = nodes.length;
  const index = new Map(nodes.map((n, i) => [n.id, i] as const));
  const xyz = new Float32Array(N * 3), kind = new Uint8Array(N), degree = new Uint16Array(N), size = new Float32Array(N);
  nodes.forEach((n, i) => { const p = layout.pos.get(n.id)!; xyz[3 * i] = p.x; xyz[3 * i + 1] = p.y; xyz[3 * i + 2] = p.z; kind[i] = KINDS.indexOf(n.kind as SceneKind); });
  const edges: SceneEdge[] = []; const adj: number[][] = Array.from({length: N}, () => []);
  const push = (s: string, t: string, k: SceneEdgeKind, id: string) => { const a = index.get(s), b = index.get(t); if (a === undefined || b === undefined || a === b) return; edges.push({a, b, kind: k, id}); adj[a]!.push(b); adj[b]!.push(a); degree[a] += 1; degree[b] += 1; };
  for (const e of g.edges) if (e.kind === 'contains') push(e.source, e.target, 0, e.id); // the Tower root is not in the index: it is the volume, never an endpoint
  for (const l of g.links) push(l.source, l.target, l.kind === 'contests' ? 2 : 1, l.id);
  let maxDegree = 0; for (let i = 0; i < N; i += 1) { size[i] = sizeOf(degree[i]!); if (degree[i]! > maxDegree) maxDegree = degree[i]!; }
  return {g, layout, nodes, index, xyz, kind, degree, maxDegree, size, edges, adj,
    proj: {sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N), ss: new Float32Array(N)}, sig: ''};
}

export interface Filter {
  kinds: ReadonlySet<SceneKind>;
  /** hide nodes with fewer real connections than this */
  minDegree: number;
  /** replay: epoch ms; tests created after it, or without a published creation date, are hidden. null = today (everything) */
  cut: number | null;
}
export const ALL_KINDS: ReadonlySet<SceneKind> = new Set(KINDS);
export const NO_FILTER: Filter = {kinds: ALL_KINDS, minDegree: 0, cut: null};
export interface Visibility {node: Uint8Array; visible: number; total: number}

/** Which nodes are visible under the filter. Under a replay cut a container is visible only while it has a visible test below it. */
export function visibility(s: Scene, f: Filter): Visibility {
  const N = s.nodes.length, node = new Uint8Array(N); let alive: Uint8Array | null = null;
  if (f.cut !== null) {
    alive = new Uint8Array(N);
    s.nodes.forEach((n, i) => { if (n.kind !== 'test' || n.born === null || n.born > f.cut!) return; alive![i] = 1; let p = n.parent; while (p) { const j = s.index.get(p); if (j === undefined || alive![j]) break; alive![j] = 1; p = s.nodes[j]!.parent; } });
  }
  let visible = 0;
  for (let i = 0; i < N; i += 1) { if ((alive && !alive[i]) || s.degree[i]! < f.minDegree || !f.kinds.has(KINDS[s.kind[i]!]!)) continue; node[i] = 1; visible += 1; }
  return {node, visible, total: N};
}

export interface EdgeSample {edge: Uint8Array; shown: number; total: number; sampled: boolean}
/**
 * Edges whose two endpoints are visible; above `budget` a deterministic sample by hash of the edge id is kept (the same edges every frame and
 * every session), and the edges of `keep` (the selected node) always stay. `total` is the count before sampling: the UI shows shown/total.
 */
export function sampleEdges(s: Scene, node: Uint8Array, budget: number, keep: number | null = null, kinds: {hierarchy: boolean; depends: boolean} = {hierarchy: true, depends: true}): EdgeSample {
  const E = s.edges.length, edge = new Uint8Array(E); let total = 0;
  for (let i = 0; i < E; i += 1) { const e = s.edges[i]!; if (!node[e.a] || !node[e.b] || (e.kind === 0 ? !kinds.hierarchy : !kinds.depends)) continue; edge[i] = 1; total += 1; }
  if (total <= budget) return {edge, shown: total, total, sampled: false};
  const ratio = Math.max(0, budget) / total; let shown = 0;
  for (let i = 0; i < E; i += 1) { if (!edge[i]) continue; const e = s.edges[i]!; if ((keep !== null && (e.a === keep || e.b === keep)) || hash32(e.id) / 4294967296 < ratio) shown += 1; else edge[i] = 0; }
  return {edge, shown, total, sampled: true};
}

export interface Style {node: Float32Array; edge: Float32Array}
const EDGE_ALPHA = [0.5, 1, 1] as const;
/** opacity of everything that is not the selection or one of its real neighbours */
export const DIM = 0.35; // hierarchy threads are fainter than dependencies / contests
/** Per-node and per-edge opacity factors in [0, 1] for both renderers: hidden = 0; with a selection, it and its real neighbours stay at 1. */
export function styleOf(s: Scene, node: Uint8Array, edge: Uint8Array, selected: number | null): Style {
  const N = s.nodes.length, na = new Float32Array(N), ea = new Float32Array(s.edges.length);
  const near = selected === null ? null : new Set<number>([selected, ...s.adj[selected]!]);
  for (let i = 0; i < N; i += 1) na[i] = node[i] ? (near && !near.has(i) ? DIM : 1) : 0;
  for (let i = 0; i < ea.length; i += 1) { if (!edge[i]) continue; const e = s.edges[i]!; ea[i] = selected === null ? EDGE_ALPHA[e.kind] : (e.a === selected || e.b === selected ? 1 : 0.4 * EDGE_ALPHA[e.kind]); }
  return {node: na, edge: ea};
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const bareId = (id: string) => id.replace(/^(?:domain|subdomain|campaign|test):/, '');
/** Search by existing label or id (accent- and case-insensitive). Prefix matches first, then by kind and label. Never fuzzy-invents a result. */
export function searchNodes(s: Scene, query: string, limit = 8, node: Uint8Array | null = null): number[] {
  const q = fold(query.trim()); if (!q) return [];
  const hits: Array<[number, number]> = [];
  s.nodes.forEach((n, i) => { const l = fold(n.label), id = fold(bareId(n.id)); const r = l.startsWith(q) ? 0 : id.startsWith(q) ? 1 : l.includes(q) ? 2 : id.includes(q) ? 3 : -1; if (r >= 0) hits.push([r + (node && !node[i] ? 4 : 0), i]); });
  hits.sort((a, b) => a[0] - b[0] || s.kind[a[1]]! - s.kind[b[1]]! || s.nodes[a[1]]!.label.localeCompare(s.nodes[b[1]]!.label) || a[1] - b[1]);
  return hits.slice(0, limit).map(h => h[1]);
}

const sigOf = (c: Camera, w: number, h: number) => `${c.yaw}|${c.pitch}|${c.dist}|${c.focal}|${c.target.x}|${c.target.y}|${c.target.z}|${w}x${h}`;
export function projectScene(s: Scene, cam: Camera, w: number, h: number): void { const sig = sigOf(cam, w, h); if (sig === s.sig) return; s.sig = sig; projectAll(cam, s.xyz, w, h, s.proj); }
/** Node under the pointer: the one nearest the eye among those within reach (reach >= 8 px so small points stay pickable by touch). */
export function hitTest(s: Scene, x: number, y: number, node: Uint8Array | null = null): number | null {
  const {sx, sy, sz} = s.proj; let best = -1, bz = Infinity;
  for (let i = 0; i < s.nodes.length; i += 1) {
    if (sz[i]! < 0 || (node && !node[i])) continue; const r = Math.max(8, s.size[i]! / 2 + 5), dx = sx[i]! - x, dy = sy[i]! - y;
    if (dx * dx + dy * dy <= r * r && sz[i]! < bz) { bz = sz[i]!; best = i; }
  }
  return best < 0 ? null : best;
}
/** Depth attenuation shared by both renderers: 1 at the near side of the volume, 0.16 at the far side (smooth). */
export const fogOf = (depth: number, dmin: number, span: number) => { const t = Math.max(0, Math.min(1, (depth - dmin) / span)); return 1 - 0.84 * t * t * (3 - 2 * t); };
