import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
const old=publicAtlasProjection();const edited=publicEditorialProjection(old);
test('all215 editorial summaries preserve Portuguese scientific questions and scope; result edits retain the published numerical evidence',()=>{
 assert.equal(edited.tests.length,215);
 for(let i=0;i<215;i++){
  for(const field of ['question','answers'])assert.equal(edited.tests[i][field]['pt-BR'],old.tests[i][field]['pt-BR']);
  assert.equal(edited.tests[i].published_at,old.tests[i].published_at);
  assert.notEqual(edited.tests[i].method['pt-BR'],edited.tests[i].method.en);
  for(const field of ['question','answers','result'])assert.notEqual(edited.tests[i][field].en,edited.tests[i][field]['pt-BR']);
  assert.doesNotMatch(edited.tests[i].method['pt-BR'],/Condições (?:desta comparação|fixadas):|200 mil/);
 }
 assert.equal(groupPublicQuestions(guardTests(edited.tests)).length,36);
 const source=readFileSync('worker/public-tests.json');assert.equal(createHash('sha256').update(source).digest('hex'),'a77870a4d47413a9a276ac786f419c92fd0d690054235372c417927da66225b4');
});
test('editorial map refuses drift and leaves canonical campaign approvals untouched',()=>{
 assert.throws(()=>publicEditorialProjection({...old,tests:[{...old.tests[0],result:{...old.tests[0].result,'pt-BR':'Changed'}}]}),/SOURCE_MISMATCH/);
 const c={...old,campaigns:[],campaignsContract:'ATLAS_PUBLIC_CAMPAIGNS_V1'};assert.equal(publicEditorialProjection(c).campaigns,c.campaigns);
});
test('empty campaign controls are absent and software validations are visibly distinguished',()=>{
 const app=readFileSync('src/atlas/ui/PublicApp.tsx','utf8');assert.match(app,/pub\.campaigns !== undefined && pub\.campaigns\.length > 0 && <PublicCampaignsView/);
 const group=readFileSync('src/atlas/ui/PublicQuestionView.tsx','utf8');assert.match(group,/Validação de software/);assert.doesNotMatch(group,/Atualização da campanha/);
 const card=readFileSync('src/atlas/ui/PublicTestView.tsx','utf8');assert.match(card,/Alcance e limites/);assert.match(card,/Method overview/);
});
