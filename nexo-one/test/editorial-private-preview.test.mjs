import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateEditorialStudy,renderEditorialStudy,buildEditorialStudy} from '../scripts/editorial-private-preview.mjs';

const candidate=()=>({
 contract:'NEXO_EDITORIAL_CANDIDATE_V1',visibility:'PRIVATE',authorDecision:'PENDING',level:'E1',destination:'ATLAS_STUDY_CANDIDATE',
 studyId:'NEXO-EDITORIAL-SYNTHETIC-01',familyKey:'SYNTHETIC-FAMILY',
 baselineDeltaChi2:5,materialThresholdPercent:25,tolerance:.02,
 copy:{
  title:'Synthetic study with an honest question',question:'What changes under leave-one-out?',
  summary:'Two correlated exclusions give one methodological study.',method:'Same dataset; re-fit each cut.',
  interpretation:'The direction of the local fit difference changes.',limitations:'Not a global significance or discovery.',
  nextStep:'Seek independent review and author approval.',noveltyStatus:'NOVELTY_CHECK_PENDING'
 },
 review:{independentImplementation:true,sameObservationalData:true,method:'Different numeric optimizer; shared observations.'},
 surveys:[
  {id:'survey-A',label:'Survey A',remainingSupernovae:100,primaryDeltaChi2:3,reviewDeltaChi2:3.005},
  {id:'survey-B',label:'Survey B',remainingSupernovae:120,primaryDeltaChi2:4.98,reviewDeltaChi2:4.99}
 ],
 literature:[{title:'Published source',url:'https://doi.org/10.1000/test'}],
 privateEvidence:{towerId:'PRIVATE-TOWER-SENTINEL',fileId:'drive.google.com/file/d/private'}
});
test('two correlated runs generate one candidate and classify sensitivity',()=>{
 const study=validateEditorialStudy(candidate());
 assert.equal(study.surveys.length,2);
 assert.equal(study.summary.material,1);
 assert.equal(study.authorDecision,'PENDING');
 assert.ok(!JSON.stringify(study).includes('PRIVATE-TOWER-SENTINEL'));
 assert.ok(!renderEditorialStudy(study).includes('drive.google.com'));
});
test('author approval cannot be bypassed through candidate input',()=>{
 const input=candidate();input.authorDecision='APPROVED';
 assert.throws(()=>validateEditorialStudy(input),/AUTHOR_APPROVAL_REQUIRED/);
});
test('numeric reproduction requires the actual tolerance',()=>{
 const input=candidate();input.surveys[0].reviewDeltaChi2=4.5;
 assert.throws(()=>validateEditorialStudy(input),/REVIEW_MISMATCH/);
});
test('private source tokens are rejected from presentation text',()=>{
 const input=candidate();input.copy.summary='PEER confidential content';
 assert.throws(()=>validateEditorialStudy(input),/PRIVATE_COPY_summary/);
});
test('HTML tags are escaped in preview, with no JavaScript',()=>{
 const input=candidate();input.copy.summary='Some <img src=x onerror=alert(1)> result';
 const html=renderEditorialStudy(validateEditorialStudy(input));
 assert.ok(html.includes('&lt;img src=x'));assert.ok(!html.includes('<img src=x'));
 assert.ok(!html.includes('<script'));assert.ok(html.includes('noindex,nofollow'));
});
test('public and dist targets are refused',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nexo-editorial-'));
 const input=path.join(root,'input.json');await fs.writeFile(input,JSON.stringify(candidate()));
 try{
  await assert.rejects(buildEditorialStudy(input,path.join(root,'nexo-one','public','editorial')),/PUBLIC_OUTPUT_FORBIDDEN/);
  await assert.rejects(buildEditorialStudy(input,path.join(root,'nexo-one','dist','editorial')),/PUBLIC_OUTPUT_FORBIDDEN/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('private output is deterministic, complete and read back',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nexo-editorial-'));
 const input=path.join(root,'candidate.json'),out=path.join(root,'private-output');
 await fs.writeFile(input,JSON.stringify(candidate()));
 try{
  const a=await buildEditorialStudy(input,out);
  const html=await fs.readFile(path.join(out,'preview.html'),'utf8');
  const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.authorApproved,false);assert.equal(manifest.publicAtlasChanged,false);
  assert.ok(html.includes('Survey A'));assert.ok(!html.includes('PRIVATE-TOWER-SENTINEL'));
  const b=await buildEditorialStudy(input,out);
  assert.equal(a.sourceSha256,b.sourceSha256);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
