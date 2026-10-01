import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startPublishedClock } from '../src/hooks/usePublishedClock.ts';
import { isPublishedFresh } from '../src/viewmodels/published-time.ts';
test('freshness crosses the threshold without a new snapshot and stops cleanly', () => {
  let now = Date.parse('2026-10-01T05:00:00Z'); const snapshot = { generated_at: new Date(now).toISOString() };
  let tick; let change; let cleared = false; let removed = false; const received = [];
  const timer = { setInterval(callback, delay) { assert.equal(delay, 30000); tick = callback; return 1; }, clearInterval(id) { assert.equal(id, 1); cleared = true; } };
  const visibility = { visibilityState: 'visible', addEventListener(name, callback) { assert.equal(name, 'visibilitychange'); change = callback; }, removeEventListener(name, callback) { assert.equal(name, 'visibilitychange'); assert.equal(callback, change); removed = true; } };
  const stop = startPublishedClock(clock => received.push(isPublishedFresh(snapshot.generated_at, undefined, clock)), timer, visibility, () => now);
  tick(); assert.equal(received.at(-1), true);
  now += 46 * 60000; tick(); assert.equal(received.at(-1), false);
  visibility.visibilityState = 'hidden'; tick(); assert.equal(received.length, 2);
  visibility.visibilityState = 'visible'; change(); assert.equal(received.length, 3); assert.equal(received.at(-1), false);
  stop(); assert.equal(cleared, true); assert.equal(removed, true);
});
test('the header and scene-owning Lab root subscribe to the age clock', async () => {
  const lab = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const header = await readFile(new URL('../src/shell/InstrumentHeader.tsx', import.meta.url), 'utf8');
  assert.match(lab, /const publishedNow = usePublishedClock\(\)/);
  assert.match(lab, /\[state, lab, sourceCurrent, thoughtKey\]/);
  assert.match(header, /const publishedNow = usePublishedClock\(\)/);
});
