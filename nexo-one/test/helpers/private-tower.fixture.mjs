import {TOWER_ID} from '../../server/mcp/operational-state.mjs';
export function makePrivateTowerFixture(){
 const at='2026-01-01T00:00:00.000Z',revision='sha256:'+'e'.repeat(64);
 const raw={
  'CONTROL.json':{truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',authority:'TOWER_V06'},
  'snapshot/latest.json':{event_cursor:'SYNTHETIC_CURSOR'},
  'indexes/active-work.json':{work:[{id:'WORK-01'}]},
  'entities/work/WORK-01.json':{id:'WORK-01',kind:'WORK',domain:'OLYMPUS',title:'Synthetic private task',status:'AWAITING_HUMAN',human_action_required:true,human_gate:{kind:'DECIDIR',question:'Synthetic decision?'},required_operation:'READ',runtime:'HUMAN',risk:'LOW',reversible:true,capability_id:'CAP-01',campaign_id:'CAMPAIGN-01',test_id:'TEST-01',updated_at:at},
  'entities/test/TEST-01.json':{id:'TEST-01',kind:'TEST',domain:'OLYMPUS',private:true,question:'Synthetic private test?',display_name:'Synthetic private test',status:'CHECKPOINTED',review_state:'PENDING_REVIEW',hypothesis_id:'HYP-01',campaign_id:'CAMPAIGN-01',roadmap_id:'ROADMAP-01',method:'Synthetic method',result_meaning:'Synthetic result',prereg:{metric:'Synthetic metric',success:['Synthetic success']},semantic:{domain_id:'OLYMPUS',subdomain_id:'synthetic',question_plain:'Synthetic private test?'},updated_at:at},
  'entities/hypothesis/HYP-01.json':{id:'HYP-01',kind:'HYPOTHESIS',domain:'OLYMPUS',private:true,title:'Synthetic private hypothesis',statement:'Synthetic statement',test_ids:['TEST-01']},
  'roadmaps/ROADMAP-01.json':{id:'ROADMAP-01',roadmap_id:'ROADMAP-01',campaign_id:'CAMPAIGN-01',title:'Synthetic roadmap',domain:'OLYMPUS',test_ids:['TEST-01'],status:'ACTIVE'},
  'entities/lesson/LESSON-01.json':{id:'LESSON-01',domain:'ENGINEERING',title:'Synthetic transferable lesson',status:'PROVISIONAL',test_refs:['TEST-01'],from_id:'TEST-01',to_id:'CAP-01',source_domains:['OLYMPUS'],target_domains:['ENGINEERING'],from_domain:'OLYMPUS',to_domain:'ENGINEERING',weight:0.4,support:1,contradiction:0},
  'entities/interdomain/LINK-01.json':{id:'LINK-01',domain:'OLYMPUS',source_domains:['OLYMPUS'],target_domains:['ENGINEERING'],from_id:'TEST-01',to_id:'CAP-01',lesson_refs:['LESSON-01'],relation_type:'METHOD_TRANSFER',status:'PROVISIONAL'},
  'manifests/capabilities.json':{capabilities:{'CAP-01':{capability_id:'CAP-01',domain:'ENGINEERING',backend:'SYNTHETIC_RUNTIME',runtime:'LOCAL',required_operation:'READ',status:'UNVERIFIED',scope:'Synthetic read',roles:['EXECUTOR']}}},
  'events/EVENT-01.json':{id:'EVENT-01',event_type:'TEST_CHECKPOINT',entity_id:'TEST-01',at},
  'entities/artifact/AUDIT-01.json':{id:'AUDIT-01',kind:'INTEGRITY_REPORT',payload:{status:'YELLOW',checked_at:at,checks_total:1,checks_failed:1,issues:[{area:'synthetic',status:'WARN'}]}},
  'evolution/gates.json':{gates:[]},
  'snapshot/cosmology_state.json':{model:'COSMOLOGY_STATE_V1',authority:'TOWER',projection_only:true,frontiers:[{id:'FRONTIER-01',title:'Synthetic frontier',state:'OPEN',state_label:'Open',summary:'Synthetic source statement',why:'Synthetic source reason',confidence:'Unknown in fixture',literature_baseline:'Synthetic source baseline',synthesis_basis:'SOURCE_DECLARED',synthesis_evidence_ids:[],nexo_interpretation:[],evidence_counts:{confirmed:0,refuted:0,review:0,inconclusive:0,open:0},key_evidence:[],historical_lessons:[],campaign_ids:[],roadmap_ids:[],open_questions:['Synthetic question'],next_discriminants:[],active_tests:[]}],historical_tests:[]},
 };
 const files=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,{encoding:'json',value}]));
 files['services/nexo-api/app/mcp_server.py']={encoding:'text',data:'tools = [Tool(name="nexo_synthetic_read")]'};
 files['services/nexo-api/app/remote_mcp.py']={encoding:'text',data:'@mcp.tool(name="nexo_synthetic_read")\ndef synthetic_read():\n    pass'};
 return {contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',storage:'GOOGLE_DRIVE_PRIVATE',write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',stable_file_id:TOWER_ID,revision,state_fingerprint:revision,updated_at:at,file_count:Object.keys(files).length,files};
}
