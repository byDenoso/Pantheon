import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataApi, createNeonV1Reader, projectScienceRows, learningPayload} from '../lib/neon-v1.mjs';

test('Data API uses Vercel OIDC and schema profile', async () => {
  let seen;
  const api = createDataApi({
    env:{VERCEL_OIDC_TOKEN:'oidc', NEON_DATA_API_URL:'https://neon.example/rest/v1'},
    fetchImpl: async (url, opts) => {seen={url,opts}; return {ok:true,json:async()=>[{entity_id:'T-1'}]};}
  });
  const rows = await api.select('science_v1','entities',{select:'entity_id',limit:1});
  assert.equal(rows[0].entity_id,'T-1');
  assert.match(seen.url,/\/entities\?/);
  assert.equal(seen.opts.headers.Authorization,'Bearer oidc');
  assert.equal(seen.opts.headers['Accept-Profile'],'science_v1');
});

test('science_v1 rows project to Atlas graph without changing canonical ids', () => {
  const g = projectScienceRows({
    entities:[
      {entity_id:'C-1',entity_type:'CAMPAIGN',title:'Campaign',summary:'',status:'ACTIVE',updated_at:'2026-09-06T00:00:00Z'},
      {entity_id:'T-1',entity_type:'TEST',title:'Test',summary:'q',status:'COMPLETE_VALIDATED',updated_at:'2026-09-06T01:00:00Z'},
      {entity_id:'H-1',entity_type:'HYPOTHESIS',title:'Hypothesis',summary:'h',status:'SURVIVES',updated_at:'2026-09-06T02:00:00Z'},
      {entity_id:'R-1',entity_type:'RESULT',title:'Result',summary:'r',status:'UNKNOWN',updated_at:'2026-09-06T03:00:00Z'}
    ],
    displays:[{entity_id:'T-1',display_label:'Readable test',naming_method:'CURATED'}],
    domains:[{domain_id:'d3',code:'D3',name:'Dark energy',kind:'PHYSICAL',status:'ACTIVE'}],
    entityDomains:[
      {entity_id:'C-1',domain_id:'d3',role:'PRIMARY'},
      {entity_id:'T-1',domain_id:'d3',role:'PRIMARY'},
      {entity_id:'H-1',domain_id:'d3',role:'PRIMARY'},
      {entity_id:'R-1',domain_id:'d3',role:'PRIMARY'}
    ],
    relations:[
      {relation_id:'rel1',from_entity_id:'T-1',to_entity_id:'C-1',relation_type:'PART_OF_CAMPAIGN',status:'ACTIVE'},
      {relation_id:'rel2',from_entity_id:'H-1',to_entity_id:'T-1',relation_type:'TESTS',status:'ACTIVE'},
      {relation_id:'rel3',from_entity_id:'T-1',to_entity_id:'R-1',relation_type:'PRODUCES_RESULT',status:'ACTIVE'}
    ],
    provenance:[]
  });
  const ids = new Set(g.nodes.map(n=>n.id));
  assert(ids.has('T-1')); assert(ids.has('C-1')); assert(ids.has('H-1')); assert(ids.has('R-1'));
  assert(ids.has('system:NEXO')); assert(ids.has('system:SCIENCE')); assert(ids.has('domain:D3'));
  assert.equal(g.nodes.find(n=>n.id==='T-1').label,'Readable test');
  assert.equal(g.nodes.find(n=>n.id==='H-1').type,'CLAIM');
  assert(g.edges.some(e=>e.source==='C-1'&&e.target==='T-1'&&e.type==='CONTAINS'));
  assert(g.edges.some(e=>e.source==='H-1'&&e.target==='T-1'&&e.type==='TESTS'));
  assert(g.edges.some(e=>e.source==='T-1'&&e.target==='R-1'&&e.type==='PRODUCES'));
});

test('learning payload fills all five explicit Neon stages', () => {
  const p = learningPayload({
    observations:[{observation_id:'o1',event_type:'OBS',summary:'obs',outcome:'OBSERVED'}],
    patterns:[{pattern_id:'p1',title:'pat',description:'d',status:'VALIDATED',supporting_count:2,contradicting_count:0}],
    lessons:[{lesson_id:'l1',title:'lesson',statement:'s',status:'ACTIVE',source_pattern_id:'p1'}],
    strategies:[{strategy_id:'s1',title:'strategy',description:'s',status:'ACTIVE',source_lesson_id:'l1'}],
    policies:[{policy_id:'q1',title:'policy',statement:'p',status:'ACTIVE',source_strategy_id:'s1'}],
    links:[]
  });
  assert.equal(p.total,5);
  assert.deepEqual(p.ladder.map(x=>x.count),[1,1,1,1,1]);
});

function neonFixture() {
  const calls=[];
  const rows={
    entities:[{entity_id:'T-1',entity_type:'TEST',title:'Test',summary:'q',status:'COMPLETE_VALIDATED',updated_at:'2026-09-06T01:00:00Z'}],
    entity_display:[{entity_id:'T-1',display_label:'Readable test',is_curated:true}],
    domains:[{domain_id:'d1',code:'D1',name:'Expansion',kind:'PHYSICAL',status:'ACTIVE'}],
    entity_domains:[{entity_id:'T-1',domain_id:'d1',role:'PRIMARY'}],
    relations:[],
    provenance:[{owner_entity_id:'T-1',source_kind:'TOWER',source_id:'src',source_location:'sheet!A2',observed_at:'2026-09-06T01:00:00Z'}],
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
  for(const table of ['entities','entity_display','domains','entity_domains','relations']) assert.equal(tables.filter(x=>x===table).length,1,table);
  assert.equal(tables.includes('migration_issues'),false);
  assert.equal(tables.includes('provenance'),false);
});

test('science and learning bootstrap select only projection columns, never star payloads', async()=>{
  const {reader,calls}=neonFixture();
  await reader.graph({focus:'system:NEXO'});
  await reader.learning({});
  const selects=calls.map(u=>new URL(u).searchParams.get('select')).filter(Boolean);
  assert(selects.length>=11);
  assert.equal(selects.includes('*'),false);
});

test('entity inspection loads provenance only for the requested entity', async()=>{
  const {reader,calls}=neonFixture();
  const result=await reader.entity({id:'T-1'});
  const prov=calls.find(u=>new URL(u).pathname.endsWith('/provenance'));
  assert.ok(prov,'targeted provenance request missing');
  assert.equal(new URL(prov).searchParams.get('owner_entity_id'),'eq.T-1');
  assert.equal(result.entity.sourceRefs.length,1);
});

test('science refresh does not force a learning reload', async()=>{
  const {reader,calls}=neonFixture();
  await reader.refresh();
  const tables=calls.map(u=>new URL(u).pathname.split('/').pop());
  for(const table of ['observations','patterns','lessons','strategies','policies','links']) assert.equal(tables.includes(table),false,table);
});
