const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('vercel config preserves filesystem/api before SPA fallback', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(Array.isArray(config.routes));
  assert.deepEqual(config.routes[0], { handle: 'filesystem' });
  assert.equal(config.routes.at(-1).dest, '/index.html');
});

test('README documents existing production target and degraded/live contract without secrets', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /nexo-research-os-live/);
  assert.match(readme, /DATABASE_URL/);
  assert.match(readme, /POSTGRES_URL/);
  assert.match(readme, /NEON_DATABASE_URL/);
  assert.match(readme, /EMBEDDED_FALLBACK/);
  assert.doesNotMatch(readme, /npg_[A-Za-z0-9]+/);
});
