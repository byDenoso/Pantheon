import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3} from 'three';
import {syncCamera} from '../src/tower-web/gl3d.ts';
import {project, fitCamera, orbit, pan, zoom} from '../src/tower-web/camera3d.ts';

test('gl camera: the three.js camera projects every point to the same pixel as camera3d.project (labels and picking line up with the shaders)', () => {
  const W = 1000, H = 640, ext = 40; const cam0 = fitCamera(ext, W, H, {x: 3, y: -2, z: 5});
  const cams = [cam0, orbit(cam0, 120, -40), pan(orbit(cam0, -300, 80), 30, -22), zoom(cam0, 0.4, ext), {...orbit(cam0, 50, 200), dist: cam0.dist * 1.7}];
  const pts = [{x: 0, y: 0, z: 0}, {x: 10, y: 5, z: -7}, {x: -22, y: 18, z: 13}, {x: 30, y: -25, z: 2}, {x: 3, y: -2, z: 5}];
  const cam3 = new PerspectiveCamera();
  for (const c of cams) {
    syncCamera(cam3, c, W, H, ext);
    for (const p of pts) {
      const ref = project(c, p, W, H); const v = new Vector3(p.x, p.y, p.z).project(cam3);
      if (!ref) continue;
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      assert.ok(Math.abs(sx - ref.x) < 0.05 && Math.abs(sy - ref.y) < 0.05, `pixel match (${sx.toFixed(2)},${sy.toFixed(2)}) vs (${ref.x.toFixed(2)},${ref.y.toFixed(2)})`);
    }
  }
});
