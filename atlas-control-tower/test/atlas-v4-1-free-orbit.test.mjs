import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('free orbit crosses both poles without changing target distance', async () => {
  const { freeOrbitPose } = await import('../src/scene/free-orbit.mjs');
  const target = [0, 0, 0];
  const start = { position: [0, 0, 10], up: [0, 1, 0] };

  const northCross = freeOrbitPose({ ...start, target, deltaYaw: 0, deltaPitch: Math.PI * 0.75 });
  assert.ok(northCross.position[1] < -6.9, 'camera should continue through the first pole');
  assert.ok(northCross.position[2] < -6.9, 'camera should emerge behind the target after pole crossing');

  const southCross = freeOrbitPose({ ...northCross, target, deltaYaw: 0, deltaPitch: Math.PI });
  assert.ok(southCross.position[1] > 6.9, 'camera should continue through the opposite pole');
  assert.ok(southCross.position[2] > 6.9, 'camera should keep a continuous orbit after the second crossing');

  for (const pose of [northCross, southCross]) {
    const distance = Math.hypot(
      pose.position[0] - target[0],
      pose.position[1] - target[1],
      pose.position[2] - target[2],
    );
    assert.ok(Math.abs(distance - 10) < 1e-9, `orbit distance drifted: ${distance}`);
    assert.ok([...pose.position, ...pose.up].every(Number.isFinite), 'pose must stay finite through poles');
  }
});

test('free orbit supports more than two full azimuth turns without clamping', async () => {
  const { freeOrbitPose } = await import('../src/scene/free-orbit.mjs');
  const target = [0, 0, 0];
  const start = { position: [0, 0, 12], up: [0, 1, 0] };
  const pose = freeOrbitPose({ ...start, target, deltaYaw: Math.PI * 4.5, deltaPitch: 0 });

  assert.ok(Math.abs(Math.hypot(...pose.position) - 12) < 1e-9);
  assert.ok(Math.abs(pose.position[0] - 12) < 1e-8, '4.5 turns should finish at the +X quarter-turn orientation');
  assert.ok(Math.abs(pose.position[2]) < 1e-8);
});

test('R3F spatial camera delegates rotation to the free-orbit controller instead of pole-clamped OrbitControls', async () => {
  const source = await read('src/scene/AtlasCanvas.tsx');
  assert.match(source, /from ['"]\.\/free-orbit\.mjs['"]/);
  assert.match(source, /enableRotate=\{false\}/);
  assert.match(source, /data-camera-mode="free-orbit-360"/);
  assert.doesNotMatch(source, /minPolarAngle=\{presentationMode===['"]spatial['"][^\n]+/);
});

test('orientation gizmo and mobile gesture hint are part of the spatial renderer contract', async () => {
  const source = await read('src/scene/AtlasCanvas.tsx');
  assert.match(source, /atlas-orientation-gizmo/);
  assert.match(source, /1 dedo[^<\n]*orbitar/i);
  assert.match(source, /2 dedos[^<\n]*mover/i);
  assert.match(source, /pin[cç]a[^<\n]*aproximar/i);
});
