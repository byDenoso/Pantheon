import test from 'node:test';
import assert from 'node:assert/strict';
import * as webmcp from '../webmcp/tools.mjs';

function harness(){
 const calls=[],registered=new Map(),messages=[];
 const api=new Proxy({provenance:{source:'TEST'}},{get:(target,name)=>target[name]||
  (async(...args)=>{calls.push({name,args});return {entity:{id:args[0]},relations:[],source:'TEST'};})});
 const session={state:{focus:'test:fixture',summary:{sources:[]},graph:{}},setFilters:async()=>{}};
 const actions={focus:async()=>{},compare:()=>{},sync:async()=>{}};
 const context={registerTool:async(definition,options)=>registered.set(definition.name,{definition,options})};
 return {calls,registered,messages,api,session,actions,context,
  register:(extra={})=>webmcp.registerWebMcp({api,session,actions,onStatus:text=>messages.push(text),
   documentLike:{modelContext:context},navigatorLike:{},...extra})};
}

test('Unsupported browsers return zero without reading data or requiring globals',async()=>{
 const h=harness();assert.equal(await h.register({documentLike:{},navigatorLike:{}}),0);
 assert.equal(h.calls.length,0);assert.equal(h.registered.size,0);
});
test('Current document API wins when legacy navigator API also exists',async()=>{
 const h=harness();let legacy=0;
 assert.equal(await h.register({navigatorLike:{modelContext:{registerTool:()=>{legacy++;}}}}),20);
 assert.equal(legacy,0);assert.equal(h.registered.size,20);
});
test('Legacy navigator remains a fallback when document has no functional API',async()=>{
 const h=harness();assert.equal(await h.register({documentLike:{modelContext:{registerTool:true}},navigatorLike:{modelContext:h.context}}),20);
});
test('Every implemented tool has an exact schema, without unknown arguments',()=>{
 const h=harness(),tools=webmcp.buildTools(h);
 assert.deepEqual(Object.keys(webmcp.TOOL_SCHEMAS).sort(),Object.keys(tools).sort());
 for(const spec of Object.values(webmcp.TOOL_SCHEMAS))assert.equal(spec.additionalProperties,false);
 assert.deepEqual(webmcp.TOOL_SCHEMAS.atlas_get_entity.required,['id']);
 assert.deepEqual(webmcp.TOOL_SCHEMAS.atlas_get_health.properties,{});
});
test('Missing or blank entity IDs fail before an API request',async()=>{
 const h=harness();await h.register();const execute=h.registered.get('atlas_get_entity').definition.execute;
 for(const input of [{},{id:''},{id:'  '},{id:null},[],null])
  await assert.rejects(execute(input),/ATLAS_TOOL_INPUT_INVALID/);
 assert.equal(h.calls.length,0);
});
test('Unknown input fields cannot be silently interpreted as authorization',async()=>{
 const h=harness();await h.register();const execute=h.registered.get('atlas_get_health').definition.execute;
 await assert.rejects(execute({approved:true}),/ATLAS_TOOL_INPUT_INVALID/);
 assert.equal(h.calls.length,0);
});
test('Neighborhood depth rejects fractions and negative traversal',async()=>{
 const h=harness();await h.register();const execute=h.registered.get('atlas_graph_neighborhood').definition.execute;
 for(const depth of [0,-1,1.5,'2',Infinity])await assert.rejects(execute({id:'test:fixture',depth}),/ATLAS_TOOL_INPUT_INVALID/);
 assert.equal(h.calls.length,0);
});
test('Valid entity and optional search arguments use the existing data path',async()=>{
 const h=harness();await h.register();
 await h.registered.get('atlas_get_test').definition.execute({id:'fixture'});
 await h.registered.get('atlas_search').definition.execute();
 assert.equal(h.calls[0].args[0],'test:fixture');
 assert.deepEqual(h.calls[1].args[0],{mode:'search',query:''});
});
test('Lineage reads are not misclassified as view mutations',async()=>{
 const h=harness();await h.register();
 assert.equal(h.registered.get('atlas_show_lineage').definition.annotations.readOnlyHint,true);
 assert.equal(h.registered.get('atlas_focus_entity').definition.annotations.readOnlyHint,false);
 for(const {definition} of h.registered.values())assert.equal(definition.annotations.consequentialHint,false);
});
test('One registration failure is isolated and reported without leaking error text',async()=>{
 const h=harness();const count=await h.register({documentLike:{modelContext:{registerTool:async definition=>{
  if(definition.name==='atlas_get_health')throw new Error('PRIVATE_ERROR_DETAIL');
 }}}});
 assert.equal(count,19);assert.match(h.messages.at(-1),/1 indispon/);
 assert.doesNotMatch(h.messages.join(' '),/PRIVATE_ERROR_DETAIL/);
});
test('Registration completion is awaited before reporting availability',async()=>{
 const h=harness();let release;
 const gate=new Promise(resolve=>{release=resolve;});let first=true;
 const pending=h.register({documentLike:{modelContext:{registerTool:async()=>{if(first){first=false;await gate;}}}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.messages.length,0);
 release();assert.equal(await pending,20);
});
test('An already-aborted registration does not install any tools',async()=>{
 const h=harness(),controller=new AbortController();controller.abort();
 assert.equal(await h.register({signal:controller.signal}),0);assert.equal(h.registered.size,0);
});
test('Registration signal is passed to the browser for native disposal',async()=>{
 const h=harness(),controller=new AbortController();await h.register({signal:controller.signal});
 for(const {options} of h.registered.values())assert.equal(options.signal,controller.signal);
});
test('An aborted invocation performs no API read',async()=>{
 const h=harness(),controller=new AbortController();await h.register();controller.abort();
 await assert.rejects(h.registered.get('atlas_get_health').definition.execute({}, {signal:controller.signal}),{name:'AbortError'});
 assert.equal(h.calls.length,0);
});
test('The registration scope cannot execute more work after cancellation',async()=>{
 const h=harness(),controller=new AbortController();await h.register({signal:controller.signal});controller.abort();
 await assert.rejects(h.registered.get('atlas_get_health').definition.execute({}),{name:'AbortError'});
 assert.equal(h.calls.length,0);
});
