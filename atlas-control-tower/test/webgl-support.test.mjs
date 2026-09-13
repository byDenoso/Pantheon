import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsWebGL2, resolveMapRenderMode } from '../src/graph-engine/webgl-support.ts';

test('returns true when getContext("webgl2") yields a context object', () => {
  const fake = () => ({ getContext: () => ({}) });
  assert.equal(supportsWebGL2(fake), true);
});

test('returns false when getContext("webgl2") yields null (no WebGL2 support)', () => {
  const fake = () => ({ getContext: () => null });
  assert.equal(supportsWebGL2(fake), false);
});

test('returns false when getContext throws (context creation blocked)', () => {
  const fake = () => ({ getContext: () => { throw new Error('blocked'); } });
  assert.equal(supportsWebGL2(fake), false);
});

test('returns false when the canvas factory itself throws', () => {
  const fake = () => { throw new Error('no document'); };
  assert.equal(supportsWebGL2(fake), false);
});

test('resolveMapRenderMode: no WebGL2 support -> table, regardless of contextLost', () => {
  assert.equal(resolveMapRenderMode({ webgl2Supported: false, contextLost: false }), 'table');
  assert.equal(resolveMapRenderMode({ webgl2Supported: false, contextLost: true }), 'table');
});

test('resolveMapRenderMode: WebGL2 supported and no context loss -> canvas', () => {
  assert.equal(resolveMapRenderMode({ webgl2Supported: true, contextLost: false }), 'canvas');
});

test('resolveMapRenderMode: WebGL2 supported but context lost -> table', () => {
  assert.equal(resolveMapRenderMode({ webgl2Supported: true, contextLost: true }), 'table');
});
