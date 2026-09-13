import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub manifest authorizes a Drive-backed science snapshot, never Neon',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'GITHUB');
 assert.equal(authority.scienceProjection?.kind,'GOOGLE_DRIVE');
 assert.equal(authority.scienceProjection?.schema,'nexo-science-drive-github-v1');
 assert.equal(authority.scienceProjection?.transportPath,'atlas-control-tower/data/science-drive-projection.json');
 assert.equal(authority.scienceProjection?.role,'PROJECTION_ONLY');
 assert.doesNotMatch(JSON.stringify(authority.scienceProjection),/NEON|DATA_API|OIDC/i);
});

test('science API reads only the GitHub-persisted Drive projection',()=>{
 const science=read('api/science.js');
 assert.match(science,/drive-github-science\.mjs/);
 assert.match(science,/loadDriveGithubScience/);
 assert.match(science,/projectDriveGithubScience/);
 assert.doesNotMatch(science,/atlas\.js|NEON|science_v1|DATA_API|OIDC/i);
});

test('Drive GitHub reader exposes graph state and entity projection without a network database',()=>{
 const reader=read('lib/drive-github-science.mjs');
 assert.match(reader,/nexo-science-drive-github-v1/);
 assert.match(reader,/science-drive-projection\.json/);
 assert.match(reader,/projectDriveGithubScience/);
 assert.match(reader,/PRODUCES/);
 assert.match(reader,/result:/);
 assert.doesNotMatch(reader,/neon\.tech|science_v1|DATA_API|OIDC/i);
});

test('Drive snapshot keeps real CMB test content with complete sharded coverage',()=>{
 const snapshot=JSON.parse(read('data/science-drive-projection.json'));
 const d7=JSON.parse(read('data/science-drive-projection/D7.json'));
 assert.equal(snapshot.contract,'nexo-science-drive-github-v1');
 assert.equal(snapshot.source,'GOOGLE_DRIVE');
 assert.match(snapshot.sourceRef,/PEER_CONTROL_TOWER_CANONICAL/);
 assert.ok(snapshot.domains.some(d=>d.id==='domain:D7'&&d.label));
 assert.equal(snapshot.shards?.D7,'science-drive-projection/D7.json');
 const testNode=d7.tests.find(n=>n.id==='T-ALENS-001');
 assert.ok(testNode,'expected canonical D7 test is absent');
 assert.equal(testNode.primaryCampaign,'CAMP-CMB-ANOMALIES');
 assert.ok(testNode.domains.includes('D7'));
 assert.ok(testNode.summary);
 assert.ok(testNode.evidenceClass);
 assert.equal(snapshot.completeness?.tests?.declared,2198);
 assert.equal(snapshot.completeness?.tests?.included,2198);
 assert.equal(snapshot.completeness?.tests?.truncated,false);
});
