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
export const MORPHOLOGY_VERSION = 2;
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
const BRANCH_ROOT = 0.08; // fraction along the parent arm, right next to the bar end
const BRANCH_STEP = 0.07; // further branches on the same arm root a little further out
export const DOMAIN_TINTS = {
  NEXO: '#ffd36b',
  SCIENCE: '#7fb2ff',
  OLYMPUS: '#8ff0a8',
  ENGINEERING: '#c9a0ff',
};

const saturate = (value, scale) => 1 - Math.exp(-Math.max(0, value) / scale);
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
      turns: round(0.3 + 0.6 * saturate(entities + subdomains * 4, 250)),
      pitch: round(0.3 + 0.08 * saturate(subdomains, 8)),
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
    arm.parent = linked[0]?.[0] ?? (arms[affinity] ? affinity : largest);
    const order = (branchesOn[arm.parent] = (branchesOn[arm.parent] ?? -1) + 1);
    arm.branch_at = round(BRANCH_ROOT + BRANCH_STEP * order);
    // The branch lengthens as its domain grows, opening a little faster than its parent.
    arm.turns = round(0.15 + 0.45 * saturate(counts[domain].entities || 0, 90));
    arm.pitch = round(arm.pitch + 0.45); // opens away from the parent quickly
  }
  return {
    version: MORPHOLOGY_VERSION,
    bulge: {
      radius: round(5 + 9 * saturate(core, 50)),
      bar: round(BAR_BASE + 26 * saturate(core, 40)),
      tint: DOMAIN_TINTS.NEXO,
    },
    arms,
    bridges: bridges.filter(b => b.from !== b.to).map(b => ({ from: b.from, to: b.to, count: b.count })),
  };
}

/** Half-length of the NEXO bar: where the main arms attach. */
export const barEnd = morph => morph.bulge.bar * 0.75;

export function armPoint(morph, domain, t) {
  const arm = morph.arms[domain];
  if (!arm) return { x: 0, y: 0 };
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
  const radius = barEnd(morph) * Math.exp(arm.pitch * theta * (1 - 0.3 * t)) + t * 4;
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
