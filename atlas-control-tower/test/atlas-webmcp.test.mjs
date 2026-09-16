import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const webmcpPath=resolve(here,'../src/webmcp/atlas-webmcp.mjs');
const corePath=resolve(here,'../src/webmcp/atlas-semantic-core.mjs');

async function loadModules(){
  assert.equal(existsSync(webmcpPath),true,'Atlas WebMCP adapter must exist');
  assert.equal(existsSync(corePath),true,'Atlas Semantic Core must exist');
  return Promise.all([import(pathToFileURL(webmcpPath)),import(pathToFileURL(corePath))]);
}

function makeAtlas(){
  const calls=[];
  const state={
    focusId:'system:SCIENCE',selectedId:'HYP-DE-017',selectedEntity:{entity:{id:'HYP-DE-017',type:'HYPOTHESIS',status:'ACTIVE'},provenance:[]},
    graph:{nodes:[{id:'HYP-DE-017',type:'HYPOTHESIS',label:'Dark energy hypothesis'}],edges:[]},
    health:{dataSource:{freshness:'LIVE',source:'TOWER_V06'}}
  };
  const actions={
    select(node){calls.push(['select',node.id]);},
    async open(node){calls.push(['open',node.id]);return state.graph;},
    async focusSystem(id,label){calls.push(['focusSystem',id,label]);return state.graph;},
    async search(query){calls.push(['search',query]);return state.graph;},
    async sync(){calls.push(['sync']);return {status:'NO_CHANGE'};}
  };
  return {state,actions,calls};
}

test('semantic core exposes bounded read and UI operations over live Atlas state/actions',async()=>{
  const [,coreModule]=await loadModules();
  const atlas=makeAtlas();
  const core=coreModule.createAtlasSemanticCore({
    getState:()=>atlas.state,
    actions:atlas.actions,
    getRoute:()=>({area:'graphs',path:'/mapa/science',context:{domain:'D7'}}),
    getCapabilities:()=>({towerWriteConfigured:false})
  });
  assert.equal(core.get_status().truth_owner,'TOWER_V06');
  assert.equal(core.get_current_context().focus_id,'system:SCIENCE');
  assert.equal(core.get_selection().entity.id,'HYP-DE-017');
  assert.equal(core.get_entity({entity_id:'HYP-DE-017'}).id,'HYP-DE-017');
  await core.select_entity({entity_id:'HYP-DE-017'});
  await core.focus_entity({entity_id:'system:SCIENCE',label:'Ciência'});
  await core.search({query:'dark energy'});
  await core.sync();
  assert.deepEqual(atlas.calls,[['select','HYP-DE-017'],['focusSystem','system:SCIENCE','Ciência'],['search','dark energy'],['sync']]);
  assert.equal(core.get_capabilities().canonical_write.available,false);
});

test('WebMCP descriptors are bounded, correctly annotated, and omit canonical writes when unavailable',async()=>{
  const [webmcpModule,coreModule]=await loadModules();
  const atlas=makeAtlas();
  const core=coreModule.createAtlasSemanticCore({getState:()=>atlas.state,actions:atlas.actions,getRoute:()=>({area:'graphs',path:'/mapa',context:{}}),getCapabilities:()=>({towerWriteConfigured:false})});
  const tools=webmcpModule.createAtlasWebMcpToolDescriptors(core);
  const names=tools.map(tool=>tool.name).sort();
  assert.deepEqual(names,[
    'atlas.focus_entity','atlas.get_capabilities','atlas.get_current_context','atlas.get_entity','atlas.get_selection','atlas.get_status','atlas.search','atlas.select_entity','atlas.sync'
  ]);
  const status=tools.find(tool=>tool.name==='atlas.get_status');
  const sync=tools.find(tool=>tool.name==='atlas.sync');
  assert.equal(status.annotations.readOnlyHint,true);
  assert.equal(status.annotations.consequentialHint,false);
  assert.equal(sync.annotations.readOnlyHint,false);
  assert.equal(sync.annotations.consequentialHint,false);
  assert.equal(names.some(name=>/run_campaign|create_hypothesis|update_claim|terminalize/.test(name)),false);
});

test('WebMCP absence is progressive enhancement, registration is abortable, and execute delegates to the semantic core',async()=>{
  const [webmcpModule,coreModule]=await loadModules();
  const atlas=makeAtlas();
  const core=coreModule.createAtlasSemanticCore({getState:()=>atlas.state,actions:atlas.actions,getRoute:()=>({area:'graphs',path:'/mapa',context:{}}),getCapabilities:()=>({towerWriteConfigured:false})});
  const unavailable=await webmcpModule.registerAtlasWebMcp({documentLike:{},core});
  assert.equal(unavailable.available,false);
  assert.equal(unavailable.reason,'WEBMCP_UNAVAILABLE');

  const registrations=[];
  const modelContext={
    async registerTool(tool,options){registrations.push({tool,options});},
    async getTools(){return registrations.map(item=>item.tool);}
  };
  const mounted=await webmcpModule.registerAtlasWebMcp({documentLike:{modelContext},core});
  assert.equal(mounted.available,true);
  assert.equal(registrations.length,9);
  assert.ok(registrations.every(item=>item.options?.signal instanceof AbortSignal));
  const selectionTool=registrations.find(item=>item.tool.name==='atlas.get_selection').tool;
  assert.equal((await selectionTool.execute({})).entity.id,'HYP-DE-017');
  mounted.dispose();
  assert.equal(mounted.signal.aborted,true);
});

test('App mounts WebMCP from live Atlas session without making human UI depend on support',()=>{
  const app=readFileSync(resolve(here,'../src/App.tsx'),'utf8');
  assert.match(app,/createAtlasSemanticCore/);
  assert.match(app,/registerAtlasWebMcp/);
  assert.match(app,/dispose\(\)/);
  assert.doesNotMatch(app,/if\s*\([^)]*modelContext[^)]*\)\s*return/,'human UI must not be gated on WebMCP availability');
});

test('App stabilizes the WebMCP action facade instead of depending on the per-render actions object',()=>{
  const app=readFileSync(resolve(here,'../src/App.tsx'),'utf8');
  assert.match(app,/const\s+webMcpActions\s*=\s*useMemo/,'WebMCP must use a stable action facade');
  assert.doesNotMatch(app,/createAtlasSemanticCore\([\s\S]*?actions,\s*\n[\s\S]*?\),\s*\[actions\]\)/,'core must not depend on the per-render actions object identity');
});
