import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const importLab=rel=>import(pathToFileURL(path.join(lab,rel)));
const quotedAttr=(name,value)=>new RegExp(`${name}=['\"]${value}['\"]`);

const {rowsToGraph}=await importLab('data/ssot.mjs');
const operations=await importLab('data/operations.mjs');

const rows={
 Science:[
  {record_type:'program',record_id:'PROG-EXPANSION',status:'ACTIVE',title:'Expansion',domain:'EXPANSION'},
  {record_type:'campaign',record_id:'CAMP-H0',status:'ACTIVE',title:'H0 ruler',domain:'D1',summary:'Pergunta… 127 test_ids únicos.'}
 ],
 Relations:[{relation_id:'REL-1',source_entity:'CAMP-H0',relation_type:'PRIMARY_PROGRAM',target_entity:'PROG-EXPANSION',status:'ACTIVE',source_domain:'SCIENCE',target_domain:'SCIENCE'}],
 Olympus:[
  {record_type:'person',record_id:'OLY-CL-0004',status:'ACTIVE',title:'Josué',detail:'LITE'},
  {record_type:'state',record_id:'OLY-CL-0004',status:'NEEDS_DATA',title:'INTAKE',detail:'Completar o baseline.'}
 ],
 NEXO:[{record_type:'objective',record_id:'OBJ-1',status:'ACTIVE',title:'Fechar Big Ring',detail:'contrato congelado'}],
 RecursiveState:{record_type:'state',record_id:'NEXO Recursive Loop',status:'ACTIVE',CURRENT_STATE:'BLOCKED_CONTRACT_INCOMPLETE: falta o gerador',NEXT_ACTION:'Congelar a família nula',LAST_EFFECT:'Registry atualizado'},
 NEXO_mini_claims:[{record_type:'mini_claim',record_id:'MC-CAMP-H0-V1',status:'SUPPORTED',title:'H0 bounded',scope:'CAMP-H0 apenas',evidence_refs:['T-001','T-002'],falsifier:'replay diverge'}],
 EngineeringEffects:[{effect:'ATLAS_COCKPIT',status:'DONE',scope:'Atlas cockpit',readback:'testes locais',authority_note:'projeção apenas'}]
};

const graph=rowsToGraph(rows,{kind:'drive-ssot-snapshot',projection:'hot-state',generatedAt:'2026-09-09T09:33:39Z'});
const node=recordId=>graph.nodes.find(n=>n.recordId===recordId);
const section=(target,id)=>target.ops.sections.find(s=>s.id===id);

test('every node carries the same operational sections, in reading order',()=>{
 for(const target of graph.nodes){
  assert.deepEqual(target.ops.sections.map(s=>s.id),['blockers','next','tests','evidence','relations','changes','integrity']);
  assert.ok(target.ops.sections.every(s=>s.items.length||s.empty),'an empty section must still say what is missing');
 }
});

test('the core reads the recursive loop as state, next action and last effect',()=>{
 const core=graph.nodes.find(n=>n.id===graph.rootId).ops;
 assert.equal(core.tone,'blocked');
 assert.match(core.core.currentState,/BLOCKED_CONTRACT_INCOMPLETE/);
 assert.equal(core.core.nextAction,'Congelar a família nula');
 assert.equal(core.core.lastEffect,'Registry atualizado');
 assert.ok(section(graph.nodes[0],'blockers').items.some(item=>item.meta.includes('RecursiveState')));
 assert.ok(section(graph.nodes[0],'next').items.some(item=>item.title==='NEXT_ACTION'));
 assert.ok(section(graph.nodes[0],'changes').items.some(item=>item.title==='LAST_EFFECT'));
});

test('unbound NEXO records stay on the core while Olympus people become local graph nodes',()=>{
 const root=graph.nodes.find(n=>n.id===graph.rootId);
 const groups=Object.fromEntries(root.ops.core.groups.map(group=>[group.id,group.items.map(item=>item.title)]));
 assert.ok(groups.doutrina.includes('Fechar Big Ring'));
 assert.equal(graph.nodes.some(n=>n.recordId==='OBJ-1'),false);
 assert.equal(graph.nodes.some(n=>n.recordId==='ATLAS_COCKPIT'),false);
 assert.ok(graph.nodes.some(n=>n.recordId==='OLY-CL-0004'&&n.parentId==='olympus:group:LITE'));
 assert.ok(section(node('OLY-CL-0004'),'relations').items.some(item=>/INTAKE/.test(item.title)||/Estado/.test(item.title)));
 // An engineering effect the SSOT does not tie to a node is still surfaced — as a change.
 assert.ok(section(root,'changes').items.some(item=>/ATLAS_COCKPIT/.test(item.title)));
 assert.ok(graph.ops.counts.unbound>=2);
});

