import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compilePrivateTowerViews} from '../server/atlas/private-tower-views.mjs';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';

// Synthetic only: no private Tower fetch, credentials, or publication writes.
const REVISION='sha256:'+'1'.repeat(64);
const AT='2026-01-01T12:30:00.000Z';
const SOURCE='https://example.invalid/tower/private.json';
function fixture(){
  return {
    revision:REVISION,generatedAt:AT,sourceRef:SOURCE,
    system:{bus:{fingerprint:REVISION},graph:{edges:[{id:'edge-private',from:'action:WORK::PRIVATE',to:'test:TEST::PRIVATE',kind:'DEPENDS_ON'}]},inbox:[]},
    records:{
      work:[{id:'WORK::PRIVATE',domain:'Private Health / Raw',title:'Synthetic sensitive work',status:'WAIT_DEPENDENCY',dependency_class:'HUMAN_AUTH_REQUIRED',priority:'CRITICAL',campaign_id:'CAMPAIGN::PRIVATE',_source_path:'TOWER_V06/work/private.json'}],
      tests:[{id:'TEST::PRIVATE',domain:'Cosmologia',status:'CHECKPOINTED',attempt_state:'RUNNING',scientific_state:'INCONCLUSIVE',review_state:'PENDING',hypothesis_id:'HYP::PRIVATE',campaign_id:'CAMPAIGN::PRIVATE',_source_path:'TOWER_V06/tests/private.json'}],
      hypotheses:[{id:'HYP::PRIVATE',domain:'Cosmologia',statement:'Synthetic private hypothesis',_source_path:'TOWER_V06/hypotheses/private.json'}],
      campaigns:[{id:'CAMPAIGN::PRIVATE',domain:'Cosmologia',title:'Synthetic private campaign',_source_path:'TOWER_V06/campaigns/private.json'}],
      roadmaps:[{roadmap_id:'ROADMAP::PRIVATE',domain:'OLYMPUS',test_ids:['TEST::PRIVATE'],_source_path:'TOWER_V06/roadmaps/private.json'}],
      lessons:[{id:'LESSON::PRIVATE',domain:'Private Health / Raw',title:'Synthetic private lesson',_source_path:'TOWER_V06/lessons/private.json'}],
      artifacts:[{id:'ARTIFACT::PRIVATE',domain:'Private Health / Raw',_source_path:'TOWER_V06/artifacts/private.json'}],
      interdomain:[{id:'LINK::PRIVATE',source_domains:['Cosmologia'],target_domains:['Private Health / Raw'],relation_type:'METHOD_TRANSFER',_source_path:'TOWER_V06/interdomain/private.json'}],
      capabilities:{
        'private.a/b':{domain:'ENGINEERING',backend:'Synthetic Backend / Exact',roles:['Private Role'],status:'DECLARED_PRIVATE',scope:'Synthetic private capability',_source_path:'TOWER_V06/manifests/capabilities.json'},
        'private.a?b':{status:'UNVERIFIED',_source_path:'TOWER_V06/manifests/capabilities.json'},
      },
      events:[{id:'EVENT::PRIVATE',event_type:'SYNTHETIC_CHECKPOINT'}],evolution:{},
      texts:{
        'services/nexo-api/app/mcp_server.py':'tools = [Tool(name="nexo_private_read", description="Synthetic"), Tool(name="nexo_private_shared")]\nignored = "nexo_not_registered"',
        'services/nexo-api/app/remote_mcp.py':'@mcp.tool(name="nexo_private_shared")\nasync def synthetic_shared():\n    pass\n@mcp.tool()\ndef synthetic_private_remote():\n    pass',
      },
      coverage:{capabilities:{status:'PRESENT',count:2,paths:['TOWER_V06/manifests/capabilities.json']}},
    },
  };
}
const compile=overrides=>compilePrivateTowerViews({...fixture(),...overrides});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};

test('private topology and galaxy are bound to one canonical fingerprint and updated_at',()=>{
  const {topology,galaxy}=compile();
  for(const view of [topology,galaxy]){
    assert.equal(view.access,'PRIVATE');assert.equal(view.generated_at,AT);assert.equal(view.tower_revision,REVISION);
    assert.equal(view.provenance.source_contract,'NEXO_ATLAS_PRIVATE_RUNTIME_V1');
    assert.equal(view.provenance.source_fingerprint,REVISION);assert.equal(view.provenance.source_ref,SOURCE);
    assert.match(view.fingerprint,/^sha256:[a-f0-9]{64}$/);
  }
  assert.equal(topology.contract,'NEXO_MCP_TOPOLOGY_V1');assert.equal(galaxy.contract,'NEXO_ONE_GALAXY_V1');
  assert.equal(topology.source.projection_fingerprint,REVISION);assert.equal(topology.source.source_state_fingerprint,REVISION);
});

