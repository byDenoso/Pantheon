import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRetrievalTransport,createRetrievalSyncTransport,parseRetrievalResult,parseIndexProgress,createRetrievalLifetime,refreshRetrievalIndex} from '../src/private-memory/retrieval.ts';

export const fixture=()=>({query:'Which dataset and prior?',role:'LEARNER',mode:'lexical',route:{mode:'lexical',reason:'measured_lexical_default; hybrid_remains_opt_in'},snapshot:{source_id:'fixed-source',revision:'rev-a',observed_at:'2026-10-06T00:00:00Z'},authorization_revision:'rev-a',method:'nexo-retrieval-1.3.0',answer_status:'EVIDENCE_FOUND',hits:[{id:'TEST::T-1',title:'Dataset ≠ prior',kind:'TEST',state:'PROVISIONAL',excerpt:'Dataset: D-1\nPrior: P-1\n<script>sendPrivateData()</script>\nResult: unchanged ± 0.1',chunk_context:{dataset:'D-1',prior:'P-1'},segments:[{json_pointer:'/record/result',text_start:0,text_end:100}],authority:'evidence_only',graph_path:null,citation:{canonical_id:'TEST::T-1',object_id:'T-1',source_id:'fixed-source',tower_revision:'rev-a',path:'entities/test/T-1.json',json_pointer:'/record',entity_version:'v3',content_sha256:'a'.repeat(64)}}]});

