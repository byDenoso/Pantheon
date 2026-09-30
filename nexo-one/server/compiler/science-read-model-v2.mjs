import {createHash} from 'node:crypto';
import {buildScienceProjectionV1,towerSourceRef} from '../../scripts/science-projection-v1.mjs';

export const SCIENCE_READ_MODEL_V2_CONTRACT='NEXO_SCIENCE_READ_MODEL_V2';
export const ACTIVITY_LEDGER_CONTRACT='NEXO_ACTIVITY_LEDGER_V1';

const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase().replace(/[\s-]+/g,'_');
const arr=value=>Array.isArray(value)?value:[];
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()&&Number.isFinite(Number(value))?Number(value):undefined;
const strings=value=>arr(value).map(text).filter(Boolean);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const fingerprint=value=>`sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;

export const isPublicResearchRecord=row=>Boolean(row)&&row.private!==true&&row.visibility!=='PRIVATE'&&!/(OLYMPUS|CLIENT|PERSON|PRIVATE)/i.test([row.thread_id,row.domain,row.semantic?.domain_id].map(text).join(' '));

function towerRows(snapshot){
  const p=snapshot.projection,m=snapshot.manifest;
  const clean={...p,campaigns:arr(p.campaigns).filter(isPublicResearchRecord),hypotheses:arr(p.hypotheses).filter(isPublicResearchRecord),tests:arr(p.tests).filter(isPublicResearchRecord)};
  const v1=buildScienceProjectionV1({projection:clean,manifest:m});
  const originals=new Map([...clean.tests,...clean.hypotheses].map(row=>[row.id,row]));
  const work=[];
  for(const [kind,records] of [['HYPOTHESIS',v1.hypotheses],['TEST',v1.tests]])for(const row of records){
    work.push({work_id:row.id,kind,thread_id:'THR::SCIENCE::ROOT',title:originals.get(row.id)?.title||row.title?.value||row.id,question:row.question?.value||row.statement?.value,status:row.status?.value,primary_campaign:row.campaign_id?.value,source_ref:row.source_ref});
  }
  for(const row of arr(p.work).filter(isPublicResearchRecord)){
    if(['RUN','RESULT','EVIDENCE','CLAIM','DECISION','KNOWLEDGE','PIPELINE'].includes(upper(row.kind)))work.push({...row,work_id:row.id,thread_id:'THR::SCIENCE::ROOT',primary_campaign:row.campaign_id,source_ref:towerSourceRef(m,`TOWER_V06/projections/public/projection.json#work/${encodeURIComponent(row.id)}`)});
  }
  return {
    work,rows:[
      ...arr(p.programs).filter(isPublicResearchRecord).map(row=>({...row,record_type:'program',record_id:row.program_id||row.id})),
      ...v1.campaigns.map(row=>({record_type:'campaign',record_id:row.id,title:row.title.value,question:row.question.value,status:row.status.value,source_ref:row.source_ref})),
      ...arr(p.observations).filter(isPublicResearchRecord)
    ],v1
  };
}

