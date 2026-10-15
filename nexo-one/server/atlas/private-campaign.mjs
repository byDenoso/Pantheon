import {validatePrivateRuntime} from './private-runtime.mjs';
import {sha256,requireValue,object,atlasCampaignAllowed} from './campaign-records.mjs';

const arrays = keys => Object.fromEntries(keys.map(key=>[key,[]]));
const rawState = e => typeof e.data.status === 'string' ? e.data.status : typeof e.data.state === 'string' ? e.data.state : 'UNKNOWN';
const label = e => [e.data.title,e.data.question,e.data.statement,e.entity_id].find(v=>typeof v==='string'&&v.trim());
const sourceRef = row => `gdrive-file://${row.sources[0].file_id}@${row.sources[0].version}`;
const unavailable = (reason,ref) => ({state:'UNAVAILABLE',reason,source_ref:ref});
function layout(id) {
  const hash=sha256(id);
  return {x:parseInt(hash.slice(0,4),16)/65535*2-1,y:parseInt(hash.slice(4,8),16)/65535*2-1,z:parseInt(hash.slice(8,12),16)/65535*2-1};
}

/** Private selected-campaign adapter. Never invokes a solver or changes a claim.
 * The existing five-view HTTP contract is retained. Source scientific records
 * are preserved in read_model; absent global views stay explicitly unavailable.
 * galaxy.tower_revision is a compatibility field carrying source_revision, NOT
 * a Tower identity or an invented Git commit. Layout is illustrative geometry.
 */
