import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicationKey} from '../worker/public-publication.mjs';
import {validateResearchRegistry} from '../src/contracts/research-registry.mjs';
import {claimsFromPublic} from '../src/atlas/researchRegistry.ts';
import {guardTests} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';

const source=JSON.parse(readFileSync('worker/public-cosmology.json','utf8'));
const rows=Object.values(source.records), keyed=new Map(rows.map(row=>[publicationKey(row),row]));
const groups=groupPublicQuestions(guardTests(rows));
const membership=new Map();
for(const group of groups) for(const {test} of group.members){const key=publicationKey(test);const owners=membership.get(key)??new Set();owners.add(group.id);membership.set(key,owners);}
const group=groups.find(g=>g.id!=='question-study-1');
const row=group.members[0].test, key=publicationKey(row);
const base={version:'editorial-copy',status:'unknown',date:null,datasets:null,code:null,result:row.result,uncertainty:null,scope:null,limits:null,evidenceLevel:null,sourceKeys:[key],changeReason:null};
const registry=versions=>({contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[{questionId:group.id,versions}]});

test('registry retains an explicitly sourced text without inferring scientific metadata',()=>{
 const actual=validateResearchRegistry(registry([base]),keyed,membership);
 assert.equal(actual.records[0].versions[0].date,null);
 assert.equal(actual.records[0].versions[0].status,'unknown');
});
test('unmatched data, status, question or result cannot be promoted',()=>{
 assert.throws(()=>validateResearchRegistry(registry([{...base,status:'published'}]),keyed,membership),/metadado científico/);
 assert.throws(()=>validateResearchRegistry(registry([{...base,sourceKeys:['a'.repeat(64)]}]),keyed,membership),/fonte pública ausente/);
 assert.throws(()=>validateResearchRegistry({...registry([base]),records:[{questionId:'question-not-this-one',versions:[base]}]},keyed,membership),/outra pergunta/);
 assert.throws(()=>validateResearchRegistry(registry([{...base,result:{'pt-BR':'Texto sem fonte',en:'Unbacked text'}}]),keyed,membership),/resultado não corresponde/);
});
test('revision history preserves earlier entries and requires a reason for later corrections',()=>{
 assert.throws(()=>validateResearchRegistry(registry([base,{...base,version:'correction'}]),keyed,membership),/changeReason/);
 const reason={'pt-BR':'Correção editorial de teste.',en:'Synthetic editorial correction.'};
 const actual=validateResearchRegistry(registry([base,{...base,version:'correction',changeReason:reason}]),keyed,membership);
 assert.equal(actual.records[0].versions.length,2);
 assert.equal(actual.records[0].versions[1].changeReason['pt-BR'],reason['pt-BR']);
});
test('claims are an exact intersection of current selected rows and versioned repository rows',async()=>{
 const modified={...row,result:{...row.result,'pt-BR':row.result['pt-BR']+' alterado'}};
 const selected=guardTests([row,modified]);
 const found=await claimsFromPublic({status:'ready',items:[],tests:selected});
 assert.equal(found.length,1);
 assert.equal(found[0].test.result['pt-BR'],row.result['pt-BR']);
 assert.equal((await claimsFromPublic({status:'unavailable',items:[],tests:[]})).length,0);
});
