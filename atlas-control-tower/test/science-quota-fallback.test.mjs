import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub manifest authorizes a Drive-backed science snapshot, never a network database',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'GITHUB');
 assert.equal(authority.scienceProjection?.kind,'GOOGLE_DRIVE');
 assert.equal(authority.scienceProjection?.schema,'nexo-science-drive-github-v1');
 assert.equal(authority.scienceProjection?.transportPath,'atlas-control-tower/data/science-drive-projection.json');
 assert.equal(authority.scienceProjection?.role,'PROJECTION_ONLY');
 assert.doesNotMatch(JSON.stringify(authority.scienceProjection),/DATA_API|OIDC/i);
});

test('science API reads only the GitHub-persisted Drive projection',()=>{
 const science=read('api/science.js');
 assert.match(science,/drive-github-science\.mjs/);
 assert.match(science,/loadDriveGithubScience/);
 assert.match(science,/projectDriveGithubScience/);
 assert.doesNotMatch(science,/atlas\.js|DATA_API|OIDC/i);
});

test('Drive GitHub reader exposes graph state and entity projection without a network database',()=>{
 const reader=read('lib/drive-github-science.mjs');
 assert.match(reader,/nexo-science-drive-github-v1/);
 assert.match(reader,/science-drive-projection\.json/);
 assert.match(reader,/projectDriveGithubScience/);
 assert.match(reader,/PRODUCES/);
 assert.match(reader,/result:/);
 assert.doesNotMatch(reader,/neon\.tech|DATA_API|OIDC/i);
});

test('sharded snapshot contains the complete canonical Test Registry corpus',()=>{
 const snapshot=JSON.parse(read('data/science-drive-projection.json'));
 assert.equal(snapshot.contract,'nexo-science-drive-github-v1');
 assert.equal(snapshot.source,'GOOGLE_DRIVE');
 assert.match(snapshot.sourceRef,/PEER_CONTROL_TOWER_CANONICAL/);
 assert.ok(snapshot.domains.some(d=>d.id==='domain:D7'&&d.label));
 assert.equal(snapshot.shards?.D7,'science-drive-projection/D7.json');
 const shardEntries=Object.entries(snapshot.shards||{});
 const total=shardEntries.reduce((sum,[name,rel])=>{
  const shard=JSON.parse(read(`data/${rel}`));
  const actual=Array.isArray(shard.tests)?shard.tests.length:0;
  assert.equal(snapshot.completeness?.byShard?.[name]?.included,actual,`${name} included count drift`);
  assert.equal(snapshot.completeness?.byShard?.[name]?.truncated,false,`${name} must be complete`);
  return sum+actual;
 },0);
 assert.equal(total,snapshot.completeness?.tests?.declared);
 assert.equal(snapshot.completeness?.tests?.included,total);
 assert.equal(snapshot.completeness?.tests?.truncated,false);
});

test('historical D1 test resolves through the rich science entity projection',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const response=projectDriveGithubScience(state,'entity',{id:'T-AF-001'});
 assert.equal(response.entity?.id,'T-AF-001');
 assert.equal(response.entity?.type,'TEST');
 assert.equal(response.entity?.domain,'D1');
 assert.ok(response.entity?.summary);
});

test('D7 graph contains a real canonical CMB test and a derived result edge',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const graph=projectDriveGithubScience(state,'graph',{focus:'domain:D7'});
 const testNode=graph.nodes.find(n=>n.id==='T-ALENS-001');
 assert.ok(testNode,'expected canonical D7 test is absent');
 assert.equal(testNode.type,'TEST');
 assert.equal(testNode.domain,'D7');
 assert.ok(testNode.summary);
 assert.ok(testNode.evidenceClass);
 const resultNode=graph.nodes.find(n=>n.id==='result:T-ALENS-001');
 assert.ok(resultNode,'expected derived result node is absent');
 assert.equal(resultNode.type,'RESULT');
 assert.ok(graph.edges.some(e=>e.source==='T-ALENS-001'&&e.target==='result:T-ALENS-001'&&e.type==='PRODUCES'));
 assert.equal(graph.freshness,'SNAPSHOT');
 assert.equal(graph.projectionAuthority,'GOOGLE_DRIVE');
});
