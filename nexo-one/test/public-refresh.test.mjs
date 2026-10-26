import test from 'node:test';
import assert from 'node:assert/strict';
import {startPublicRefresh} from '../src/atlas/publicRefresh.ts';

const ready = day => ({status: 'ready', items: [], tests: [], campaigns: [], coverage: 'COMPLETE',
  generatedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`});
const settle = async () => {await Promise.resolve(); await Promise.resolve();};
function clock() {
  let visible = true, wake, nextId = 0;
  const timers = new Map();
  return {
    host: {
      visible: () => visible,
      later: (fn, delay) => {const id = ++nextId; timers.set(id, {fn, delay}); return () => timers.delete(id);},
      onWake: fn => {wake = fn; return () => {wake = undefined;};},
    },
    tick: async delay => {
      const timer = [...timers].find(([, t]) => t.delay === delay);
      assert.ok(timer, `no ${delay} timer`);
      timers.delete(timer[0]); timer[1].fn(); await settle();
    },
    visibility: async value => {visible = value; wake?.(); await settle();},
    focus: async () => {wake?.(); await settle();},
    timerCount: () => timers.size,
  };
}

test('public display recovers across 21 deterministic days and rejects older snapshots', async () => {
  const c = clock(), updates = []; let day = 1;
  const stop = startPublicRefresh(async () => day === 5 ? {status: 'unavailable', items: [], tests: []}
    : day === 10 ? ready(2) : ready(day), (state, delayed) => updates.push({state, delayed}), c.host);
  await settle();
  for (day = 2; day <= 21; day++) {
    await c.tick(60_000);
    const last = updates.at(-1);
    assert.equal(last.delayed, day === 5 || day === 10);
    assert.equal(last.state.generatedAt, ready(day === 5 ? 4 : day === 10 ? 9 : day).generatedAt);
  }
  stop(); assert.equal(c.timerCount(), 0);
});

test('repeated snapshots do not republish or rerender the same display', async () => {
  const c = clock(), updates = [];
  const stop = startPublicRefresh(async () => ready(1), (...row) => updates.push(row), c.host);
  await settle(); await c.tick(60_000); await c.focus();
  assert.equal(updates.length, 1); stop();
});

test('hidden tab pauses reads, focus resumes, and cleanup cancels all work', async () => {
  const c = clock(); let reads = 0;
  const stop = startPublicRefresh(async () => {reads++; return ready(1);}, () => {}, c.host);
  await settle(); await c.visibility(false);
  assert.equal(c.timerCount(), 0); await c.focus(); assert.equal(reads, 1);
  await c.visibility(true); assert.equal(reads, 2);
  stop(); await c.focus(); assert.equal(reads, 2); assert.equal(c.timerCount(), 0);
});

test('overlapping wake events and abandoned responses cannot update the display', async () => {
  const c = clock(), updates = []; let resolve, reads = 0, signal;
  const stop = startPublicRefresh(s => {reads++; signal = s; return new Promise(r => {resolve = r;});},
    (...row) => updates.push(row), c.host);
  await c.focus(); assert.equal(reads, 1);
  stop(); assert.equal(signal.aborted, true); resolve(ready(1)); await settle();
  assert.equal(updates.length, 0); assert.equal(c.timerCount(), 0);
});

test('timed-out read releases the request and permits later reconciliation', async () => {
  const c = clock(), updates = []; let reads = 0;
  const stop = startPublicRefresh(signal => {
    if (++reads === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic timeout'))));
    return Promise.resolve(ready(2));
  }, (...row) => updates.push(row), c.host);
  await c.tick(30_000); assert.equal(updates.at(-1)[1], true);
  await c.tick(60_000); assert.equal(updates.at(-1)[1], false);
  assert.equal(reads, 2); stop(); assert.equal(c.timerCount(), 0);
});
