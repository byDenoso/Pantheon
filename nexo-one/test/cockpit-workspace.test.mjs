import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCandidates, pageRows, publicationState, newestFirst, canRefresh, reconcileDraft, createReadGate} from '../src/cockpit/workspace.ts';
test('private search covers scientific limits and normalizes Portuguese accents',()=>{
  const rows=[{id:'a',source:{titulo:'Expansão',limites:'Somente baixo redshift'}},{id:'b',source:{titulo:'Crescimento'}}];
  assert.deepEqual(filterCandidates(rows,'expansao','all',new Set(),new Set()).map(r=>r.id),['a']);
  assert.deepEqual(filterCandidates(rows,'baixo redshift','all',new Set(),new Set()).map(r=>r.id),['a']);
  assert.deepEqual(filterCandidates(rows,'','selected',new Set(['b']),new Set()).map(r=>r.id),['b']);
  assert.deepEqual(filterCandidates(rows,'','changed',new Set(),new Set(['a'])).map(r=>r.id),['a']);
  assert.deepEqual(rows.map(r=>r.id),['a','b']);
});
test('pagination clamps stale pages and sorting uses source dates without changing rows',()=>{
  const rows=[{id:'old',source:{data:'2026-10-01T00:00:00Z'}},{id:'new',source:{data:'2026-11-01T00:00:00Z'}}];
  assert.deepEqual(newestFirst(rows,'data').map(r=>r.id),['new','old']);
  assert.deepEqual(pageRows(rows,99,1),{rows:[rows[1]],page:2,pages:2,total:2});
  assert.deepEqual(pageRows([],1,10),{rows:[],page:1,pages:1,total:0});
});
test('draft choices never claim publication and refresh cannot overwrite an edit',()=>{
  assert.equal(publicationState(true,false),'Rascunho');
  assert.equal(publicationState(true,true),'Publicado');
  assert.equal(publicationState(false,true),'Retirada pendente');
  assert.equal(publicationState(false,false),'Privado');
  assert.equal(canRefresh({automatic:true,dirty:false,saving:false,loading:false,visible:true}),true);
  for(const change of [{dirty:true},{saving:true},{loading:true},{visible:false},{automatic:false}])assert.equal(canRefresh({automatic:true,dirty:false,saving:false,loading:false,visible:true,...change}),false);
});
test('a source response arriving during editing preserves the draft, while an unchanged draft follows the source',()=>{
  const original={text:'original'}, incoming={text:'nova leitura'}, edited={text:'minha revisão'};
  assert.equal(reconcileDraft(edited,original,incoming,JSON.stringify),edited);
  assert.equal(reconcileDraft({...original},original,incoming,JSON.stringify),incoming);
});
test('logout invalidates an in-flight read even when its response still arrives; a new session can read safely',async()=>{
  const gate=createReadGate(), first=gate.start();let finish;
  const delayed=new Promise(resolve=>{finish=resolve;});
  let visible=null;
  const read=(async()=>{const payload=await delayed;if(gate.valid(first))visible=payload;})();
  assert.equal(gate.start(),null);
  gate.invalidate();assert.equal(first.controller.signal.aborted,true);
  finish('private payload');await read;assert.equal(visible,null);
  const second=gate.start();assert.equal(gate.valid(second),true);
  assert.equal(gate.finish(first),false);assert.equal(gate.valid(second),true);
  assert.equal(gate.finish(second),true);
});
