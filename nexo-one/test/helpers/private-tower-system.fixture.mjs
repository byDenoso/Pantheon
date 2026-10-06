// Wholly synthetic normalized Tower inputs. Never imported by production.
export const PRIVATE_TOWER_REVISION = 'sha256:' + 'a'.repeat(64);
export const PRIVATE_TOWER_AT = '2026-10-01T10:00:00.000Z';
export function privateTowerSystemFixture() {
  const at = PRIVATE_TOWER_AT;
  const record = (kind,id,extra={}) => ({id,kind:kind.toUpperCase(),domain:'OLYMPUS',private:true,_source_path:`entities/${kind}/${id}.json`,...extra});
  const records = {
    work:[record('work','WORK-HUMAN',{title:'Synthetic private decision',status:'WAIT_DEPENDENCY',human_action_required:true,priority:'P1',question:'Synthetic private question?',next_action:'Inspect synthetic record',
      remaining_dependencies:[{id:'HUMAN-INPUT',dependency_class:'HUMAN_INPUT_REQUIRED',detail:'Synthetic human detail'},{id:'AUTO-INPUT',dependency_class:'EXTERNAL_TRANSIENT',detail:'Synthetic automatic detail'}],
      readback_criteria:['Synthetic criterion'],action_location:'Synthetic private location',private_detail:'Keep this private detail'}),
      record('work','WORK-ONLY',{domain:'SCIENCE',title:'Synthetic ordinary WORK',status:'READY'}),
      record('work','WORK-EXEC',{domain:'ENGINEERING',action_id:'ACTION-EXEC',title:'Synthetic source-backed action',status:'READY',runtime:'NEXO_KERNEL',required_operation:'READ',capability_id:'CAP-PRIVATE',risk:'LOW',reversible:true})],
    tests:[record('test','TEST-PRIVATE',{title:'Synthetic test title',display_name:'Synthetic private test',question:'Synthetic private evidence question?',status:'DONE',review_state:'PENDING_REVIEW',scientific_state:'INCONCLUSIVE',attempt_state:'FINISHED',verdict:'INCONCLUSIVE',
      hypothesis_id:'HYP-PRIVATE',campaign_id:'CAMPAIGN-PRIVATE',roadmap_id:'ROADMAP-PRIVATE',method:'Synthetic private method',datasets:[{id:'DATA-PRIVATE',private:true}],
      result:{parameter:'synthetic',value:3,err_lo:1,err_hi:2,unit:'synthetic units'},statistics:{p_value:0.2,sigma_lee:0.1},
      robustness_checks:[{id:'CHECK-PRIVATE',name:'Synthetic private check',status:'PASS',private_detail:'Not sanitized'}],artifacts:['private://synthetic-artifact'],claim_boundary:'Synthetic bounded claim',limitations:'Synthetic private limitation',
      prereg:{metric:'Synthetic metric',threshold:2,prediction:'Synthetic prediction',null:'Synthetic null',rival:'Synthetic rival',hash:'synthetic-hash',at,ref:'private://prereg',criterion:{success:['Synthetic success'],kill:['Synthetic kill']}},
      semantic:{domain_id:'olympus',subdomain_id:'private-subdomain',subdomain_label:'Synthetic private subdomain',topic_id:'private-topic',topic_label:'Synthetic private topic',display_name:'Synthetic private test',question_plain:'Synthetic plain question?'},
      review:[{kind:'REFEREE_1',by:'PRIVATE_REVIEWER',outcome:'PASS',at}],parents:['TEST-ENGINEERING'],children:[],created_at:at,executed_at:at,execution:{at,run_ref:'private://run',runner:'PRIVATE_EXECUTOR'},
      readiness:{eligible:false,reasons:['SYNTHETIC_INPUT'],policy:'SYNTHETIC_POLICY'}}),
      record('test','TEST-ENGINEERING',{domain:'ENGINEERING',title:'Synthetic engineering test',status:'BLOCKED_INPUT',blocker:'Synthetic blocker',scientific_result:{parameter:'alternate',value:7,statistics:{p_value:0.3}}})],
    hypotheses:[record('hypothesis','HYP-PRIVATE',{statement:'Synthetic private hypothesis',model:'Synthetic model',baseline:'Synthetic baseline',falsification_criterion:'Synthetic falsifier'})],
    campaigns:[record('campaign','CAMPAIGN-PRIVATE',{title:'Synthetic private campaign',question:'Synthetic campaign question?',hypothesis_ids:['HYP-PRIVATE']})],
    roadmaps:[record('roadmap','ROADMAP-PRIVATE',{_source_path:'roadmaps/ROADMAP-PRIVATE.json',roadmap_id:'ROADMAP-PRIVATE',title:'Synthetic private roadmap',campaign_id:'CAMPAIGN-PRIVATE',state:'ACTIVE',test_ids:['TEST-PRIVATE'],hypothesis_ids:['HYP-PRIVATE'],frontier_test_ids:['TEST-PRIVATE'],progress:{frontier:1,confirmed:0},charter:{budget:{max_tests:4},stop:{success_confirmed:2},objectives:['Synthetic objective'],renewable:true}})],
    lessons:[record('lesson','LESSON-PRIVATE',{lesson:'Synthetic private learning',heuristic:'Synthetic private procedure',source_id:'TEST-PRIVATE',target_id:'TEST-ENGINEERING',source_domain:'OLYMPUS',target_domain:'ENGINEERING',evidence_refs:['TEST-PRIVATE','TEST-ENGINEERING'],weight:0.4,support:2,contradiction:0,status:'SUPPORTED',boundary:'Synthetic only'})],
    interdomain:[record('interdomain','LINK-PRIVATE',{title:'Synthetic domain bridge',source_domains:['OLYMPUS'],target_domains:['SCIENCE'],source_nodes:['TEST-PRIVATE'],test_refs:['TEST-PRIVATE'],lesson_refs:['LESSON-PRIVATE'],mapping:'Synthetic mapping',falsifier_or_validation:'Synthetic scope',status:'PROVISIONAL'})],
    artifacts:[],capabilities:{'CAP-PRIVATE':{domain:'ENGINEERING',label:'Synthetic private capability',status:'ACTIVE',runtime:'NEXO_KERNEL',operation:'READ',private:true,_source_path:'manifests/capabilities.json'}},
    events:[{id:'EVENT-PRIVATE',event_type:'TEST_RESULT_RECORDED',role:'PRIVATE_EXECUTOR',at,entity_id:'TEST-PRIVATE',private_detail:'Synthetic private event'}],
    evolution:{'gate.json':{charters_waiting:[{roadmap_id:'ROADMAP-PRIVATE',question:'Synthetic charter question?'}],canaries_waiting:[]},
      'review_queue.json':{referee_1:['TEST-PRIVATE'],referee_2:[]},'roadmaps.json':[{roadmap_id:'ROADMAP-PRIVATE',confirmed:0,tests_used:1,refuted_streak:0}],
      'genome.json':{generation:3,genes:[{id:'GENE-PRIVATE',status:'CANARY',canonical:'synthetic baseline',canary:'synthetic candidate'}]},'decoys.json':{planted:2,revealed:1,caught:1},
      'thoughts.json':[{id:'THOUGHT-PRIVATE',at,kind:'QUESTION',text:'Synthetic private thought',refs:['TEST-PRIVATE']}],
      'incidents.json':[{incident_id:'INCIDENT-PRIVATE',state:'OBSERVED',private:true,cause:'Synthetic private cause',evidence_refs:['TEST-PRIVATE']}],
      'learning.json':{rules:[{feature:'synthetic',value:'private',state:'ACTIVE'}]}},
    integrity:{status:'YELLOW',checked_at:at,checks_total:2,checks_failing:1,failing_areas:['synthetic'],private_detail:'Synthetic private integrity detail'},
    control:{truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE'},snapshot:{},coverage:{},
  };
  for (const key of ['work','tests','hypotheses','campaigns','roadmaps','lessons','interdomain','artifacts','capabilities']) records.coverage[key]={status:'PRESENT',complete:true,count:Array.isArray(records[key])?records[key].length:Object.keys(records[key]).length};
  return {records,revision:PRIVATE_TOWER_REVISION,generatedAt:at,sourceRef:'https://example.invalid/private/canonical-tower'};
}