function scienceProjection(snapshot){return arr(snapshot?.projections?.Science).filter(isPublicResearchRecord);}
function scienceWork(snapshot){return arr(snapshot?.sections?.WORK).filter(row=>text(row?.thread_id)==='THR::SCIENCE::ROOT');}
function provenance(snapshot,sourceRef=''){
  return [{authority:snapshot?.authority||'GOOGLE_DRIVE',source:snapshot?.projection?'TOWER_V06':'NEXO_SSOT',projectionAuthority:snapshot?.projection?'DERIVED_FROM_TOWER':'DERIVED_FROM_SSOT',sourceRef:text(sourceRef)||(snapshot?.manifest?towerSourceRef(snapshot.manifest,'TOWER_V06/projections/public/projection.json'):undefined),modifiedAt:text(snapshot?.sourceModifiedAt)||undefined,sourceVersion:snapshot?.sourceVersion||undefined,projectionFingerprint:snapshot?.projection?snapshot.fingerprint:undefined}];
}
function publicRecord(row,fallbackType){
  const id=text(row?.work_id||row?.record_id||row?.id);
  if(!id)return null;
  return {
    id,
    type:upper(row?.kind||row?.record_type||row?.type)||fallbackType,
    label:text(row?.title||row?.question)||id,
    status:text(row?.status)||undefined,
    primaryCampaign:text(row?.primary_campaign||row?.primaryCampaign)||undefined,
    testId:text(row?.test_id||row?.testId)||undefined,
    domains:strings(row?.domains).length?strings(row?.domains):text(row?.domain)?[text(row.domain)]:[],
    summary:text(row?.summary||row?.question)||undefined,
    keyMetrics:text(row?.key_metrics||row?.keyMetrics)||undefined,
    evidenceClass:text(row?.evidence_class||row?.evidenceClass)||undefined,
    updatedAt:text(row?.updated_at||row?.updatedAt)||undefined,
    sourceRef:text(row?.source_ref||row?.sourceRef)||undefined,
    provenance:provenance(null,row?.source_ref||row?.sourceRef)
  };
}
function explicitObservation(row,snapshot){
  const metricId=text(row?.metric_id||row?.metricId);
  const id=text(row?.observation_id||row?.observationId||row?.record_id||row?.id);
  const kind=text(row?.observation_kind||row?.observationKind||row?.kind).toLowerCase();
  if(!id||!metricId||!['scalar','interval','distribution','directional','timeseries','matrix','categorical'].includes(kind))return null;
  const rawValue=row?.value??row?.metric_value??row?.metricValue;
  const value=typeof rawValue==='boolean'||typeof rawValue==='string'?rawValue:number(rawValue);
  const low=number(row?.uncertainty_low??row?.uncertaintyLow),high=number(row?.uncertainty_high??row?.uncertaintyHigh),sigma=number(row?.sigma);
  const uncertainty=low!==undefined||high!==undefined||sigma!==undefined||text(row?.confidence_level||row?.confidenceLevel)?{low,high,sigma,confidenceLevel:text(row?.confidence_level||row?.confidenceLevel)||undefined}:undefined;
  return {
    id,metricId,label:text(row?.label||row?.title)||metricId,kind,value,unit:text(row?.unit)||undefined,uncertainty,
    stackId:text(row?.stack_id||row?.stackId)||undefined,stackLabel:text(row?.stack_label||row?.stackLabel)||undefined,
    datasets:strings(row?.datasets),model:text(row?.model)||undefined,programId:text(row?.program_id||row?.programId)||undefined,campaignId:text(row?.campaign_id||row?.campaignId)||undefined,
    testId:text(row?.test_id||row?.testId)||undefined,domains:strings(row?.domains).length?strings(row?.domains):text(row?.domain)?[text(row.domain)]:[],status:text(row?.status)||undefined,
    evidenceClass:text(row?.evidence_class||row?.evidenceClass)||undefined,sourceRef:text(row?.source_ref||row?.sourceRef)||undefined,observedAt:text(row?.observed_at||row?.observedAt)||undefined,
    provenance:provenance(snapshot,row?.source_ref||row?.sourceRef),ra:number(row?.ra),dec:number(row?.dec),points:arr(row?.points),matrix:arr(row?.matrix),categories:strings(row?.categories)
  };
}

