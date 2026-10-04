import test from 'node:test';
import assert from 'node:assert/strict';
import {browserModelContext,registerWebMcp} from '../src/mcp/webmcp.ts';

const publicTool={name:'search_atlas',description:'Search Atlas',inputSchema:{type:'object',properties:{query:{type:'string'}}},access:'PUBLIC',availability:'AVAILABLE',annotations:{readOnlyHint:true}};
test('unsupported browsers do not contact MCP or claim registration',async()=>{
  let calls=0;
  const result=await registerWebMcp(undefined,{readStatus:async()=>{calls++;}});
  assert.equal(result.state,'UNSUPPORTED');assert.equal(calls,0);
  const context={registerTool(){}};
  assert.equal(browserModelContext({modelContext:context},{}),context);
  assert.equal(browserModelContext({}, {modelContext:context}),context);
});
test('WebMCP forwards only available public read-only tools and propagates cancellation',async()=>{
  const tools=[],removed=[];let forwarded;
  const context={registerTool(tool){tools.push(tool);},unregisterTool(name){removed.push(name);}};
  const result=await registerWebMcp(context,{
    readStatus:async()=>({tools:[publicTool,{...publicTool,name:'write',annotations:{readOnlyHint:false}},{...publicTool,name:'private',access:'OPERATIONAL'},{...publicTool,name:'missing',availability:'UNAVAILABLE'}]}),
    callTool:async(tool,args,signal)=>{forwarded={tool,args,signal};return {items:[]};}
  });
  assert.equal(result.state,'REGISTERED');assert.deepEqual(result.registered,['nexo_search_atlas']);
  const controller=new AbortController();const payload=await tools[0].execute({query:'DESI'},{signal:controller.signal});
  assert.deepEqual(payload,{items:[]});assert.equal(forwarded.tool,publicTool);assert.deepEqual(forwarded.args,{query:'DESI'});
  assert.equal(forwarded.signal.aborted,false);controller.abort();assert.equal(forwarded.signal.aborted,true);
  result.dispose();assert.deepEqual(removed,['nexo_search_atlas']);
});
test('page disposal aborts ongoing WebMCP reads even without an invocation signal',async()=>{
  let tool,signal;
  const result=await registerWebMcp({registerTool(value){tool=value;}}, {
    readStatus:async()=>({tools:[publicTool]}),callTool:async(_,args,value)=>{signal=value;return {};}
  });
  await tool.execute({query:'DESI'});assert.equal(signal.aborted,false);
  result.dispose();assert.equal(signal.aborted,true);
});
test('registration failure removes partial tools without claiming availability',async()=>{
  const removed=[];let attempts=0;
  const result=await registerWebMcp({registerTool(){if(++attempts===2)throw new Error('registration denied');},unregisterTool(name){removed.push(name);}},
    {readStatus:async()=>({tools:[publicTool,{...publicTool,name:'get_science_state'}]})});
  assert.equal(result.state,'UNAVAILABLE');assert.deepEqual(result.registered,[]);assert.deepEqual(removed,['nexo_search_atlas']);
});
test('leaving a page during discovery cancels registration even if discovery completes later',async()=>{
  const lifecycle=new AbortController();let discoverySignal;let registrations=0;
  const result=await registerWebMcp({registerTool(){registrations++;}}, {
    signal:lifecycle.signal,
    readStatus:async(signal)=>{discoverySignal=signal;lifecycle.abort();return {tools:[publicTool]};}
  });
  assert.equal(discoverySignal.aborted,true);assert.equal(registrations,0);assert.equal(result.state,'UNAVAILABLE');
});
test('legacy async registration finishing after disposal removes the late tool',async()=>{
  const lifecycle=new AbortController();const removed=[];
  const result=await registerWebMcp({
    async registerTool(){lifecycle.abort();await Promise.resolve();},
    unregisterTool(name){removed.push(name);}
  },{signal:lifecycle.signal,readStatus:async()=>({tools:[publicTool]})});
  assert.equal(result.state,'UNAVAILABLE');assert.deepEqual(result.registered,[]);
  assert.deepEqual(removed,['nexo_search_atlas']);
});
