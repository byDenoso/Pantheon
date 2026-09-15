import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stable=(prefix,value,size=24)=>`${prefix}-${hash(value).slice(0,size).toUpperCase()}`;
const PERSONAL_KINDS=new Set(['Person','Message','Event','Document','Task','Commitment','Decision']);
const kindFor=item=>{
  if(PERSONAL_KINDS.has(item?.personalType))return item.personalType;
  if(item?.kind==='MESSAGE')return'Message';
  if(item?.kind==='EVENT')return'Event';
  if(item?.kind==='FILE')return'Document';
  if(item?.source==='nexo'&&item?.status)return'Task';
  return null;
};
const semanticEntity=entity=>({id:entity.id,kind:entity.kind,title:entity.title,status:entity.status,due_at:entity.due_at,end_at:entity.end_at,source:entity.source,payload:entity.payload,correlation_id:entity.correlation_id});
const semanticEvent=event=>({id:event.id,type:event.type,entity_id:event.entity_id,occurred_at:event.occurred_at,actor:event.actor,subject:event.subject,payload:event.payload,provenance:event.provenance,confidence:event.confidence,correlation_id:event.correlation_id});
const ordered=value=>[...value].sort((a,b)=>`${a.kind||a.type}:${a.id}`.localeCompare(`${b.kind||b.type}:${b.id}`));

function toEntity(item){
  const kind=kindFor(item);
  if(!kind||item?.contextId!=='PERSONAL')return null;
  const sourceId=String(item.id||'');
  const sourceRef=String(item.sourceRef||'');
  const source={provider:String(item.source||''),source_id:sourceId,source_ref:sourceRef,authority:String(item.authority||'UNKNOWN')};
  const id=stable('PCE',[kind,source.provider,sourceId]);
  return {
    id,kind,title:String(item.title||''),status:item.status||null,
    due_at:item.dueAt||null,end_at:item.endAt||null,
    source,
    payload:{summary:item.summary||null,attention:item.attention||'NOTICE'},
    correlation_id:stable('PCR',[source.provider,sourceId],20)
  };
}

function toObservation(entity,item){
  const occurredAt=item.observedAt||item.freshness?.observedAt||null;
  const provenance={provider:entity.source.provider,source_id:entity.source.source_id,source_ref:entity.source.source_ref,authority:entity.source.authority};
  const core={type:`${entity.kind.toUpperCase()}_OBSERVED`,entity_id:entity.id,occurred_at:occurredAt,actor:entity.source.provider,subject:entity.title,payload:{status:entity.status,due_at:entity.due_at,end_at:entity.end_at},provenance,confidence:['PROVIDER','CANONICAL'].includes(entity.source.authority)?1:0.8,correlation_id:entity.correlation_id};
  return {id:stable('PCEV',[core.type,core.entity_id,core.occurred_at,core.payload]),...core};
}

export function buildPersonalModel(world,{now=Date.now()}={}){
  const entities=[],events=[];
  for(const item of world?.items||[]){
    const entity=toEntity(item);if(!entity)continue;
    entities.push(entity);events.push(toObservation(entity,item));
  }
  const entityList=ordered(entities),eventList=ordered(events);
  return {version:'1',generated_at:new Date(now).toISOString(),source_world_fingerprint:world?.fingerprint||null,fingerprint:stable('PCM',[entityList.map(semanticEntity),eventList.map(semanticEvent)],40),entities:entityList,events:eventList};
}

const proposal=(kind,entityIds,evidence,detail)=>{
  const core={kind,entity_ids:[...entityIds].sort(),evidence:[...evidence].sort(),detail};
  return {id:stable('PCP',core),fingerprint:stable('PCPF',core,40),...core,policy:classifyPersonalProposal(core)};
};

export function proposePersonalActions(model,{now=Date.now()}={}){
  const out=[],events=(model?.entities||[]).filter(x=>x.kind==='Event'&&x.due_at&&x.end_at).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at)||a.id.localeCompare(b.id));
  for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
    const a=events[i],b=events[j],aStart=Date.parse(a.due_at),aEnd=Date.parse(a.end_at),bStart=Date.parse(b.due_at),bEnd=Date.parse(b.end_at);
    if(![aStart,aEnd,bStart,bEnd].every(Number.isFinite))continue;
    if(bStart>=aEnd)break;
    if(aStart<bEnd&&bStart<aEnd)out.push(proposal('REVIEW_CALENDAR_CONFLICT',[a.id,b.id],[a.source.source_ref,b.source.source_ref],`${a.title} overlaps ${b.title}`));
  }
  for(const entity of model?.entities||[]){
    if(!['Task','Commitment'].includes(entity.kind))continue;
    if(!['NEEDS_ME','BLOCKED'].includes(entity.status))continue;
    out.push(proposal('TRACK_PERSONAL_ITEM',[entity.id],[entity.source.source_ref],`${entity.title} is ${entity.status}`));
  }
  return out.sort((a,b)=>a.id.localeCompare(b.id)).map(x=>({...x,observed_at:new Date(now).toISOString()}));
}

export function classifyPersonalProposal(proposal={}){
  const kind=String(proposal.kind||'');
  if(kind==='OBSERVE')return {level:'L0',policy:'AUTO'};
  if(kind==='INFER')return {level:'L1',policy:'AUTO'};
  if(['REVIEW_CALENDAR_CONFLICT','TRACK_PERSONAL_ITEM'].includes(kind))return {level:'L2',policy:'AUTO'};
  if(['UPSERT_NEXO_TASK','UPSERT_NEXO_COMMITMENT'].includes(kind))return {level:'L3',policy:'AUTO'};
  if(['CREATE_GMAIL_DRAFT','CREATE_CALENDAR_EVENT'].includes(kind))return {level:'L4',policy:'APPROVAL_REQUIRED'};
  return {level:'L5',policy:'DENY'};
}

export function reconcilePersonalFollowUps(model,receipts=[],{now=Date.now()}={}){
  const verified=new Set((receipts||[]).filter(x=>x?.verified===true&&x?.closes_follow_up===true).map(x=>x.entity_id));
  return (model?.entities||[]).filter(x=>['Task','Commitment'].includes(x.kind)).map(entity=>({
    id:stable('PCF',[entity.id]),entity_id:entity.id,kind:entity.kind,title:entity.title,
    state:entity.status==='DONE'||verified.has(entity.id)?'CLOSED':'OPEN',status:entity.status||null,due_at:entity.due_at||null,
    checked_at:new Date(now).toISOString(),correlation_id:entity.correlation_id
  })).sort((a,b)=>a.id.localeCompare(b.id));
}