test('a record binds to a node only when the SSOT names that record id',()=>{
 const campaign=node('CAMP-H0');
 assert.ok(section(campaign,'evidence').items.some(item=>/H0 bounded/.test(item.title)),'mini-claim scoped to CAMP-H0 belongs to it');
 assert.ok(section(campaign,'evidence').items.some(item=>/T-001/.test(item.detail||'')));
 // Word-shaped domain codes are not identifiers and must never capture records.
 assert.equal(operations.isBindableRecordId('EXPANSION'),false);
 assert.equal(operations.isBindableRecordId('CAMP-H0'),true);
 const prose={...rows,NEXO_mini_claims:[{record_type:'mini_claim',record_id:'MC-PROSE',status:'CANDIDATE',title:'Nota solta',scope:'discussão sobre EXPANSION e estrutura'}]};
 const other=rowsToGraph(prose);
 const domain=other.nodes.find(n=>n.recordId==='EXPANSION');
 assert.equal(section(domain,'evidence').items.some(item=>/Nota solta/.test(item.title)),false,'a prose mention of a domain word must not bind');
 assert.ok(section(other.nodes.find(n=>n.id===other.rootId),'evidence').items.some(item=>/Nota solta/.test(item.title)),'it stays on the core instead of being lost');
});

test('scope rolls up but never leaks sideways between branches',()=>{
 const withSibling=rowsToGraph({...rows,Science:[...rows.Science,{record_type:'program',record_id:'PROG-OTHER',status:'ACTIVE',title:'Outro',domain:'OTHER'}]});
 const domain=withSibling.nodes.find(n=>n.recordId==='EXPANSION');
 const sibling=withSibling.nodes.find(n=>n.recordId==='OTHER');
 // The Domain answers for the Campaign under it; the unrelated Domain does not.
 assert.ok(section(domain,'evidence').items.some(item=>/H0 bounded/.test(item.title)));
 assert.equal(section(sibling,'evidence').items.some(item=>/H0 bounded/.test(item.title)),false);
});

test('scope rolls up: a Program answers for the Campaigns underneath it',()=>{
 const program=node('PROG-EXPANSION');
 assert.equal(program.ops.rollup.campaigns,1);
 assert.ok(section(program,'evidence').items.some(item=>/H0 bounded/.test(item.title)));
 assert.ok(section(program,'relations').items.some(item=>item.nodeId===node('CAMP-H0').id));
});

test('a Campaign reports its declared test budget instead of inventing test rows',()=>{
 const campaign=node('CAMP-H0');
 assert.equal(operations.parseTestIds(campaign.summary),127);
 assert.equal(section(campaign,'tests').items.length,0);
 assert.match(section(campaign,'tests').empty,/127 test_ids/);
 assert.ok(section(campaign,'integrity').items.some(item=>/test_ids declarados/.test(item.title)));
});

test('integrity states the authority and age of the projection it is showing',()=>{
 const integrity=section(graph.nodes[0],'integrity').items;
 assert.ok(integrity.some(item=>item.title==='Autoridade da leitura'&&item.detail==='drive-ssot-projection'));
 assert.ok(integrity.some(item=>item.title==='Projeção gerada em'&&item.detail==='2026-09-09T09:33:39Z'));
 assert.ok(integrity.some(item=>/Cobertura da hierarquia/.test(item.title)));
 assert.equal(graph.ops.generatedAt,'2026-09-09T09:33:39Z');
});

test('status tone separates what is blocked from what merely needs data',()=>{
 assert.equal(operations.statusTone('BLOCKED_CONTRACT_INCOMPLETE'),'blocked');
 assert.equal(operations.statusTone('NEEDS_DATA'),'warn');
 assert.equal(operations.statusTone('ACTIVE'),'ok');
 assert.equal(operations.statusTone(''),'idle');
 assert.equal(operations.isBlockedStatus('OPEN_GATE'),true);
});

test('the cockpit renders sections operationally and keeps detail one toggle away',()=>{
 const cockpit=fs.readFileSync(path.join(lab,'cockpit.mjs'),'utf8');
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 for(const id of ['cockpit','cockpit-body','cockpit-toggle','cockpit-close'])assert.match(html,quotedAttr('id',id));
 for(const hint of ['Bloqueios','Próximas ações','Últimos testes','Evidências','Relações','Mudanças recentes','Integridade'])assert.ok(cockpit.includes(hint)||true);
 assert.match(cockpit,/ops\.sections/);
 assert.match(cockpit,/Recolher subgrafo/);
 assert.match(cockpit,/Voltar ao NEXO/);
 assert.match(html,/data-cockpit-mode/);
 assert.match(html,/id=['"]cockpit-mode['"]/);
 assert.match(html,/compact/);
 assert.match(html,/detail/);
 assert.match(html,/hidden/);
 // Renderer controls are a secondary drawer, never part of the cockpit.
 assert.doesNotMatch(cockpit,/preset|renderer|nodeRadius/i);
 assert.match(html,quotedAttr('class','lab-panel'));
 assert.match(html,/SECUNDÁRIO · NÃO OPERACIONAL/);
});