test('private identities and domains survive without alias mapping or public sanitization',()=>{
  const {galaxy,topology}=compile();
  assert.equal(galaxy.entities.length,9);
  const scientific=galaxy.entities.find(row=>row.canonical_id==='TEST::PRIVATE');
  assert.equal(scientific.domain,'Cosmologia');assert.equal(scientific.visual_domain,'Cosmologia');
  assert.equal(scientific.source.source_domain,'Cosmologia');assert.equal(scientific.source.path,'TOWER_V06/tests/private.json');
  assert.equal(scientific.hypothesis_id,'HYP::PRIVATE');assert.equal(scientific.observation.access,'PRIVATE');
  assert.ok(galaxy.domains.some(row=>row.domain==='Private Health / Raw'));
  for(const id of ['private.a/b','private.a?b'])assert.ok(topology.nodes.some(row=>row.id==='cap:'+id));
  assert.equal(galaxy.stats.by_kind.LESSON,1);assert.equal(galaxy.stats.by_kind.ROADMAP,1);assert.equal(galaxy.stats.by_kind.ARTIFACT,1);
});

test('topology derives actual declarations and never invents unknown backends or live transport availability',()=>{
  const {topology}=compile();
  assert.equal(topology.stats.capabilities,2);assert.equal(topology.stats.backends,1);assert.equal(topology.stats.roles,1);
  assert.equal(topology.stats.tools,3);assert.equal(topology.stats.internal_tools,2);assert.equal(topology.stats.remote_tools,2);
  assert.equal(topology.stats.capabilities_without_backend,1);
  assert.equal(topology.nodes.some(row=>row.id==='backend:unknown'),false);
  assert.equal(topology.nodes.some(row=>row.id==='tool:nexo_not_registered'),false);
  const shared=topology.nodes.find(row=>row.id==='tool:nexo_private_shared');
  assert.equal(shared.meta.remote,true);assert.equal(shared.meta.internal,true);
  assert.equal(shared.meta.availability,'UNKNOWN');
  assert.equal(topology.nodes.some(row=>row.status==='LIVE'),false);
});

test('missing manifest and transport sources are explicit, with unknown rather than invented zero counts',()=>{
  const input=fixture();input.records.capabilities={};input.records.texts={};
  input.records.coverage.capabilities={status:'NOT_PRESENT',count:0,paths:[]};
  const {topology}=compilePrivateTowerViews(input);
  assert.equal(topology.source.source_status.capabilities,'MISSING_SOURCE');
  assert.equal(topology.source.source_status.mcp_server,'MISSING_SOURCE');
  assert.equal(topology.source.source_status.remote_mcp,'MISSING_SOURCE');
  for(const key of ['tools','internal_tools','remote_tools','capabilities','backends','roles','families'])assert.equal(topology.stats[key],null,key);
  assert.equal(topology.nodes.find(row=>row.id==='layer:capabilities').status,'MISSING_SOURCE');
  assert.equal(topology.nodes.find(row=>row.id==='transport:remote').status,'MISSING_SOURCE');
  assert.deepEqual(topology.nodes.filter(row=>row.kind==='TOOL'||row.kind==='CAPABILITY'),[]);
});

test('a present but empty source is distinct from a missing source',()=>{
  const input=fixture();input.records.capabilities={};input.records.coverage.capabilities.count=0;
  input.records.texts={'mcp_server.py':'# Synthetic empty registry','remote_mcp.py':'# Synthetic empty registry'};
  const {topology}=compilePrivateTowerViews(input);
  for(const key of ['tools','internal_tools','remote_tools','capabilities','backends','roles','families'])assert.equal(topology.stats[key],0,key);
  assert.equal(topology.source.source_status.capabilities,'SOURCE_PRESENT');
  assert.equal(topology.nodes.find(row=>row.id==='layer:capabilities').status,'NO_DECLARATIONS');
});

test('carried tool manifest and explicit capability references retain names without guessing transport',()=>{
  const input=fixture();input.records.texts={'TOWER_V06/manifests/tools.json':JSON.stringify({tools:[{name:'custom.private.tool',transport:'remote'},'opaque private tool']})};
  input.records.capabilities['private.a/b'].tools=['capability.referenced.tool'];
  const {topology}=compilePrivateTowerViews(input);
  assert.equal(topology.stats.tools,3);assert.equal(topology.stats.remote_tools,1);assert.equal(topology.stats.internal_tools,null);
  assert.equal(topology.stats.unassigned_tools,2);
  assert.equal(topology.nodes.find(row=>row.id==='tool:opaque private tool').meta.availability,'UNKNOWN');
});

