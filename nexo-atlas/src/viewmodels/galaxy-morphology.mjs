// Galaxy morphology: the shape of the NEXO galaxy is an indicator of the
// system's state, not decoration. Shared by the server compiler (positions of
// data stars) and the browser (procedural starfield), so both always agree.
//
// Rules (fixed constants, never normalised by the current snapshot, so shapes
// are comparable across snapshots — the galaxy only changes when NEXO does):
//   arm mass          = number of entities in the domain
//   arm length        = expansion of the domain (entities + subdomains)
//   arm thickness     = internal density (entities per subdomain)
//   fragmentation     = number of subdomains (star-forming knots on the arm)
//   bridges           = cross-domain relations
//   bulge / bar       = NEXO core entities (hubs, infrastructure, capabilities)
// Any new domain gets an arm automatically; known domains keep stable phases.

const TAU = Math.PI * 2;
export const MORPHOLOGY_VERSION = 3;
export const BAR_BASE = 30;

// NEXO is the nucleus; SCIENCE and ENGINEERING are the two main arms, on
// opposite sides. Every other domain (OLYMPUS and any new one) is a branch
// that leaves its parent arm close to the nucleus. Parent = the main arm it
// shares most cross-domain relations with; without relations, its semantic
// affinity; otherwise the largest arm. Every arm grows out of the nucleus, so
// there is never a gap between the core and an arm.
const KNOWN_PHASES = { SCIENCE: 0, ENGINEERING: Math.PI };
const MAIN_ARMS = new Set(['SCIENCE', 'ENGINEERING']);
const SEMANTIC_AFFINITY = { OLYMPUS: 'SCIENCE' };
const BRANCH_ROOT = 0.4; // fraction along the parent arm: where it sweeps past the far side of the bar
const BRANCH_STEP = 0.07; // further branches on the same arm root a little further out
export const DOMAIN_TINTS = {
  NEXO: '#ffd36b',
  SCIENCE: '#7fb2ff',
  OLYMPUS: '#8ff0a8',
  ENGINEERING: '#c9a0ff',
};

const saturate = (value, scale) => 1 - Math.exp(-Math.max(0, value) / scale);

/*
 * Evolution (data-driven, never by clock):
 *   1 NÚCLEO        only the NEXO core has content
 *   2 PRIMEIROS BRAÇOS  arms exist but the system is small (<30 domain entities)
 *   3 DOMÍNIOS PRINCIPAIS  the main arms carry content, no branches yet
 *   4 RAMIFICAÇÕES  branches (sub-arms / bridges / satellites) have appeared
 *   5 MADURA        large, interconnected system; only here a stellar bar forms
 * New domains enter by affinity: RAMO (one arm), PONTE (two arms),
 * SATÉLITE (no affinity with any arm). Bar strength stays 0 before stage 5.
 */
export const STAGES = ['', 'NÚCLEO', 'PRIMEIROS BRAÇOS', 'DOMÍNIOS PRINCIPAIS', 'RAMIFICAÇÕES', 'MADURA'];
const MATURE_ENTITIES = 1200;
const round = value => Math.round(value * 1000) / 1000;

function hashPhase(domain) {
  let h = 2166136261;
  for (const ch of String(domain)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 0xffffffff) * TAU;
}

