import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {startPrivateKnowledgeSession} from '../src/private-memory/session.ts';
const revision='sha256:'+'a'.repeat(64);
const make=extra=>{const calls=[],lifecycle=new AbortController();return {calls,lifecycle,options:{read:async(action,body,signal)=>{calls.push({action,body,signal});return {source_revision:revision};},environment:{isSecureContext:true},revision,getRevision:()=>revision,signal:lifecycle.signal,onUnauthorized:()=>{},...extra}};};
test('installed session binds both read tools to the authenticated runtime revision',async()=>{
 const {options,calls}=make(),bridge=await startPrivateKnowledgeSession(options);assert.equal(bridge.mode,'HTTP_FALLBACK');await bridge.invoke('nexo_memory_search',{query:'test'});await bridge.invoke('nexo_knowledge_graph',{});assert.ok(calls.every(v=>v.body.expected_revision===revision));
 await assert.rejects(()=>bridge.invoke('nexo_knowledge_graph',{expected_revision:'sha256:'+'b'.repeat(64)}),/KNOWLEDGE_REVISION_CONFLICT/);assert.equal(calls.length,2);
});
test('runtime replacement and logout disable old closures and abort pending private reads',async()=>{
 let current=revision;const {options,lifecycle,calls}=make({getRevision:()=>current}),bridge=await startPrivateKnowledgeSession(options);current='sha256:'+'b'.repeat(64);await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);assert.equal(calls.length,0);current=revision;lifecycle.abort();await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);
});
test('expired server session unregisters tools and asks the existing parent to log out',async()=>{
 let exits=0;const registered=[],{options}=make({environment:{isSecureContext:true,document:{modelContext:{registerTool(_tool,opts){registered.push(opts.signal);}}}},read:async()=>{throw Object.assign(Error('AUTH_REQUIRED'),{status:401});},onUnauthorized:()=>{exits++;}});
 const bridge=await startPrivateKnowledgeSession(options);await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);assert.equal(exits,1);assert.ok(registered.every(signal=>signal.aborted));await assert.rejects(()=>bridge.invoke('nexo_memory_search',{}),/AUTH_REQUIRED/);assert.equal(exits,1);
});
test('Host installs tools only after a valid private runtime and captures a narrow native transport',()=>{
 const host=readFileSync('src/private-legacy/Host.tsx','utf8'),install=readFileSync('src/private-legacy/install.ts','utf8');assert.match(host,/phase\.kind !== 'ready'/);assert.match(host,/window\.parent === window/);assert.match(host,/lifecycle\.abort\(\)/);assert.match(host,/runtimeHolder\.get\(\)\?\.source_revision/);assert.match(install,/createKnowledgeTransport\(nativeFetch\)/);assert.doesNotMatch(install,/export const nativeFetch/);
});
test('memory presentation mounts through the reviewed slot and reports actual native availability',()=>{
 const route=readFileSync('src/private-legacy/TowerRoute.tsx','utf8'),workspace=readFileSync('src/private-workspace/PrivateWorkspace.tsx','utf8'),status=readFileSync('src/private-memory/ReadToolsStatus.tsx','utf8');
 assert.match(route,/memory=\{<MemoryView/);assert.match(route,/bridge=\{<ReadToolsStatus/);assert.match(workspace,/route\.page !== 'memory' && route\.page !== 'board' && coverageNote/);assert.match(workspace,/memory \?\? <MemoryPlaceholder/);assert.match(status,/mode==='DOCUMENT_WEBMCP'/);assert.match(status,/observer\.disconnect\(\)/);assert.doesNotMatch(status,/fetch\(|localStorage|sessionStorage/);
});
