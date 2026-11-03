import test from 'node:test';
import assert from 'node:assert/strict';
import {activityBins} from '../src/cockpit/activity-model.ts';

test('activity chart counts only dated records inside the explicit window', () => {
  const end = Date.parse('2026-11-03T19:00:00Z'), hour = 3_600_000;
  const events = [{when: end-hour, kind:'resultado'}, {when:end-1, kind:'mural'}, {when:end-1,kind:'mural'}, {when:null,kind:'resultado'}, {when:end+1,kind:'mural'}, {when:end-25*hour,kind:'resumo'}];
  const rows = activityBins(events, end, 24);
  assert.equal(rows.length, 24*3);
  assert.equal(rows.reduce((sum,row)=>sum+row.count,0), 3);
  assert.equal(rows.find(row=>row.at===end-hour&&row.kind==='mural').count,2);
  assert.equal(rows.find(row=>row.at===end-hour&&row.kind==='resultado').count,1);
  assert.equal(rows[0].at,end-24*hour);
});

test('activity chart keeps zero bins and does not mutate incoming records', () => {
  const events=Object.freeze([Object.freeze({when:NaN,kind:'mural'})]);
  assert.ok(activityBins(events,Date.parse('2026-11-03T19:00:00Z'),6).every(row=>row.count===0));
});
