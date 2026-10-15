import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUALITY, buildWeb, frameIntervalMs, project} from '../src/atlas/web/webModel.ts';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('hero animation cadence is bounded and preserves the original projection', () => {
  const expected = {high: 30, medium: 24, low: 20};
  for (const quality of Object.keys(QUALITY)) {
    assert.equal(Math.round(1000 / frameIntervalMs(quality)), expected[quality]);
    assert.deepEqual(buildWeb(20251, QUALITY[quality]), buildWeb(20251, QUALITY[quality]));
  }
  for (let n = 0; n < 1000; n++) {
    const angle = n / 57, node = {x: Math.sin(n), y: Math.cos(n), z: Math.sin(n / 3), r: 1};
    assert.deepEqual(project(node, angle, 840, 420), project(node, angle, 840, 420, 420, Math.cos(angle), Math.sin(angle)));
  }
});

test('public shell loads noncritical artwork and campaigns on demand', () => {
  const app = read('../src/atlas/ui/PublicApp.tsx');
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /cancelIdleCallback/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /motionReady &&/);
  assert.match(app, /lazy\(\(\) => import\('\.\/PublicCampaignsView\.tsx'\)\)/);
  const campaign = read('../src/atlas/ui/PublicCampaignsView.tsx');
  assert.match(campaign, /testsExpanded &&/);
  assert.match(campaign, /onToggle=\{event => setTestsExpanded\(event\.currentTarget\.open\)\}/);
});

test('static cache policy does not include private/API routes', () => {
  const config = JSON.parse(read('../vercel.json'));
  const rule = config.headers.find(rule => rule.source === '/assets/(.*)');
  assert.equal(rule?.headers.find(h => h.key === 'Cache-Control')?.value, 'public, max-age=31536000, immutable');
  assert.equal(config.headers.some(rule => rule.source.includes('api/') && rule.headers.some(h => h.key === 'Cache-Control')), false);
});
