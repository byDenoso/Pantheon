import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderControlTower} from '../ui/control-tower.mjs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const model={
 health:[
  {id:'science',label:'Science',state:'good',detail:'science_v1 · LIVE',focus:'system:SCIENCE'},
  {id:'semantic',label:'Semantic',state:'good',detail:'5.219 entradas',focus:'system:NEXO'},
  {id:'blackbox',label:'Black Box',state:'good',detail:'17 runs',focus:'system:AUTOMATION'},
  {id:'learning',label:'Learning',state:'good',detail:'181 objetos',focus:'system:LEARNING'}
 ],
 attention:{blockedCount:2,blockers:[{id:'a',label:'Acquire source',domain:'SCIENCE',status:'BLOCKED',summary:'waiting'}],runs:17,readbackVerified:17,readbackPercent:100,readbackLabel:'17/17',success:15},
 corpus:{total:5060,tests:2190,results:1565,claims:1195,sourceVersion:'v1'},
 recent:{newCount:1,hasPreviousVisit:true,items:[{id:'e',label:'Runtime remediation',updatedAt:'2026-09-07T19:02:30Z',summary:'repaired',metadata:{event_type:'RUNTIME'}}]},
 promoted:[{id:'p',title:'should not render',status:'ACTIVE'}],decisions:[]
};

const fakeRoot=()=>({innerHTML:'',querySelectorAll(){return[]},querySelector(){return null}});

test('overview puts the approved reference map before the operational deck',()=>{
 assert.match(index,/Ideias em órbita\./);
 assert.match(index,/Descobertas em rede\./);
 assert.match(index,/ui\/reference-one\.css/);
 assert.ok(index.indexOf('id="map-workspace"')<index.indexOf('id="command-center"'));
 assert.match(index,/CONTROL TOWER/);
 assert.match(index,/reference-system-card/);
 assert.doesNotMatch(index,/FRONTEND OFICIAL|Estado rastreável/);
});

test('post-map deck contains the five approved reference consoles',()=>{
 const root=fakeRoot();
 renderControlTower(root,model,{});
 assert.match(root.innerHTML,/Status operacional/);
 assert.match(root.innerHTML,/Prioridades/);
 assert.match(root.innerHTML,/Atividade recente/);
 assert.match(root.innerHTML,/Blockers/);
 assert.match(root.innerHTML,/Readback/);
 assert.doesNotMatch(root.innerHTML,/LEARNING PROMOVIDO/);
 assert.doesNotMatch(root.innerHTML,/APRENDIZADO/);
});
