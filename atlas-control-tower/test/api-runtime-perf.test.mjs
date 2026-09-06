import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/atlas.js';

const rows={
 entities:[{entity_id:'T-1',entity_type:'TEST',title:'Test',summary:'q',status:'COMPLETE_VALIDATED',current_revision_id:'REV::T-1::1',updated_at:null,imported_at:'2026-09-06T00:49:23Z'}],
 entity_display:[{entity_id:'T-1',display_label:'Readable test',is_curated:true}],
 domains:[{domain_id:'d1',code:'D1',name:'Expansion',kind:'PHYSICAL',status:'ACTIVE'}],
 entity_domains:[{entity_id:'T-1',domain_id:'d1',role:'PRIMARY'}],relations:[],
 revisions:[{revision_id:'REV::T-1::1',entity_id:'T-1',observed_at:'2026-09-05T10:00:00Z',is_current:true}],
 provenance:[],migration_issues:[],observations:[],patterns:[],lessons:[],strategies:[],policies:[],links:[]
};
function fakeReq(path,method='GET'){return{url:path,method,headers:{'x-vercel-oidc-token':'oidc','host':'atlas.example'}}}
function fakeRes(){const headers={};return{headers,statusCode:0,body:'',setHeader(k,v){headers[k.toLowerCase()]=v},end(v=''){this.body=v}}}
function withFetch(fn){const old=global.fetch,calls=[];global.fetch=async url=>{calls.push(String(url));const table=new URL(url).pathname.split('/').pop();return{ok:true,text:async()=>'',json:async()=>rows[table]||[]}};return Promise.resolve().then(()=>fn(calls)).finally(()=>{global.fetch=old})}

test('graph carries summary so a recorte needs no separate state request',()=>withFetch(async()=>{
 const res=fakeRes();await handler(fakeReq('/api/atlas.js?route=graph&focus=system:NEXO&refresh=1'),res);assert.equal(res.statusCode,200);const body=JSON.parse(res.body);assert.ok(body.summary);assert.ok(body.summary.counts);assert.equal(body.summary.projection.source,'v1');
}));

test('cold graph skips bulk provenance and migration issues and avoids SELECT star',()=>withFetch(async calls=>{
 const res=fakeRes();await handler(fakeReq('/api/atlas.js?route=graph&focus=system:NEXO&refresh=1'),res);const urls=calls.map(x=>new URL(x));const tables=urls.map(x=>x.pathname.split('/').pop());assert.equal(tables.includes('provenance'),false);assert.equal(tables.includes('migration_issues'),false);assert.equal(urls.some(x=>x.searchParams.get('select')==='*'),false);
}));

test('idempotent graph is CDN-cacheable while health and sync remain no-store',()=>withFetch(async()=>{
 let res=fakeRes();await handler(fakeReq('/api/atlas.js?route=graph&focus=system:NEXO'),res);assert.match(String(res.headers['cache-control']),/s-maxage=30/);
 res=fakeRes();await handler(fakeReq('/api/atlas.js?route=health'),res);assert.match(String(res.headers['cache-control']),/no-store/);
 res=fakeRes();await handler(fakeReq('/api/atlas.js?route=sync','POST'),res);assert.match(String(res.headers['cache-control']),/no-store/);
}));

test('entity route fetches provenance only for requested entity',()=>withFetch(async calls=>{
 const res=fakeRes();await handler(fakeReq('/api/atlas.js?route=entity&id=T-1'),res);const u=calls.map(x=>new URL(x)).find(x=>x.pathname.endsWith('/provenance'));assert.ok(u);assert.equal(u.searchParams.get('owner_entity_id'),'eq.T-1');
}));

test('sync refreshes science without forcing learning tables',()=>withFetch(async calls=>{
 const res=fakeRes();await handler(fakeReq('/api/atlas.js?route=sync','POST'),res);const tables=calls.map(x=>new URL(x).pathname.split('/').pop());for(const t of ['observations','patterns','lessons','strategies','policies','links'])assert.equal(tables.includes(t),false,t);
}));