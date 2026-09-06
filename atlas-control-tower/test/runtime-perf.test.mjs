import test from 'node:test';
import assert from 'node:assert/strict';
import {createNeonV1Reader} from '../lib/neon-v1.mjs';

function neonFixture() {
  const calls=[];
  const rows={
    entities:[{entity_id:'T-1',entity_type:'TEST',title:'Test',summary:'q',status:'COMPLETE_VALIDATED',current_revision_id:'REV::T-1::1',updated_at:null,imported_at:'2026-09-06T00:49:23Z'}],
    entity_display:[{entity_id:'T-1',display_label:'Readable test',is_curated:true}],
    domains:[{domain_id:'d1',code:'D1',name:'Expansion',kind:'PHYSICAL',status:'ACTIVE'}],
    entity_domains:[{entity_id:'T-1',domain_id:'d1',role:'PRIMARY'}],
    relations:[],
    revisions:[{revision_id:'REV::T-1::1',entity_id:'T-1',observed_at:'2026-09-05T10:00:00Z',is_current:true}],
    provenance:[{owner_entity_id:'T-1',source_kind:'TOWER',source_id:'src',source_location:'sheet!A2',observed_at:'2026-09-05T10:00:00Z'}],
    migration_issues:[], observations:[],patterns:[],lessons:[],strategies:[],policies:[],links:[]
  };
  const fetchImpl=async url=>{
    calls.push(url);
    await new Promise(r=>setTimeout(r,2));
    const table=new URL(url).pathname.split('/').pop();
    return {ok:true,json:async()=>rows[table]||[]};
  };
  const reader=createNeonV1Reader({env:{VERCEL_OIDC_TOKEN:'oidc',NEON_DATA_API_URL:'https://neon.example/rest/v1'},fetchImpl,ttlMs:60000});
  return {reader,calls};
}

test('concurrent graph and state share one cold science load and skip audit/provenance bulk reads', async()=>{
  const {reader,calls}=neonFixture();
  await Promise.all([reader.graph({focus:'system:NEXO'}),reader.state({})]);
  const tables=calls.map(u=>new URL(u).pathname.split('/').pop());
  for(const table of ['entities','entity_display','domains','entity_domains','relations','revisions']) assert.equal(tables.filter(x=>x===table).length,1,table);
  assert.equal(tables.includes('migration_issues'),false);
  assert.equal(tables.includes('provenance'),false);
});

test('science and learning bootstrap select only projection columns, never star payloads', async()=>{
  const {reader,calls}=neonFixture();
  await reader.graph({focus:'system:NEXO'});
  await reader.learning({});
  const selects=calls.map(u=>new URL(u).searchParams.get('select')).filter(Boolean);
  assert(selects.length>=12);
  assert.equal(selects.includes('*'),false);
});

test('entity inspection loads provenance only for requested entity', async()=>{
  const {reader,calls}=neonFixture();
  const result=await reader.entity({id:'T-1'});
  const prov=calls.find(u=>new URL(u).pathname.endsWith('/provenance'));
  assert.ok(prov,'targeted provenance request missing');
  assert.equal(new URL(prov).searchParams.get('owner_entity_id'),'eq.T-1');
  assert.equal(result.entity.sourceRefs.length,1);
});

test('audit loads migration issues only when audit is requested', async()=>{
  const {reader,calls}=neonFixture();
  await reader.graph({focus:'system:NEXO'});
  assert.equal(calls.some(u=>new URL(u).pathname.endsWith('/migration_issues')),false);
  await reader.audit();
  assert.equal(calls.filter(u=>new URL(u).pathname.endsWith('/migration_issues')).length,1);
});

test('science refresh does not force a learning reload', async()=>{
  const {reader,calls}=neonFixture();
  await reader.refresh();
  const tables=calls.map(u=>new URL(u).pathname.split('/').pop());
  for(const table of ['observations','patterns','lessons','strategies','policies','links']) assert.equal(tables.includes(table),false,table);
});