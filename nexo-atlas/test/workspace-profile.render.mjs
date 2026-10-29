// Component SSR parity over synthetic private data. No hosted browser or real session.
import {build}from'vite';import{mkdir,mkdtemp,writeFile,rm}from'node:fs/promises';import{resolve}from'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});const tmp=await mkdtemp(resolve('.sites-runtime/workspace-render-'));
try{
 await writeFile(`${tmp}/entry.tsx`,String.raw`
import React from 'react';import assert from 'node:assert/strict';import{renderToStaticMarkup as render}from'react-dom/server';
import{compilePrivateTowerRuntime}from'${resolve('server/atlas/private-tower.mjs')}';import{compilePrivateWorkspaceRuntime,privateWorkspaceTest}from'${resolve('server/atlas/private-workspace.mjs')}';import{makePrivateTowerFixture}from'${resolve('test/helpers/private-tower.fixture.mjs')}';
import{buildLab}from'${resolve('src/features/lab/model.ts')}';import{workspaceLab}from'${resolve('src/private-workspace/workspace-lab.ts')}';
import{DomainView,ResearchView,TestDetail,OperationView}from'${resolve('src/private-workspace/Views.tsx')}';import AgentBoardView from'${resolve('src/private-workspace/AgentBoardView.tsx')}';import OnDemandTestDetail from'${resolve('src/private-workspace/OnDemandTestDetail.tsx')}';
const tower=makePrivateTowerFixture();tower.files['evolution/board.json']={encoding:'json',value:{posts:[{id:'P',at:tower.updated_at,from:'ENGINEER',to:'EXECUTOR',text:'Canonical board text',refs:['TEST-01']}]}};tower.file_count++;
const old=compilePrivateTowerRuntime(tower).data.system,next=compilePrivateWorkspaceRuntime(tower).data.system,a=buildLab(old),b=workspaceLab(next),tests=[...a.tests.values()],updated=[...b.tests.values()];
// The compact profile adds explicit Writer availability; the legacy profile has no such field.
assert.equal(old.writer_operations,undefined);assert.ok(next.writer_operations);
const comparableOld={...old,writer_operations:next.writer_operations};
const record=privateWorkspaceTest(tower,{id:'TEST-01',expected_revision:tower.revision}).body.record;const detail={...next,read_model:{...next.read_model,tests:{'TEST-01':record}}};
for(const lang of ['pt-BR','en']){
 assert.equal(render(<DomainView tests={tests} lab={a} state={old} lang={lang}/>),render(<DomainView tests={updated} lab={b} state={next} lang={lang}/>));
 assert.equal(render(<ResearchView tests={tests} lab={a} state={old} domain={null} filter="all" lang={lang}/>),render(<ResearchView tests={updated} lab={b} state={next} domain={null} filter="all" lang={lang}/>));
 assert.equal(render(<OperationView state={comparableOld} lang={lang}/>),render(<OperationView state={next} lang={lang}/>));assert.equal(render(<AgentBoardView state={old} lang={lang}/>),render(<AgentBoardView state={next} lang={lang}/>));
 assert.equal(render(<TestDetail test={a.tests.get('TEST-01')} lab={a} state={old} lang={lang}/>),render(<TestDetail test={b.tests.get('TEST-01')} lab={b} state={detail} lang={lang}/>));
 let reads=0;const reader={read:async()=>{reads++;return record;},clear(){}};
 const pending=render(<OnDemandTestDetail test={b.tests.get('TEST-01')} lab={b} state={next} lang={lang} reader={reader}/>);assert.equal(reads,0);assert.match(pending,/aria-busy="true"/);assert.match(pending,lang==='en'?/Loading the complete/:/Carregando o registro completo/);
}
console.log('PASS PT/EN exact SSR equality for domains, research, operations, board and loaded full test; deferred record initial loading, no eager request in render.');
 `);
 await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${tmp}/entry.tsx`,outDir:`${tmp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});await import(`${tmp}/out/check.mjs`);
}finally{await rm(tmp,{recursive:true,force:true});}