test('geometry is finite, counts are real, and every relation endpoint exists',()=>{
  const {galaxy,topology}=compile();
  for(const collection of [galaxy.entities,galaxy.subdomains,galaxy.domains])for(const row of collection)for(const axis of ['x','y','z'])assert.ok(Number.isFinite(row.layout[axis]),row.id+' '+axis);
  for(const event of galaxy.events)for(const axis of ['x','y','z'])assert.ok(Number.isFinite(event[axis]));
  for(const key of ['entities','subdomains','domains','relations','needs_you','events','changes'])assert.equal(galaxy.stats[key],galaxy[key].length,key);
  assert.equal(galaxy.stats.source_events,1);
  assert.equal(Object.values(galaxy.stats.by_kind).reduce((a,b)=>a+b,0),galaxy.entities.length);
  assert.equal(Object.values(galaxy.stats.by_visual_domain).reduce((a,b)=>a+b,0),galaxy.entities.length);
  const ids=new Set([...galaxy.entities,...galaxy.subdomains,...galaxy.domains].map(row=>row.id));
  assert.equal(ids.size,galaxy.entities.length+galaxy.subdomains.length+galaxy.domains.length);
  for(const row of galaxy.relations){assert.ok(ids.has(row.from),row.from);assert.ok(ids.has(row.to),row.to);}
  const topologyIds=new Set(topology.nodes.map(row=>row.id));
  assert.equal(new Set(topology.links.map(row=>row.id)).size,topology.links.length);
  for(const row of topology.links){assert.ok(topologyIds.has(row.source));assert.ok(topologyIds.has(row.target));}
});

test('explicit private relationships retain canonical domains and provenance',()=>{
  const {galaxy}=compile();
  const graphEdge=galaxy.relations.find(row=>row.id==='edge-private');
  assert.equal(graphEdge.from,'work:WORK::PRIVATE');assert.equal(graphEdge.to,'test:TEST::PRIVATE');
  const cross=galaxy.relations.find(row=>row.kind==='METHOD_TRANSFER');
  assert.equal(cross.from,'domain:Cosmologia');assert.equal(cross.to,'domain:Private Health / Raw');
  assert.equal(cross.source.canonical_id,'LINK::PRIVATE');assert.equal(cross.derived,false);
  assert.equal(galaxy.relations.some(row=>row.from==='roadmap:ROADMAP::PRIVATE'&&row.to==='test:TEST::PRIVATE'),true);
  assert.equal(galaxy.morphology.bridges.some(row=>row.from==='Cosmologia'&&row.to==='Private Health / Raw'),true);
});

test('unassigned entities remain unassigned while their presentation uses NEXO',()=>{
  const {galaxy}=compile();const entity=galaxy.entities.find(row=>row.canonical_id==='private.a?b');
  assert.equal(entity.domain,null);assert.equal(entity.source.source_domain,null);assert.equal(entity.visual_domain,'NEXO');
  assert.equal(entity.source.derivation,'unassigned_layout');
});

test('human attention and running phenomena require explicit source evidence',()=>{
  const input=fixture();input.records.work.push({id:'QUEUED',domain:'OLYMPUS',status:'QUEUED'},{id:'BLOCKED',domain:'OLYMPUS',status:'BLOCKED'});
  input.records.tests.push({id:'TASK_RUNNING_ONLY',domain:'OLYMPUS',status:'RUNNING'});
  const {galaxy}=compilePrivateTowerViews(input);
  assert.deepEqual(galaxy.needs_you.map(row=>row.entity),['work:WORK::PRIVATE']);
  assert.ok(galaxy.events.some(row=>row.kind==='SUPERNOVA'&&row.entity==='work:WORK::PRIVATE'));
  assert.ok(galaxy.events.some(row=>row.id==='agn:Cosmologia'));
  assert.equal(galaxy.events.some(row=>row.id==='agn:OLYMPUS'),false);
  assert.deepEqual(galaxy.changes,[]);
});

test('resolved or disabled human gates do not reappear as private attention',()=>{
  const input=fixture();input.records.work=[
    {id:'DONE',status:'DONE',decision_required:true},
    {id:'RESOLVED',human_gate:{state:'RESOLVED',required:true}},
    {id:'EMPTY',human_gate:{}},
    {id:'DISABLED',human_gate:false,dependency_class:'HUMAN_AUTH_REQUIRED'},
    {id:'SATISFIED',dependencies:[{dependency_class:'HUMAN_AUTH_REQUIRED',status:'SATISFIED'}]},
    {id:'PENDING',dependencies:[{dependency_class:'HUMAN_INPUT_REQUIRED',status:'PENDING'}]},
  ];
  const {galaxy}=compilePrivateTowerViews(input);
  assert.deepEqual(galaxy.needs_you.map(row=>row.entity),['work:PENDING']);
});

