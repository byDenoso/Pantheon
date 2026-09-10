import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTruthGraph} from '../server/compiler/truthgraph.mjs';

const NOW=Date.parse('2026-09-09T23:30:00-03:00');
const refs={authority:'https://docs.google.com/spreadsheets/d/action/edit#gid=1',capability:'https://docs.google.com/spreadsheets/d/action/edit#gid=2',ssot:'https://docs.google.com/spreadsheets/d/ssot/edit#gid=3'};
const authority=(domain,canonical_truth)=>({domain,canonical_truth,operational_truth:'runtime',chat_role:'context',conflict_rule:'canonical wins',notes:''});
const truth=(record_id,title,detail='aligned',updated_at='2026-09-09T20:00:00-03:00')=>({record_type:'truth',record_id,status:'ACTIVE',title,detail,source:'NEXO · SSOT CANONICAL',updated_at});
const provider=(id,status='AVAILABLE',partial=false)=>({id,status,partial,checkedAt:'2026-09-09T23:29:00-03:00'});
const cap=(domain,status='PASS',id=`CAP-${domain}`)=>({capability_id:id,domain,runtime:'TEST',operation:'readback',status,last_tested_at:'2026-09-09T20:00:00-03:00',readback:status==='PASS'?'PASS':'UNKNOWN',fingerprint:`fp-${id}`});

function graph({authorityRows,truthRows=[],capabilityRows=[],providers=[]}){
  return buildTruthGraph({authorityRows,truthRows,capabilityRows,providers,refs,now:NOW});
}

test('Olympus is CONFLICT when SSOT declares Sheets while authority matrix declares Drive',()=>{
  const out=graph({
    authorityRows:[authority('OLYMPUS','Olympus Drive folder/ledger/protocol for persisted data/state')],
    truthRows:[truth('OLYMPUS','Google Sheets:NEXO · SSOT CANONICAL / Olympus','Olympus operational truth hot state')],
    capabilityRows:[cap('OLYMPUS')],providers:[provider('drive'),provider('nexo')]
  });
  const finding=out.results[0];
  assert.equal(finding.status,'CONFLICT');
  for(const key of ['source_ref','fingerprint','checked_at','authority','provider','capability','explanation']) assert.ok(finding[key],key);
  assert.equal(finding.material,true);
  assert.equal(finding.provider.expected,'drive');
  assert.equal(finding.provider.actual,'nexo');
  assert.equal(finding.provider.status,'AVAILABLE');
  assert.equal(finding.provider.expected_status,'AVAILABLE');
});

test('Olympus canonical NEXO SSOT authority resolves to nexo instead of owner-dependent',()=>{
  const out=graph({
    authorityRows:[authority('OLYMPUS','NEXO · SSOT CANONICAL / Olympus')],
    truthRows:[truth('OLYMPUS','Google Sheets:NEXO · SSOT CANONICAL / Olympus','Olympus operational truth hot state')],
    capabilityRows:[cap('OLYMPUS')],providers:[provider('nexo')]
  });
  const finding=out.results[0];
  assert.equal(finding.provider.expected,'nexo');
  assert.equal(finding.provider.actual,'nexo');
  assert.equal(finding.status,'LIVE');
  assert.equal(finding.material,false);
});

test('detects LIVE, DEGRADED, STALE_DECLARATION, MISSING_PROVIDER and BLOCKED',()=>{
  const cases=[
    ['LIVE',{authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime')],capabilityRows:[cap('ENGINEERING')],providers:[provider('github')]},'LIVE'],
    ['DEGRADED',{authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime')],capabilityRows:[cap('ENGINEERING','PENDING_CANARY')],providers:[provider('github')]},'DEGRADED'],
    ['STALE_DECLARATION',{authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime','aligned','2026-08-20T10:00:00-03:00')],capabilityRows:[cap('ENGINEERING')],providers:[provider('github')]},'STALE_DECLARATION'],
    ['MISSING_PROVIDER',{authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime')],capabilityRows:[cap('ENGINEERING')],providers:[provider('github','UNAVAILABLE')]},'MISSING_PROVIDER'],
    ['BLOCKED',{authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime')],capabilityRows:[cap('ENGINEERING','FAIL')],providers:[provider('github')]},'BLOCKED']
  ];
  for(const [name,input,expected] of cases){
    const finding=graph(input).results[0];
    assert.equal(finding.status,expected,name);
    assert.match(finding.fingerprint,/^TG-/);
  }
});

test('fingerprints ignore checked_at but change when semantic state changes',()=>{
  const input={authorityRows:[authority('ENGINEERING','Git/GitHub for versioned code')],truthRows:[truth('ENGINEERING','GitHub:repo + real runtime')],capabilityRows:[cap('ENGINEERING')],providers:[provider('github')]};
  const a=buildTruthGraph({...input,refs,now:NOW});
  const b=buildTruthGraph({...input,refs,now:NOW+60_000});
  assert.equal(a.results[0].fingerprint,b.results[0].fingerprint);
  const c=buildTruthGraph({...input,refs,now:NOW,capabilityRows:[cap('ENGINEERING','PENDING_CANARY')]});
  assert.notEqual(a.results[0].fingerprint,c.results[0].fingerprint);
});
