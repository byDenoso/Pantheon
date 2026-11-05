import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {claimsFromPublic,matchingClaimRevision,claimRevisionState} from '../src/atlas/researchRegistry.ts';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {publicationKey} from '../worker/public-publication.mjs';

// Synthetic revision metadata attached to existing PUBLIC text solely to test
// the UI policy. No classification is written to the production registry.
const rows=guardTests(Object.values(JSON.parse(readFileSync('worker/public-cosmology.json','utf8')).records));
const group=groupPublicQuestions(rows).find(group=>group.members.length>1);
const [a,b]=group.members.map(member=>member.test),key=publicationKey(a),other=publicationKey(b);
const revision=(sourceKey,version,status='ongoing')=>({analysisId:sourceKey===key?'SYNTHETIC-a':'SYNTHETIC-b',version,status,sourceKeys:[sourceKey],date:null,datasets:null,code:null,result:null,uncertainty:null,scope:null,limits:null,evidenceLevel:'exploratory',changeReason:null});
const entries=versions=>[{questionId:group.id,versions}];
test('current claims use the latest sourced revision for their exact row, never a neighboring analysis',async()=>{
 const first=revision(key,'SYNTHETIC-1'),neighbor={...revision(other,'SYNTHETIC-other'),evidenceLevel:'replicated'};
 const found=await claimsFromPublic({status:'ready',items:[],tests:[a,b]},undefined,entries([first,neighbor]));
 assert.equal(found.find(claim=>claim.test.id===a.id).revision.version,'SYNTHETIC-1');
 assert.equal(found.find(claim=>claim.test.id===a.id).revision.evidenceLevel,'exploratory');
 assert.equal(found.find(claim=>claim.test.id===b.id).revision.version,'SYNTHETIC-other');
 assert.equal(matchingClaimRevision(group.id,'f'.repeat(64),entries([neighbor])),undefined);
});
test('a retracted exact row leaves current claims while its history and other analyses remain',async()=>{
 const old=revision(key,'SYNTHETIC-1'),retracted=revision(key,'SYNTHETIC-2','retracted');
 const records=entries([old,retracted]);
 const found=await claimsFromPublic({status:'ready',items:[],tests:[a,b]},undefined,records);
 assert.equal(found.length,1);assert.equal(found[0].test.id,b.id);
 assert.equal(records[0].versions.length,2);
 assert.equal(matchingClaimRevision(group.id,key,records).status,'retracted');
});
test('a corrected or retracted successor with changed text suppresses the stale selected predecessor',async()=>{
 for(const status of ['ongoing','retracted']) {
  const old=revision(key,'SYNTHETIC-1'),next={...revision(other,'SYNTHETIC-2',status),analysisId:old.analysisId};
  const records=entries([old,next]);
  const found=await claimsFromPublic({status:'ready',items:[],tests:[a]},undefined,records);
  assert.equal(found.length,0);
  assert.equal(claimRevisionState(group.id,key,records).kind,status==='retracted'?'retracted':'superseded');
  assert.equal(records[0].versions[0].sourceKeys[0],key);
 }
});
test('identical text attributed to different scientific identities is withheld rather than guessed',async()=>{
 const records=entries([revision(key,'SYNTHETIC-1'),{...revision(key,'SYNTHETIC-2'),analysisId:'SYNTHETIC-other'}]);
 assert.equal(claimRevisionState(group.id,key,records).kind,'ambiguous');
 assert.equal((await claimsFromPublic({status:'ready',items:[],tests:[a]},undefined,records)).length,0);
});
test('an invalid cross-question fork of scientific identity is withheld in the read model as well',async()=>{
 const first=revision(key,'SYNTHETIC-1'),records=entries([first]);
 records.push({questionId:'question-other',versions:[{...first,version:'SYNTHETIC-2',status:'retracted',sourceKeys:[other]}]});
 assert.equal(claimRevisionState(group.id,key,records).kind,'ambiguous');
 assert.equal((await claimsFromPublic({status:'ready',items:[],tests:[a]},undefined,records)).length,0);
});
