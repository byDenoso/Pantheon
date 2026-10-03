// Reproduce the reviewed Agora false-zero on the exact immutable pre-fix source.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { labVisualFixture } from './lab-visual-fixture.mjs';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
const expected='2cabbea718960ad1dc72379fbb30ef1688372f01';
const root=process.env.NEXO_REPRO_BASELINE_ROOT;
assert.ok(root,'NEXO_REPRO_BASELINE_ROOT is required');
const repository=resolve(root,'..');
const actual=execFileSync('git',['rev-parse','HEAD^{commit}'],{cwd:repository,encoding:'utf8'}).trim();
assert.equal(actual,expected);
execFileSync('git',['diff','--quiet','HEAD','--'],{cwd:repository});
const projection=labVisualFixture(); projection.tests=[]; projection.evolution.board=[];
const {system}=buildPagesProjection({projection,manifestFile:projection.manifest});
delete system.read_model.tests;
const server=await createServer({root,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
try{
 const {default:LabApp}=await server.ssrLoadModule('/src/features/lab/LabApp.tsx');
 const render=(page,q)=>renderToStaticMarkup(createElement(LabApp,{state:system,route:{page,q},theme:'dark'}));
 const agora=render('agora'), evidence=render('evidencia','READY');
 assert.match(agora,/0 testes marcados READY/);
 assert.match(agora,/Nenhum teste pronto nesta leitura/);
 assert.match(evidence,/Não foi possível confirmar a fila nesta leitura/);
 const receipt={input:'synthetic-test-only',source_sha:actual,clean_tracked_source:true,removed:'read_model.tests',agora:'false zero and empty queue reproduced',evidence:'unavailable',reproduction:'PASS'};
 await mkdir('test-output/agora-source',{recursive:true});
 await writeFile('test-output/agora-source/reviewed-baseline.json',JSON.stringify(receipt,null,2));
 console.log('AGORA_SOURCE_BASELINE_REPRODUCTION '+JSON.stringify(receipt));
}finally{await server.close();}
