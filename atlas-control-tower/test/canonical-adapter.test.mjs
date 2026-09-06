import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptCanonical} from '../lib/canonical-adapter.mjs';

test('canonical Neon projection uses curated domain membership and no UNMAPPED domain node',()=>{
  const g=adaptCanonical({
    domains:[{domain_id:'D1',code:'D1',name:'Expansion, H0 & Acoustic Geometry',kind:'PHYSICAL',status:'ACTIVE'}],
    entities:[
      {entity_id:'T-1',entity_type:'TEST',title:'Question',summary:'',status:'COMPLETE',source_surface:'Test Registry',source_row_key:'A2'},
      {entity_id:'PUB-1',entity_type:'PUBLICATION',title:'Paper',summary:'',status:'READY',source_surface:'PUBLICATIONS',source_row_key:'A2'}
    ],
    entity_display:[{entity_id:'T-1',display_label:'Readable test'}],
    entity_domains:[{entity_id:'T-1',domain_id:'D1',role:'PRIMARY',mapping_basis:'CURATED',confidence:'REVIEWED'}],
    relations:[],assets:[],entity_assets:[],migration_issues:[]
  },{observations:[],patterns:[],lessons:[],strategies:[],policies:[],links:[]},null);
  assert.ok(g.nodes.some(n=>n.id==='domain:D1'&&n.label==='Expansion, H0 & Acoustic Geometry'));
  assert.ok(g.nodes.some(n=>n.id==='test:T-1'&&n.label==='Readable test'&&n.domain==='D1'));
  assert.ok(g.nodes.some(n=>n.id==='publication:PUB-1'&&n.projectionClass==='PUBLICATION_LIFECYCLE'));
  assert.ok(!g.nodes.some(n=>n.id==='domain:UNMAPPED'));
});

test('campaign membership is rendered campaign to test and learning is staged',()=>{
  const g=adaptCanonical({
    domains:[{domain_id:'D8',name:'Microphysics',status:'ACTIVE'}],
    entities:[
      {entity_id:'C1',entity_type:'CAMPAIGN',title:'Campaign',status:'ACTIVE'},
      {entity_id:'T1',entity_type:'TEST',title:'Test',status:'PASS'}
    ],
    entity_display:[],entity_domains:[
      {entity_id:'C1',domain_id:'D8',role:'PRIMARY',confidence:'REVIEWED'},
      {entity_id:'T1',domain_id:'D8',role:'PRIMARY',confidence:'REVIEWED'}
    ],
    relations:[{relation_id:'R1',from_entity_id:'T1',to_entity_id:'C1',relation_type:'PART_OF_CAMPAIGN',status:'IMPORTED'}],
    assets:[],entity_assets:[],migration_issues:[]
  },{
    observations:[{observation_id:'O1',event_type:'RETRY',summary:'Repeated retry',outcome:'OBSERVED'}],patterns:[],lessons:[],strategies:[],policies:[],links:[]
  },null);
  assert.ok(g.edges.some(e=>e.source==='campaign:C1'&&e.target==='test:T1'&&e.type==='CONTAINS'));
  assert.ok(g.edges.some(e=>e.source==='system:LEARNING'&&e.target==='learning-stage:OBSERVATION'));
  assert.ok(g.edges.some(e=>e.source==='learning-stage:OBSERVATION'&&e.target==='learning:observation:O1'));
});
