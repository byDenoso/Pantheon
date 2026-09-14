import {createHash} from 'node:crypto';
import {buildH0StackProjection} from './h0-stack-projection.mjs';

const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const upper=value=>text(value).toUpperCase();
const sha256=value=>`sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const provenance=(sourceRef,sourceVersion)=>[{source:'GOOGLE_DRIVE',...(text(sourceRef)?{sourceRef:text(sourceRef)}:{}),...(text(sourceVersion)?{sourceVersion:text(sourceVersion)}:{})}];

function sourceVersionOf(scienceIndex){return text(scienceIndex?.sourceVersion||scienceIndex?.sourceModifiedAt||scienceIndex?.generatedAt);}
function campaignQuestion(row){
  const source=text(row?.question||row?.summary);
  const match=source.match(/(?:^|\s)Pergunta:\s*(.*?)(?:\s+Mecanismo:|$)/i);
  return text(match?.[1]||row?.question);
}
function publicTest(raw,domain,sourceVersion){
  const domains=[...new Set([...arr(raw?.domains).map(text),text(domain)].filter(Boolean))];
  return {
    id:text(raw?.id),type:'TEST',label:text(raw?.label||raw?.title||raw?.id),status:text(raw?.status)||undefined,
    primaryCampaign:text(raw?.primaryCampaign||raw?.primary_campaign)||undefined,domains,
    summary:text(raw?.summary)||undefined,keyMetrics:text(raw?.keyMetrics||raw?.key_metrics)||undefined,
    evidenceClass:text(raw?.evidenceClass||raw?.evidence_class)||undefined,
    updatedAt:text(raw?.lastVerified||raw?.last_verified||raw?.updatedAt||raw?.updated_at)||undefined,
    sourceRef:text(raw?.sourceRef||raw?.source_ref)||undefined,
    provenance:provenance(raw?.sourceRef||raw?.source_ref||'PEER_CONTROL_TOWER_CANONICAL/Test Registry',sourceVersion)
  };
}
function publicResult(test){
  return {id:`result:${test.id}`,type:'RESULT',label:`Resultado · ${test.label}`,status:test.status,primaryCampaign:test.primaryCampaign,domains:[...test.domains],summary:test.summary,keyMetrics:test.keyMetrics,evidenceClass:test.evidenceClass,updatedAt:test.updatedAt,sourceRef:test.sourceRef,provenance:[...test.provenance]};
}
function flattenTests(scienceShards,sourceVersion){
  const rows=[];
  for(const [domain,shard] of Object.entries(scienceShards||{}))for(const raw of arr(shard?.tests))if(text(raw?.id))rows.push({raw,test:publicTest(raw,domain,sourceVersion)});
  return rows.sort((a,b)=>a.test.id.localeCompare(b.test.id));
}
function buildStructure(scienceIndex,tests){
  const programs=arr(scienceIndex?.programs).filter(x=>text(x?.id)).map(row=>({
    id:text(row.id),type:'PROGRAM',label:text(row.title||row.label||row.id),status:text(row.status)||undefined,domain:text(row.domain)||undefined,summary:text(row.summary)||undefined
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const campaignRows=arr(scienceIndex?.campaigns).filter(x=>text(x?.id));
  const campaigns=campaignRows.map(row=>({
    id:text(row.id),type:'CAMPAIGN',label:text(row.title||row.label||row.id),programId:text(row.primaryProgram)||undefined,status:text(row.status)||undefined,
    summary:text(row.summary)||undefined,question:campaignQuestion(row)||undefined,facets:[...new Set([text(row.domain)].filter(Boolean))],
    declaredTestCount:Number.isFinite(Number(row.testCount))?Number(row.testCount):undefined,
    observedTestCount:tests.filter(item=>item.primaryCampaign===text(row.id)).length
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const facetMap=new Map();
  for(const campaign of campaigns)for(const code of campaign.facets){
    const entry=facetMap.get(code)||{id:`facet:${code}`,code,label:code,type:'FACET',campaignIds:[],question:undefined,status:undefined};
    entry.campaignIds.push(campaign.id);
    if(!entry.question&&campaign.question)entry.question=campaign.question;
    if(!entry.status&&campaign.status)entry.status=campaign.status;
    facetMap.set(code,entry);
  }
  const facets=[...facetMap.values()].map(item=>({...item,campaignIds:[...new Set(item.campaignIds)].sort()})).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  const system={id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE'};
  const nodes=[system,...programs,...campaigns];
  const edges=[];
  for(const program of programs)edges.push({id:`contains:${system.id}:${program.id}`,source:system.id,target:program.id,type:'CONTAINS'});
  for(const campaign of campaigns)if(campaign.programId)edges.push({id:`contains:${campaign.programId}:${campaign.id}`,source:campaign.programId,target:campaign.id,type:'CONTAINS'});
  return {system,programs,campaigns,facets,nodes,edges};
}
function h0Observation(measurement,testById,sourceVersion){
  const source=testById.get(measurement.id);
  const uncertainty=(measurement.uncertaintyLow!==undefined||measurement.uncertaintyHigh!==undefined||measurement.uncertaintyLevel)
    ? {...(measurement.uncertaintyLow!==undefined?{low:measurement.uncertaintyLow}:{}),...(measurement.uncertaintyHigh!==undefined?{high:measurement.uncertaintyHigh}:{}),...(measurement.uncertaintyLevel?{confidenceLevel:measurement.uncertaintyLevel}:{})}
    : undefined;
  return {
    id:`observation:h0:${measurement.id}`,metricId:'cosmology.H0',label:'H0',kind:'interval',value:measurement.h0,unit:'km/s/Mpc',
    ...(uncertainty?{uncertainty}:{}),stackId:measurement.id,stackLabel:measurement.stackLabel,datasets:[...arr(measurement.datasets)],
    ...(source?.primaryCampaign?{campaignId:source.primaryCampaign}:{}),testId:measurement.id,domains:[...arr(source?.domains||measurement.domain?[measurement.domain]:[])],
    ...(measurement.status?{status:measurement.status}:{}),...(source?.evidenceClass?{evidenceClass:source.evidenceClass}:{}),
    ...(source?.sourceRef?{sourceRef:source.sourceRef}:{}),...(measurement.updatedAt?{observedAt:measurement.updatedAt}:{}),
    provenance:provenance(source?.sourceRef||measurement.sourceRef||'PEER_CONTROL_TOWER_CANONICAL/Test Registry',sourceVersion)
  };
}
function stateFromShards(shards,hasInvestigation){
  const states=arr(shards).map(x=>upper(x?.state));
  if(states.includes('ERROR'))return {state:'PARTIAL',freshness:'DEGRADED'};
  if(states.includes('PARTIAL')||states.includes('DATA_UNAVAILABLE'))return {state:'PARTIAL',freshness:'DEGRADED'};
  if(!states.length&&!hasInvestigation)return {state:'EMPTY',freshness:'SNAPSHOT'};
  return {state:'READY',freshness:'SNAPSHOT'};
}
function semanticFingerprint(model){
  const semantic={contract:model.contract,sourceVersion:model.sourceVersion,state:model.state,structure:model.structure,observations:model.observations,comparisons:model.comparisons,syntheses:model.syntheses,investigation:model.investigation,activity:model.activity,shards:model.shards,diagnostics:model.diagnostics};
  return sha256(JSON.stringify(semantic));
}

export function buildScienceReadModelV2({scienceIndex={},scienceShards={},shardCatalog=[],projectionLedger=[],activity=[],previousSyntheses=[],generatedAt=new Date().toISOString()}={}){
  const sourceVersion=sourceVersionOf(scienceIndex);
  const flattened=flattenTests(scienceShards,sourceVersion);
  const tests=flattened.map(x=>x.test);
  const testById=new Map(tests.map(x=>[x.id,x]));
  const results=tests.map(publicResult);
  const structure=buildStructure(scienceIndex,tests);
  const h0=buildH0StackProjection(flattened.map(x=>({...x.raw,domain:x.test.domains[0],sourceRef:x.test.sourceRef})),sourceVersion);
  const observations=h0.measurements.map(item=>h0Observation(item,testById,sourceVersion));
  const investigation={hypotheses:[],claims:[],tests,results,runs:[],evidence:[],decisions:[],knowledge:[],pipelines:[],ledger:arr(projectionLedger).map(entry=>({...entry}))};
  const comparisons=[];
  const syntheses=arr(previousSyntheses).filter(x=>x&&text(x.id)).map(x=>({...x}));
  const status=stateFromShards(shardCatalog,tests.length>0);
  const model={
    contract:'NEXO_SCIENCE_READ_MODEL_V2',state:status.state,generatedAt:text(generatedAt),sourceVersion,fingerprint:'',freshness:status.freshness,
    structure,observations,comparisons,syntheses,investigation,activity:arr(activity).map(x=>({...x})),shards:arr(shardCatalog).map(x=>({...x})),
    diagnostics:{rejectedObservations:h0.rejected,observedTests:tests.length,observedResults:results.length},
    provenance:provenance(scienceIndex?.sourceRef||'DENER · SSOT CANONICAL / Science',sourceVersion)
  };
  model.fingerprint=semanticFingerprint(model);
  return model;
}
