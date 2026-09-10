import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {hierarchyView} from '../graph-lab/graph/projection.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const graphLab=join(here,'../graph-lab');
const associativePath=join(graphLab,'data/associative-memory.mjs');

const baseGraph={
 rootId:'system:NEXO',alternativeFilamentsDefault:false,
 nodes:[
  {id:'system:NEXO',recordId:'NEXO',label:'NEXO',hierarchyLevel:'root',type:'SYSTEM'},
  {id:'lane:SCIENCE',recordId:'SCIENCE',label:'CIÊNCIA',hierarchyLevel:'lane',type:'DOMAIN',parentId:'system:NEXO',domain:'SCIENCE'},
  {id:'lane:OLYMPUS',recordId:'OLYMPUS',label:'OLYMPUS',hierarchyLevel:'lane',type:'DOMAIN',parentId:'system:NEXO',domain:'OLYMPUS'},
  {id:'record:Olympus:OLY-CL-0002',recordId:'OLY-CL-0002',label:'Renilde',hierarchyLevel:'person',type:'PROGRAM',parentId:'lane:OLYMPUS',domain:'OLYMPUS'}
 ],
 edges:[
  {id:'e1',source:'system:NEXO',target:'lane:SCIENCE',kind:'canonical'},
  {id:'e2',source:'system:NEXO',target:'lane:OLYMPUS',kind:'canonical'},
  {id:'e3',source:'lane:OLYMPUS',target:'record:Olympus:OLY-CL-0002',kind:'canonical'}
 ]
};

const associativeRows={
 SEMANTIC_MEMORY:[{
  semantic_id:'SEM-CROSS-NULL-AUDIT-001',term_or_phrase:'null; nulls',meaning:'Construir hipóteses rivais mínimas.',domain_scope:'CROSS_DOMAIN',activated_flow:'OLYMPUS_NULL_MODEL_AUDIT; SCIENCE_FROZEN_NULL_BATTERY',expected_output:'hipóteses rivais + próximo discriminante',confidence:'0,92',status:'SUPPORTED_CANDIDATE',support_refs:'case-a; case-b'
 }],
 PROCEDURAL_MEMORY:[{
  lesson_id:'LESSON-CROSS-NULL-FIRST-AUDIT-001',context:'CROSS_DOMAIN_AMBIGUOUS_TRAJECTORY_ANALYSIS',proposed_rule:'Ativar null-first audit.',forbidden_generalization:'Não transferir diagnóstico entre domínios.',support_count:'4',contradiction_count:'0',status:'SUPPORTED_CANDIDATE'
 }],
 LEARNING_FILAMENTS:[{
  filament_id:'FIL-CROSS-NULL-SCI-OLY-001',source_layer:'SEMANTIC_MEMORY',source_id:'SEM-CROSS-NULL-AUDIT-001',source_domain:'SCIENCE',target_layer:'PROCEDURAL_MEMORY',target_id:'LESSON-CROSS-NULL-FIRST-AUDIT-001',target_domain:'OLYMPUS',filament_type:'TRANSFERABLE_METHOD',activation_rule:'Ativar em nulls.',weight:'0,90',support_count:'4',contradiction_count:'0',status:'ACTIVE',evidence_refs:'Renilde; Miquéias',next_discriminant:'próximo check-in'
 },{
  filament_id:'FIL-INTRA-OLY-NULL-CLIENTS-001',source_layer:'SEMANTIC_MEMORY',source_id:'SEM-CROSS-NULL-AUDIT-001',source_domain:'OLYMPUS',target_layer:'OLYMPUS_CASES',target_id:'OLY-CL-0002',target_domain:'OLYMPUS',filament_type:'INTRA_DOMAIN_CASE_GENERALIZATION',activation_rule:'Ativar em check-in ambíguo.',weight:'0,88',support_count:'4',contradiction_count:'0',status:'ACTIVE'
 }]
};

test('associative memory is a transparent overlay and never a fourth hierarchy lane',async()=>{
 assert.equal(existsSync(associativePath),true,'associative-memory.mjs must exist');
 const {buildAssociativeOverlay,mergeAssociativeOverlay}=await import(pathToFileURL(associativePath));
 const overlay=buildAssociativeOverlay(associativeRows,baseGraph);
 assert.ok(overlay.nodes.some(node=>node.id==='SEM-CROSS-NULL-AUDIT-001'&&node.overlayOnly===true&&node.kind==='SEMANTIC_MEMORY'));
 assert.ok(overlay.nodes.some(node=>node.id==='LESSON-CROSS-NULL-FIRST-AUDIT-001'&&node.overlayOnly===true&&node.kind==='PROCEDURAL_MEMORY'));
 const filament=overlay.edges.find(edge=>edge.id==='FIL-CROSS-NULL-SCI-OLY-001');
 assert.equal(filament.type,'ALTERNATIVE_FILAMENT');
 assert.equal(filament.weight,.9);
 assert.equal(filament.authority,'DERIVED_NOT_TRUTH');
 const merged=mergeAssociativeOverlay(baseGraph,overlay);
 const off=hierarchyView(merged,{expandedIds:new Set(['lane:SCIENCE','lane:OLYMPUS']),showAlternativeFilaments:false});
 assert.equal(off.nodes.some(node=>node.overlayOnly),false);
 const on=hierarchyView(merged,{expandedIds:new Set(['lane:SCIENCE','lane:OLYMPUS']),showAlternativeFilaments:true});
 assert.ok(on.nodes.some(node=>node.id==='SEM-CROSS-NULL-AUDIT-001'));
 assert.ok(on.nodes.some(node=>node.id==='LESSON-CROSS-NULL-FIRST-AUDIT-001'));
 assert.ok(on.edges.some(edge=>edge.id==='FIL-CROSS-NULL-SCI-OLY-001'));
 assert.equal(on.nodes.filter(node=>node.hierarchyLevel==='lane').length,2);
});

test('associative overlay resolves canonical record ids before creating derived reference anchors',async()=>{
 assert.equal(existsSync(associativePath),true,'associative-memory.mjs must exist');
 const {buildAssociativeOverlay}=await import(pathToFileURL(associativePath));
 const overlay=buildAssociativeOverlay(associativeRows,baseGraph);
 const caseEdge=overlay.edges.find(edge=>edge.id.startsWith('FIL-INTRA-OLY-NULL-CLIENTS-001'));
 assert.equal(caseEdge.target,'record:Olympus:OLY-CL-0002');
 assert.equal(overlay.nodes.some(node=>node.id==='ref:OLY-CL-0002'),false);
});

test('Graph Lab loads associative memory best-effort and keeps filament rendering weighted',()=>{
 const app=readFileSync(join(graphLab,'app.mjs'),'utf8');
 const projection=readFileSync(join(graphLab,'graph/projection.mjs'),'utf8');
 const filaments=readFileSync(join(graphLab,'graph/filaments.mjs'),'utf8');
 assert.match(app,/loadAssociativeMemory/);
 assert.match(app,/mergeAssociativeOverlay/);
 assert.match(projection,/overlayOnly/);
 assert.match(filaments,/filamentWeight/);
});
