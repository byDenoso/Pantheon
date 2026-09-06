import {mergeGraph,CANON,DERIVED,automationKind} from './model.mjs';

const PREFIX={TEST:'test',CAMPAIGN:'campaign',HYPOTHESIS:'claim',DECISION_HYPOTHESIS:'claim',CLAIM:'claim',PUBLICATION:'publication',RESULT:'result',DATASET:'dataset',MODEL:'model',PROBE:'probe'};
const LEARNING_TABLES=[['observations','OBSERVATION','observation_id'],['patterns','PATTERN','pattern_id'],['lessons','LESSON','lesson_id'],['strategies','STRATEGY','strategy_id'],['policies','POLICY','policy_id']];
const gid=(type,id)=>`${PREFIX[type]||String(type||'entity').toLowerCase()}:${id}`;
const sourceRef=(kind,id,ref)=>({source:kind,sourceId:id,sourceRef:ref||''});
const isPublicationLifecycle=e=>e.entity_type==='PUBLICATION'||(e.entity_type==='TEST'&&(/^T-PAPER-|^ASCOM-/i.test(e.entity_id)||/^Publication\b/i.test(e.legacy_lane_raw||'')));
const learningId=(kind,id)=>`learning:${String(kind||'item').toLowerCase()}:${id}`;

/** Read-only Atlas projection after the scientific cutover.
 * science_v1 owns scientific truth. learning_v1 owns procedural learning.
 * Legacy lane/domain strings are metadata only; navigation domains come from
 * entity_domains, which prevents ID/token collisions from becoming science. */
