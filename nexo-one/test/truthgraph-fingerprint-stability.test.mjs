import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTruthGraph} from '../server/compiler/truthgraph.mjs';

const authorityRows=[{domain:'OLYMPUS',canonical_truth:'Olympus Drive folder/ledger/protocol for persisted data/state',operational_truth:'Drive Olympus persisted state',chat_role:'context',conflict_rule:'persisted data wins'}];
const truthRows=[{record_type:'truth',record_id:'OLYMPUS',status:'ACTIVE',title:'Google Sheets:NEXO · SSOT CANONICAL / Olympus',detail:'Olympus operational truth hot state',updated_at:'2026-09-09T20:00:00-03:00'}];
const capabilityRows=[{capability_id:'CAP-OLYMPUS-ANTICIPATORY-E2E',domain:'OLYMPUS',runtime:'SCHEDULED_TASK',operation:'Signal→ACTION→Calendar/Drive→readback',status:'PASS',last_tested_at:'2026-09-09T20:00:00-03:00',readback:'PASS',fingerprint:'cap-oly-pass'}];
const refs={authority:'https://docs.google.com/spreadsheets/d/action/edit#gid=1',ssot:'https://docs.google.com/spreadsheets/d/ssot/edit#gid=2'};

function run(checkedAt){
  return buildTruthGraph({authorityRows,truthRows,capabilityRows,providers:[
    {id:'drive',status:'AVAILABLE',partial:false,checkedAt},
    {id:'nexo',status:'AVAILABLE',partial:false,checkedAt}
  ],refs,now:Date.parse(checkedAt)});
}

test('semantic fingerprints ignore provider checked_at when state is unchanged',()=>{
  const a=run('2026-09-10T05:00:00-03:00');
  const b=run('2026-09-10T05:10:00-03:00');
  assert.equal(a.results[0].status,'CONFLICT');
  assert.equal(a.results[0].fingerprint,b.results[0].fingerprint);
  assert.equal(a.fingerprint,b.fingerprint);
});