/** counts: {DOMAIN: {entities, subdomains}}; core: number of NEXO entities; bridges: [{from,to,count}] */
export function morphologyFrom({ counts, core, bridges = [] }) {
  const arms = {};
  for (const [domain, c] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    if (domain === 'NEXO') continue;
    const entities = Number(c.entities || 0);
    const subdomains = Math.max(1, Number(c.subdomains || 0));
    const density = entities / subdomains;
    arms[domain] = {
      phase: round(KNOWN_PHASES[domain] ?? hashPhase(domain)),
      // Short today; lengthens as the domain expands (room to ~0.9 turns).
      turns: round(0.54 + 0.9 * saturate(entities + subdomains * 4, 250)),
      pitch: round(0.18 + 0.05 * saturate(subdomains, 8)),
      width: round(6 + 14 * saturate(density, 8)),
      mass: round(saturate(entities, 60)),
      segments: subdomains,
      tint: DOMAIN_TINTS[domain] || '#dfe9ff',
    };
  }
  const primary = Object.keys(arms).filter(d => MAIN_ARMS.has(d));
  // Balanced arms: the longest arm follows the largest domain's expansion;
  // every other main arm is 77-100% of it, in proportion to its own
  // expansion. So the biggest arm is at most ~30% longer than the smallest,
  // and the whole galaxy still grows as NEXO grows.
  const MIN_RATIO = 1 / 1.3;
  const longest = Math.max(0, ...primary.map(d => arms[d].turns));
  for (const d of primary) {
    const share = longest > 0 ? arms[d].turns / longest : 1;
    arms[d].turns = round(longest * (MIN_RATIO + (1 - MIN_RATIO) * share));
  }
  // Same pitch on every main arm (the widest domain's), so length alone
  // carries the difference instead of compounding it in the outer radius.
  const sharedPitch = Math.max(0, ...primary.map(d => arms[d].pitch));
  for (const d of primary) arms[d].pitch = round(sharedPitch);
  const largest = primary.slice().sort((a, b) => arms[b].mass - arms[a].mass || a.localeCompare(b))[0];
  const branchesOn = {};
  for (const domain of Object.keys(arms)) {
    if (MAIN_ARMS.has(domain) || !largest) continue;
    const linked = primary
      .map(d => [d, bridges.filter(b => (b.from === domain && b.to === d) || (b.to === domain && b.from === d)).reduce((s, b) => s + b.count, 0)])
      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const arm = arms[domain];
    const affinity = SEMANTIC_AFFINITY[domain];
    if (linked.length >= 2 && linked[1][1] >= linked[0][1] * 0.5) {
      // Strong affinity with two arms: a bridge between them.
      arm.mode = 'bridge';
      arm.parent = linked[0][0];
      arm.bridge_to = linked[1][0];
      continue;
    }
    if (!linked.length && !arms[affinity]) {
      // No affinity with any arm: a satellite galaxy outside the disk.
      arm.mode = 'satellite';
      arm.orbit_phase = round(hashPhase(domain));
      arm.satellite_radius = round(4 + 10 * saturate(counts[domain].entities || 0, 80));
      continue;
    }
    arm.mode = 'branch';
    arm.parent = linked[0]?.[0] ?? (arms[affinity] ? affinity : largest);
    const order = (branchesOn[arm.parent] = (branchesOn[arm.parent] ?? -1) + 1);
    arm.branch_at = round(BRANCH_ROOT + BRANCH_STEP * order);
    // The branch lengthens as its domain grows, opening a little faster than its parent.
    // Length proportional to the domain: sqrt of its size relative to the
    // parent domain, so a small domain is a short spur and grows with it.
    const ratio = (counts[domain].entities || 0) / Math.max(1, counts[arm.parent]?.entities || 1);
    arm.turns = round(arms[arm.parent].turns * Math.min(1, Math.max(0.08, 0.6 * Math.sqrt(ratio))));
    arm.pitch = round(arm.pitch + 0.3); // opens away from the parent
  }
  const domainEntities = Object.entries(counts).filter(([d]) => d !== 'NEXO').reduce((s, [, c]) => s + Number(c.entities || 0), 0);
  const withContent = primary.filter(d => (counts[d].entities || 0) > 0);
  const offshoots = Object.values(arms).filter(a => a.mode).length;
  const crossLinks = bridges.filter(b => b.from !== b.to).reduce((s, b) => s + b.count, 0);
  const stage = !Object.keys(arms).length ? 1
    : domainEntities < 30 ? 2
    : domainEntities >= MATURE_ENTITIES && crossLinks >= 20 ? 5
    : offshoots > 0 ? 4
    : withContent.length >= 2 ? 3 : 2;
  const barStrength = stage === 5 ? round(saturate(domainEntities - MATURE_ENTITIES, 800)) : 0;
  return {
    version: MORPHOLOGY_VERSION,
    stage,
    stage_label: STAGES[stage],
    bulge: {
      radius: round(5 + 9 * saturate(core, 50)),
      bar: round(BAR_BASE + 26 * saturate(core, 40)),
      bar_strength: barStrength,
      tint: DOMAIN_TINTS.NEXO,
    },
    arms,
    bridges: bridges.filter(b => b.from !== b.to).map(b => ({ from: b.from, to: b.to, count: b.count })),
  };
}

/** Where the main arms attach: the bulge edge today, the bar ends once a bar forms (stage 5). */
export const barEnd = morph => {
  const strength = Number(morph.bulge.bar_strength ?? 1);
  const bulgeEdge = morph.bulge.bar * 0.7; // keeps the approved disk size while there is no bar
  return bulgeEdge + (morph.bulge.bar * 0.75 - bulgeEdge) * Math.max(0, Math.min(1, strength));
};

/** Outer radius of the main disk (tips of the main arms). */
function diskRadius(morph) {
  const tips = Object.entries(morph.arms).filter(([, a]) => !a.mode).map(([d]) => {
    const p = armPoint(morph, d, 1);
    return Math.hypot(p.x, p.y);
  });
  return Math.max(60, ...tips);
}

