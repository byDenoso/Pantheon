/** Deterministic orbital geometry for the focused view.
 *
 *  Geometry represents navigation only. Distance, radius, inclination and drift
 *  never encode scientific status, authority or strength of evidence; they exist
 *  so a focused body and its declared children read as one small 3D system
 *  instead of a flat fan. Every position is a pure function of the entity id, so
 *  the same cut always lands in the same place between renders and sessions.
 */

/** FNV-1a style 32-bit hash: stable across engines, no Math.random anywhere. */
export function hashId(id) {
 let h = 0x811c9dc5;
 const s = String(id ?? '');
 for (let i = 0; i < s.length; i++) {
  h ^= s.charCodeAt(i);
  h = Math.imul(h, 0x01000193) >>> 0;
 }
 return h >>> 0;
}

/** Deterministic [0,1) stream: one id yields several independent jitters. */
const unit = (id, salt) => (hashId(id + '·' + salt) % 100000) / 100000;

/** Irregular by construction: the branch angles are deliberately unevenly
 *  spaced so the result never collapses into a mandala or a perfect ring.
 *  band selects the base distance, tilt drives the Z plane of the branch. */
const BRANCHES = Object.freeze([
 {angle: -0.42, tilt: 0.34, band: 0},
 {angle: 1.02, tilt: -0.52, band: 1},
 {angle: 2.05, tilt: 0.18, band: 0},
 {angle: 3.35, tilt: -0.28, band: 2},
 {angle: 4.61, tilt: 0.44, band: 1},
 {angle: 5.42, tilt: -0.15, band: 2}
]);

const BANDS = Object.freeze([215, 285, 350]);

export const ORBITAL_CONFIG = Object.freeze({
 stepRadius: 46,      // how much each extra lap pushes a branch outward
 radiusJitter: 54,    // per-entity distance jitter inside its band
 angleJitter: 0.30,   // per-entity angular jitter, keeps spacing uneven
 stepDrift: 0.17,     // outer laps rotate slightly, so laps never align
 verticalScale: 0.80, // screen-space Y is compressed, X stays wide
 depthScale: 0.75,    // Z amplitude relative to the orbital radius
 depthJitter: 34,     // per-entity depth jitter so no two share a Z plane
 outlierEvery: 7,     // every Nth child rides a wider, more distant orbit
 outlierPush: 1.28
});

/** Positions for a focused body and its declared children.
 *  Returns one [x,y,z] per node, in the order the nodes were given. */
export function orbitalLayout(nodes, focus, config = {}) {
 const c = {...ORBITAL_CONFIG, ...config};
 const children = nodes.filter(n => n.id !== focus);
 // Sorting by id makes the layout independent of the order the API returned.
 const order = [...children].sort((a, b) => String(a.id).localeCompare(String(b.id)));
 const placed = new Map();

 order.forEach((node, i) => {
  const id = node.id;
  const branch = BRANCHES[i % BRANCHES.length];
  const step = Math.floor(i / BRANCHES.length);
  const outlier = i % c.outlierEvery === c.outlierEvery - 1;

  const angle = branch.angle
   + (unit(id, 'a') - 0.5) * c.angleJitter
   + step * c.stepDrift * (branch.tilt < 0 ? -1 : 1);

  let radius = BANDS[branch.band] + step * c.stepRadius + (unit(id, 'r') - 0.5) * c.radiusJitter;
  if (outlier) radius *= c.outlierPush;

  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * c.verticalScale;
  const z = branch.tilt * radius * c.depthScale + (unit(id, 'z') - 0.5) * c.depthJitter;

  placed.set(id, [x, y, z]);
 });

 return nodes.map(n => (n.id === focus ? [0, 0, 0] : placed.get(n.id) || [0, 0, -260]));
}

/** Small orbital drift added on top of the base position at draw time.
 *  It is an offset, never a new layout: the semantic position is untouched and
 *  the amplitude stays well inside the node radius so clicks keep landing. */
export function orbitalOffset(id, timeMs, {reducedMotion = false, amplitude = 9} = {}) {
 if (reducedMotion) return [0, 0, 0];
 const t = Number(timeMs) || 0;
 const px = unit(id, 'px') * Math.PI * 2, py = unit(id, 'py') * Math.PI * 2, pz = unit(id, 'pz') * Math.PI * 2;
 const sx = 0.00021 + unit(id, 'sx') * 0.00013;
 const sy = 0.00017 + unit(id, 'sy') * 0.00011;
 const sz = 0.00013 + unit(id, 'sz') * 0.00009;
 return [
  Math.sin(t * sx + px) * amplitude,
  Math.cos(t * sy + py) * amplitude * 0.72,
  Math.sin(t * sz + pz) * amplitude * 0.85
 ];
}
