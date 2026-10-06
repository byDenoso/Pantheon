// "LCDM style" motion for the Tower cosmos: the bounded, ILLUSTRATIVE flat-ΛCDM toy of src/features/lab/cosmicDynamics.ts applied to the Tower web.
//  - the scale factor a(t) follows the Friedmann acceleration (Ωm = 0.315, ΩΛ = 0.685); domain anchors recede from the centre of mass by S(a) <= 1.04
//    (the voids between domains grow) while whatever is bound to a domain is carried with it (structures do not grow with the void);
//  - filament dust is pulled toward its nearest domain anchor by a softened inverse-square attraction, with Hubble damping and a speed cap (clustering);
//  - anchors have EQUAL visual weight: no mass is inferred from records, counts or verdicts. The comoving layout (memory, warm start) is never mutated.
// Display units only: not an N-body or GR solver. Gated by paused / hidden / prefers-reduced-motion. Deterministic (no randomness).
import {evaluateFlatLcdm, type FlatLcdmParameters} from '../features/lab/cosmicDynamics.ts';
import type {V3} from './embed3d.ts';

export const PHYSICS_MODEL = 'illustrative-flat-lcdm-toy';
export const PHYSICS_NOTE = 'Modelo visual ilustrativo flat-ΛCDM: os domínios se afastam lentamente do centro (no máximo 4%) seguindo a expansão acelerada, sem massas inferidas dos registros. As âncoras de domínio têm peso visual igual.';

export interface TowerLcdmOptions {
  /** test positions, flattened xyz, mutated in place */
  nodes: Float32Array;
  /** filament dust positions, flattened xyz, mutated in place */
  dust: Float32Array;
  /** container positions (domain / subdomain / campaign), mutated in place (V3 objects owned by the caller) */
  containers: Map<string, V3>;
  /** domain anchors, equal weight */
  anchors: V3[];
  center: V3;
  /** layout extent (world units): the length scale */
  extent: number;
  params?: Partial<FlatLcdmParameters>;
  initialScaleFactor?: number;
  /** scale factor at which the recession is 1 (the first generation's start); defaults to 0.66 */
  baseScaleFactor?: number;
  minScaleFactor?: number;
  maxScaleFactor?: number;
  /** attraction gain (display units) */
  attraction?: number;
  maxSpeed?: number;
  softening?: number;
  /** ceiling of the domain recession S(a)-1 (default 0.04) */
  maxRecession?: number;
  /** how far dust may be drawn toward its anchor, as a fraction of its initial distance */
  maxPull?: number;
}
export interface TowerLcdmGate {paused?: boolean; hidden?: boolean; reducedMotion?: boolean}
export interface TowerLcdmState {scaleFactor: number; expansion: number; hubble: number; acceleration: number; simulatedSeconds: number; fixedSteps: number; particleSteps: number; /** mean |pull| / L of the dust */ clustering: number; /** a reached its ceiling and the dust is at rest: nothing moves any more */ settled: boolean}

const BG_STEP = 1 / 60, MAX_FRAME = 0.05;
const DEFAULTS: FlatLcdmParameters = {omegaMatter: 0.315, omegaLambda: 0.685, h0Visual: 0.0008};

/** inverse-distance (partition of unity) weighted anchor recession direction of a point: Σ w_j (A_j − c) */
function recession(x: number, y: number, z: number, A: V3[], c: V3, eps2: number, out: Float32Array, o: number): number {
  let sw = 0, sx = 0, sy = 0, sz = 0, best = 0, bd = Infinity;
  for (let j = 0; j < A.length; j += 1) {
    const dx = A[j]!.x - x, dy = A[j]!.y - y, dz = A[j]!.z - z; const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; best = j; }
    const w = 1 / ((d2 + eps2) * (d2 + eps2)); sw += w; sx += w * (A[j]!.x - c.x); sy += w * (A[j]!.y - c.y); sz += w * (A[j]!.z - c.z);
  }
  out[o] = sx / sw; out[o + 1] = sy / sw; out[o + 2] = sz / sw; return best;
}

