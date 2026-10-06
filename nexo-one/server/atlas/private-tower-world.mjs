import {compile} from '../compiler/world-state.mjs';
const text=value=>typeof value==='string'?value.trim():'';
const loopStatus=row=>row.human_action_required===true?'NEEDS_ME':({DONE:'DONE',COMPLETED:'DONE',BLOCKED:'BLOCKED',WAITING_OTHER:'WAITING_OTHER',WAITING_HUMAN:'NEEDS_ME',AWAITING_HUMAN:'NEEDS_ME',SCHEDULED:'SCHEDULED'}[text(row.status||row.state).toUpperCase()]);
const context=row=>{const domain=text(row.domain||row.semantic?.domain_id).toUpperCase();return domain==='SCIENCE'?'COSMOLOGY':['NEXO','COSMOLOGY','OLYMPUS','ENGINEERING','PERSONAL'].includes(domain)?domain:undefined;};
// Reuse the existing private WorldState classifier. No additional providers,
// inboxes, calendar accounts or independent persisted truth are queried here.
export function compilePrivateTowerWorld({records,revision,generatedAt,sourceRef}){
  const items=[];const ids=new Set();
  for(const row of [...records.work,...records.tests,...records.hypotheses,...records.lessons]){
    const id=`nexo:${row._source_path||row.id}`;if(ids.has(id))continue;ids.add(id);
    const title=text(row.title||row.display_name||row.question||row.id);if(!title)continue;
    const due=row.due_at||row.dueAt;
    const item={id,kind:row.kind==='WORK'||row._source_path?.startsWith('entities/work/')?'ACTION':'ENTITY',title:title.slice(0,1000),source:'nexo',sourceRef,authority:'CANONICAL',sourceRevision:revision,sourcePath:row._source_path,observedAt:generatedAt,freshness:{state:'SNAPSHOT',observedAt:generatedAt,expiresAt:generatedAt},attention:'NOTICE',actions:[{id:'source',label:'Open canonical source',kind:'OPEN_SOURCE',url:sourceRef}],contextId:context(row),status:loopStatus(row)};
    if(text(row.summary||row.result_meaning))item.summary=text(row.summary||row.result_meaning);
    if(text(row.next_action||row.nextAction))item.nextAction=text(row.next_action||row.nextAction);
    if(typeof due==='string'&&Number.isFinite(Date.parse(due)))item.dueAt=due;
    if(text(row.priority))item.priority=text(row.priority).toUpperCase();
    items.push(item);
  }
  const present=Object.values(records.coverage||{}).some(value=>value.status==='PRESENT');
  const provider={id:'nexo',label:'Canonical Tower',status:present?'AVAILABLE':'UNAVAILABLE',lastSuccessAt:present?generatedAt:null,checkedAt:generatedAt,revision,message:present?'Private read-only canonical snapshot; unrelated external providers were not queried.':'Canonical entity collections are not present.',partial:!present,count:items.length};
  const truthGraphInput={authorityRows:[{domain:'NEXO',canonical_truth:records.control.truth_owner,operational_truth:records.writeModel||'',conflict_rule:records.control.conflict_rule||''}],capabilityRows:Object.entries(records.capabilities||{}).map(([id,row])=>({...row,capability_id:id})),refs:{authority:sourceRef,ssot:sourceRef}};
  const world=compile([{provider,items,truthGraphInput}],{now:Date.parse(generatedAt),access:'PRIVATE'});
  return {...world,source_revision:revision,source_coverage:records.coverage,unqueried_providers:['drive','gmail','calendar','github','vercel','atlas']};
}