export function adaptCanonical(science={},learning={},ops=null){
  const nodes=new Map(),edges=[],issues=[];
  const add=n=>{if(n?.id)nodes.set(n.id,n);return n?.id};
  const edge=(source,target,type='CONTAINS',authority=DERIVED,extra={})=>edges.push({id:`${source}:${type}:${target}`,source,target,type,authority,...extra});

  add({id:'system:NEXO',type:'SYSTEM',label:'NEXO',summary:'Unified Cognitive Infrastructure · Atlas is a read-only projection.',authority:DERIVED});
  for(const [id,label] of [['SCIENCE','Science'],['ENGINEERING','Engineering'],['OLYMPUS','Olympus'],['AUTOMATION','Black Box'],['LEARNING','Learning'],['ARTIFACTS','Arquivos']]){
    add({id:'system:'+id,type:'SYSTEM',label,authority:DERIVED}); edge('system:NEXO','system:'+id);
  }

  const domainById=new Map();
  for(const d of science.domains||[]){
    const id='domain:'+d.domain_id; domainById.set(d.domain_id,d);
    add({id,type:'DOMAIN',label:d.name||d.code||d.domain_id,domain:d.domain_id,summary:d.description||'',status:d.status||'',authority:CANON,metadata:d});
    edge('system:SCIENCE',id,'CONTAINS',DERIVED);
  }

  const display=new Map((science.entity_display||[]).map(x=>[x.entity_id,x]));
  const memberships=new Map();
  for(const m of science.entity_domains||[]){if(!memberships.has(m.entity_id))memberships.set(m.entity_id,[]);memberships.get(m.entity_id).push(m)}
  const graphIdByEntity=new Map();

  for(const e of science.entities||[]){
    const all=(memberships.get(e.entity_id)||[]).filter(m=>m.confidence!=='UNRESOLVED');
    const primary=all.find(m=>m.role==='PRIMARY');
    const domains=[...new Set(all.map(m=>m.domain_id))];
    const pub=isPublicationLifecycle(e);
    const unresolved=!primary&&!pub&&['TEST','HYPOTHESIS','DECISION_HYPOTHESIS','CAMPAIGN'].includes(e.entity_type);
    const id=gid(e.entity_type,e.entity_id); graphIdByEntity.set(e.entity_id,id);
    const disp=display.get(e.entity_id);
    add({id,type:['DECISION_HYPOTHESIS','HYPOTHESIS'].includes(e.entity_type)?'CLAIM':e.entity_type,subtype:e.entity_type,label:disp?.display_label||e.title||e.entity_id,summary:e.summary||e.title||'',status:e.status||'',domain:primary?.domain_id||(unresolved?'UNMAPPED':''),domains,authority:CANON,updatedAt:e.updated_at||e.imported_at||e.created_at||'',projectionClass:pub?'PUBLICATION_LIFECYCLE':'SCIENCE',sourceRefs:[sourceRef('NEON','science_v1',e.source_row_key||e.source_surface)],metadata:{...e,display:disp,domain_memberships:all}});
    if(primary&&domainById.has(primary.domain_id)) edge('domain:'+primary.domain_id,id,'CONTAINS',DERIVED,{mappingBasis:primary.mapping_basis,confidence:primary.confidence});
    else if(pub) edge('system:SCIENCE',id,'CONTAINS',DERIVED,{projectionClass:'PUBLICATION_LIFECYCLE'});
    else if(unresolved) issues.push({id:`domain:${e.entity_id}`,reason:'UNRESOLVED_DOMAIN',source:id,missing:'PRIMARY_DOMAIN'});
  }

  for(const r of science.relations||[]){
    const from=graphIdByEntity.get(r.from_entity_id),to=graphIdByEntity.get(r.to_entity_id);
    if(!from||!to){issues.push({id:r.relation_id||`${r.from_entity_id}:${r.relation_type}:${r.to_entity_id}`,reason:'UNRESOLVED_ENDPOINT',source:from||r.from_entity_id,target:to||r.to_entity_id,missing:from?(to||r.to_entity_id):(from||r.from_entity_id)});continue}
    if(r.relation_type==='PART_OF_CAMPAIGN') edge(to,from,'CONTAINS',DERIVED,{sourceRef:r.source_ref,canonicalRelation:r.relation_id});
    else if(r.relation_type==='PRODUCES_RESULT') edge(from,to,'PRODUCES',CANON,{sourceRef:r.source_ref});
    else edge(from,to,r.relation_type||'ASSOCIATED_WITH',CANON,{sourceRef:r.source_ref,evidenceClass:r.evidence_class,status:r.status});
  }

  for(const a of science.assets||[]){
    const id='asset:'+a.asset_id;
    add({id,type:/DATASET/i.test(a.origin||'')?'DATASET':'ARTIFACT',label:a.display_name||a.asset_id,summary:a.origin||'',status:'',authority:a.authority||CANON,url:a.uri||'',updatedAt:a.observed_at||a.imported_at||'',sourceRefs:[sourceRef('NEON','science_v1.assets',a.asset_id)],metadata:a});
    edge('system:ARTIFACTS',id,'CONTAINS',DERIVED);
  }
  for(const ea of science.entity_assets||[]){const from=graphIdByEntity.get(ea.entity_id),to='asset:'+ea.asset_id;if(from&&nodes.has(to))edge(from,to,ea.relation_type||'PRODUCES',CANON)}

  for(const stage of LEARNING_TABLES.map(x=>x[1])){const sid='learning-stage:'+stage;add({id:sid,type:'LEARNING_STAGE',label:stage[0]+stage.slice(1).toLowerCase(),subtype:stage,stage,authority:DERIVED});edge('system:LEARNING',sid)}
  const learningGraphIds=new Map();
  for(const [table,stage,key] of LEARNING_TABLES){
    for(const row of learning[table]||[]){
      const rawId=row[key]; if(!rawId)continue;
      const id=learningId(stage,rawId); learningGraphIds.set(`${stage}:${rawId}`,id);
      const label=row.title||row.event_type||rawId;
      const summary=row.summary||row.description||row.statement||'';
      const status=row.status||row.outcome||'';
      const evidence=row.evidence_json||row.source_payload||{};
      add({id,type:'LEARNING_RELATION',subtype:stage,stage,label,summary,status,domain:row.domain||'',authority:DERIVED,confidence:row.confidence_score==null?null:Number(row.confidence_score),updatedAt:row.updated_at||row.last_seen_at||row.observed_at||row.created_at||'',sourceRefs:[sourceRef('NEON',`learning_v1.${table}`,rawId)],metadata:{...row,evidence_refs:JSON.stringify(evidence)}});
      edge('learning-stage:'+stage,id,'CONTAINS',DERIVED);
    }
  }
  const kindToStage={OBSERVATION:'OBSERVATION',OBSERVATIONS:'OBSERVATION',PATTERN:'PATTERN',PATTERNS:'PATTERN',LESSON:'LESSON',LESSONS:'LESSON',STRATEGY:'STRATEGY',STRATEGIES:'STRATEGY',POLICY:'POLICY',POLICIES:'POLICY'};
  for(const l of learning.links||[]){
    const fs=kindToStage[String(l.from_kind||'').toUpperCase()],ts=kindToStage[String(l.to_kind||'').toUpperCase()];
    const from=fs&&learningGraphIds.get(`${fs}:${l.from_id}`),to=ts&&learningGraphIds.get(`${ts}:${l.to_id}`);
    if(from&&to)edge(from,to,l.relation_type||'DERIVED_FROM',DERIVED,{sourceRef:l.source_id});
  }

  for(const name of ['NEXO Continuity','NEXO Scientific Core','NEXO Executor']){add({id:'automation:'+name,type:'AUTOMATION',label:name,authority:'OPERATIONAL_CANONICAL'});edge('system:AUTOMATION','automation:'+name)}
  for(const ev of ops?.model?.events||[]){const kind=automationKind(ev.actor||''),name=/continuity/i.test(ev.actor)?'NEXO Continuity':/scientific core/i.test(ev.actor)?'NEXO Scientific Core':/executor/i.test(ev.actor)?'NEXO Executor':ev.actor||'Outro';const aid='automation:'+name;if(!nodes.has(aid)){add({id:aid,type:'AUTOMATION',label:name,status:kind==='LEGACY'?'LEGACY':'',authority:DERIVED});edge('system:AUTOMATION',aid)}const id='event:'+ev.id;add({id,type:'AUTOMATION_RUN',label:ev.runId||ev.id,status:ev.rawStatus||ev.status,domain:ev.domain,summary:ev.outcome||ev.blocker,updatedAt:ev.timestamp,authority:DERIVED,sourceRefs:ev.provenance?[ev.provenance]:[],metadata:ev});edge(aid,id,'EXECUTED_AS');if(['ENGINEERING','OLYMPUS'].includes(ev.domain))edge('system:'+ev.domain,id)}

  for(const mi of science.migration_issues||[])if(mi.status==='OPEN')issues.push({id:mi.issue_id,reason:mi.issue_type||'MIGRATION_ISSUE',source:graphIdByEntity.get(mi.entity_id)||mi.entity_id||mi.source_key,missing:mi.raw_value||'',detail:mi.detail,severity:mi.severity});
  const g=mergeGraph({nodes:[...nodes.values()],edges});
  g.issues.push(...issues);
  return g;
}
