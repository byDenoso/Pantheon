/** Filaments: the visual reading of relations the source already declares.
 *
 *  A filament is never a new fact. It is drawn only for an edge that exists in
 *  the projection, and its class is read from fields the source publishes
 *  (`domains[]`, `domain`, `relation_scope`). Nothing is inferred from similar
 *  names, and no filament upgrades a display relation into evidence: the whole
 *  layer is DERIVED_NOT_EVIDENCE.
 */
import {hashId} from './orbital-layout.mjs';

export const FILAMENT_AUTHORITY = 'DERIVED_NOT_EVIDENCE';

export const FILAMENT_LIMITS = Object.freeze({
 crossDomain: 20,
 intraDomain: 30,
 intraTest: 20,
 idle: 35,      // nothing selected: only the relations worth reading at a glance
 selected: 60   // a chosen neighbourhood may show more, still bounded
});

/** Speed windows in curve-fractions per second. Longer bridges travel slower so
 *  a cross-domain filament reads as a distant connection, not a wire. */
export const PULSE_SPEEDS = Object.freeze({
 'cross-domain': [0.10, 0.16],
 'intra-domain': [0.18, 0.28],
 'intra-test': [0.28, 0.42]
});

const unit = (id, salt) => (hashId(String(id) + '#' + salt) % 100000) / 100000;

/** Every domain the source declares for a node, never a guess. */
function declaredDomains(node) {
 const list = Array.isArray(node?.domains) ? node.domains : [];
 const all = [...list, node?.domain].map(d => (d == null ? '' : String(d))).filter(Boolean);
 return new Set(all);
}

/** Classifies one declared edge. Undeclared domains stay undeclared: a missing
 *  domain never becomes a cross-domain bridge. */
export function classifyEdge(a, b, edge = {}) {
 const scope = String(edge.relationScope || edge.relation_scope || edge.scope || '').toUpperCase();
 if (scope === 'CROSS_DOMAIN') return 'cross-domain';

 const union = new Set([...declaredDomains(a), ...declaredDomains(b)]);
 if (union.size > 1) return 'cross-domain';

 if (a?.type === 'TEST' && b?.type === 'TEST') return 'intra-test';
 return 'intra-domain';
}

/** Deterministic speed inside the class window, so a filament always pulses at
 *  the same rhythm for the same relation. */
export function pulseSpeed(kind, id) {
 const [min, max] = PULSE_SPEEDS[kind] || PULSE_SPEEDS['intra-domain'];
 return min + unit(id, 'speed') * (max - min);
}

/** Advances one pulse by real elapsed seconds.
 *  The phase travels A→B→A continuously: it reflects at both ends instead of
 *  restarting, and folding keeps it inside [0,1] even after a long stall. */
export function advancePulse(filament, dtSeconds) {
 const speed = Number(filament.speed) || 0;
 const dt = Math.max(0, Number(dtSeconds) || 0);
 const dir = filament.direction === -1 ? -1 : 1;
 const phase = Math.min(1, Math.max(0, Number(filament.phase) || 0));
 // unfold into a 0..2 saw so the reflection is a pure modulo, never a jump
 const unfolded = dir === 1 ? phase : 2 - phase;
 const moved = (unfolded + speed * dt) % 2;
 const next = moved < 0 ? moved + 2 : moved;
 filament.phase = next <= 1 ? next : 2 - next;
 filament.direction = next < 1 ? 1 : -1;
 return filament;
}

/** Control point for the filament curve in projected space.
 *  Cross-domain relations arc wider so they read as a bridge between
 *  constellations; relations inside one domain stay short and shallow. */
export function filamentControl(a, b, kind) {
 const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
 const bow = kind === 'cross-domain' ? 0.26 : kind === 'intra-domain' ? 0.15 : 0.09;
 const side = (a.x + a.y) <= (b.x + b.y) ? 1 : -1;
 const k = len * bow * side;
 return {cx: (a.x + b.x) / 2 - dy / len * k, cy: (a.y + b.y) / 2 + dx / len * k};
}

/** Point on the quadratic curve at t. Used for the travelling pulse and for
 *  edge hit-testing, so what is clicked is exactly what is drawn. */
export function quadraticBezierPoint(a, cp, b, t) {
 const u = 1 - t;
 return {x: u * u * a.x + 2 * u * t * cp.cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cp.cy + t * t * b.y};
}

const KIND_WEIGHT = {'cross-domain': 3, 'intra-domain': 2, 'intra-test': 1};
const CAP_KEY = {'cross-domain': 'crossDomain', 'intra-domain': 'intraDomain', 'intra-test': 'intraTest'};

/** Precomputes the filaments for a cut. Called when the dataset, the focus or
 *  the selection changes: never once per frame. */
export function buildFilaments(data, {selected = null, hover = null, limits = FILAMENT_LIMITS} = {}) {
 const nodes = new Map((data?.nodes || []).map(n => [n.id, n]));
 const focused = selected || hover;
 const candidates = [];

 for (const edge of data?.edges || []) {
  const a = nodes.get(edge.source), b = nodes.get(edge.target);
  if (!a || !b) continue;
  const kind = classifyEdge(a, b, edge);
  const near = !!focused && (edge.source === focused || edge.target === focused);
  const id = edge.id || `${edge.source}:${edge.type}:${edge.target}`;
  candidates.push({
   edge, kind, near,
   authority: FILAMENT_AUTHORITY,
   rank: (near ? 1000 : 0) + KIND_WEIGHT[kind] * 10 + unit(id, 'rank'),
   phase: unit(id, 'phase'),
   direction: unit(id, 'dir') > 0.5 ? 1 : -1,
   speed: pulseSpeed(kind, id)
  });
 }

 candidates.sort((x, y) => y.rank - x.rank);

 const total = focused ? limits.selected : limits.idle;
 const used = {crossDomain: 0, intraDomain: 0, intraTest: 0};
 const kept = [];
 for (const f of candidates) {
  if (kept.length >= total) break;
  const key = CAP_KEY[f.kind];
  if (used[key] >= limits[key]) continue;
  used[key]++;
  kept.push(f);
 }
 return kept;
}