test('retrieval transport pins native same-origin endpoint and rejects URL, role, source and unknown options',async()=>{
 const calls=[];const read=createRetrievalTransport(async(url,init)=>{calls.push({url,init});return Response.json(fixture());});
 const controller=new AbortController();await read({query:'What do we know about T-1?',mode:'auto',k:8},controller.signal);
 assert.equal(calls[0].url,'/api/atlas-retrieval/search');assert.equal(calls[0].init.signal,controller.signal);
 assert.deepEqual(JSON.parse(calls[0].init.body),{query:'What do we know about T-1?',mode:'auto',k:8});
 for(const [key,value]of Object.entries({method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'}))assert.equal(calls[0].init[key],value);
 assert.deepEqual(calls[0].init.headers,{'Content-Type':'application/json'});
 for(const patch of [{url:'https://foreign.invalid'},{role:'ENGINEER'},{source:'other'},{headers:{}},{as_of:'2026-01-01'},{mode:'graph'},{mode:'https://foreign.invalid'},{k:51},{k:0},{query:''},{query:'x'.repeat(4001)}])await assert.rejects(()=>read({query:'test',mode:'auto',k:8,...patch}),/RETRIEVAL_REQUEST_INVALID/);
 assert.equal(calls.length,1);controller.abort();await assert.rejects(()=>read({query:'test',mode:'auto',k:8},controller.signal),e=>e.name==='AbortError');assert.equal(calls.length,1);
});
test('search preserves explicit server states and ignores aborted JSON completion',async()=>{
 for(const [status,code]of [[401,'AUTHORIZATION_REQUIRED'],[409,'IMPORTED_GENERATION_STALE'],[400,'HISTORICAL_QUERY_UNSUPPORTED'],[503,'AUTHORIZED_INDEX_UNAVAILABLE']]){
  const read=createRetrievalTransport(async()=>Response.json({error:code,available:false},{status}));await assert.rejects(()=>read({query:'test',mode:'auto',k:8}),e=>e.status===status&&e.message===code);
 }
 const controller=new AbortController();let finish;const read=createRetrievalTransport(async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})}));
 const pending=read({query:'test',mode:'auto',k:8},controller.signal);await Promise.resolve();controller.abort();finish(fixture());await assert.rejects(()=>pending,e=>e.name==='AbortError');
});
test('response validation preserves exact scientific text and refuses role, authority or citation mismatch',()=>{
 const value=fixture();assert.equal(parseRetrievalResult(value),value);
 for(const mutate of [v=>v.role='ENGINEER',v=>v.authorization_revision='rev-old',v=>v.hits[0].authority='scientific_answer',v=>v.hits[0].citation.tower_revision='rev-old',v=>v.hits[0].citation.source_id='other',v=>v.hits[0].citation.canonical_id='other',v=>v.answer_status='NO_EVIDENCE_IN_AUTHORIZED_INDEX',v=>v.hits.push(v.hits[0]),v=>v.hits[0].excerpt={}]){const broken=fixture();mutate(broken);assert.throws(()=>parseRetrievalResult(broken),/RETRIEVAL_RESPONSE_INVALID/);}
 const empty={...value,hits:[],answer_status:'NO_EVIDENCE_IN_AUTHORIZED_INDEX'};assert.equal(parseRetrievalResult(empty),empty);
});
test('refresh exposes only fixed start/resume bodies, never a service grant or arbitrary route',async()=>{
 const calls=[];const sync=createRetrievalSyncTransport(async(url,init)=>{calls.push({url,init});return Response.json({done:true});});
 await sync();await sync('opaque-server-cursor');assert.ok(calls.every(c=>c.url==='/api/atlas-retrieval/sync'));
 assert.deepEqual(calls.map(c=>JSON.parse(c.init.body)),[{}, {cursor:'opaque-server-cursor'}]);
 for(const {init}of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.method,'POST');}
 for(const cursor of [null,{},'',1])await assert.rejects(()=>sync(cursor),/RETRIEVAL_SYNC_CURSOR_INVALID/);
 for(const value of [{}, {done:false},{done:false,cursor:''},{done:true,staged_shards:-1}])assert.throws(()=>parseIndexProgress(value));
});
test('refresh follows verified cursors to done, stops on cancellation and rejects stuck cursor',async()=>{
 const life=createRetrievalLifetime(),op=life.start(),calls=[],progress=[];
 assert.equal(await refreshRetrievalIndex(async cursor=>{calls.push(cursor);return cursor?{done:true,documents:4}:{done:false,cursor:'next',staged_shards:3};},op,v=>progress.push(v)),true);
 assert.deepEqual(calls,[undefined,'next']);assert.equal(progress.at(-1).documents,4);
 let finish;const canceled=life.start(),stale=[];const pending=refreshRetrievalIndex(()=>new Promise(resolve=>finish=resolve),canceled,v=>stale.push(v));life.cancel();finish({done:false,cursor:'late'});
 assert.equal(await pending,false);assert.deepEqual(stale,[]);assert.equal(canceled.signal.aborted,true);
 await assert.rejects(()=>refreshRetrievalIndex(async()=>({done:false,cursor:'same'}),life.start(),()=>{}),/RETRIEVAL_RESPONSE_INVALID/);
});
test('cancel, newer requests and closed session invalidate late results without storage',()=>{
 const life=createRetrievalLifetime(),first=life.start(),second=life.start();assert.equal(first.signal.aborted,true);assert.equal(first.current(),false);assert.equal(second.current(),true);
 life.close();assert.equal(second.signal.aborted,true);assert.equal(second.current(),false);assert.throws(()=>life.start(),/AUTH_REQUIRED/);
 for(const path of ['src/private-memory/retrieval.ts','src/private-memory/RetrievalPanel.tsx','src/private-memory/MemoryView.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/localStorage|sessionStorage|dangerouslySetInnerHTML/);
});
test('memory defaults to search, lazy browser stays opt-in, native search exception precedes legacy guards',()=>{
 const view=readFileSync('src/private-memory/MemoryView.tsx','utf8'),panel=readFileSync('src/private-memory/RetrievalPanel.tsx','utf8'),install=readFileSync('src/private-legacy/install.ts','utf8');
 assert.match(view,/useState<'search'\|'browse'>\('search'\)/);assert.match(view,/lazy\(\(\) => import\('\.\/MemoryBrowseView.tsx'\)\)/);assert.match(view,/view==='search' \?/);
 assert.ok(install.indexOf('createRetrievalTransport(nativeFetch)')<install.indexOf('installGuards(window'));
 assert.doesNotMatch(install,/export const nativeFetch/);assert.match(panel,/trusted\(event,window.location.origin,window.parent\)/);assert.match(panel,/type === 'TEARDOWN'/);assert.match(panel,/window.addEventListener\('pagehide',close\)/);
 assert.match(panel,/if \(!operation.current\(\)\) return/);assert.match(panel,/lastRequest.current=null/);
});
