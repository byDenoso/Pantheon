import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchLiveSsot,projectLiveRoute,diffLiveSnapshots} from '../lib/live-drive-ssot.mjs';

const live={
 contract:'NEXO_ATLAS_SSOT_V1',authority:'GOOGLE_DRIVE',projectionAuthority:'DERIVED_FROM_SSOT',projectionOnly:true,
 sourceFileId:'sheet-1',sourceModifiedAt:'2026-09-11T18:00:00Z',generatedAt:'2026-09-11T18:00:01Z',fingerprint:'sha256:aaa',
 sections:{
  THREADS:[{thread_id:'THR::SCIENCE::ROOT',domain:'SCIENCE',title:'Science',status:'ACTIVE',current_question:'Test?'}],
  WORK:[{work_id:'WORK::1',thread_id:'THR::SCIENCE::ROOT',kind:'TEST',question:'Run it',status:'DONE',priority:'HIGH',domain:'SCIENCE',updated_at:'2026-09-11T18:00:00Z',verification_status:'VERIFIED'}],
  EVENTS:[{event_id:'EVT::1',event_type:'HANDOFF_RESULT',domain:'SCIENCE',summary:'Verified',status:'DONE',created_at:'2026-09-11T18:00:00Z'}],
  KNOWLEDGE:[
   {knowledge_id:'KNOW::1',domain:'NEXO',type:'PROCEDURAL',statement:'Null-first audit',context:'method',support:'2',contradiction:'0',confidence:'0.9',evidence_refs:'Drive:1',related_ids:'WORK::1',status:'ACTIVE',updated_at:'2026-09-11T18:00:00Z'},
   {knowledge_id:'KNOW::REL::1',domain:'SCIENCE | OLYMPUS',type:'RELATION',statement:'Science — LEARNING_FILAMENT — Olympus',context:'filament',support:'3',contradiction:'0',confidence:'0.8',evidence_refs:'Drive:2',related_ids:'PROG-SCI | OLY-PROG',status:'SUPPORTED',updated_at:'2026-09-11T18:00:00Z'},
   {knowledge_id:'KNOW::UNKNOWN::1',domain:'ENGINEERING',type:'PROCEDURAL',statement:'Unknown metrics stay unknown',context:'method',support:'',contradiction:'',confidence:'',evidence_refs:'Drive:3',related_ids:'',status:'ACTIVE',updated_at:'2026-09-11T18:00:00Z'}
  ],
  DECISIONS:[],SYSTEM:[{system_id:'SYS::NEON',key:'NEON',value:'RETIRED_RUNTIME',status:'RETIRED',updated_at:'2026-09-11T18:00:00Z',source:'Director'}]
 },
 projections:{
  Science:[{record_type:'campaign',record_id:'CAMP-1',status:'ACTIVE',title:'Campaign 1',summary:'Question',domain:'D1',source_ref:'Drive:science'}],
  Engineering:[{record_type:'domain',record_id:'ENG-DOM-ENGINEERING',status:'ACTIVE',title:'Engineering',parent_id:'',summary:'Engineering root',source_ref:'Drive:eng'},{record_type:'program',record_id:'ENG-PROG-1',status:'ACTIVE',title:'Program',parent_id:'ENG-DOM-ENGINEERING',summary:'Program summary',source_ref:'Drive:eng'}],
  Olympus:[{record_type:'domain',record_id:'OLY-DOM-OLYMPUS',status:'ACTIVE',title:'Olympus',detail:'Olympus root',payload_json:'{}',source:'SSOT',updated_at:'2026-09-11'}],
  StructuralLearning:[{learning_id:'SL-1',status:'SUPPORTED',title:'Structural',source_domains:'SCIENCE|ENGINEERING',structural_pattern:'Pattern',transfer_rule:'Rule',support_count:'2',contradict_count:'0',confidence:'0.7',provenance:'Drive'}],
  CrossDomain:[{cross_id:'CD-1',domains:'SCIENCE|OLYMPUS',hypothesis:'Cross transfer',mechanism:'Mechanism',status:'SUPPORTED',provenance:'Drive'}],
  Integrity:[{integrity_id:'INT-1',scope:'NEXO',type:'readback',target:'SSOT',status:'PASS',severity:'HIGH'}]
 }
};

test('live reader forwards Atlas OIDC identity and force-refresh intent',async()=>{
 let request;
 const fetcher=async(url,options)=>{request={url,options};return {ok:true,json:async()=>structuredClone(live)}};
 const result=await fetchLiveSsot({url:'https://nexo.test/api/atlas-ssot',fetcher,oidcToken:'signed-token',force:true});
 assert.equal(result.fingerprint,'sha256:aaa');
 assert.match(request.url,/refresh=1/);
 assert.equal(request.options.headers.Authorization,'Bearer signed-token');
 assert.equal(request.options.headers['x-vercel-trusted-oidc-idp-token'],'signed-token');
});

test('live graph preserves current Science D-domain contract',()=>{
 const graph=projectLiveRoute(live,'graph',{focus:'system:SCIENCE'});
 assert.equal(graph.authority,'GOOGLE_DRIVE');
 assert.equal(graph.fingerprint,'sha256:aaa');
 assert.ok(graph.nodes.some(node=>node.id==='domain:D1'));
 const detail=projectLiveRoute(live,'graph',{focus:'domain:D1'});
 assert.ok(detail.nodes.some(node=>node.id==='CAMP-1'));
});

test('Learning comes from current canonical knowledge plus derived transfer projections',()=>{
 const report=projectLiveRoute(live,'learning',{});
 assert.ok(report.total>=5);
 const items=report.ladder.flatMap(stage=>stage.items);
 const relation=items.find(item=>item.id==='KNOW::REL::1');
 assert.equal(relation.domainA,'SCIENCE');
 assert.equal(relation.domainB,'OLYMPUS');
 assert.equal(relation.evidenceRefs.relation_scope,'CROSS_DOMAIN');
 const unknown=items.find(item=>item.id==='KNOW::UNKNOWN::1');
 assert.equal(unknown.confidence,null);
 assert.equal(unknown.evidenceCount,null);
 assert.equal(unknown.contradictionCount,null);
 assert.ok(report.crossDomain>=2);
});

test('sync diff reports semantic section changes without using retrieval timestamps',()=>{
 const same=structuredClone(live);same.generatedAt='2026-09-11T18:10:00Z';
 assert.equal(diffLiveSnapshots(live,same).outcome,'NO_CHANGE');
 const changed=structuredClone(live);changed.fingerprint='sha256:bbb';changed.sections.WORK[0].status='BLOCKED';changed.sections.KNOWLEDGE.push({...changed.sections.KNOWLEDGE[0],knowledge_id:'KNOW::2'});
 const diff=diffLiveSnapshots(live,changed);
 assert.equal(diff.outcome,'UPDATED');
 assert.ok(diff.changedSections.includes('WORK'));
 assert.ok(diff.changedSections.includes('KNOWLEDGE'));
 assert.equal(diff.counts.KNOWLEDGE.delta,1);
});
