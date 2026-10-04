/**
 * A bounded, illustrative flat-LCDM motion model for the Observatory drawing.
 * Coordinates and time are display units; this is not an N-body or GR solver.
 */

export interface FlatLcdmParameters {
  omegaMatter: number;
  omegaLambda: number;
  h0Visual: number;
}

export interface CosmicDynamicsOptions {
  /** XYZ buffers are mutated in place so drawing and picking share positions. */
  particleBuffers: Float32Array[];
  /** Published display anchors, flattened xyz; anchors have equal visual weight. */
  anchors: Float32Array;
  omegaMatter?: number;
  omegaLambda?: number;
  h0Visual?: number;
  initialScaleFactor?: number;
  minScaleFactor?: number;
  maxScaleFactor?: number;
  /** Softened inverse-square attraction in display units, not inferred masses. */
  matterAttraction?: number;
  maxComovingSpeed?: number;
  softeningLength?: number;
}

export interface DynamicsGate {
  paused?: boolean;
  hidden?: boolean;
  reducedMotion?: boolean;
}

export interface CosmicDynamicsState {
  scaleFactor: number;
  expansion: number;
  hubble: number;
  acceleration: number;
  simulatedSeconds: number;
  fixedSteps: number;
}

const DEFAULT_PARAMETERS: FlatLcdmParameters = {
  omegaMatter: 0.315,
  omegaLambda: 0.685,
  h0Visual: 0.0008,
};

const FIXED_STEP_SECONDS = 1 / 60;
const PARTICLE_STEP_SECONDS = 0.1;
const MAX_FRAME_DELTA_SECONDS = 0.05;

/** Flat-ΛCDM background quantities in the scene's arbitrary time units. */
export function evaluateFlatLcdm(
  scaleFactor: number,
  parameters: FlatLcdmParameters = DEFAULT_PARAMETERS,
): { expansionRate: number; acceleration: number } {
  const a = Math.max(0.05, scaleFactor);
  const matter = Math.max(0, parameters.omegaMatter);
  const lambda = Math.max(0, parameters.omegaLambda);
  const h0 = Math.max(0, parameters.h0Visual);
  const expansionRate = h0 * Math.sqrt(matter / (a * a * a) + lambda);
  const acceleration = h0 * h0 * a * (lambda - matter / (2 * a * a * a));
  return { expansionRate, acceleration };
}

/**
 * Evolves illustrative tracer positions toward equal-weight domain anchors,
 * with softened attraction and Hubble damping. Tower records provide anchor
 * locations only; their count/verdicts do not define physical masses.
 */