export function createTowerLcdm(opt: TowerLcdmOptions) {
  const P: FlatLcdmParameters = {omegaMatter: Math.max(0, opt.params?.omegaMatter ?? DEFAULTS.omegaMatter), omegaLambda: Math.max(0, opt.params?.omegaLambda ?? DEFAULTS.omegaLambda), h0Visual: Math.max(0, opt.params?.h0Visual ?? DEFAULTS.h0Visual)};
  const aMin = opt.minScaleFactor ?? 0.5, aMax = opt.maxScaleFactor ?? 1.2;
  const L = Math.max(1, opt.extent / 2), C = opt.center, A = opt.anchors;
  const gain = opt.attraction ?? 0.00006 * 3, vmax = (opt.maxSpeed ?? 0.004) * L, soft2 = (opt.softening ?? 0.4) ** 2, maxPull = Math.max(0, Math.min(0.9, opt.maxPull ?? 0.08));
  // the web stays ONE web: recession is kept small (default 4%, not the Atlas toy's 14%) and dust is pulled only a short way
  const maxRecession = Math.max(0, Math.min(0.14, opt.maxRecession ?? 0.04));
  const eps2 = (0.35 * L) ** 2;
  // 20 Hz for normal clouds, 10 Hz when the dust is dense (keeps the physics step well under a frame budget)
  const PARTICLE_STEP = opt.dust.length / 3 > 40000 ? 0.1 : 0.05;
  const nodes0 = opt.nodes.slice(), dust0 = opt.dust.slice();
  const nSd = new Float32Array(nodes0.length), dSd = new Float32Array(dust0.length);
  const nn = new Uint16Array(dust0.length / 3), cap = new Float32Array(dust0.length / 3);
  const off = new Float32Array(dust0.length), vel = new Float32Array(dust0.length);
  for (let i = 0; i < nodes0.length; i += 3) recession(nodes0[i]!, nodes0[i + 1]!, nodes0[i + 2]!, A, C, eps2, nSd, i);
  for (let i = 0; i < nn.length; i += 1) {
    const k = 3 * i; const b = recession(dust0[k]!, dust0[k + 1]!, dust0[k + 2]!, A, C, eps2, dSd, k); nn[i] = b;
    cap[i] = maxPull * Math.hypot(A[b]!.x - dust0[k]!, A[b]!.y - dust0[k + 1]!, A[b]!.z - dust0[k + 2]!);
  }
  const cont0 = new Map<string, {p: V3; sd: [number, number, number]}>();
  for (const [id, p] of opt.containers) { const t = new Float32Array(3); recession(p.x, p.y, p.z, A, C, eps2, t, 0); cont0.set(id, {p: {...p}, sd: [t[0]!, t[1]!, t[2]!]}); }

  let a = Math.min(aMax, Math.max(aMin, opt.initialScaleFactor ?? 0.66));
  const a0 = a, aBase = Math.min(a0, opt.baseScaleFactor ?? 0.66);
  let av = evaluateFlatLcdm(a, P).expansionRate * a;
  let fastest = Infinity; let acc = 0, pacc = 0, sim = 0, fixed = 0, psteps = 0, clustering = 0;
  const S = () => 1 + maxRecession * Math.max(0, Math.min(1, (a - aBase) / Math.max(1e-6, aMax - aBase)));
  const state: TowerLcdmState = {scaleFactor: a, expansion: 1, hubble: 0, acceleration: 0, simulatedSeconds: 0, fixedSteps: 0, particleSteps: 0, clustering: 0, settled: false};
  const publish = () => { const bg = evaluateFlatLcdm(a, P); state.scaleFactor = a; state.expansion = S(); state.hubble = bg.expansionRate; state.acceleration = bg.acceleration; state.simulatedSeconds = sim; state.fixedSteps = fixed; state.particleSteps = psteps; state.clustering = clustering; state.settled = a >= aMax && fastest < 1e-4 * L; };

  const bgStep = () => {
    const bg = evaluateFlatLcdm(a, P);
    av = Math.max(0, Math.min(0.0025, av + bg.acceleration * BG_STEP)); a += av * BG_STEP;
    if (a >= aMax) { a = aMax; av = 0; } else if (a <= aMin) { a = aMin; av = 0; }
    sim += BG_STEP; fixed += 1;
  };
  const particles = (dt: number) => {
    const s = S() - 1; const pull = P.omegaMatter > 0 ? gain * (P.omegaMatter / 0.315) / (a * a) : 0; const hub = evaluateFlatLcdm(a, P).expansionRate; const damp = Math.max(0, 1 - 2 * hub * dt);
    let sum = 0, fast = 0;
    for (let i = 0; i < nn.length; i += 1) {
      const k = 3 * i; const an = A[nn[i]!]!;
      // the anchor recedes with the background: its current position is A + s (A - c)
      const tx = an.x + s * (an.x - C.x), ty = an.y + s * (an.y - C.y), tz = an.z + s * (an.z - C.z);
      const px = dust0[k]! + s * dSd[k]! + off[k]!, py = dust0[k + 1]! + s * dSd[k + 1]! + off[k + 1]!, pz = dust0[k + 2]! + s * dSd[k + 2]! + off[k + 2]!;
      const dx = (tx - px) / L, dy = (ty - py) / L, dz = (tz - pz) / L; const r2 = dx * dx + dy * dy + dz * dz + soft2; const ir3 = 1 / (r2 * Math.sqrt(r2));
      let vx = (vel[k]! + L * pull * dx * ir3 * dt) * damp, vy = (vel[k + 1]! + L * pull * dy * ir3 * dt) * damp, vz = (vel[k + 2]! + L * pull * dz * ir3 * dt) * damp;
      const sp = Math.hypot(vx, vy, vz); if (sp > vmax) { const f = vmax / sp; vx *= f; vy *= f; vz *= f; }
      let ox = off[k]! + vx * dt, oy = off[k + 1]! + vy * dt, oz = off[k + 2]! + vz * dt;
      const om = Math.hypot(ox, oy, oz), c = cap[i]!; if (om > c) { const f = c / om; ox *= f; oy *= f; oz *= f; vx *= 0.5; vy *= 0.5; vz *= 0.5; }
      fast = Math.max(fast, Math.hypot(vx, vy, vz)); vel[k] = vx; vel[k + 1] = vy; vel[k + 2] = vz; off[k] = ox; off[k + 1] = oy; off[k + 2] = oz; sum += Math.hypot(ox, oy, oz);
    }
    clustering = nn.length ? sum / nn.length / L : 0; fastest = fast; psteps += 1;
  };
  /** writes the current positions into the caller's buffers */
  const apply = () => {
    const s = S() - 1;
    for (let i = 0; i < nodes0.length; i += 1) opt.nodes[i] = nodes0[i]! + s * nSd[i]!;
    for (let i = 0; i < dust0.length; i += 1) opt.dust[i] = dust0[i]! + s * dSd[i]! + off[i]!;
    for (const [id, c] of cont0) { const p = opt.containers.get(id)!; p.x = c.p.x + s * c.sd[0]; p.y = c.p.y + s * c.sd[1]; p.z = c.p.z + s * c.sd[2]; }
  };
  /** returns true when positions changed (the caller redraws) */
  const step = (dt: number, gate: TowerLcdmGate = {}): boolean => {
    if (gate.paused || gate.hidden || gate.reducedMotion || !Number.isFinite(dt) || dt <= 0 || state.settled) { publish(); return false; }
    const d = Math.min(MAX_FRAME, dt); acc += d; pacc += d; let moved = false;
    while (acc >= BG_STEP) { bgStep(); acc -= BG_STEP; }
    while (pacc >= PARTICLE_STEP) { particles(PARTICLE_STEP); pacc -= PARTICLE_STEP; moved = true; }
    if (moved) { apply(); publish(); }
    return moved;
  };
  const reset = () => { off.fill(0); vel.fill(0); a = a0; av = evaluateFlatLcdm(a, P).expansionRate * a; acc = pacc = sim = 0; fixed = psteps = 0; clustering = 0; fastest = Infinity; apply(); publish(); };
  apply(); publish();
  return {step, reset, apply, state};
}
export type TowerLcdm = ReturnType<typeof createTowerLcdm>;
