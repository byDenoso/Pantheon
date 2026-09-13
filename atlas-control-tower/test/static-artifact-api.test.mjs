import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateStaticState} from '../lib/static-state-generator.mjs';
import {createStaticArtifactApi} from '../lib/static-artifact-api.mjs';

function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'nexo-static-api-'))}
function fileFetch(root){
  return async url=>{
    const parsed=new URL(String(url),'http://static.local/');
    const file=path.join(root,decodeURIComponent(parsed.pathname).replace(/^\/data\//,''));
    if(!fs.existsSync(file))return {ok:false,status:404,headers:{get:()=> 'application/json'},json:async()=>({error:'NOT_FOUND'})};
    return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
  };
}

test('static artifact API resolves core graph and science sentinel by relative artifacts',async()=>{
  const root=temp();
  await generateStaticState({outDir:root,generatedAt:'2026-09-13T18:00:00Z'});
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:fileFetch(root)});
  const top=await api.graph({focus:'system:NEXO'});
  assert.ok(top.nodes.some(node=>node.id==='system:SCIENCE'));
  assert.ok(top.nodes.some(node=>node.id==='system:OPERATIONS'));
  const ops=await api.graph({focus:'system:OPERATIONS'});
  assert.equal(ops.focus,'system:OPERATIONS');
  assert.ok(ops.nodes.some(node=>node.id==='system:OPERATIONS'));
  const d7=await api.graph({focus:'domain:D7'});
  assert.ok(d7.nodes.some(node=>node.id==='T-ALENS-001'));
  assert.ok(d7.nodes.some(node=>node.id==='result:T-ALENS-001'));
  assert.ok(d7.edges.some(edge=>edge.source==='T-ALENS-001'&&edge.target==='result:T-ALENS-001'&&edge.type==='PRODUCES'));
});

test('static artifact API resolves entity state health learning ops and audit without server routes',async()=>{
  const root=temp();
  await generateStaticState({outDir:root});
  let calls=0;
  const fetcher=fileFetch(root);
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:async url=>{calls++;return fetcher(url)}});
  const entity=await api.entity('T-ALENS-001');
  assert.equal(entity.entity?.type,'TEST');
  assert.equal((await api.health()).runtime,'STATIC_LOCAL');
  const state=await api.state();
  assert.equal(state.freshness,'SNAPSHOT');
  assert.equal(state.projection?.authority,'GITHUB');
  assert.equal(state.projection?.projectionAuthority,'GOOGLE_DRIVE');
  assert.ok(state.domains?.science>0);
  assert.ok(Array.isArray((await api.learning()).ladder));
  assert.ok(Array.isArray((await api.ops()).actions));
  assert.ok(Array.isArray((await api.audit()).issues));
  assert.equal(api.remote,false);
  assert.ok(calls>0);
});

test('static artifact API search-mode graph uses compact index and never needs every science shard',async()=>{
  const root=temp();
  await generateStaticState({outDir:root});
  const requested=[];
  const fetcher=fileFetch(root);
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:async url=>{requested.push(String(url));return fetcher(url)}});
  const graph=await api.graph({mode:'search',type:'TEST',limit:5});
  assert.equal(graph.nodes.length,5);
  assert.ok(graph.nodes.every(node=>node.type==='TEST'));
  assert.ok(requested.some(url=>url.includes('search/index.json')));
  assert.equal(requested.filter(url=>/science\/D\d+\.json/.test(url)).length,0);
});
