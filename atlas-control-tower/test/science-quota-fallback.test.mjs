import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('GitHub manifest authorizes a Drive-backed science campaign projection, never a network database',()=>{
 const authority=JSON.parse(read('../nexo-one/data/canonical.json'));
 assert.equal(authority.authority,'GITHUB');
 assert.equal(authority.scienceProjection?.kind,'GOOGLE_DRIVE');
 assert.equal(authority.scienceProjection?.schema,'nexo-science-drive-github-v1');
 assert.equal(authority.scienceProjection?.transportPath,'atlas-control-tower/data/science-drive-projection.json');
 assert.equal(authority.scienceProjection?.role,'PROJECTION_ONLY');
 assert.doesNotMatch(JSON.stringify(authority.scienceProjection),/DATA_API|OIDC/i);
});

test('public science projection is campaign-first and does not expose TEST or RESULT nodes',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const graph=projectDriveGithubScience(state,'graph',{focus:'domain:D7'});
 assert.ok(graph.nodes.some(node=>node.type==='CAMPAIGN'&&node.id==='CAMP-CMB-ANOMALIES'));
 assert.ok(graph.nodes.every(node=>node.type==='DOMAIN'||node.type==='CAMPAIGN'));
 assert.equal(graph.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
 assert.equal(graph.truncated,false);
});

test('campaign detail stays campaign-level and does not expand into tests',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const graph=projectDriveGithubScience(state,'graph',{focus:'CAMP-CMB-ANOMALIES'});
 assert.equal(graph.nodes.length,1);
 assert.equal(graph.nodes[0].type,'CAMPAIGN');
 assert.equal(graph.nodes[0].id,'CAMP-CMB-ANOMALIES');
 assert.equal(graph.nodes[0].metadata?.testCount,104);
 assert.equal(graph.edges.length,0);
});

test('test ids are not public science entities',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const response=projectDriveGithubScience(state,'entity',{id:'T-AF-001'});
 assert.equal(response.entity,null);
});

test('science state reports campaigns without TEST or RESULT public counts',async()=>{
 const {loadDriveGithubScience,projectDriveGithubScience}=await import('../lib/drive-github-science.mjs');
 const state=loadDriveGithubScience();
 const response=projectDriveGithubScience(state,'state');
 assert.equal(response.science?.campaigns,17);
 assert.equal(response.counts?.CAMPAIGN,17);
 assert.equal(Object.hasOwn(response.counts||{},'TEST'),false);
 assert.equal(Object.hasOwn(response.counts||{},'RESULT'),false);
 assert.equal(Object.hasOwn(response.science||{},'testsIncluded'),false);
 assert.equal(Object.hasOwn(response.science||{},'testsDeclared'),false);
 assert.equal(response.science?.truncated,false);
});

test('static public state contains campaign graphs and no public test entities',async()=>{
 const {generateStaticState}=await import('../lib/static-state-generator.mjs');
 const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-campaign-state-'));
 try{
  const result=await generateStaticState({outDir,generatedAt:'2026-09-13T18:30:00Z'});
  const snap=path.join(outDir,result.manifest.snapshotPath);
  const d7=JSON.parse(fs.readFileSync(path.join(snap,'graph/science/D7.json'),'utf8'));
  assert.ok(d7.nodes.some(node=>node.type==='CAMPAIGN'&&node.id==='CAMP-CMB-ANOMALIES'));
  assert.equal(d7.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
  const entities=JSON.parse(fs.readFileSync(path.join(snap,'entities/index.json'),'utf8'));
  assert.equal(Boolean(entities.entities?.['T-AF-001']),false);
  const publicState=JSON.parse(fs.readFileSync(path.join(snap,'state.json'),'utf8'));
  assert.equal(publicState.counts.CAMPAIGN,17);
  assert.equal(Object.hasOwn(publicState.counts,'TEST'),false);
  assert.equal(Object.hasOwn(publicState.counts,'RESULT'),false);
 }finally{
  fs.rmSync(outDir,{recursive:true,force:true});
 }
});
