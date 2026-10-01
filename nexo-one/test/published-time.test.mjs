import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatPublishedAge, publishedAgeMs, isPublishedFresh } from '../src/viewmodels/published-time.ts';
import { latestDelivery } from '../src/features/lab/live-state.ts';
import { observedActivity } from '../src/features/lab/activity-presentation.ts';
import { ago } from '../src/features/lab/model.ts';
const now = Date.parse('2026-10-01T05:00:00Z');
test('missing, invalid and future dates cannot attest freshness or be labelled now', () => {
  for (const value of [null, '', 'bad', '2026-10-01T05:00:01Z']) {
    assert.equal(publishedAgeMs(value, now), null);
    assert.equal(isPublishedFresh(value, undefined, now), false);
    assert.notEqual(formatPublishedAge(value, now), 'agora');
  }
  assert.equal(formatPublishedAge('bad', now), 'data inválida');
  assert.equal(formatPublishedAge('2026-10-01T05:00:01Z', now), 'data futura');
  assert.equal(publishedAgeMs('2026-10-01T05:00:00Z', now), 0);
  assert.equal(formatPublishedAge('2026-10-01T05:00:00Z', now), 'agora');
  assert.equal(isPublishedFresh('2026-10-01T04:14:00Z', undefined, now), false);
  assert.equal(isPublishedFresh('2026-10-01T04:15:00Z', undefined, now), true);
  assert.equal(ago('bad'), 'data inválida');
});
test('header, home, health and live execution use the same fail-closed published date guard', async () => {
  const header = await readFile(new URL('../src/shell/InstrumentHeader.tsx', import.meta.url), 'utf8');
  const lab = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const live = await readFile(new URL('../src/features/lab/LiveNowPanel.tsx', import.meta.url), 'utf8');
  assert.match(header, /formatPublishedAge\(value, now\)/);
  assert.match(lab, /!isPublishedFresh\(state.generated_at\)/);
  assert.match(live, /!isPublishedFresh\(lab.generatedAt\)/);
  assert.match(lab, /sourceCurrent=\{sourceCurrent\}/);
});


test('future and invalid events cannot be the latest observed delivery or crew activity', () => {
  const past = { event_type: 'TEST_RESULT_RECORDED', role: 'EXECUTOR', at: '2026-10-01T04:59:00Z' };
  const future = { ...past, at: '2026-10-01T09:00:00Z' };
  const invalid = { ...past, at: 'invalid' };
  const events = [past, future, invalid];
  assert.equal(latestDelivery({ activity: events }, undefined, now), past);
  assert.equal(latestDelivery({ activity: [future, invalid] }, undefined, now), undefined);
  assert.deepEqual(observedActivity(events, now), [past]);
  assert.deepEqual(events, [past, future, invalid]);
});
