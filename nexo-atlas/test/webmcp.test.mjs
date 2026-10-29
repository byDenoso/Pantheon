import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexoWebMCP} from '../src/private-memory/webmcp.ts';
import {createKnowledgeTransport} from '../src/private-memory/knowledge.ts';
function setup(extra={}) {const calls=[],tools=[],registrations=[];return {calls,tools,registrations,options:{enabled:true,isAuthorized:()=>true,environment:{isSecureContext:true,document:{modelContext:{async registerTool(tool,opts){tools.push(tool);registrations.push(opts);}}}},read:async(action,args,signal)=>{calls.push({action,args,signal});return {access:'PRIVATE'};},...extra}};}
test('current document API registers only read tools, abort signals and same-origin exposure',async()=>{
 const {options,tools,registrations,calls}=setup(),bridge=await createNexoWebMCP(options);
 assert.equal(bridge.mode,'DOCUMENT_WEBMCP');assert.deepEqual(bridge.registeredTools,['nexo_memory_search','nexo_knowledge_graph']);
 for(const tool of tools){assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.untrustedContentHint,true);assert.equal(tool.annotations.consequentialHint,false);assert.equal(tool.inputSchema.additionalProperties,false);}
 for(const options of registrations)assert.deepEqual(options.exposedTo,[]);
 await tools[0].execute({query:'test'});await tools[1].execute({seed_id:'TEST::T-1'});assert.deepEqual(calls.map(v=>v.action),['browse','graph']);assert.equal(calls[0].args.limit,10);
 bridge.dispose();bridge.dispose();assert.ok(registrations.every(v=>v.signal.aborted));await assert.rejects(()=>tools[0].execute({}),/AUTH_REQUIRED/);
});
test('unsupported browsers retain authenticated HTTP invocation with no polyfill',async()=>{
 const {options}=setup({environment:{isSecureContext:true}}),bridge=await createNexoWebMCP(options);assert.equal(bridge.mode,'HTTP_FALLBACK');assert.deepEqual(bridge.registeredTools,[]);assert.deepEqual(await bridge.invoke('nexo_knowledge_graph',{}),{access:'PRIVATE'});assert.equal(options.environment.document,undefined);
});
test('a denied native feature getter falls back without breaking normal private browsing',async()=>{
 const {options}=setup({environment:{isSecureContext:true,document:{get modelContext(){throw new Error('PermissionsPolicy denied');}}}});
 const bridge=await createNexoWebMCP(options);assert.equal(bridge.mode,'HTTP_FALLBACK');assert.deepEqual(await bridge.invoke('nexo_memory_search',{}),{access:'PRIVATE'});
});
test('registration is opt-in, secure-context and owner-session gated',async()=>{
 for(const patch of [{enabled:false},{isAuthorized:()=>false},{environment:{isSecureContext:false}}]){const {options,calls,tools}=setup(patch),bridge=await createNexoWebMCP(options);assert.equal(bridge.mode,'DISABLED');assert.equal(tools.length,0);await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);assert.equal(calls.length,0);}
});
test('write tools, arbitrary destinations, unknown fields and oversized queries are refused',async()=>{
 const {options,calls}=setup(),bridge=await createNexoWebMCP(options);
 for(const name of ['apply','propose','nexo_memory_apply','https://attacker.invalid'])await assert.rejects(()=>bridge.invoke(name,{}),/KNOWLEDGE_TOOL_DENIED/);
 for(const args of [{url:'https://attacker.invalid'},{query:'x'.repeat(257)},{limit:21},{toString:'bad'},{expected_revision:'old'}])await assert.rejects(()=>bridge.invoke('nexo_memory_search',args),/KNOWLEDGE_QUERY_INVALID/);
 assert.equal(calls.length,0);
});
test('logout and cancellation during reads discard late private results',async()=>{
 let resolve,authorized=true;const {options}=setup({isAuthorized:()=>authorized,read:async()=>new Promise(r=>{resolve=r;})}),bridge=await createNexoWebMCP(options);
 const pending=bridge.invoke('nexo_memory_search',{});authorized=false;resolve({secret:'not delivered'});await assert.rejects(()=>pending,/AUTH_REQUIRED/);
 authorized=true;const signal=new AbortController(),later=bridge.invoke('nexo_memory_search',{},signal.signal);signal.abort();resolve({secret:'not delivered'});await assert.rejects(()=>later,{name:'AbortError'});
 const final=bridge.invoke('nexo_memory_search',{});bridge.dispose();resolve({secret:'not delivered'});await assert.rejects(()=>final,{name:'AbortError'});
});
test('legacy navigator registration is explicit and requires cleanup support',async()=>{
 const tools=[],removed=[],context={registerTool:t=>tools.push(t),unregisterTool:n=>removed.push(n)};
 const {options}=setup({environment:{isSecureContext:true,navigator:{modelContext:context}}});
 const defaultBridge=await createNexoWebMCP(options);assert.equal(defaultBridge.mode,'HTTP_FALLBACK');assert.equal(tools.length,0);
 const bridge=await createNexoWebMCP({...options,allowLegacyNavigator:true});assert.equal(bridge.mode,'LEGACY_NAVIGATOR_WEBMCP');bridge.dispose();assert.equal(removed.length,2);
 const missingCleanup=await createNexoWebMCP({...options,allowLegacyNavigator:true,environment:{isSecureContext:true,navigator:{modelContext:{registerTool:()=>{throw Error('must not register');}}}}});assert.equal(missingCleanup.mode,'HTTP_FALLBACK');
});
test('partial registration and logout during async registration fail closed',async()=>{
 let first, count=0;const {options}=setup({environment:{isSecureContext:true,document:{modelContext:{async registerTool(_t,opts){if(++count===2)throw Error('failed');first=opts.signal;}}}}});
 const bridge=await createNexoWebMCP(options);assert.equal(bridge.mode,'DISABLED');assert.equal(first.aborted,true);await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);
 const controller=new AbortController();let finish,signal;const second=setup({signal:controller.signal,environment:{isSecureContext:true,document:{modelContext:{registerTool(_tool,opts){signal=opts.signal;return new Promise(r=>{finish=r;});}}}}});
 const pending=createNexoWebMCP(second.options);controller.abort();finish();const closed=await pending;assert.equal(closed.mode,'DISABLED');assert.equal(signal.aborted,true);
});
test('HTTP transport has fixed private read routes, no credential parameters or mutations',async()=>{
 const calls=[],read=createKnowledgeTransport(async(url,init)=>{calls.push({url,init});return Response.json({ok:true});});
 await read('browse',{});await read('graph',{});assert.deepEqual(calls.map(v=>v.url),['/api/atlas-memory/browse','/api/atlas-knowledge/query']);
 for(const {init} of calls){assert.equal(init.method,'POST');assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');}
 for(const action of ['propose','apply','https://attacker.invalid'])await assert.rejects(()=>read(action,{}),/KNOWLEDGE_ACTION_DENIED/);assert.equal(calls.length,2);
});
