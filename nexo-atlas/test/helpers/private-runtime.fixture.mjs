// Synthetic integration proposal only. No production source or private values.
const AT='2026-01-01T00:00:00.000Z';
const FP='sha256:'+'a'.repeat(64);
const REV='b'.repeat(40);
const REF='https://example.invalid/private/source';
const freshness=()=>({state:'RECENT',observed_at:AT,ttl_seconds:900});
const evidence=value=>({value,unavailable_reason:null,source_ref:REF,fingerprint:FP});
const node=(id,type,domain,extra={})=>({id,type,domain,label:'Synthetic '+id,state:'SNAPSHOT',authority_class:'DERIVED',source_ref:REF,source_revision:REV,fingerprint:FP,freshness:freshness(),checked_at:AT,summary:'Synthetic contract content',...extra});

export function makePrivateRuntimeFixture(){
  const testId='TEST-01',hypId='HYP-01',campaignId='CAMPAIGN-01',workId='WORK-01';
  const readback={status:'UNVERIFIED',provider:null,observed_fingerprint:null,checked_at:null,explanation:'Synthetic readback pending'};
  const action={action_id:workId,lane:'OLYMPUS',title:'Synthetic private task',status:'AWAITING_HUMAN',required_operation:'READ',capability_id:'CAP-01',runtime:'HUMAN',effect_key:null,input_fingerprint:FP,readback,receipt_ref:null,blocker:'Synthetic decision pending',next_action:'Review synthetic choice',risk:'LOW',reversible:true,eligibility:'Synthetic read-only fixture',human_gate:{kind:'DECIDIR',question:'Synthetic question?',options:[]},source_ref:REF,fingerprint:FP,checked_at:AT,freshness:freshness(),updated_at:AT};
  const graph={nodes:[
    ...['NEXO','SCIENCE','ENGINEERING','OLYMPUS'].map(domain=>node('domain:'+domain,'DOMAIN',domain)),
    node('campaign:'+campaignId,'CAMPAIGN','OLYMPUS',{semantic_domain:'OLYMPUS',semantic_subdomain_id:'olympus.synthetic',semantic_subdomain:'Synthetic area'}),
    node('test:'+testId,'TEST','OLYMPUS',{campaign_id:campaignId,semantic_domain:'OLYMPUS',semantic_subdomain_id:'olympus.synthetic',semantic_subdomain:'Synthetic area',question_plain:'Synthetic test question?',result_meaning:'Synthetic interpretation',status_group:'CHECKPOINTED',scientific_state:'INCONCLUSIVE',attempt_state:'RUNNING',review_state:'PENDING_REVIEW'}),
    node('action:'+workId,'ACTION','OLYMPUS',{human_gate:true,decision_required:true,operational_status:'WAIT_DEPENDENCY'}),
    node('capability:CAP-01','CAPABILITY','ENGINEERING'),
  ],edges:[
    {id:'EDGE-01',from:'domain:OLYMPUS',to:'campaign:'+campaignId,kind:'OWNS',weight:1,explanation:'Synthetic hierarchy'},
    {id:'EDGE-02',from:'campaign:'+campaignId,to:'test:'+testId,kind:'OWNS',weight:1,explanation:'Synthetic hierarchy'},
    {id:'EDGE-03',from:'test:'+testId,to:'capability:CAP-01',kind:'DEPENDS_ON',weight:0.8,explanation:'Synthetic private cross-domain relationship',is_learning:true,learning_scope:'INTER_DOMAIN',learning_ref:'FILAMENT-01'},
  ]};
  const system={contract_version:'1',scenario_id:'synthetic-private',scenario_label:'Synthetic private contract fixture',generated_at:AT,global_state:'SNAPSHOT',
    bus:{fingerprint:FP,generated_at:AT,state:'SNAPSHOT',envelope_count:1,sources:[],consumers:[]},
    envelopes:[{entity_id:testId,domain:'OLYMPUS',authority_class:'DERIVED',source_ref:REF,source_revision:REV,fingerprint:FP,freshness:freshness(),derivation_rule:'Synthetic identity mapping',state:'SNAPSHOT',checked_at:AT,projection_role:'ATLAS',authoritative:false,title:'Synthetic record'}],
    findings:[],actions:[action],inbox:[{id:'GATE-01',kind:'DECIDIR',domain:'OLYMPUS',title:'Synthetic gate',question:'Synthetic question?',why:'Synthetic blocked task',action_id:workId,options:[],severity:'INFO',due_at:null,source_ref:REF,fingerprint:FP,checked_at:AT,freshness:freshness()}],
    capabilities:[{capability_id:'CAP-01',label:'Synthetic capability',domain:'ENGINEERING',runtime:'LOCAL',operation:'READ',status:'UNVERIFIED',risk:'LOW',provider:'Synthetic provider',last_verified_at:null,evidence_ref:null,explanation:'Synthetic evidence absent'}],
    runs:[],lanes:[{domain:'OLYMPUS',current_state:'Synthetic private lane',next_action:'Review synthetic choice',last_effect:null,blockers:['Synthetic decision pending'],side_quests:[],freshness:freshness(),state:'SNAPSHOT',source_ref:REF,fingerprint:FP,checked_at:AT}],
    graph,projected_work:[graph.nodes.find(item=>item.id==='action:'+workId)],
    filaments:[{id:'FILAMENT-01',label:'Synthetic cross-domain learning',domain:'OLYMPUS',kind:'SEMANTIC',weight:0.8,support:1,contradiction:0,status:'PROVISIONAL',evidence:[testId],source_ref:REF,boundary:'Synthetic only',from_label:'Synthetic test',to_label:'Synthetic capability',from_id:'test:'+testId,to_id:'capability:CAP-01',from_domain:'OLYMPUS',to_domain:'ENGINEERING',scope:'INTER_DOMAIN'}],providers:[],
    science_projection_v1:{contract:'NEXO_SCIENCE_PROJECTION_V1',version:1,source:{authority:'TOWER_V06',tower_repository:'synthetic/repository',tower_commit:REV,projection_fingerprint:FP,projection_ref:REF,writeback:'FORBIDDEN'},fingerprint:FP,
      campaigns:[{id:campaignId,source_ref:REF,fingerprint:FP,title:evidence('Synthetic campaign'),question:evidence('Synthetic campaign question?'),hypothesis_ids:evidence([hypId])}],
      hypotheses:[{id:hypId,source_ref:REF,fingerprint:FP,statement:evidence('Synthetic hypothesis')}],
      tests:[{id:testId,source_ref:REF,fingerprint:FP,campaign_id:evidence(campaignId),hypothesis_id:evidence(hypId),method:evidence('Synthetic method'),result:evidence('Synthetic result'),statistics:evidence({parameter:'synthetic',value:1}),datasets:evidence(['DATASET-01'])}]},
    read_model:{version:1,tests:{[testId]:{domain:'OLYMPUS',display_name:'Synthetic private test',status:'CHECKPOINTED',review_state:'PENDING_REVIEW',campaign_id:campaignId,hypothesis_id:hypId,roadmap_id:'ROADMAP-01',question:'Synthetic question?',private:true,prereg:{metric:'Synthetic metric',threshold:1,criterion:{success:['Synthetic success'],kill:['Synthetic stop']}},parents:[],children:[],created_at:AT,limitations:'Synthetic limitation'}},historical_tests:{},hypotheses:{[hypId]:{statement:'Synthetic hypothesis',private:true}},roadmaps:[{id:'ROADMAP-01',roadmap_id:'ROADMAP-01',campaign_id:campaignId,title:'Synthetic roadmap',state:'ACTIVE',test_ids:[testId],hypothesis_ids:[hypId],progress:{confirmed:0,frontier:1},frontier_test_ids:[testId],private:true}],activity:[{event_type:'TEST_CHECKPOINTED',role:'EXECUTOR',at:AT,entity_id:testId,entity_kind:'TEST'}]},
    guardian:{status:'YELLOW',checked_at:AT,checks_total:1,checks_failing:1,failing_areas:['synthetic']},
    evolution:{gate:{charters_waiting:[],canaries_waiting:[]},review_queue:{referee_1:[testId],referee_2:[]},roadmaps:[{roadmap_id:'ROADMAP-01',confirmed:0,tests_used:1,refuted_streak:0}],genome:{generation:0,genes:[]},decoys:{planted:0,revealed:0,caught:0},board:[],thoughts:[]},
  };
  const world={version:'1',fingerprint:'WORLD-SYNTHETIC',generatedAt:AT,access:'PRIVATE',providers_total:1,providers_available:1,read_valid:true,
    providers:[{id:'nexo',label:'Synthetic private source',status:'AVAILABLE',lastSuccessAt:AT,checkedAt:AT,revision:REV,message:'Synthetic fixture',partial:false,count:1}],
    items:[{id:'ITEM-01',kind:'ENTITY',title:'Synthetic Olympus record',summary:'Synthetic private detail',source:'nexo',sourceRef:REF,authority:'DERIVED',freshness:{state:'SNAPSHOT',observedAt:AT,expiresAt:'2026-01-01T01:00:00.000Z'},contextId:'OLYMPUS',attention:'NOTICE',status:'NEEDS_ME',nextAction:'Review synthetic record',actions:[{id:'OPEN-01',label:'Synthetic source',kind:'OPEN_SOURCE',url:REF}],observedAt:AT}],
    contexts:[{id:'OLYMPUS',title:'Olympus',description:'Synthetic private context',itemIds:['ITEM-01'],attentionCount:0,coverage:'AVAILABLE'}],issues:[],truthGraph:{fingerprint:'TRUTH-SYNTHETIC',checked_at:AT,results:[],material_conflicts:[]},diff:{previous:null,current:'WORLD-SYNTHETIC',added:[],updated:[],removed:[],providerChanges:[]}};
  const topology={contract:'NEXO_MCP_TOPOLOGY_V1',access:'PRIVATE',generated_at:AT,source:{authority:'TOWER_V06',repository:'synthetic/repository',commit:REV,manifest:REF,mcp_server:'synthetic-server',remote_mcp:'https://example.invalid/private/mcp',projection_fingerprint:FP},stats:{tools:0,remote_tools:0,internal_tools:0,capabilities:0,backends:0,roles:0,families:0,status_counts:{SNAPSHOT:1},backend_counts:{}},nodes:[{id:'TOPOLOGY-01',label:'Synthetic root',kind:'ROOT',group:'NEXO',status:'SNAPSHOT',summary:'Synthetic private topology'}],links:[]};
  const manifest={authority:'TOWER_V06',access:'PRIVATE',projection_only:true,writeback:'FORBIDDEN',projection_fingerprint:FP,tower_commit:REV,generated_at:AT};
  const publication={contract:'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1',access:'PRIVATE',manifest,build_meta:{contract:'NEXO_ONE_BUILD_META_V1',projection_fingerprint:FP,built_at:AT}};
  const galaxy={contract:'NEXO_ONE_GALAXY_V1',access:'PRIVATE',snapshot_id:'SNAPSHOT-01',generated_at:AT,tower_revision:REV,fingerprint:'sha256:'+'c'.repeat(64),provenance:{authority:'TOWER_V06',source_contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1',source_fingerprint:FP,projection_only:true,writeback:'FORBIDDEN'},
    entities:[{id:'test:'+testId,canonical_id:testId,kind:'TEST',domain:'OLYMPUS',visual_domain:'OLYMPUS',title:'Synthetic private test',plain:'Synthetic question?',meaning:'Synthetic interpretation',status:'CHECKPOINTED',scientific_state:'INCONCLUSIVE',attempt_state:'RUNNING',review_state:'PENDING_REVIEW',source:{authority:'TOWER_V06',revision:REV,projection_fingerprint:FP,canonical_id:testId},layout:{x:1,y:2,z:3}}],events:[],needs_you:[],relations:[],stats:{entities:1,relations:0,needs_you:0}};
  return {contract:'ATLAS_PRIVATE_V1',data:{contract:'NEXO_ATLAS_PRIVATE_RUNTIME_V1',access:'PRIVATE',generated_at:AT,source_revision:REV,fingerprint:FP,system,world,topology,publication,galaxy}};
}
