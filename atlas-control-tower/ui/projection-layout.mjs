/** Layout and level of detail for a graph projection.
 *
 *  Pure geometry and pure budget decisions: rows in, coordinates out. The
 *  renderer owns pixels, this module owns where things belong and how many of
 *  them are worth drawing at the current camera.
 *
 *  Depth is semantic. A node's Z comes from its tier inside its layer and from
 *  its layer's band inside the composition, so moving toward the camera always
 *  means the same thing: closer to the origin of the truth. */

export const SHELL = Object.freeze({
 innerRadius: 96,     // the first tier sits near the core, not on it
 outerRadius: 470,    // the last tier, before the vignette
 depth: 330,          // half-span of the Z axis in world units
 sectorPadding: 0.16, // radians kept clear between constellation sectors
 jitter: 0.22         // deterministic in-ring spread so rings never look printed
});

/** Deterministic per-id noise in [0,1). Same node, same seat, every render. */
export function seed(id) {
 let h = 2166136261;
 const s = String(id);
 for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
 return ((h >>> 0) % 100000) / 100000;
}

/** Groups nodes into constellations: one sector of the ring per cluster key.
 *  A node with no cluster falls into a shared sector rather than being scattered,
 *  so "unclustered" reads as a place instead of as noise. */
export function constellations(nodes, {key = n => n.domain || n.layer || ''} = {}) {
 const groups = new Map();
 for (const n of nodes) {
  const id = String(key(n) || '—');
  if (!groups.has(id)) groups.set(id, {id, nodes: []});
  groups.get(id).nodes.push(n);
 }
 // Stable order: biggest constellation first, ties broken by name, so the map
 // does not reshuffle between two reads of the same data.
 return [...groups.values()].sort((a, b) => b.nodes.length - a.nodes.length || a.id.localeCompare(b.id));
}

/** Places every node of a projection.
 *
 *  Radius comes from the tier (spine position), angle from the constellation
 *  (which domain / owner it belongs to), and Z from the node's declared depth.
 *  `focus`, when given, is pulled to the origin so the camera has a subject. */
export function projectionLayout(projection, {focus = '', tiers} = {}) {
 const nodes = projection?.nodes || [];
 if (!nodes.length) return [];
 const spine = tiers || projection?.tiers || [];
 const span = Math.max(1, spine.length - 1);

 const byTier = new Map();
 for (const n of nodes) {
  const t = n.tier || '—';
  if (!byTier.has(t)) byTier.set(t, []);
  byTier.get(t).push(n);
 }

 const seats = new Map();
 for (const [tier, tierNodes] of byTier) {
  const index = spine.indexOf(tier);
  const ratio = index < 0 ? 0.5 : index / span;
  const radius = SHELL.innerRadius + ratio * (SHELL.outerRadius - SHELL.innerRadius);
  const groups = constellations(tierNodes);
  const total = tierNodes.length;
  let placed = 0;
  groups.forEach((group, gi) => {
   // Each constellation owns an arc proportional to its size, minus padding, so
   // a domain stays visually contiguous across every tier it appears in.
   const share = group.nodes.length / total;
   const start = (placed / total) * Math.PI * 2 + SHELL.sectorPadding / 2;
   const sweep = Math.max(0.001, share * Math.PI * 2 - SHELL.sectorPadding);
   group.nodes.forEach((n, i) => {
    const step = group.nodes.length > 1 ? i / (group.nodes.length - 1) : 0.5;
    const angle = start + step * sweep + gi * 0.0001;
    const wobble = (seed(n.id) - 0.5) * SHELL.jitter;
    const r = radius * (1 + wobble * 0.14);
    seats.set(n.id, {
     angle, radius: r, constellation: group.id, tier, tierIndex: index < 0 ? 0 : index
    });
   });
   placed += group.nodes.length;
  });
 }

 return nodes.map(n => {
  if (focus && n.id === focus) return [0, 0, 0];
  const seat = seats.get(n.id) || {angle: 0, radius: SHELL.innerRadius};
  const z = Number.isFinite(n.z) ? n.z : 0;
  return [
   Math.cos(seat.angle) * seat.radius,
   Math.sin(seat.angle) * seat.radius * 0.74,
   z * SHELL.depth
  ];
 });
}

