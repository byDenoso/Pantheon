import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const ssot=await import(pathToFileURL(path.join(lab,'data/ssot.mjs')));
const quotedAttr=(name,value)=>new RegExp(`${name}=['\"]${value}['\"]`);

const science=[{record_type:'program',record_id:'PROG-DE',status:'ACTIVE',title:'Dark Energy',domain:'DARK_ENERGY'}];

test('the live loop reads the inline NEXO rows of a direct Drive read',()=>{
 const live=ssot.extractNexoLiveState({
  Science:science,Relations:[],Olympus:[],
  NEXO:[
   {record_type:'state',record_id:'NEXO Recursive Loop',status:'ACTIVE',payload_json:JSON.stringify({CURRENT_STATE:'DE_ACTIVE',NEXT_ACTION:'Run discriminant',LAST_EFFECT:'Result 035 persisted'})},
   {record_type:'mini_claim',record_id:'MC-DE-001',status:'SUPPORTED',title:'Late attractor survives tested scope',detail:'bounded scope',payload_json:JSON.stringify({scope:'tested effective model',evidence_refs:['T-034','T-035'],falsifier:'instability'})},
   {record_type:'engineering_effect',record_id:'ENG-EFF-1',status:'DONE',title:'CAMB cache repair',detail:'runtime restored'}
  ]
 });
 assert.deepEqual(live.loop.currentState,'DE_ACTIVE');
 assert.equal(live.loop.nextAction,'Run discriminant');
 assert.equal(live.loop.lastEffect,'Result 035 persisted');
 assert.equal(live.miniClaims.length,1);
 assert.equal(live.miniClaims[0].recordId,'MC-DE-001');
 assert.equal(live.miniClaims[0].scope,'tested effective model');
 assert.deepEqual(live.miniClaims[0].evidenceRefs,['T-034','T-035']);
 assert.equal(live.engineeringEffects[0].recordId,'ENG-EFF-1');
});

test('the same loop is read from the snapshot tabs, so the surface is never blank',()=>{
 const live=ssot.extractNexoLiveState({
  Science:science,Relations:[],Olympus:[],NEXO:[],
  RecursiveState:{record_type:'state',record_id:'NEXO Recursive Loop',status:'ACTIVE',CURRENT_STATE:'BLOCKED_CONTRACT_INCOMPLETE: falta a família nula',NEXT_ACTION:'Congelar o gerador',LAST_EFFECT:'Registry atualizado'},
  NEXO_mini_claims:[{record_type:'mini_claim',record_id:'MC-BR-V1',status:'SUPPORTED',title:'Big Ring topology',scope:'non-FoF apenas',evidence_refs:['T-146']}],
  EngineeringEffects:[{effect:'ATLAS_NEXO_LIVE_PROJECTION',status:'DONE',scope:'overlay operacional',readback:'testes locais'}]
 });
 assert.match(live.loop.currentState,/BLOCKED_CONTRACT_INCOMPLETE/);
 assert.equal(live.loop.nextAction,'Congelar o gerador');
 assert.equal(live.miniClaims[0].recordId,'MC-BR-V1');
 assert.deepEqual(live.miniClaims[0].evidenceRefs,['T-146']);
 assert.equal(live.engineeringEffects[0].recordId,'ATLAS_NEXO_LIVE_PROJECTION');
});

test('mini-claims and effects stay out of the graph and only enrich the cockpit',()=>{
 const rows={
  Science:science,Relations:[],Olympus:[],
  NEXO:[{record_type:'mini_claim',record_id:'MC-DE-001',status:'SUPPORTED',title:'Late attractor',payload_json:JSON.stringify({scope:'PROG-DE apenas'})}]
 };
 const graph=ssot.rowsToGraph(rows);
 assert.equal(graph.nodes.some(n=>n.recordId==='MC-DE-001'),false);
 assert.equal(graph.nodes.filter(n=>n.hierarchyLevel==='program').length,1);
 const program=graph.nodes.find(n=>n.recordId==='PROG-DE');
 assert.ok(program.ops.sections.find(s=>s.id==='evidence').items.some(item=>/Late attractor/.test(item.title)));
});

test('Graph Lab shell reserves a read-only NEXO LIVE surface on the map',()=>{
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 for(const id of ['nexo-live','nexo-current-state','nexo-next-action','nexo-last-effect','nexo-mini-claims','nexo-engineering-effects','nexo-live-toggle'])assert.match(html,quotedAttr('id',id));
 // It is a ribbon that folds away, not a second dashboard covering the graph.
 const css=fs.readFileSync(path.join(lab,'nexo-live.css'),'utf8');
 assert.match(css,/\.nexo-live:not\(\.is-open\)/);
});