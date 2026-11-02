import test from 'node:test';
import assert from 'node:assert/strict';

let shouldAnimate;
try { ({shouldAnimate} = await import('../src/atlas/ui/orbitalMotion.mjs')); } catch {}

test('the decorative scene only animates while it is visible and motion is allowed', () => {
  assert.equal(typeof shouldAnimate, 'function', 'motion policy must be available');
  const running = {visible: true, pageVisible: true, paused: false, reduced: false};
  assert.equal(shouldAnimate(running), true);
  for (const state of [
    {...running, visible: false},
    {...running, pageVisible: false},
    {...running, paused: true},
    {...running, reduced: true},
  ]) assert.equal(shouldAnimate(state), false);
});
