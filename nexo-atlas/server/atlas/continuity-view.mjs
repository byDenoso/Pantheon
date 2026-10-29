import {normalizePrivateTower} from './private-tower-input.mjs';
import {cleanMemory} from '../../worker/memory.mjs';
import {createHash} from 'node:crypto';
import {canonical,record} from '../../worker/retrieval/python-json.mjs';
import {readSource as readVerifiedSource} from '../../worker/retrieval/source-producer.mjs';
import {readCanonicalDriveTowerBytes} from '../../worker/drive-source.mjs';
const ROOT='evolution/enxame/events/';
const ESSENTIAL=['question','null','rival','method','dataset_and_selection','success_criteria','kill_criteria','implementation'];
const DESIGN=['observable','likelihood','parameters_and_priors','statistic','threshold','multiplicity','attempts','systematics','degeneracies','null_expected','dependencies','cost'];
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const defined=v=>v!==undefined&&v!==null&&v!==''&&(!Array.isArray(v)||v.length>0)&&(!object(v)||Object.keys(v).length>0);
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{status});};
// Read the complete canonical bytes and verify each event with the same Python
// JSON contract as the Writer. Values are parsed lazily, including 1.0 and large
// integers, before the ordinary browser view is built. No second full lossless
// Tower is retained.
export async function verifiedContinuityTower(raw,options={}){
  const text=typeof raw==='string'?raw:raw.toString('utf8');
  const {envelope}=await readVerifiedSource(raw,options);
  const sourceHashes=new Map(),specHashes=new Map();
  const sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
  for(const path of envelope.fileRanges.keys()){
    if(path.startsWith(ROOT)){
      const entry=envelope.entry(path);
      const event=entry.value;
      if(!object(event)||createHash('sha256').update(canonical(record(Object.entries(event).filter(([key])=>key!=='sha256')))).digest('hex')!==event.sha256)fail('BOARD_CONTENT_INVALID');
      if(event.event_type==='SPEC')specHashes.set(event.event_id,sha(event.body.spec));
    }
  }
  const tower=JSON.parse(text);normalizePrivateTower(tower);
  for(const [path,entry]of Object.entries(tower.files)){
    const value=entry.value,refs=path.startsWith(ROOT)?value?.sources:value?.payload?.contract==='NEXO_CONTINUITY_V1'?value.payload.sources:[];
    for(const ref of refs||[]){if(sourceHashes.has(ref.path))continue;const source=envelope.entry(ref.path);sourceHashes.set(ref.path,source?.encoding==='json'?sha(source.value):null);}
  }
  Object.defineProperty(tower,'continuityIntegrity',{value:{sourceHashes,specHashes},enumerable:false});
  return tower;
}
export async function readContinuitySource({binding}={}){const {raw,transport}=await readCanonicalDriveTowerBytes(binding);return verifiedContinuityTower(raw,{transport});}
function gaps(spec){if(!spec)return [...ESSENTIAL,...DESIGN];const result=ESSENTIAL.filter(k=>!spec[k]),requirements=spec.requirements||{};for(const key of DESIGN){const r=requirements[key];if(!object(r)||!(r.status==='DEFINED'&&defined(r.value)||r.status==='NOT_APPLICABLE'&&typeof r.reason==='string'&&r.reason.trim()))result.push(key);}for(const [k,r]of Object.entries(requirements))if(!DESIGN.includes(k)&&r?.required===true&&!r.value)result.push(k);return [...new Set([...result,...(Array.isArray(spec.gaps)?spec.gaps:['gaps'])])].sort();}
export function deriveBoard(events,now=Date.now()){
  const cards=new Map();let previous=null,closed=false;
  for(let n=0;n<events.length;n++){
    const e=events[n];if(e.contract!=='NEXO_ENXAME_V1'||e.sequence!==n+1||e.previous_hash!==previous||!/^([a-f0-9]{64})$/.test(e.sha256))fail('BOARD_SEQUENCE_INVALID');previous=e.sha256;
    if(e.event_type==='FIM'){closed=true;continue;}
    if(!e.card_id)continue;
    const b=e.body||{},kind=e.event_type;
    if(['CLAIM','EMERGENTE'].includes(kind)){if(cards.has(e.card_id))fail('BOARD_CARD_CONFLICT');cards.set(e.card_id,{id:e.card_id,claim:b.claim,scope_id:e.scope_id,scope_version:e.scope_version,sources:e.sources,origin:e.event_id,emergent:kind==='EMERGENTE',classification:b.classification,legacy_test_ref:b.legacy_test_ref,spec:null,spec_version:0,endorsements:{},objections:{},conflicts:{},links:[],signals:[],freeze:null,registration:null,last_material_at:e.applied_at,last_material_event:e.event_id});}
    const c=cards.get(e.card_id);if(!c)fail('BOARD_CARD_MISSING');let material=false;
    if(kind==='SPEC'){c.spec=b.spec;c.spec_version=e.spec_version;c.endorsements={};c.freeze=null;material=true;}
    if(kind==='OBJECAO'){c.objections[e.event_id]={author:e.role,text:b.text,spec_version:e.spec_version,response:null,resolved:false};material=true;}
    if(kind==='RESPOSTA'){if(!c.objections[b.objection_id])fail('BOARD_OBJECTION_MISSING');c.objections[b.objection_id].response={event_id:e.event_id,text:b.text,spec_version:e.spec_version,sources:e.sources};material=true;}
    if(kind==='ENDOSSO'){for(const id of b.resolves||[]){if(!c.objections[id])fail('BOARD_OBJECTION_MISSING');c.objections[id].resolved=true;}c.endorsements[e.role]={event_id:e.event_id,spec_version:e.spec_version};material=true;}
    if(kind==='CONFLITO'){if(b.resolves){if(!c.conflicts[b.resolves])fail('BOARD_CONFLICT_MISSING');c.conflicts[b.resolves].resolved=true;}else c.conflicts[e.event_id]={author:e.role,text:b.text,resolved:false};material=true;}
    if(kind==='LINK'){c.links.push({event_id:e.event_id,...b});material=true;}
    if(kind==='SINAL')c.signals.push({event_id:e.event_id,at:e.applied_at,...b});
    if(kind==='FREEZE'){c.freeze={event_id:e.event_id,spec_version:e.spec_version,spec_sha256:b.spec_sha256};material=true;}
    if(kind==='REGISTRO'){c.registration={event_id:e.event_id,...b};material=true;}
    if(material){c.last_material_at=e.applied_at;c.last_material_event=e.event_id;}
  }
  for(const c of cards.values()){
    c.gaps=gaps(c.spec);c.open_objections=Object.entries(c.objections).filter(([,v])=>!v.resolved).map(([k])=>k);c.open_conflicts=Object.entries(c.conflicts).filter(([,v])=>!v.resolved).map(([k])=>k);
    const roles=new Set(Object.keys(c.endorsements));c.quorum=roles.has('A3')&&(roles.has('A1')||roles.has('A4'))&&!c.gaps.length&&!c.open_objections.length&&!c.open_conflicts.length;
    c.state=c.registration||c.legacy_test_ref?'REGISTRADO':c.classification==='NAO_TESTAVEL'?'NAO_TESTAVEL':c.open_objections.length||c.open_conflicts.length?'CONTESTADO':c.freeze?'CONGELADO':c.quorum?'ENDOSSADO':c.spec?'ESPECIFICADO':'ABERTO';
    c.next_owner=c.gaps.length?'A2':c.open_objections.length||!roles.has('A3')?'A3':c.open_conflicts.length?'A4':!roles.has('A1')&&!roles.has('A4')?'A1':'A5';
    c.pressure=c.freeze?0:c.signals.reduce((sum,s)=>sum+Number(s.weight??1)*2**(-Math.max(0,now-Date.parse(s.at))/86400000),0);
    c.stale=!['REGISTRADO','NAO_TESTAVEL'].includes(c.state)&&now-Date.parse(c.last_material_at)>7200000;
  }
  return {cards:[...cards.values()],head:previous,closed};
}
function projectViews(records){
  const groups=new Map();for(const row of records){if(row.kind!=='NEXO_PROJECT_EVENT')continue;const key=JSON.stringify([row.payload.scope,row.payload.project_id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups.values()].map(rows=>{rows.sort((a,b)=>a.payload.sequence-b.payload.sequence);let previous=null;for(let n=0;n<rows.length;n++){if(rows[n].payload.sequence!==n+1||rows[n].payload.expected_previous!==previous)fail('PROJECT_HISTORY_INVALID');previous=rows[n].id;}const last=rows.at(-1),p=last.payload;return {id:p.project_id,scope:p.scope,title:p.title,action:p.action,text:p.text,next_action:p.next_action||null,owner:p.owner||null,depends_on:p.depends_on||[],decision:p.action==='DECISION_REQUIRED'?p.decision:null,updated_at:p.recorded_at,last_event_id:last.id,history:rows.map(r=>({id:r.id,...r.payload})),deliveries:rows.filter(r=>r.payload.action==='DELIVERY').map(r=>({id:r.id,...r.payload}))};});
}
export function continuityView(tower,body={},now=Date.now()){
  normalizePrivateTower(tower);
  if(!object(body)||Object.keys(body).some(k=>!['scope','view','offset','limit','expected_revision','since'].includes(k)))fail('CONTINUITY_REQUEST_INVALID',400);
  if(body.expected_revision&&body.expected_revision!==tower.revision)fail('SOURCE_REVISION_CHANGED');
  const scope=body.scope||'SCIENCE',view=body.view||'overview',offset=body.offset??0,limit=body.limit??50;
  if(!/^(SCIENCE|WORK|PERSONAL|CLIENT:[A-Za-z0-9_-]{1,80})$/.test(scope)||!['overview','board','memory'].includes(view)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('CONTINUITY_REQUEST_INVALID',400);
  if(offset&&!body.expected_revision)fail('PAGINATION_REVISION_REQUIRED',400);
  if(body.since&&(!Number.isFinite(Date.parse(body.since))||Date.parse(body.since)>now))fail('CONTINUITY_SINCE_INVALID',400);
  const records=[],events=[],groups=new Map();
  for(const [path,entry]of Object.entries(tower.files||{})){
    const v=entry?.value;if(!object(v))continue;
    if(path.startsWith(ROOT)){if(v.contract!=='NEXO_ENXAME_V1'||v.private!==true||!Array.isArray(v.allowed_roles)||v.allowed_roles.length)fail('PRIVATE_BOARD_INVALID');events.push({...cleanMemory(v),source_path:path});}
    if(['NEXO_MEMORY_ENTRY','NEXO_PROJECT_EVENT'].includes(v.kind)&&v.payload?.contract==='NEXO_CONTINUITY_V1'&&v.payload.scope===scope){if(v.private!==true||!Array.isArray(v.allowed_roles)||v.allowed_roles.length)fail('PRIVATE_MEMORY_INVALID');records.push(cleanMemory(v));}
  }
  for(const e of events){const key=JSON.stringify([e.scope_id,e.scope_version]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
  const protocols=scope==='SCIENCE'?[...groups.values()].map(rows=>{rows.sort((a,b)=>a.sequence-b.sequence);return {scope_id:rows[0].scope_id,scope_version:rows[0].scope_version,...deriveBoard(rows,now)};}):[];
  const cards=protocols.flatMap(p=>p.cards),projects=projectViews(records),memory=records.filter(r=>r.kind==='NEXO_MEMORY_ENTRY').map(r=>({id:r.id,...r.payload}));
  const proof=refs=>(refs||[]).map(r=>({...r,current_source_revision:tower.revision,current_status:tower.continuityIntegrity?(!tower.continuityIntegrity.sourceHashes.get(r.path)?'MISSING':tower.continuityIntegrity.sourceHashes.get(r.path)===r.sha256?'UNCHANGED':'SOURCE_CHANGED'):'UNVERIFIED_INPUT'}));
  for(const e of events)e.source_readback=proof(e.sources);
  for(const r of memory)r.source_readback=proof(r.sources);
  for(const c of cards){
    const testPath=c.registration?.test_id?'entities/test/'+c.registration.test_id+'.json':c.legacy_test_ref;
    if(testPath){const test=tower.files[testPath]?.value;if(!object(test)||test.kind!=='TEST'||c.registration&&test.enxame?.spec_sha256!==c.freeze?.spec_sha256)fail('REGISTERED_TEST_SOURCE_MISMATCH');c.current_test={path:testPath,source_revision:tower.revision,entity_version:test.entity_version,id:test.id,status:test.status,recipe:test.recipe,recipe_params:test.recipe_params,data_binding:cleanMemory(test.data_binding),preparation:cleanMemory(test.preparation),readiness:cleanMemory(test.readiness),execution_phase:test.execution_phase,attempt_id:test.attempt_id,battery_id:test.battery_id,review_state:test.review_state,scientific_evidence:cleanMemory(test.scientific_evidence)};}
    c.source_readback=proof(c.sources);
    if(c.spec){const specEvent=events.filter(e=>e.card_id===c.id&&e.scope_id===c.scope_id&&e.scope_version===c.scope_version&&e.event_type==='SPEC').at(-1);c.spec_sha256=tower.continuityIntegrity?.specHashes.get(specEvent?.event_id)||null;}
  }
  const replaced=new Set(memory.map(r=>r.supersedes_record_id).filter(Boolean));for(const r of memory){r.current=!replaced.has(r.id)&&(!r.valid_until||Date.parse(r.valid_until)>now)&&(!r.valid_from||Date.parse(r.valid_from)<=now);r.history=memory.filter(h=>h.id===r.supersedes_record_id||h.supersedes_record_id===r.id).map(h=>h.id);}
  const selectedEvents=scope==='SCIENCE'?events.sort((a,b)=>a.scope_id.localeCompare(b.scope_id)||a.scope_version-b.scope_version||a.sequence-b.sequence):[];
  const source=view==='board'?selectedEvents:view==='memory'?memory:projects;
  const timeline=[...selectedEvents.map(e=>({id:e.event_id,at:e.applied_at,kind:e.event_type,text:e.body.text||e.body.claim||e.body.rationale||e.body.spec?.question||null,scope_id:e.scope_id,card_id:e.card_id,source_path:e.source_path})),...records.map(r=>({id:r.id,at:r.payload.recorded_at,kind:r.payload.action||r.payload.category,text:r.payload.text,scope:r.payload.scope}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return {contract:'NEXO_PRIVATE_CONTINUITY_VIEW_V1',access:'OWNER_PRIVATE',available:true,source_revision:tower.revision,source_id:tower.stable_file_id,scope,view,observed_at:new Date(now).toISOString(),source_updated_at:tower.updated_at,writer:{authority:'EXISTING_TOWER_WRITER',browser_write_enabled:false},logical_roles_one_owner:true,projects,cards,protocols:protocols.map(({cards,...p})=>({...p,card_count:cards.length})),memory:memory.filter(r=>r.current),decisions:projects.filter(p=>p.decision),deliveries:projects.flatMap(p=>p.deliveries),timeline:timeline.filter(e=>!body.since||Date.parse(e.at)>Date.parse(body.since)).slice(0,100),timeline_total:timeline.filter(e=>!body.since||Date.parse(e.at)>Date.parse(body.since)).length,items:source.slice(offset,offset+limit),total:source.length,offset,next_offset:offset+limit<source.length?offset+limit:null,events_total:selectedEvents.length,source_complete:true};
}
