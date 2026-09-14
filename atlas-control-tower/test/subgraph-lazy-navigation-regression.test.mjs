import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateStaticState} from '../lib/static-state-generator.mjs';
import {createStaticArtifactApi} from '../lib/static-artifact-api.mjs';
import {deriveGraphNavigation} from '../src/graph-engine/navigation-contract.mjs';

function json(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function localFetch(root){
  return async url=>{
    const pathname=new URL(String(url),'https://atlas.local').pathname.replace(/^\/data\//,'');
    const file=path.join(root,pathname);
    if(!fs.existsSync(file))return {ok:false,status:404,json:async()=>({})};
    return {ok:true,status:200,json:async()=>json(file)};
  };
}

test('lazy structural containers publish child counts so click navigation can prove expandability',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-lazy-nav-'));
  const built=await generateStaticState({outDir:out,generatedAt:'2026-09-14T12:00:00Z'});
  const root=json(path.join(built.snapshotDir,'graph/root.json'));
  const rootNav=deriveGraphNavigation(root.nodes,root.edges);
  assert.equal(rootNav.get('system:SCIENCE')?.expandable,true,'Science must be clickable even though its children live in another artifact');
  assert.ok(rootNav.get('system:SCIENCE')?.childCount>0);
  assert.equal(rootNav.get('system:ENGINEERING')?.expandable,true,'Engineering must be clickable from the root graph');

  const science=json(path.join(built.snapshotDir,'graph/science.json'));
  const scienceNav=deriveGraphNavigation(science.nodes,science.edges);
  assert.equal(scienceNav.get('domain:D1')?.expandable,true,'D1 must be clickable before its campaign shard is loaded');
  assert.ok(scienceNav.get('domain:D1')?.childCount>0);

  const d1=json(path.join(built.snapshotDir,'graph/science/D1.json'));
  const d1Nav=deriveGraphNavigation(d1.nodes,d1.edges);
  assert.equal(d1Nav.get('CAMP-H0-RULER-ANCHOR')?.expandable,false,'Campaign remains a structural leaf in the public map');
});

test('static runtime can open an Engineering program into its real campaign subgraph',async()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-program-nav-'));
  await generateStaticState({outDir:out,generatedAt:'2026-09-14T12:00:00Z'});
  const api=createStaticArtifactApi({baseUrl:'/data',fetchImpl:localFetch(out)});
  const graph=await api.graph({focus:'ENG-PROG-ATLAS-CONTROL-TOWER',depth:2});
  assert.equal(graph.focus,'ENG-PROG-ATLAS-CONTROL-TOWER');
  assert.ok(graph.nodes.some(node=>node.id==='ENG-CAMP-ATLAS-GRAPH-SSOT'));
  assert.ok(graph.edges.some(edge=>edge.source==='ENG-PROG-ATLAS-CONTROL-TOWER'&&edge.target==='ENG-CAMP-ATLAS-GRAPH-SSOT'));
});
