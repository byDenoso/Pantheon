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
// Young barred spiral: SCIENCE and NEXO leave from the two bar ends,
// ENGINEERING from the ring; OLYMPUS is a spur that diverges from the arm it
// shares most bridges with (the largest arm when there are none).
// Any new domain gets an arm automatically; known domains keep stable phases.

const TAU = Math.PI * 2;
export const MORPHOLOGY_VERSION = 2;
export const BAR_BASE = 30;

const KNOWN_PHASES = { SCIENCE: 0, NEXO: Math.PI, ENGINEERING: Math.PI / 2 };
const BRANCHES = new Set(['OLYMPUS']);
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
    const entities = Number(c.entities || 0);
    const subdomains = Math.max(1, Number(c.subdomains || 0));
    const density = entities / subdomains;
    arms[domain] = {
      phase: round(KNOWN_PHASES[domain] ?? hashPhase(domain)),
      // Young galaxy: every arm is a real spiral arm; growth lengthens it slowly.
      turns: round(0.46 + 0.34 * saturate(entities + subdomains * 4, 250)),
      pitch: round(0.3 + 0.06 * saturate(subdomains, 8)),
      width: round(7 + 9 * saturate(density, 8)),
      mass: round(0.25 + 0.75 * saturate(entities, 60)),
      segments: subdomains,
      tint: DOMAIN_TINTS[domain] || '#dfe9ff',
    };
  }
  // Spurs: attach to the arm they bridge to most, else to the largest arm.
  const primary = Object.keys(arms).filter(d => !BRANCHES.has(d));
  const largest = primary.slice().sort((a, b) => arms[b].mass - arms[a].mass || a.localeCompare(b))[0];
  for (const domain of Object.keys(arms)) {
    if (!BRANCHES.has(domain) || !largest) continue;
    const linked = primary
      .map(d => [d, bridges.filter(b => (b.from === domain && b.to === d) || (b.to === domain && b.from === d)).reduce((s, b) => s + b.count, 0)])
      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const arm = arms[domain];
    arm.parent = linked[0]?.[0] ?? largest;
    // Diverges a third of the way along the parent, opening outward faster.
    arm.branch_at = 0.34;
    arm.turns = round(0.22 + 0.3 * saturate(counts[domain].entities || 0, 120));
    arm.pitch = round(arm.pitch + 0.18);
    arm.width = round(arm.width * 0.8);
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

export function armPoint(morph, domain, t) {
  const arm = morph.arms[domain];
  if (!arm) return { x: 0, y: 0 };
  if (arm.parent && morph.arms[arm.parent]) {
    const root = armPoint(morph, arm.parent, arm.branch_at ?? 0.34);
    const r0 = Math.hypot(root.x, root.y);
    const a0 = Math.atan2(root.y, root.x);
    const theta = arm.turns * TAU * t;
    const radius = r0 * Math.exp(arm.pitch * theta) + t * 12;
    return { x: Math.cos(a0 + theta) * radius, y: Math.sin(a0 + theta) * radius };
  }
  const theta = arm.turns * TAU * t;
  const radius = morph.bulge.bar * Math.exp(arm.pitch * theta) + t * 18;
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
