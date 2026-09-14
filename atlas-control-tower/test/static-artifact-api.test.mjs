import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateStaticState} from '../lib/campaign-static-state-generator.mjs';
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

test('static artifact API resolves core graph and canonical science program drill-down',async()=>{
  const root=temp();
  await generateStaticState({outDir:root,generatedAt:'2026-09-13T18:00:00Z'});
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:fileFetch(root)});
  const top=await api.graph({focus:'system:NEXO'});
  assert.ok(top.nodes.some(node=>node.id==='system:SCIENCE'));
  assert.ok(top.nodes.some(node=>node.id==='system:OPERATIONS'));
  const science=await api.graph({focus:'system:SCIENCE'});
  assert.ok(science.nodes.some(node=>node.id==='PROG-CMB-EARLY-MICROPHYSICS'&&node.type==='PROGRAM'));
  const program=await api.graph({focus:'PROG-CMB-EARLY-MICROPHYSICS'});
  assert.equal(program.focus,'PROG-CMB-EARLY-MICROPHYSICS');
  assert.ok(program.nodes.some(node=>node.id==='CAMP-CMB-ANOMALIES'&&node.type==='CAMPAIGN'));
  assert.equal(program.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
  const d7=await api.graph({focus:'domain:D7'});
  assert.ok(d7.nodes.some(node=>node.id==='CAMP-CMB-ANOMALIES'&&node.type==='CAMPAIGN'));
  assert.equal(d7.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
});

test('static artifact API resolves entity state health learning ops and audit without server routes',async()=>{
  const root=temp();
  await generateStaticState({outDir:root});
  let calls=0;
  const fetcher=fileFetch(root);
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:async url=>{calls++;return fetcher(url)}});
  const entity=await api.entity('CAMP-CMB-ANOMALIES');
  assert.equal(entity.entity?.type,'CAMPAIGN');
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

test('static artifact API search-mode graph uses compact index without loading domain shards',async()=>{
  const root=temp();
  await generateStaticState({outDir:root});
  const requested=[];
  const fetcher=fileFetch(root);
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:async url=>{requested.push(String(url));return fetcher(url)}});
  const graph=await api.graph({mode:'search',type:'CAMPAIGN',limit:5});
  assert.equal(graph.nodes.length,5);
  assert.ok(graph.nodes.every(node=>node.type==='CAMPAIGN'));
  assert.ok(requested.some(url=>url.includes('search/index.json')));
  assert.equal(requested.filter(url=>/science\/D\d+\.json/.test(url)).length,0);
});
