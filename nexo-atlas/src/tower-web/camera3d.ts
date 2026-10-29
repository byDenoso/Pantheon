// Orbital perspective camera for the 2.5D canvas. Pure maths: no DOM. The camera orbits a TARGET (the observer), which is the
// centre of mass of the web by default or any selected node: every point can be the centre.
import type {V3} from './embed3d.ts';

export interface Camera {yaw: number; pitch: number; dist: number; target: V3; focal: number}
export interface Projected {x: number; y: number; depth: number; scale: number}
export const NEAR = 1;
const PITCH_MAX = 1.5;
export const clampPitch = (p: number) => Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));

export function fitCamera(extent: number, w: number, h: number, center: V3 = {x: 0, y: 0, z: 0}): Camera {
  const dist = Math.max(4, extent * 3);
  // a sphere of radius `extent` at the target spans ~0.46 of the short side (the near limb is magnified by dist/(dist-extent) = 1.5)
  return {yaw: 0.55, pitch: 0.38, dist, target: {...center}, focal: 0.46 * Math.max(1, Math.min(w, h)) * dist / Math.max(1, extent)};
}

/** World -> camera space (x right, y up, z away from the camera along the view direction, in world units from the eye). */
export function toCamera(c: Camera, p: V3): V3 {
  const x0 = p.x - c.target.x, y0 = p.y - c.target.y, z0 = p.z - c.target.z;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const x1 = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0;      // yaw about Y
  const y2 = cp * y0 - sp * z1, z2 = sp * y0 + cp * z1;       // pitch about X
  return {x: x1, y: y2, z: c.dist - z2};                      // eye sits `dist` in front of the target
}

export function project(c: Camera, p: V3, w: number, h: number): Projected | null {
  const q = toCamera(c, p);
  if (q.z < NEAR) return null;
  const scale = c.focal / q.z;
  return {x: w / 2 + q.x * scale, y: h / 2 - q.y * scale, depth: q.z, scale};
}

/** Batch projection into preallocated typed arrays (x, y, depth, scale per point). Points behind the eye get depth = -1. */
export function projectAll(c: Camera, xyz: Float32Array, w: number, h: number, out: {sx: Float32Array; sy: Float32Array; sz: Float32Array; ss: Float32Array}): void {
  const n = xyz.length / 3;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const tx = c.target.x, ty = c.target.y, tz = c.target.z, hw = w / 2, hh = h / 2;
  for (let i = 0; i < n; i += 1) {
    const x0 = xyz[3 * i]! - tx, y0 = xyz[3 * i + 1]! - ty, z0 = xyz[3 * i + 2]! - tz;
    const x1 = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0;
    const y2 = cp * y0 - sp * z1, z2 = sp * y0 + cp * z1;
    const z = c.dist - z2;
    if (z < NEAR) { out.sz[i] = -1; out.ss[i] = 0; out.sx[i] = 0; out.sy[i] = 0; continue; }
    const s = c.focal / z; out.sx[i] = hw + x1 * s; out.sy[i] = hh - y2 * s; out.sz[i] = z; out.ss[i] = s;
  }
}

export const orbit = (c: Camera, dx: number, dy: number): Camera => ({...c, yaw: c.yaw + dx * 0.006, pitch: clampPitch(c.pitch + dy * 0.006)});
export const zoom = (c: Camera, factor: number, extent: number): Camera => ({...c, dist: Math.min(extent * 12, Math.max(extent * 0.15, c.dist * factor))});
/** Pan in the screen plane (moves the target). */
export function pan(c: Camera, dx: number, dy: number): Camera {
  const s = c.dist / c.focal; // world units per pixel at the target depth
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  // screen right/up expressed in world axes (inverse of toCamera's rotation)
  const right = {x: cy, y: 0, z: sy};
  const up = {x: sy * sp, y: cp, z: -cy * sp};
  return {...c, target: {x: c.target.x - (dx * right.x - dy * up.x) * s, y: c.target.y - (dx * right.y - dy * up.y) * s, z: c.target.z - (dx * right.z - dy * up.z) * s}};
}
export const lerpCamera = (a: Camera, b: Camera, t: number): Camera => ({
  yaw: a.yaw + (b.yaw - a.yaw) * t, pitch: a.pitch + (b.pitch - a.pitch) * t, dist: a.dist + (b.dist - a.dist) * t, focal: a.focal + (b.focal - a.focal) * t,
  target: {x: a.target.x + (b.target.x - a.target.x) * t, y: a.target.y + (b.target.y - a.target.y) * t, z: a.target.z + (b.target.z - a.target.z) * t},
});