export function compilePrivateCampaignRuntime(observation) {
  const {events,campaignId,revision,generatedAt,coverage}=observation;
  requireValue(Array.isArray(events)&&/^sha256:[a-f0-9]{64}$/.test(revision)&&Number.isFinite(Date.parse(generatedAt)),'CAMPAIGN_OBSERVATION_INVALID');
  requireValue(atlasCampaignAllowed(campaignId), 'CAMPAIGN_EXCLUDED');
  const ref=observation.sourceRef,access='PRIVATE';
  const fresh=at=>({state:'UNKNOWN',observed_at:at,ttl_seconds:null});
  const provenance=row=>({source_ref:sourceRef(row),source_revision:row.sources[0].version,fingerprint:'sha256:'+row.sources[0].sha256,
    checked_at:generatedAt,freshness:fresh(row.event.timestamp_utc)});
  const latest=new Map();
  for(const row of events) {
    const e=row.event,key=`${e.role}:${e.kind}:${e.entity_id}`,prior=latest.get(key);
    if(!prior||prior.event.version<e.version)latest.set(key,row);
  }
  const rows=[...latest.values()],methods=rows.filter(r=>r.event.kind==='METHOD');
  const methodIds=new Set();
  for(const row of methods){requireValue(!methodIds.has(row.event.entity_id),'METHOD_ID_CONFLICT');methodIds.add(row.event.entity_id);}
  const nodeId=row=>row.event.kind==='METHOD'?`test:${row.event.entity_id}`:`artifact:${row.event.event_id}`;
  const graphNodes=rows.map(row=>{
    const e=row.event;
    return {id:nodeId(row),canonical_id:e.entity_id,type:e.kind==='METHOD'?'TEST':'EFFECT',label:label(e),
      domain:typeof e.data.domain==='string'?e.data.domain:'SCIENCE',state:'SNAPSHOT',status:rawState(e),
      authority_class:'DERIVED',...provenance(row),summary:typeof e.data.summary==='string'?e.data.summary:'',
      campaign_id:campaignId,event_kind:e.kind,actor_id:e.actor_id,record_version:e.version,
      scientific_state:e.kind==='RESULT'?(e.data.verdict??null):null,review_state:null,
      source_links:[{label:'Drive source',url:`https://drive.google.com/file/d/${row.sources[0].file_id}/view`}],
      automation_eligible:false};
  });
  const campaignNode={id:`campaign:${campaignId}`,canonical_id:campaignId,type:'CAMPAIGN',label:campaignId,domain:'SCIENCE',state:'SNAPSHOT',
    authority_class:'DERIVED',source_ref:ref,source_revision:revision,fingerprint:revision,checked_at:generatedAt,freshness:fresh(null),
    summary:'Private campaign records; no global scientific conclusion is inferred.'};
  graphNodes.unshift(campaignNode);
  const eventNodes=new Map(rows.map(row=>[row.event.event_id,nodeId(row)]));
  const edges=[],unresolved=[],edgeKeys=new Set();
  function edge(from,to,kind,reference) {
    if(!to){unresolved.push({from,kind,source_reference:reference});return;}
    if(from===to)return;
    const key=sha256([from,to,kind].join('\n'));
    if(edgeKeys.has(key))return;edgeKeys.add(key);
    edges.push({id:'edge:'+key,from,to,kind,weight:1,explanation:'Explicit source reference.',source_reference:reference});
  }
  for(const row of rows){
    const e=row.event,id=nodeId(row);
    edge(campaignNode.id,id,'OWNS',campaignId);
    if(e.data.test_id)edge(id,methodIds.has(e.data.test_id)?`test:${e.data.test_id}`:null,'DERIVES_FROM',e.data.test_id);
    for(const k of ['method_event_id','result_event_id'])if(e.data[k])edge(id,eventNodes.get(e.data[k]),'DERIVES_FROM',e.data[k]);
    for(const r of Array.isArray(e.data.source_event_ids)?e.data.source_event_ids:[])edge(id,eventNodes.get(r),'DERIVES_FROM',r);
  }
  const artifacts=Object.fromEntries(events.map(row=>[row.event.event_id,{...structuredClone(row.event),...provenance(row),source_files:row.sources.map(s=>({file_id:s.file_id,version:s.version,sha256:s.sha256,mime_type:s.mime_type}))}]));
  const results=rows.filter(row=>row.event.kind==='RESULT'),reviews=rows.filter(row=>row.event.kind==='REVIEW');
  const tests=Object.fromEntries(methods.map(row=>{
    const e=row.event;
    // This does not merge later numerical results into a frozen method or infer
    // that a reviewer has approved anything from the existence of a REVIEW file.
    return [e.entity_id,{...structuredClone(e.data),id:e.entity_id,test_id:e.entity_id,campaign_id:campaignId,
      source_event_id:e.event_id,...provenance(row),
      result_refs:results.filter(r=>r.event.data.test_id===e.entity_id).map(r=>r.event.event_id),
      review_refs:reviews.filter(r=>r.event.data.test_id===e.entity_id).map(r=>r.event.event_id)}];
  }));
  function fields(row,keys){return Object.fromEntries(keys.map(key=>[key,{value:Object.hasOwn(row,key)?row[key]:null,
    unavailable_reason:Object.hasOwn(row,key)&&row[key]!==null?null:'Not supplied by this source record.',source_ref:row.source_ref||ref,fingerprint:row.fingerprint||revision}]));}
  const scienceTests=Object.values(tests).map(row=>({id:row.id,source_ref:row.source_ref,fingerprint:row.fingerprint,
    ...fields(row,['question','status','null_model','rival_model','statistic','threshold','method','datasets','limitations','claim_boundary','hypothesis_id'])}));
  const campaign={id:campaignId,campaign_id:campaignId,test_ids:Object.keys(tests),source_ref:ref,
    description:'Observed campaign membership; no inferred closure or scientific verdict.'};
  const collectionState=(items,kind)=>items.length?{state:'AVAILABLE',count:items.length,scope:coverage.scope,source_ref:ref}
    :unavailable(`No typed ${kind} records in this observation; historical artifacts have not been reclassified.`,ref);
  const availability={tests:collectionState(methods,'METHOD'),campaigns:{state:'AVAILABLE',count:1,scope:coverage.scope,source_ref:ref},
    results:collectionState(results,'RESULT'),reviews:collectionState(reviews,'REVIEW'),
    hypotheses:unavailable('No separate hypothesis records were supplied.',ref),
    evolution:unavailable('Global evolution is outside the selected campaign source.',ref),
    guardian:unavailable('No live provider health probe was performed.',ref),
    cosmology_state:unavailable('No global cosmology state may be inferred from campaign events.',ref),
    coverage};
  const runs=rows.filter(r=>r.event.kind==='RUN').map(row=>({...structuredClone(row.event.data),run_id:row.event.entity_id,
    title:label(row.event),lane:row.event.data.domain||'SCIENCE',canonical_status:rawState(row.event),
    status:['RUNNING','FAILED','BLOCKED'].includes(rawState(row.event))?rawState(row.event)
      :rawState(row.event)==='SUCCEEDED'&&row.event.data.readback?.status==='CONFIRMED'?'SUCCEEDED':'UNKNOWN',
    runtime:row.event.data.runtime??'UNKNOWN',steps:Array.isArray(row.event.data.steps)?row.event.data.steps:[],
    readback:object(row.event.data.readback)?row.event.data.readback:{status:'UNVERIFIED'},...provenance(row)}));
  const system={contract_version:'1',access,scenario_id:'private-campaign',scenario_label:campaignId,generated_at:generatedAt,source_revision:revision,
    global_state:'SNAPSHOT',...arrays(['findings','actions','inbox','capabilities','lanes','filaments']),runs,projected_work:[],
    providers:[{id:'campaign_files',label:'Private campaign files',state:'SNAPSHOT',expected_for:['SCIENCE'],capabilities:[],last_success_at:null,
      checked_at:generatedAt,availability:'PARTIAL',explanation:'Selected-campaign observation, not global operational health.'}],
    bus:{fingerprint:revision,generated_at:generatedAt,state:'SNAPSHOT',envelope_count:1,
      sources:[{id:'campaign_files',label:campaignId,source_revision:revision,state:'SNAPSHOT',envelopes:1,freshness:fresh(null)}],
      consumers:[{id:'atlas',label:'Atlas',state:'SNAPSHOT',last_pull_at:null}]},
    envelopes:[{entity_id:campaignId,domain:'SCIENCE',title:campaignId,authoritative:false,authority_class:'DERIVED',state:'SNAPSHOT',
      source_ref:ref,source_revision:revision,fingerprint:revision,freshness:fresh(null),derivation_rule:'CAMPAIGN_FILES_READ_ONLY_V1'}],
    graph:{nodes:graphNodes,edges},availability,unresolved_relations:unresolved,
    science_projection_v1:{contract:'NEXO_SCIENCE_PROJECTION_V1',version:1,access,source:{authority:'CAMPAIGN_FILES',source_revision:revision,
      projection_fingerprint:revision,projection_ref:ref,writeback:'FORBIDDEN'},fingerprint:revision,
      campaigns:[{id:campaignId,source_ref:ref,fingerprint:revision,...fields(campaign,['title','question','status','test_ids'])}],
      tests:scienceTests,hypotheses:[],historical_tests:[]},
    read_model:{version:1,access,source_ref:ref,source_revision:revision,tests,historical_tests:{},hypotheses:{},roadmaps:[],
      work:{},campaigns:{[campaignId]:campaign},lessons:{},interdomain:{},artifacts,
      results:Object.fromEntries(results.map(r=>[r.event.entity_id,artifacts[r.event.event_id]])),
      reviews:Object.fromEntries(reviews.map(r=>[r.event.entity_id,artifacts[r.event.event_id]])),
      activity:events.map(r=>({...r.event,at:r.event.timestamp_utc,event_type:r.event.kind,source_ref:sourceRef(r)})),coverage,
      evolution:null,integrity:null,cosmology_baseline:null,cosmology_source:null},
    evolution:null,evolution_partial:null,guardian:null,cosmology_state:null};
  const items=graphNodes.map(node=>({id:node.id,kind:'ENTITY',title:node.label,summary:node.summary,source:'campaign_files',sourceRef:node.source_ref,
    authority:'DERIVED',freshness:{state:'SNAPSHOT',observedAt:generatedAt,expiresAt:null},attention:false,actions:[],observedAt:generatedAt,contextId:campaignId}));
  const world={version:'1',access,fingerprint:revision,generatedAt,items,
    providers:[{id:'campaign_files',label:'Private campaign files',status:'PARTIAL',lastSuccessAt:null,checkedAt:generatedAt,revision,
      message:'Selected-campaign scope only.',partial:true,count:items.length}],
    contexts:[{id:campaignId,title:campaignId,description:'Source-backed campaign records',itemIds:items.map(i=>i.id),attentionCount:0,coverage:'PARTIAL'}],issues:[],
    truthGraph:{fingerprint:revision,generatedAt,results:[],material_conflicts:[]},diff:{state:'UNAVAILABLE',reason:'No prior observation supplied.'}};
  const topology={contract:'NEXO_MCP_TOPOLOGY_V1',access,generated_at:generatedAt,
    source:{authority:'CAMPAIGN_FILES',source_storage:'GOOGLE_DRIVE_PRIVATE',source_ref:ref,projection_fingerprint:revision,remote_mcp:null},
    nodes:[],links:[],stats:{tools:0,remote_tools:0,internal_tools:0,capabilities:0,backends:0,roles:0,families:0,status_counts:{},backend_counts:{}},
    availability:unavailable('No MCP or runtime inventory read; empty arrays are not a health claim.',ref)};
  const publication={contract:'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1',access,
    manifest:{authority:'CAMPAIGN_FILES',access,source_storage:'GOOGLE_DRIVE_PRIVATE',source_state_fingerprint:revision,source_ref:ref,
      projection_fingerprint:revision,projection_only:true,writeback:'FORBIDDEN',generated_at:generatedAt,coverage},
    build_meta:{contract:'NEXO_ONE_BUILD_META_V1',projection_fingerprint:revision,built_at:generatedAt}};
  const entities=graphNodes.map(node=>({...node,kind:node.type,canonical_id:node.canonical_id,title:node.label,visual_domain:node.domain,
    layout:layout(node.id),source:{source_ref:node.source_ref,projection_fingerprint:revision},observation:{access:'PRIVATE',state:'SNAPSHOT'}}));
  const galaxy={contract:'NEXO_ONE_GALAXY_V1',access,snapshot_id:revision,generated_at:generatedAt,tower_revision:revision,
    source_revision:revision,revision_field_semantics:'SOURCE_REVISION_COMPATIBILITY_ALIAS_NOT_TOWER',fingerprint:revision,
    provenance:{authority:'CAMPAIGN_FILES',source_fingerprint:revision,source_contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1',source_ref:ref},
    coordinate_semantics:'ILLUSTRATIVE_LAYOUT_NOT_PHYSICAL_OBSERVATION',entities,events:[],needs_you:[],relations:edges,
    stats:{entities:entities.length,relations:edges.length,needs_you:0,events:0}};
  return {contract:'ATLAS_PRIVATE_V1',data:validatePrivateRuntime({contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1',access,
    generated_at:generatedAt,source_revision:revision,fingerprint:revision,system,world,topology,publication,galaxy})};
}
