import test from 'node:test';
import assert from 'node:assert/strict';
import { createCosmicDynamics, evaluateFlatLcdm } from '../src/features/lab/cosmicDynamics.ts';

test('flat-LCDM background has matter-era deceleration and late Lambda acceleration', () => {
  const matterEra = evaluateFlatLcdm(0.5);
  const lateEra = evaluateFlatLcdm(0.9);

  assert.ok(matterEra.expansionRate > lateEra.expansionRate);
  assert.ok(matterEra.acceleration < 0);
  assert.ok(lateEra.acceleration > 0);
  assert.ok(Number.isFinite(matterEra.expansionRate));
});

test('softened matter pull moves tracers toward domain anchors without tower-derived masses', () => {
  const makeScene = (matterAttraction) => {
    const points = new Float32Array([8, 0, 0, 8, 2, 0]);
    const model = createCosmicDynamics({
      particleBuffers: [points],
      anchors: new Float32Array([0, 0, 0]),
      initialScaleFactor: 0.8,
      h0Visual: 0.004,
      matterAttraction,
      maxComovingSpeed: 0.2,
      softeningLength: 0.8,
    });
    return { points, model };
  };

  const withMatter = makeScene(0.02);
  const withoutMatter = makeScene(0);
  const initialDistance = 8;
  for (let frame = 0; frame < 300; frame += 1) {
    withMatter.model.step(1 / 60);
    withoutMatter.model.step(1 / 60);
  }

  assert.ok(withMatter.points[0] < initialDistance);
  assert.equal(withoutMatter.points[0], initialDistance);
  assert.ok(withMatter.model.state.scaleFactor > 0.8);
});

test('Lambda changes the background acceleration independently of local attraction', () => {
  const withLambda = evaluateFlatLcdm(0.9, { omegaMatter: 0.315, omegaLambda: 0.685, h0Visual: 1 });
  const noLambda = evaluateFlatLcdm(0.9, { omegaMatter: 0.315, omegaLambda: 0, h0Visual: 1 });
  assert.ok(withLambda.acceleration > 0);
  assert.ok(noLambda.acceleration < 0);
});

test('large frame gaps are clamped; hidden, paused and reduced-motion gates freeze dynamics', () => {
  const make = () => {
    const points = new Float32Array([4, 0, 0]);
    const model = createCosmicDynamics({
      particleBuffers: [points],
      anchors: new Float32Array([0, 0, 0]),
      matterAttraction: 0.01,
      h0Visual: 0.01,
      maxComovingSpeed: 0.2,
    });
    return { points, model };
  };
  const clamped = make();
  const capped = make();
  clamped.model.step(100);
  capped.model.step(0.05);
  assert.deepEqual([...clamped.points], [...capped.points]);
  assert.equal(clamped.model.state.fixedSteps, 3);

  const before = [...clamped.points];
  const beforeA = clamped.model.state.scaleFactor;
  clamped.model.step(0.05, { hidden: true });
  clamped.model.step(0.05, { paused: true });
  clamped.model.step(0.05, { reducedMotion: true });
  assert.deepEqual([...clamped.points], before);
  assert.equal(clamped.model.state.scaleFactor, beforeA);
});

test('reset restores positions and scale; long runs stay finite and bounded', () => {
  const points = new Float32Array([3, 1, -2, -7, 3, 5]);
  const initial = [...points];
  const model = createCosmicDynamics({
    particleBuffers: [points],
    anchors: new Float32Array([0, 0, 0, 2, 2, 2]),
    maxComovingSpeed: 0.01,
  });

  for (let frame = 0; frame < 30_000; frame += 1) model.step(0.05);
  assert.ok(points.every(Number.isFinite));
  assert.ok(points.every(value => Math.abs(value) <= 40));
  assert.ok(model.state.scaleFactor <= 1.2);
  assert.ok(model.state.scaleFactor >= 0.5);
  assert.ok(model.state.expansion >= 1 && model.state.expansion <= 1.14);

  model.reset();
  assert.deepEqual([...points], initial);
  assert.equal(model.state.scaleFactor, 0.66);
  assert.equal(model.state.simulatedSeconds, 0);
});
