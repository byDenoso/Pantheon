import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('Vercel API entrypoint is CommonJS-loadable while bridging to the ESM handler dynamically', () => {
  const entrypoint = require('../../api/index.js');
  assert.equal(typeof entrypoint, 'function');
});