/** The constellation each node was seated in, for legends and for focus mode. */
export function layoutIndex(projection, options = {}) {
 const nodes = projection?.nodes || [];
 const positions = projectionLayout(projection, options);
 return new Map(nodes.map((n, i) => [n.id, {position: positions[i], node: n}]));
}

/* ------------------------------------------------------------ level of detail */

/** How many bodies are worth drawing at this camera, and which ones.
 *
 *  The budget is a frame-time budget, not a taste judgement: past it, canvas
 *  compositing dominates and the map stops feeling live. Selection, focus and
 *  hover are never dropped — losing what you are looking at to a budget would
 *  make the control read as broken. */
export const LOD_BUDGET = Object.freeze({
 nodes: 900,      // drawn bodies
 labels: 26,      // label chips
 glow: 260,       // bodies that get the expensive radial halo
 edges: 1400,     // drawn relations
 pulses: 90       // relations with a travelling pulse
});

export function nodeImportance(node, {focus, selected, hover, tiers = []} = {}) {
 if (node.id === focus) return 1e6;
 if (node.id === selected) return 9e5;
 if (node.id === hover) return 8e5;
 let score = 0;
 // Earlier tiers are structural: they carry the shape of the layer.
 const index = tiers.indexOf(node.tier);
 score += index >= 0 ? (tiers.length - index) * 1000 : 0;
 // A macro node is by definition meant to survive at every zoom.
 score += (4 - (node.zoom || 2)) * 400;
 // Cross-layer nodes are the joins the whole composition hangs on.
 if (node.alsoInLayers?.length) score += 2500;
 // A blocked or contradicted body is the one an operator is looking for.
 if (node.signal === 'blocked' || node.signal === 'negative') score += 600;
 if (node.unlinked) score -= 200;
 return score;
}

/** Chooses what to draw. Returns the surviving nodes and edges plus an honest
 *  account of what was left out, so the UI can say so rather than imply the
 *  map is complete. */
export function applyLod(projection, {focus, selected, hover, budget = LOD_BUDGET, viewport} = {}) {
 const nodes = projection?.nodes || [];
 const edges = projection?.edges || [];
 const tiers = projection?.tiers || [];
 const ranked = [...nodes].sort((a, b) =>
  nodeImportance(b, {focus, selected, hover, tiers}) - nodeImportance(a, {focus, selected, hover, tiers}));
 const drawn = ranked.slice(0, Math.max(1, budget.nodes));
 const ids = new Set(drawn.map(n => n.id));

 // Prefer edges that touch what the operator is looking at, then canonical ones:
 // a derived grouping edge is the first thing that should disappear under load.
 const relevant = e => (e.source === selected || e.target === selected || e.source === focus || e.target === focus);
 const placeable = edges.filter(e => ids.has(e.source) && ids.has(e.target));
 const sortedEdges = [...placeable].sort((a, b) =>
  (relevant(b) - relevant(a)) || ((b.authority !== 'DERIVED_NOT_EVIDENCE') - (a.authority !== 'DERIVED_NOT_EVIDENCE')));
 const drawnEdges = sortedEdges.slice(0, Math.max(0, budget.edges));

 return {
  nodes: drawn,
  edges: drawnEdges,
  glowIds: new Set(drawn.slice(0, budget.glow).map(n => n.id)),
  pulseIds: new Set(drawnEdges.slice(0, budget.pulses).map(e => e.id)),
  labelBudget: budget.labels,
  omitted: {
   nodes: nodes.length - drawn.length,
   edges: placeable.length - drawnEdges.length,
   unplaceableEdges: edges.length - placeable.length
  },
  viewport: viewport || null
 };
}

/** Frustum culling in screen space. A body fully outside the canvas costs
 *  nothing to skip and everything to draw, but it stays in the model — it is
 *  hidden by the camera, not removed from the data. */
export function cull(points, {width, height, margin = 120} = {}) {
 if (!width || !height) return points;
 return points.filter(p =>
  p.x + p.r > -margin && p.x - p.r < width + margin &&
  p.y + p.r > -margin && p.y - p.r < height + margin);
}