test('explicit evolution gates keep private identities without guessed science domains',()=>{
  const input=fixture();input.records.evolution={gate:{charters_waiting:[{roadmap_id:'ROADMAP::PRIVATE',question:'Synthetic charter?'}],canaries_waiting:[{gene:'PRIVATE::GENE',question:'Synthetic canary?'}]}};
  const {galaxy}=compilePrivateTowerViews(input);
  const charter=galaxy.needs_you.find(row=>row.canonical_id==='ROADMAP::PRIVATE');
  assert.equal(charter.entity,'roadmap:ROADMAP::PRIVATE');
  assert.equal(galaxy.entities.find(row=>row.id===charter.entity).observation.decision_required,true);
  const canary=galaxy.needs_you.find(row=>row.canonical_id==='PRIVATE::GENE');
  assert.equal(canary.entity,null);assert.equal(canary.domain,null);
  const event=galaxy.events.find(row=>row.id==='supernova:'+canary.id);
  assert.equal(event.domain,'NEXO');assert.equal(event.entity,null);assert.equal(event.kind,'SUPERNOVA');
});

test('canonical collection identity and explicit semantic domain agree with private SystemState',()=>{
  const input=fixture();input.records.tests=[{id:'file-key',test_id:'TEST::CANONICAL',semantic:{domain_id:'private.semantic.domain'}}];
  const {galaxy}=compilePrivateTowerViews(input);const entity=galaxy.entities.find(row=>row.kind==='TEST');
  assert.equal(entity.canonical_id,'TEST::CANONICAL');assert.equal(entity.domain,'private.semantic.domain');assert.equal(entity.visual_domain,'private.semantic.domain');
});

test('private compilation is deterministic, order-independent, and does not mutate input',()=>{
  const input=deepFreeze(fixture());const first=compilePrivateTowerViews(input);assert.deepEqual(compilePrivateTowerViews(input),first);
  const reordered=structuredClone(input);
  for(const value of Object.values(reordered.records))if(Array.isArray(value))value.reverse();
  reordered.records.capabilities=Object.fromEntries(Object.entries(reordered.records.capabilities).reverse());
  reordered.records.texts=Object.fromEntries(Object.entries(reordered.records.texts).reverse());
  assert.deepEqual(compilePrivateTowerViews(reordered),first);
});

test('empty private Tower produces no fabricated entities or relationships',()=>{
  const {galaxy}=compile({records:{capabilities:{},work:[],tests:[],hypotheses:[],campaigns:[],roadmaps:[],lessons:[],artifacts:[],texts:{}}});
  assert.deepEqual(galaxy.entities,[]);assert.deepEqual(galaxy.relations,[]);assert.deepEqual(galaxy.needs_you,[]);
  assert.equal(galaxy.stats.entities,0);assert.equal(galaxy.domains.length,1);assert.equal(galaxy.domains[0].canonical,false);
});

test('missing record ID can retain its full canonical source path without a fabricated identity',()=>{
  const input=fixture();input.records.lessons=[{title:'Synthetic path-only lesson',_source_path:'TOWER_V06/lessons/exact source.json'}];
  const entity=compilePrivateTowerViews(input).galaxy.entities.find(row=>row.kind==='LESSON');
  assert.equal(entity.canonical_id,'TOWER_V06/lessons/exact source.json');
});

test('private compiler rejects invalid or split-generation inputs and duplicate identities',()=>{
  for(const overrides of [{revision:'not-a-canonical-fingerprint'},{generatedAt:null},{records:{capabilities:null}},{system:{bus:{fingerprint:'sha256:'+'2'.repeat(64)}}}])assert.throws(()=>compile(overrides),error=>error.code==='PRIVATE_TOWER_VIEWS_INVALID');
  const duplicate=fixture();duplicate.records.tests.push({...duplicate.records.tests[0]});
  assert.throws(()=>compilePrivateTowerViews(duplicate),/Duplicate entity id/);
  const missing=fixture();missing.records.lessons=[{title:'No canonical identity'}];assert.throws(()=>compilePrivateTowerViews(missing),/Missing identity/);
});

test('public compiler still rejects private contracts and private path has no public compiler import',async()=>{
  assert.throws(()=>compileGalaxySnapshot({projection:{contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1'}}),/NEXO_PUBLIC_PROJECTION_V1/);
  const source=await readFile(new URL('../server/atlas/private-tower-views.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/import[^\n]*(?:build-mcp-topology|galaxy-v1|public-system-input|public-projection|node:fs)/);
  assert.doesNotMatch(source,/NEXO_PUBLIC_PROJECTION_V1|PUBLIC_PROJECTION|Math\.random|new Date\(/);
});
