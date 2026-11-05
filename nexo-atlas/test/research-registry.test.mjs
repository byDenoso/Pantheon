import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {publicationKey} from '../worker/public-publication.mjs';
import {parsePublicRegistryJson,validateResearchRegistry,validateReleasableResearchRegistry,validateAppendOnlyHistory} from '../src/contracts/research-registry.mjs';
import {claimsFromPublic,currentVerifiedClaims} from '../src/atlas/researchRegistry.ts';
import {guardTests,loadPublic} from '../src/atlas/publicItems.ts';
import {groupPublicQuestions} from '../src/atlas/publicQuestionGroups.ts';
import {assertSourceIntegrity} from '../src/contracts/public-source-integrity.mjs';
import {PUBLIC_PATH} from '../src/atlas/api.ts';

const source=JSON.parse(readFileSync('worker/public-cosmology.json','utf8'));
const rows=Object.values(source.records), keyed=new Map(rows.map(row=>[publicationKey(row),row]));
const index=JSON.parse(readFileSync('src/atlas/reviewedSourceIndex.json','utf8'));
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
 assert.throws(()=>validateReleasableResearchRegistry(actual),/fontes públicas estruturadas/);
 validateAppendOnlyHistory(registry([base]),registry([base,{...base,version:'correction',changeReason:reason}]));
 assert.throws(()=>validateAppendOnlyHistory(registry([base]),registry([])),/removida ou alterada/);
 assert.throws(()=>validateAppendOnlyHistory(registry([base]),registry([{...base,version:'replaced'}])),/removida ou alterada/);
 assert.throws(()=>validateAppendOnlyHistory(registry([base]),{contract:'NEXO_PUBLIC_RESULT_REGISTRY_V1',records:[]}),/Histórico removido/);
});
test('a pending or superseded selection never displays an older verified result',async()=>{
 const selected={status:'ready',items:[],tests:guardTests([row])};
 const next={status:'ready',items:[],tests:[]};
 const verified={source:selected,rows:await claimsFromPublic(selected)};
 assert.equal(currentVerifiedClaims(verified,selected,false).length,1);
 assert.equal(currentVerifiedClaims(verified,selected,true),null);
 assert.equal(currentVerifiedClaims(verified,next,false),null);
 const controller=new AbortController(); const task=claimsFromPublic(selected,controller.signal);controller.abort();
 await assert.rejects(task,e=>e.name==='AbortError');
});
test('source mismatch fails even when the separately stored SHA is supplied',()=>{
 const actual=readFileSync('worker/public-cosmology.json');
 assert.equal(assertSourceIntegrity(actual,index.sourceSha256,actual),'COMMIT_BLOB_VERIFIED');
 assert.equal(assertSourceIntegrity(actual,index.sourceSha256),'PINNED_BLOB_ONLY');
 assert.throws(()=>assertSourceIntegrity(Buffer.concat([actual,Buffer.from('altered')]),index.sourceSha256),/diverge/);
 const changed=Buffer.concat([actual,Buffer.from('altered')]);
 const changedHash=createHash('sha256').update(changed).digest('hex');
 assert.throws(()=>assertSourceIntegrity(changed,changedHash),/blob Git fixado/);
 assert.throws(()=>assertSourceIntegrity(actual,index.sourceSha256,Buffer.from('altered commit blob')),/commit declarado/);
});
test('invalid registry JSON has a readable build diagnostic naming the file',()=>{
 assert.throws(()=>parsePublicRegistryJson('{"records":','src/atlas/researchRegistry.json'),/JSON público inválido \(src\/atlas\/researchRegistry\.json\)/);
});
test('simulated LIVE selection, revocation and outage preserve the source boundary',async()=>{
 const second=rows.find(candidate=>publicationKey(candidate)!==key);
 const extra={...row,result:{'pt-BR':'SINTÉTICO: atualização aprovada sem origem no repositório.',en:'SYNTHETIC: approved update without repository source.'}};
 const payload={contract:'ATLAS_PUBLIC_V1',items:[],links:[],tests:[row,second]};
 const endpoint='https://selection.example/api';
 const selection=(include,tests=[])=>({contract:'ATLAS_PUBLIC_SELECTION_V1',mode:'LIVE',version:1,updatedAt:'2026-11-01T00:00:00Z',include,tests,campaigns:[]});
 const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 const fetchFor=body=>async url=>url===PUBLIC_PATH?json(payload):url===endpoint?(body===null?new Response('',{status:503}):json(body)):new Response('',{status:404});
 const first=await loadPublic(fetchFor(selection([key],[extra])),undefined,endpoint);
 const firstClaims=await claimsFromPublic(first);
 assert.equal(firstClaims.length,1);assert.equal(firstClaims[0].test.result['pt-BR'],row.result['pt-BR']);
 const revoked=await loadPublic(fetchFor(selection([publicationKey(second)])),undefined,endpoint);
 assert.equal((await claimsFromPublic(revoked)).length,1);
 assert.equal(currentVerifiedClaims({source:first,rows:firstClaims},revoked,false),null);
 const none=await loadPublic(fetchFor(selection([])),undefined,endpoint);
 assert.equal((await claimsFromPublic(none)).length,0);
 const unavailable=await loadPublic(fetchFor(null),undefined,endpoint);
 assert.equal(unavailable.status,'unavailable');assert.deepEqual(await claimsFromPublic(unavailable),[]);
});
test('history CLI reads the real base tree and rejects modification or deletion',()=>{
 const root=process.cwd();
 const temp=mkdtempSync(path.join(root,'.tmp-registry-cli-'));
 assert.equal(path.dirname(temp),root);
 const app=path.join(temp,'nexo-atlas'), scripts=path.join(app,'scripts'), contracts=path.join(app,'src','contracts'), data=path.join(app,'src','atlas');
 mkdirSync(scripts,{recursive:true});mkdirSync(contracts,{recursive:true});mkdirSync(data,{recursive:true});
 try {
  copyFileSync('scripts/check-research-history.mjs',path.join(scripts,'check-research-history.mjs'));
  copyFileSync('src/contracts/research-registry.mjs',path.join(contracts,'research-registry.mjs'));
  const source=path.join(data,'researchRegistry.json');
  writeFileSync(source,JSON.stringify(registry([base])));
  execFileSync('git',['init','-q',temp]);
  execFileSync('git',['-C',temp,'add','nexo-atlas/src/atlas/researchRegistry.json']);
  execFileSync('git',['-C',temp,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','synthetic history']);
  const sha=execFileSync('git',['-C',temp,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const run=()=>spawnSync(process.execPath,[path.join(scripts,'check-research-history.mjs')],{cwd:app,encoding:'utf8',env:{...process.env,NEXO_REGISTRY_BASE:sha}});
  assert.equal(run().status,0);
  writeFileSync(source,JSON.stringify(registry([])));
  const removed=run();assert.notEqual(removed.status,0);assert.match(removed.stderr,/removida ou alterada/);
  writeFileSync(source,JSON.stringify(registry([{...base,version:'altered'}])));
  const changed=run();assert.notEqual(changed.status,0);assert.match(changed.stderr,/removida ou alterada/);
 } finally {rmSync(temp,{recursive:true,force:true});}
});
test('claims are an exact intersection of current selected rows and versioned repository rows',async()=>{
 const modified={...row,result:{...row.result,'pt-BR':row.result['pt-BR']+' alterado'}};
 const selected=guardTests([row,modified]);
 const found=await claimsFromPublic({status:'ready',items:[],tests:selected});
 assert.equal(found.length,1);
 assert.equal(found[0].test.result['pt-BR'],row.result['pt-BR']);
 assert.equal((await claimsFromPublic({status:'unavailable',items:[],tests:[]})).length,0);
});