export function buildScienceReadModelV2(snapshot){
  const tower=snapshot?.projection?towerRows(snapshot):null;
  const rows=tower?.rows||scienceProjection(snapshot),work=tower?.work||scienceWork(snapshot);
  const programs=rows.filter(row=>upper(row?.record_type||row?.type)==='PROGRAM').map(row=>({
    id:text(row.record_id||row.id),type:'PROGRAM',label:text(row.title)||text(row.record_id||row.id),status:text(row.status)||undefined,domain:text(row.domain)||undefined,summary:text(row.summary)||undefined
  })).filter(row=>row.id);
  const campaigns=rows.filter(row=>upper(row?.record_type||row?.type)==='CAMPAIGN').map(row=>({
    id:text(row.record_id||row.id),type:'CAMPAIGN',label:text(row.title)||text(row.record_id||row.id),programId:text(row.program_id||row.programId)||undefined,status:text(row.status)||undefined,
    summary:text(row.summary)||undefined,question:text(row.question)||undefined,facets:strings(row.domains).length?strings(row.domains):text(row.domain)?[text(row.domain)]:[],
    declaredTestCount:number(row.declared_test_count??row.declaredTestCount),observedTestCount:number(row.observed_test_count??row.observedTestCount)
  })).filter(row=>row.id);
  const facetCodes=[...new Set(campaigns.flatMap(row=>row.facets))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const facets=facetCodes.map(code=>{
    const members=campaigns.filter(row=>row.facets.includes(code));
    return {id:`facet:${code}`,code,label:code,type:'FACET',campaignIds:members.map(row=>row.id),question:members.find(row=>row.question)?.question,status:members.length&&members.every(row=>row.status===members[0].status)?members[0].status:undefined};
  });
  const edges=[];
  for(const program of programs)edges.push({id:`contains:system:SCIENCE:${program.id}`,source:'system:SCIENCE',target:program.id,type:'CONTAINS'});
  for(const campaign of campaigns){if(campaign.programId&&programs.some(program=>program.id===campaign.programId))edges.push({id:`contains:${campaign.programId}:${campaign.id}`,source:campaign.programId,target:campaign.id,type:'CONTAINS'});}
  const lane=kind=>work.filter(row=>upper(row.kind)===kind).map(row=>publicRecord(row,kind)).filter(Boolean).map(row=>({...row,provenance:provenance(snapshot,row.sourceRef)}));
  const observations=rows.map(row=>explicitObservation(row,snapshot)).filter(Boolean);
  const comparisons=[];
  const syntheses=[];
  const activity={contract:ACTIVITY_LEDGER_CONTRACT,state:snapshot?'READY':'DATA_UNAVAILABLE',items:snapshot?.projection?arr(snapshot.projection.activity).filter(isPublicResearchRecord).map(row=>({at:text(row.at),eventType:text(row.event_type),role:text(row.role)})):[]};
  const core={
    contract:SCIENCE_READ_MODEL_V2_CONTRACT,state:snapshot?'READY':'DATA_UNAVAILABLE',sourceVersion:text(snapshot?.sourceVersion||snapshot?.sourceModifiedAt),freshness:snapshot?.generatedAt?'SNAPSHOT':'DEGRADED',
    structure:{programs,campaigns,facets,edges},observations,comparisons,syntheses,
    investigation:{hypotheses:lane('HYPOTHESIS'),claims:lane('CLAIM'),tests:lane('TEST'),runs:lane('RUN'),results:lane('RESULT'),evidence:lane('EVIDENCE'),decisions:lane('DECISION'),knowledge:lane('KNOWLEDGE'),pipelines:lane('PIPELINE')},
    activity:activity.items,shards:[],provenance:provenance(snapshot)
  };
  return {...core,generatedAt:text(snapshot?.generatedAt),fingerprint:fingerprint(core),authority:snapshot?.authority||'GOOGLE_DRIVE',projectionFingerprint:snapshot?.projection?snapshot.fingerprint:undefined,scienceProjection:tower?.v1};
}

export function buildScienceChanges(snapshot,model=buildScienceReadModelV2(snapshot)){
  return {contract:ACTIVITY_LEDGER_CONTRACT,state:model.state,sourceVersion:model.sourceVersion,fingerprint:fingerprint({contract:ACTIVITY_LEDGER_CONTRACT,items:model.activity}),scienceFingerprint:model.fingerprint,projectionFingerprint:model.projectionFingerprint,freshness:model.freshness,authority:model.authority,generatedAt:model.generatedAt,items:model.activity,provenance:model.provenance};
}

const modelCache=new Map();
export function scienceModelFor(snapshot,{onCache}={}){
  const key=snapshot?.fingerprint?`${snapshot.authority||''}|${snapshot.sourceVersion||snapshot.sourceModifiedAt||''}|${snapshot.fingerprint}`:'';
  if(!key){onCache?.('MISS');return buildScienceReadModelV2(snapshot);}
  let model=modelCache.get(key);onCache?.(model?'HIT':'MISS');
  if(!model){model=buildScienceReadModelV2(snapshot);modelCache.set(key,model);while(modelCache.size>4)modelCache.delete(modelCache.keys().next().value);}
  return {...model,generatedAt:text(snapshot?.generatedAt)};
}
