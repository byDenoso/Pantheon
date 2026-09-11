import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  scienceSourceRefs,
  opsSourceRefs,
  learningSourceRefs,
  TOWER_ID,
  ACTION_REGISTER_ID,
} from '../lib/source-links.mjs';

const driveRuntime=fs.readFileSync(new URL('../lib/drive-ssot.mjs',import.meta.url),'utf8');

test('science source rows resolve to exact frozen Tower sheet ranges', () => {
  const [ref] = scienceSourceRefs({source_surface:'Test Registry',source_row_key:"'Test Registry'!A1000:P1000",observed_at:'2026-09-07T00:00:00Z'});
  assert.equal(ref.sourceId,TOWER_ID);assert.match(ref.url,new RegExp(`spreadsheets/d/${TOWER_ID}/edit#gid=200000001`));assert.match(ref.url,/range=A1000%3AP1000/);assert.equal(ref.source,'PEER_CONTROL_TOWER_FROZEN');
});

test('science direct Drive documents remain clickable without a provenance row', () => {
  const [ref]=scienceSourceRefs({source_surface:'Drive result document',source_row_key:'14meZg3MP5ETAZXbIw-9WCAUlXDzJWK3rfSZytE6WZLA'});
  assert.equal(ref.sourceId,'14meZg3MP5ETAZXbIw-9WCAUlXDzJWK3rfSZytE6WZLA');assert.match(ref.url,/drive\.google\.com\/open\?id=14meZg3MP5ETAZXbIw-9WCAUlXDzJWK3rfSZytE6WZLA/);
});

test('ops Action Register ranges resolve to their exact sheet tab and range', () => {
  const [ref]=opsSourceRefs({source_kind:'GOOGLE_SHEETS',source_id:ACTION_REGISTER_ID,source_ref:'EXECUTION_RUNS!A242:AV242',observed_at:'2026-09-04T00:00:00Z'});
  assert.equal(ref.sourceId,ACTION_REGISTER_ID);assert.match(ref.url,new RegExp(`spreadsheets/d/${ACTION_REGISTER_ID}/edit#gid=1195883185`));assert.match(ref.url,/range=A242%3AAV242/);
});

test('ops Drive-action aliases use Action Register rather than treating action ids as Drive ids', () => {
  const [ref]=opsSourceRefs({source_kind:'DRIVE_ACTION',source_id:'ACT-ENG-ASCOM-00323-MAJOR-REV',source_ref:'ACTIONS_ENGINEERING!A5:AC5'});
  assert.equal(ref.sourceId,ACTION_REGISTER_ID);assert.match(ref.url,/gid=718507450/);
});

test('learning Action Register provenance points to the correct compatibility tab', () => {
  const [ref]=learningSourceRefs({source_kind:'ACTION_REGISTER.PROCEDURAL_MEMORY',source_id:'PM-001'});
  assert.equal(ref.sourceId,ACTION_REGISTER_ID);assert.match(ref.url,/gid=2100000001/);assert.equal(ref.source,'ACTION_REGISTER_PROVENANCE');
});

test('Drive entity reads preserve declared source references without a semantic overlay',()=>{
  assert.match(driveRuntime,/function allEntities/);
  assert.match(driveRuntime,/metadata:\{sourceRef/);
  assert.match(driveRuntime,/driveEntity/);
  assert.match(driveRuntime,/entity\?\.metadata\?\.sourceRef/);
});