export function armPoint(morph, domain, t) {
  const arm = morph.arms[domain];
  if (!arm) return { x: 0, y: 0 };
  if (arm.mode === 'satellite') {
    // A small spiral orbiting outside the disk.
    const R = diskRadius(morph) * 1.45;
    const cx = Math.cos(arm.orbit_phase) * R, cy = Math.sin(arm.orbit_phase) * R;
    const theta = 1.2 * TAU * t;
    const r = arm.satellite_radius * (0.25 + t);
    return { x: cx + Math.cos(theta + arm.orbit_phase) * r, y: cy + Math.sin(theta + arm.orbit_phase) * r };
  }
  if (arm.mode === 'bridge' && morph.arms[arm.parent] && morph.arms[arm.bridge_to]) {
    // A stream of stars between two arms, bowing slightly outward.
    const a = armPoint(morph, arm.parent, 0.55), b = armPoint(morph, arm.bridge_to, 0.55);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, bow = Math.sin(Math.PI * t) * 0.25;
    return { x: a.x + (b.x - a.x) * t + mx * bow, y: a.y + (b.y - a.y) * t + my * bow };
  }
  if (arm.parent && morph.arms[arm.parent]) {
    const root = armPoint(morph, arm.parent, arm.branch_at ?? BRANCH_ROOT);
    const r0 = Math.hypot(root.x, root.y);
    const a0 = Math.atan2(root.y, root.x);
    const theta = arm.turns * TAU * t;
    const radius = r0 * Math.exp(arm.pitch * theta) + t * 10;
    return { x: Math.cos(a0 + theta) * radius, y: Math.sin(a0 + theta) * radius };
  }
  const theta = arm.turns * TAU * t;
  // NGC 1300-like: each arm leaves from an end of the NEXO bar (the bar fills
  // the space in between, so the galaxy has no gap) and grows outward.
  // The opening eases off towards the tip, so arm ends curl back toward the nucleus.
  // Without a bar the arm grows out of the nucleus itself: near the root it dips
  // inside the core glow, so there is never an empty ring between core and arm.
  const noBar = 1 - Math.max(0, Math.min(1, Number(morph.bulge.bar_strength ?? 1)));
  const rootDip = 1 - 0.62 * noBar * Math.max(0, 1 - t) ** 2.2;
  const radius = barEnd(morph) * Math.exp(arm.pitch * theta * (1 - 0.3 * t)) * rootDip + t * 4;
  const angle = arm.phase + theta;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function armFrame(morph, domain, t) {
  const p = armPoint(morph, domain, t);
  const q = armPoint(morph, domain, Math.min(1.05, t + 0.01));
  const tx = q.x - p.x, ty = q.y - p.y, len = Math.hypot(tx, ty) || 1;
  return { ...p, tx: tx / len, ty: ty / len, nx: -ty / len, ny: tx / len };
}

/** Shape metrics of one snapshot: the map as a signal about NEXO's evolution. */
export function shapeMetrics({ entities, crossRelations }) {
  const points = entities.filter(e => e.layout);
  const n = points.length || 1;
  const cx = points.reduce((s, e) => s + e.layout.x, 0) / n;
  const cy = points.reduce((s, e) => s + e.layout.y, 0) / n;
  const radii = points.map(e => Math.hypot(e.layout.x, e.layout.y)).sort((a, b) => a - b);
  const rMax = radii[radii.length - 1] || 1;
  const rMedian = radii[Math.floor(radii.length / 2)] || 0;
  const byDomain = {};
  for (const e of points) byDomain[e.visual_domain] = (byDomain[e.visual_domain] || 0) + 1;
  const entropy = -Object.values(byDomain).reduce((s, c) => s + (c / n) * Math.log2(c / n), 0);
  const armDensity = {};
  for (const [domain, count] of Object.entries(byDomain)) {
    const rs = points.filter(e => e.visual_domain === domain).map(e => Math.hypot(e.layout.x, e.layout.y));
    const span = Math.max(1, Math.max(...rs) - Math.min(...rs));
    armDensity[domain] = round(count / span);
  }
  return {
    center_of_mass: { x: round(cx), y: round(cy) },
    asymmetry: round(Math.hypot(cx, cy) / rMax),
    domain_entropy_bits: round(entropy),
    radial_ratio: round(rMedian / rMax),
    arm_density: armDensity,
    cross_link_density: round(crossRelations / n),
    entities_by_domain: byDomain,
  };
}

export function metricsDelta(current, previous) {
  if (!previous) return null;
  const d = (a, b) => (typeof a === 'number' && typeof b === 'number' ? round(a - b) : null);
  return {
    asymmetry: d(current.asymmetry, previous.asymmetry),
    domain_entropy_bits: d(current.domain_entropy_bits, previous.domain_entropy_bits),
    radial_ratio: d(current.radial_ratio, previous.radial_ratio),
    cross_link_density: d(current.cross_link_density, previous.cross_link_density),
  };
}
