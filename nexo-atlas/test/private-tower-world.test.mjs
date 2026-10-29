import test from 'node:test';
import assert from 'node:assert/strict';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {buildTruthGraph} from '../server/compiler/truthgraph.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';

test('private Tower declarations remain snapshots and do not establish a live Writer',()=>{
  const tower=makePrivateTowerFixture();
  tower.files['manifests/capabilities.json'].value.capabilities={
    mutation:{backend:'nexo_agent_api',domain:'NEXO',operation:'WRITE',status:'PASS',roles:['LEARNER']},
  };
  const before=JSON.stringify(tower),runtime=compilePrivateTowerRuntime(tower).data;
  const finding=runtime.world.truthGraph.results.find(row=>row.domain==='NEXO');
  assert.equal(finding.status,'SNAPSHOT');
  assert.equal(finding.authority.operational_truth,tower.write_model);
  assert.equal(finding.capability.state,'PASS');
  assert.match(finding.explanation,/disponibilidade atual de execução e escrita não foi verificada/);
  assert.equal(runtime.publication.manifest.writeback,'FORBIDDEN');
  assert.equal(JSON.stringify(tower),before);
});

test('snapshot-only classification preserves unavailable and conflicting evidence',()=>{
  const now=Date.parse('2026-10-06T18:00:00Z');
  const base={now,snapshotOnly:true,authorityRows:[{domain:'NEXO',canonical_truth:'TOWER_V06@GOOGLE_DRIVE_PRIVATE'}],providers:[{id:'nexo',status:'AVAILABLE',partial:false,checkedAt:new Date(now).toISOString()}]};
  const status=extra=>buildTruthGraph({...base,...extra}).results[0].status;
  assert.equal(status({}),'SNAPSHOT');
  assert.equal(status({providers:[]}),'MISSING_PROVIDER');
  assert.equal(status({capabilityRows:[{domain:'NEXO',capability_id:'write',status:'BLOCKED'}]}),'BLOCKED');
  assert.equal(status({capabilityRows:[{domain:'NEXO',capability_id:'write',status:'UNKNOWN'}]}),'DEGRADED');
  assert.equal(status({truthRows:[{domain:'NEXO',record_type:'truth',record_id:'NEXO',status:'ACTIVE',title:'GitHub',updated_at:new Date(now).toISOString()}]}),'CONFLICT');
  assert.equal(status({snapshotOnly:false}),'LIVE');
  assert.notEqual(buildTruthGraph(base).fingerprint,buildTruthGraph({...base,snapshotOnly:false}).fingerprint);
});

test('private control provenance resolves to the exact canonical filename',()=>{
  const tower=makePrivateTowerFixture(),system=compilePrivateTowerRuntime(tower).data.system;
  const rows=[...system.lanes,...system.findings,...system.graph.nodes.filter(row=>row.type==='DOMAIN')];
  assert.ok(rows.length>0);
  for(const row of rows){
    const path=new URL(row.source_ref).hash.slice(1);
    assert.equal(path,'CONTROL.json');
    assert.ok(Object.hasOwn(tower.files,path));
    assert.equal(row.source_revision,tower.revision);
  }
});
