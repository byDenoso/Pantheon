import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataApi, projectScienceRows, learningPayload} from '../lib/neon-v1.mjs';

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