export function createCosmicDynamics(options: CosmicDynamicsOptions) {
  const parameters: FlatLcdmParameters = {
    omegaMatter: Math.max(0, options.omegaMatter ?? DEFAULT_PARAMETERS.omegaMatter),
    omegaLambda: Math.max(0, options.omegaLambda ?? DEFAULT_PARAMETERS.omegaLambda),
    h0Visual: Math.max(0, options.h0Visual ?? DEFAULT_PARAMETERS.h0Visual),
  };
  const initialScaleFactor = options.initialScaleFactor ?? 0.66;
  const minScaleFactor = options.minScaleFactor ?? 0.5;
  const maxScaleFactor = options.maxScaleFactor ?? 1.2;
  const matterAttraction = Math.max(0, options.matterAttraction ?? 0.00006);
  const maxComovingSpeed = Math.max(0, options.maxComovingSpeed ?? 0.004);
  const softeningSq = Math.max(0.05, options.softeningLength ?? 0.4) ** 2;
  const anchors = options.anchors;
  const buffers = options.particleBuffers;
  const originals = buffers.map(buffer => buffer.slice());
  const velocities = buffers.map(buffer => new Float32Array(buffer.length));
  const anchorIndices = buffers.map(buffer => {
    const result = new Uint16Array(buffer.length / 3);
    const anchorCount = Math.floor(anchors.length / 3);
    for (let i = 0; i < result.length; i += 1) {
      const x = buffer[i * 3]!, y = buffer[i * 3 + 1]!, z = buffer[i * 3 + 2]!;
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let j = 0; j < anchorCount; j += 1) {
        const dx = anchors[j * 3]! - x;
        const dy = anchors[j * 3 + 1]! - y;
        const dz = anchors[j * 3 + 2]! - z;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = j;
        }
      }
      result[i] = bestIndex;
    }
    return result;
  });

  let scaleFactor = Math.min(maxScaleFactor, Math.max(minScaleFactor, initialScaleFactor));
  const initialA = scaleFactor;
  const initialRate = evaluateFlatLcdm(scaleFactor, parameters).expansionRate * scaleFactor;
  let scaleVelocity = initialRate;
  let accumulator = 0;
  let particleAccumulator = 0;
  let simulatedSeconds = 0;
  let fixedSteps = 0;
  const state: CosmicDynamicsState = {
    scaleFactor,
    expansion: 1,
    hubble: 0,
    acceleration: 0,
    simulatedSeconds,
    fixedSteps,
  };

  const publishState = () => {
    const background = evaluateFlatLcdm(scaleFactor, parameters);
    state.scaleFactor = scaleFactor;
    state.expansion = Math.min(1.14, 1 + 0.14 * Math.max(0, Math.min(1, (scaleFactor - initialA) / (maxScaleFactor - initialA))));
    state.hubble = background.expansionRate;
    state.acceleration = background.acceleration;
    state.simulatedSeconds = simulatedSeconds;
    state.fixedSteps = fixedSteps;
  };

  const integrateParticles = (dt: number, hubble: number) => {
    if (anchors.length < 3) return;
    const pullScale = parameters.omegaMatter > 0
      ? matterAttraction * (parameters.omegaMatter / 0.315) / (scaleFactor * scaleFactor)
      : 0;
    const damping = Math.max(0, 1 - 2 * hubble * dt);
    for (let b = 0; b < buffers.length; b += 1) {
      const positions = buffers[b]!;
      const velocity = velocities[b]!;
      const nearest = anchorIndices[b]!;
      for (let i = 0; i < nearest.length; i += 1) {
        const k = i * 3;
        const anchor = nearest[i]! * 3;
        const dx = anchors[anchor]! - positions[k]!;
        const dy = anchors[anchor + 1]! - positions[k + 1]!;
        const dz = anchors[anchor + 2]! - positions[k + 2]!;
        const r2 = dx * dx + dy * dy + dz * dz + softeningSq;
        const inverseR3 = 1 / (r2 * Math.sqrt(r2));
        let vx = (velocity[k]! + pullScale * dx * inverseR3 * dt) * damping;
        let vy = (velocity[k + 1]! + pullScale * dy * inverseR3 * dt) * damping;
        let vz = (velocity[k + 2]! + pullScale * dz * inverseR3 * dt) * damping;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > maxComovingSpeed && speed > 0) {
          const factor = maxComovingSpeed / speed;
          vx *= factor;
          vy *= factor;
          vz *= factor;
        }
        velocity[k] = vx;
        velocity[k + 1] = vy;
        velocity[k + 2] = vz;
        positions[k] = Math.max(-40, Math.min(40, positions[k]! + vx * dt));
        positions[k + 1] = Math.max(-40, Math.min(40, positions[k + 1]! + vy * dt));
        positions[k + 2] = Math.max(-40, Math.min(40, positions[k + 2]! + vz * dt));
      }
    }
  };

  const integrateOneStep = () => {
    const background = evaluateFlatLcdm(scaleFactor, parameters);
    // Friedmann acceleration: a¨/a = H0²(ΩΛ − Ωm/(2a³)).
    scaleVelocity = Math.max(0, Math.min(0.0025, scaleVelocity + background.acceleration * FIXED_STEP_SECONDS));
    scaleFactor += scaleVelocity * FIXED_STEP_SECONDS;
    if (scaleFactor >= maxScaleFactor) {
      scaleFactor = maxScaleFactor;
      scaleVelocity = 0;
    } else if (scaleFactor <= minScaleFactor) {
      scaleFactor = minScaleFactor;
      scaleVelocity = 0;
    }
    simulatedSeconds += FIXED_STEP_SECONDS;
    fixedSteps += 1;
  };

  const step = (frameDeltaSeconds: number, gate: DynamicsGate = {}): CosmicDynamicsState => {
    if (gate.paused || gate.hidden || gate.reducedMotion || !Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
      publishState();
      return state;
    }
    accumulator += Math.min(MAX_FRAME_DELTA_SECONDS, frameDeltaSeconds);
    particleAccumulator += Math.min(MAX_FRAME_DELTA_SECONDS, frameDeltaSeconds);
    while (accumulator >= FIXED_STEP_SECONDS) {
      integrateOneStep();
      accumulator -= FIXED_STEP_SECONDS;
    }
    // The background follows 60 Hz fixed steps; tracer particles need only 10 Hz.
    while (particleAccumulator >= PARTICLE_STEP_SECONDS) {
      integrateParticles(PARTICLE_STEP_SECONDS, evaluateFlatLcdm(scaleFactor, parameters).expansionRate);
      particleAccumulator -= PARTICLE_STEP_SECONDS;
    }
    publishState();
    return state;
  };

  const reset = () => {
    buffers.forEach((buffer, index) => {
      buffer.set(originals[index]!);
      velocities[index]!.fill(0);
    });
    scaleFactor = initialA;
    scaleVelocity = initialRate;
    accumulator = 0;
    particleAccumulator = 0;
    simulatedSeconds = 0;
    fixedSteps = 0;
    publishState();
  };

  publishState();
  return { step, reset, state };
}
