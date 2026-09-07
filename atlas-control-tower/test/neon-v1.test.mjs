import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataApi, projectScienceRows, learningPayload, auditPayload} from '../lib/neon-v1.mjs';

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

/* Row shapes below are copied from the live science_v1 corpus: entities.updated_at is
   null for all but a handful of rows, imported_at is the cutover stamp shared by every
   row, and the observed date lives on the current revision. */
const migrated = {
  entities:[
    {entity_id:'T-PEER-SPT-SHOES-INTERACTION-20260902',entity_type:'TEST',title:'SPT x SH0ES',status:'COMPLETE_VALIDATED',
     current_revision_id:'REV::T-PEER-SPT-SHOES-INTERACTION-20260902::1',updated_at:null,imported_at:'2026-09-06T00:49:23.795141+00:00'},
    {entity_id:'R-1',entity_type:'RESULT',title:'Envelope',status:'PASS',
     current_revision_id:'REV::R-1::1',updated_at:null,imported_at:'2026-09-06T00:49:23.795141+00:00'},
    {entity_id:'NEXO-DARK-SECTOR',entity_type:'CAMPAIGN',title:'NEXO DARK SECTOR',status:'CHECKPOINTED',
     current_revision_id:'REV::NEXO-DARK-SECTOR::1',updated_at:null,imported_at:'2026-09-06T00:49:23.795141+00:00'}
  ],
  revisions:[
    {revision_id:'REV::T-PEER-SPT-SHOES-INTERACTION-20260902::1',entity_id:'T-PEER-SPT-SHOES-INTERACTION-20260902',observed_at:'2026-09-02T17:35:00+00:00',is_current:true},
    {revision_id:'REV::R-1::1',entity_id:'R-1',observed_at:'2026-08-15T09:00:00+00:00',is_current:true},
    {revision_id:'REV::NEXO-DARK-SECTOR::1',entity_id:'NEXO-DARK-SECTOR',observed_at:null,is_current:true}
  ]
};

test('the observed revision date is the activity date, never the cutover stamp', () => {
  const g = projectScienceRows(migrated);
  const byId = Object.fromEntries(g.nodes.map(n=>[n.id,n]));
  assert.equal(byId['T-PEER-SPT-SHOES-INTERACTION-20260902'].updatedAt,'2026-09-02T17:35:00+00:00');
  assert.equal(byId['R-1'].updatedAt,'2026-08-15T09:00:00+00:00');
  // every row shares imported_at; using it would draw one fake spike on cutover day
  for(const n of g.nodes) assert.notEqual(n.updatedAt,'2026-09-06T00:49:23.795141+00:00');
  // an entity whose revision carries no date simply has none; nothing is invented
  assert.equal(byId['NEXO-DARK-SECTOR'].updatedAt,'');
  assert.equal(byId['NEXO-DARK-SECTOR'].metadata.imported_at,'2026-09-06T00:49:23.795141+00:00');
});

test('source version is the newest observation, not the import moment', () => {
  assert.equal(projectScienceRows(migrated).sourceVersion,'2026-09-02T17:35:00+00:00');
  // with no observation anywhere it falls back to the import stamp rather than going blank
  assert.equal(projectScienceRows({entities:migrated.entities,revisions:[]}).sourceVersion,'2026-09-06T00:49:23.795141+00:00');
});

/* Real migration_issues rows: every one of the 92 is RESOLVED, so the panel must not
   read as 92 live defects. */
const issues = [
  {issue_id:'ISSUE::D1::MISSING_PARENT_AUTHORITY',issue_type:'MISSING_PARENT',severity:'BLOCKER',status:'RESOLVED',
   source_key:"'Domain Registry'!D3",proposed_resolution:'Resolved by canonical registration in Tower row 1963.'},
  {issue_id:'ISSUE::PRIMARY_TEST::dc63',issue_type:'BROKEN_REFERENCE',severity:'WARN',status:'RESOLVED',
   source_key:"'Hypothesis Registry'!A1415:M1415",entity_id:'H2_PEER_DMDE',proposed_resolution:'Two explicit relations; not a malformed id.'},
  {issue_id:'ISSUE::RESULT::a1',issue_type:'UNRESOLVED_RESULT_OWNER',severity:'WARN',status:'RESOLVED',
   source_key:"'Result Envelopes'!A9",proposed_resolution:'TYPED_RESULT_SUBJECT=TEST_SET; no synthetic entity created'},
  {issue_id:'ISSUE::RESULT::a2',issue_type:'UNRESOLVED_RESULT_OWNER',severity:'WARN',status:'OPEN',
   source_key:"'Result Envelopes'!A10",proposed_resolution:''},
  {issue_id:'ISSUE::SRC::drift',issue_type:'SOURCE_DRIFT',severity:'WARN',status:'RESOLVED',
   source_key:'41 pseudo ids',proposed_resolution:'Excluded from the semantic graph; preserved in provenance.'}
];

test('migration issues map onto the declared taxonomy and separate open from resolved', () => {
  const a = auditPayload(issues);
  const at = id => a.categories.find(c=>c.id===id);
  assert.equal(a.total,5);
  assert.equal(a.open,1);
  assert.equal(a.resolved,4);
  // UNRESOLVED_RESULT_OWNER is the V1 name for the declared RESULT_SUBJECT category
  assert.ok(at('RESULT_SUBJECT'),'UNRESOLVED_RESULT_OWNER must map to RESULT_SUBJECT');
  assert.equal(at('RESULT_SUBJECT').count,2);
  assert.equal(at('RESULT_SUBJECT').openCount,1);
  // MISSING_PARENT is a broken reference; both are resolved, so the category raises no alarm
  assert.equal(at('BROKEN_REFERENCE').count,2);
  assert.equal(at('BROKEN_REFERENCE').openCount,0);
  assert.equal(at('BROKEN_REFERENCE').severity,'INFO');
  // the one category with an open item keeps that item's severity
  assert.equal(at('RESULT_SUBJECT').severity,'WARN');
  // a category the declared taxonomy does not know is kept, not dropped
  assert.ok(at('SOURCE_DRIFT'));
  // detail stays empty so the declared human explanation survives normalizeAudit
  assert.equal(at('BROKEN_REFERENCE').detail,'');
  // still-open items are listed first
  assert.equal(at('RESULT_SUBJECT').items[0].status,'OPEN');
  assert.equal(at('RESULT_SUBJECT').items[0].open,true);
});
