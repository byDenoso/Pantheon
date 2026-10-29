import test from 'node:test';import assert from 'node:assert/strict';
import {compilePrivateWorkspaceRuntime} from '../server/atlas/private-workspace.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {buildKnowledge} from '../src/knowledge/model.ts';
import {describeBlob,displayJson} from '../src/private-workspace/blob.ts';

const withClaims=()=>{
 const t=makePrivateTowerFixture();
 t.files['entities/claim/C1.json']={encoding:'json',value:{claim_id:'C1',source:'NEXO',label:'entity version',supports:['HYP-01']}};
 t.files['entities/claim/C2.json']={encoding:'json',value:{claim_id:'C2',label:'only entity',contradicts:['HYP-01']}};
 t.files['indexes/knowledge-framework.json']={encoding:'json',value:{
  claims:{C1:{claim_id:'C1',label:'document version',supports:['HYP-01']},C3:{claim_id:'C3',label:'only document',supports:['HYP-01']}},
  questions:[{question_id:'Q-DOC',label:'Pergunta do documento'}],aliases:{A:'B'},hypothesis_scores:{'HYP-01':{pro:1}}}};
 t.file_count=Object.keys(t.files).length;
 return t;
};

test('claims from entities/claim/ and from the knowledge-framework document merge, document wins',()=>{
 const k=compilePrivateWorkspaceRuntime(withClaims()).data.system.read_model.knowledge;
 assert.deepEqual(Object.keys(k.claims).sort(),['C1','C2','C3']);
 assert.equal(k.claims.C1.label,'document version');
 assert.deepEqual(k.questions,[{question_id:'Q-DOC',label:'Pergunta do documento'}]);
 assert.deepEqual(k.aliases,{A:'B'});
 assert.ok(k.hypotheses['HYP-01']);
 assert.equal(k.claims.C1.supports[0],'HYP-01');
});

test('workspace without claims still yields an empty, valid knowledge projection',()=>{
 const k=compilePrivateWorkspaceRuntime(makePrivateTowerFixture()).data.system.read_model.knowledge;
 assert.deepEqual(k.claims,{});
});

test('buildKnowledge reads the workspace projection and prefers declared questions',()=>{
 const state={read_model:compilePrivateWorkspaceRuntime(withClaims()).data.system.read_model};
 const kn=buildKnowledge(state);
 assert.ok(kn.questions.some(q=>q.id==='Q-DOC'&&q.label==='Pergunta do documento'));
 assert.deepEqual(kn.claims.map(c=>c.id).sort(),['C1','C2','C3']);
 assert.equal(kn.claims.find(c=>c.id==='C1').label,'document version');
 assert.ok(kn.hypotheses.some(h=>h.id==='HYP-01'));
});

test('binary attachment text is summarised, never printed',()=>{
 const data='QUJD'.repeat(3000);
 const chunk=JSON.stringify({chunk_count:2,chunk_index:0,data_base64:data});
 assert.equal(describeBlob(chunk,'pt-BR'),'Anexo binário em partes: parte 1 de 2, ≈ 11,7 KB codificados');
 assert.equal(describeBlob(chunk,'en'),'Binary attachment in parts: part 1 of 2, ≈ 11.7 KB encoded');
 assert.match(describeBlob(data,'pt-BR'),/^Anexo binário, ≈ 11,7 KB/);
 assert.equal(describeBlob('texto normal '.repeat(40),'pt-BR'),null);
 assert.equal(describeBlob('curto','pt-BR'),null);
 assert.equal(describeBlob(JSON.stringify({a:1,b:'x'.repeat(300)}),'pt-BR'),null);
 const shown=displayJson({text:chunk,n:1},'pt-BR');
 assert.ok(!shown.includes('QUJD')&&shown.includes('parte 1 de 2'));
});
