import {createAtlasAdapter as createLegacyAdapter} from './adapters';
import {scientificStatus} from './scientific-status';
import {DEFAULT_OBSERVATORY_SURFACES,OBSERVATORY_QUESTIONS_CONTRACT,sortObservatoryQuestions,type ObservatoryQuestionsRead} from './observatory-questions';
import {parseScienceReadModel,type ScienceInvestigationRecord,type ScienceReadModelV2} from './science-read-model';
import type {AtlasApiClient,AtlasContext,DirectionalSignal,Freshness,H0StackMeasurement,ObservatoryData,ParameterEstimate,ResearchEnvelope,ResearchRecord,ScientificSection} from './types';

const text=(v:unknown)=>String(v??'').trim();
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const query=(context:AtlasContext={})=>Object.fromEntries(Object.entries(context).filter(([,value])=>Boolean(value))) as Record<string,string>;
const modelSource=(model:ScienceReadModelV2)=>text(model.provenance?.[0]?.source)||'TOWER_V06_PROJECTION';

function h0Stacks(raw:unknown):H0StackMeasurement[]{
 const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
 const direct=arr(data.h0Stacks);
 const observations=arr(data.observations).filter(item=>text(obj(item).metricId)==='cosmology.H0');
 const source=direct.length?direct:observations;
 return source.map((item):H0StackMeasurement|null=>{
  const row=obj(item),h0=Number(row.h0??row.value);
  if(!text(row.id)&&!text(row.testId))return null;
  if(!Number.isFinite(h0))return null;
  const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):undefined;
  const uncertainty=obj(row.uncertainty);
  const id=text(row.testId||row.stackId||row.id).replace(/^observation:h0:/,'');
  return {id,stackLabel:text(row.stackLabel||row.label||id),domain:arr(row.domains).map(text).filter(Boolean)[0]||text(row.domain)||undefined,primaryCampaign:text(row.campaignId||row.primaryCampaign)||undefined,h0,uncertaintyLow:n(row.uncertaintyLow??uncertainty.low),uncertaintyHigh:n(row.uncertaintyHigh??uncertainty.high),uncertaintyLevel:text(row.uncertaintyLevel||uncertainty.confidenceLevel)||undefined,datasets:arr(row.datasets).map(text).filter(Boolean),baselineId:text(row.baselineId)||undefined,deltaH0:n(row.deltaH0),status:text(row.status)||undefined,updatedAt:text(row.observedAt||row.updatedAt)||undefined,sourceRef:text(row.sourceRef)||undefined};
 }).filter((item):item is H0StackMeasurement=>Boolean(item));
}

function records(raw:ResearchEnvelope,type:string):ResearchRecord[]{
 const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
 return arr(data.items).map((item):ResearchRecord|null=>{
  const row=obj(item),id=text(row.id);if(!id)return null;
  const label=text(row.label||row.title||id)||id;
  const resolvedType=text(row.type||type)||type;
  return {id,label,type:resolvedType,status:text(row.status)||undefined,domain:text(row.domain)||arr(row.domains).map(text).filter(Boolean)[0]||undefined,summary:text(row.summary||row.question)||undefined,updatedAt:text(row.updatedAt||row.timestamp)||undefined,provenance:arr(row.provenance) as ResearchRecord['provenance'],node:{id,label,type:resolvedType,status:text(row.status)||undefined,domain:text(row.domain)||arr(row.domains).map(text).filter(Boolean)[0]||undefined,summary:text(row.summary||row.question)||undefined,updatedAt:text(row.updatedAt||row.timestamp)||undefined}};
 }).filter((item):item is ResearchRecord=>Boolean(item));
}

function researchRecord(row:ScienceInvestigationRecord):ResearchRecord{
 const domain=row.domains[0];
 return {id:row.id,label:row.label,type:row.type,status:row.status,domain,summary:row.summary,updatedAt:row.updatedAt,provenance:row.provenance,node:{id:row.id,label:row.label,type:row.type,status:row.status,domain,summary:row.summary,updatedAt:row.updatedAt,metadata:{primaryCampaign:row.primaryCampaign,keyMetrics:row.keyMetrics,evidenceClass:row.evidenceClass}}};
}

function freshnessFromModel(model:ScienceReadModelV2):Freshness{
 const value=text(model.freshness).toUpperCase();
 return value==='LIVE'||value==='SNAPSHOT'||value==='STALE'||value==='DEGRADED'?value:'DEGRADED';
}

function modelSummary(model:ScienceReadModelV2):ObservatoryData{
 const stacks=h0Stacks(model);
 const parameters:ParameterEstimate[]=model.observations.filter(item=>typeof item.value==='number').map(item=>({
  id:item.metricId==='cosmology.H0'?item.id:item.metricId,label:item.label,value:Number(item.value),
  uncertainty:item.uncertainty?.sigma??(item.uncertainty?.high!==undefined&&item.uncertainty?.low!==undefined?{plus:Math.abs(item.uncertainty.high-Number(item.value)),minus:Math.abs(Number(item.value)-item.uncertainty.low)}:undefined),
  unit:item.unit,status:scientificStatus(item.status,'MEASURED'),evidenceLevel:scientificStatus(item.status,'MEASURED'),updatedAt:item.observedAt,provenance:item.provenance
 }));
 const directionalSignals:DirectionalSignal[]=model.observations.filter(item=>item.kind==='directional').map(item=>{
  const status=scientificStatus(item.status,'INCONCLUSIVE');
  const state:DirectionalSignal['state']=status==='SUPPORTED'?'SUPPORTED':status==='CANDIDATE'?'CANDIDATE':status==='PROVISIONAL'?'PROVISIONAL':'INCONCLUSIVE';
  return {id:item.id,label:item.label,state,ra:item.ra,dec:item.dec,datasets:item.datasets,provenance:item.provenance};
 });
 const sections:ScientificSection[]=model.syntheses.map(item=>({id:item.id,label:item.scopeId||item.id,summary:item.narrative,status:scientificStatus(item.status,'INCONCLUSIVE'),updatedAt:item.updatedAt,provenance:item.provenance}));
 const narrative=model.syntheses.find(item=>item.scope==='global'&&item.narrative)?.narrative;
 return {h0:null,h0Stacks:stacks,tensions:[],directionalSignals,parameters,narrative,sections,freshness:{state:freshnessFromModel(model),source:modelSource(model),sourceVersion:model.sourceVersion,updatedAt:model.generatedAt}};
}

function modelQuestions(model:ScienceReadModelV2):ObservatoryQuestionsRead{
 const questions=sortObservatoryQuestions(model.structure.facets.map(facet=>{
  const campaigns=model.structure.campaigns.filter(campaign=>facet.campaignIds.includes(campaign.id));
  const refs=campaigns.map(campaign=>({id:campaign.id,label:campaign.label,status:campaign.status||'',testCount:campaign.declaredTestCount??null}));
  const known=refs.length>0&&refs.every(item=>item.testCount!==null);
  const testCount=refs.reduce((sum,item)=>sum+(item.testCount||0),0);
  const question=facet.question||campaigns.find(item=>item.question)?.question||'';
  return {id:`domain:${facet.code}`,code:facet.code,label:facet.label,question,status:scientificStatus(facet.status,'INCONCLUSIVE'),rawStatus:facet.status||'',campaigns:refs,testCount,testCountKnown:known,counts:{campaigns:refs.length,tests:known?testCount:null},synthesis:null,availability:question?'QUESTION_PUBLISHED' as const:'DATA_UNAVAILABLE' as const,unavailableReason:question?'A fonte publica a pergunta e o recorte de campanhas, mas ainda não publica uma síntese quantitativa para esta faceta.':'A fonte ainda não publicou uma pergunta semântica para esta faceta.',nextAction:refs.length?'Abrir as campanhas para revisar testes, evidências e relações publicadas.':'Aguardar a publicação de uma campanha vinculada.'};
 }));
 const counts={questions:questions.length,tests:model.investigation.tests.length,relations:model.structure.edges.length,evidence:model.investigation.evidence.length,decisions:model.investigation.decisions.length};
 const surfaces=DEFAULT_OBSERVATORY_SURFACES.map(surface=>{
  const count=surface.id==='questions'?counts.questions:surface.id==='tests'?counts.tests:surface.id==='relations'?counts.relations:surface.id==='evidence'?counts.evidence:counts.decisions;
  return {...surface,count,available:count>0};
 });
 return {questions,surfaces,contract:OBSERVATORY_QUESTIONS_CONTRACT,status:questions.length?'OK':'DATA_UNAVAILABLE',freshness:model.freshness,source:modelSource(model),sourceVersion:model.sourceVersion};
}

export function createAtlasAdapter(client:AtlasApiClient){
 const legacy=createLegacyAdapter(client);
 let modelPromise:Promise<ScienceReadModelV2>|null=null;
 const getScienceReadModel=()=>{
  if(!modelPromise)modelPromise=client.research('science-read-model').then(parseScienceReadModel).catch(error=>{modelPromise=null;throw error});
  return modelPromise;
 };
 const legacySummary=legacy.getObservatorySummary.bind(legacy);
 const summary=async(context:AtlasContext={}):Promise<ObservatoryData>=>{
  try{return modelSummary(await getScienceReadModel())}catch{
   let base:ObservatoryData;
   try{base=await legacySummary(context)}catch{base={h0:null,h0Stacks:[],tensions:[],directionalSignals:[],parameters:[],sections:[],freshness:{state:'DEGRADED'}}}
   try{
    const raw=await client.research('observatory-summary',query(context));
    const stacks=h0Stacks(raw);
    const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
    return {...base,h0Stacks:stacks,narrative:text(data.narrative)||base.narrative,freshness:{...base.freshness,state:String(root.freshness||data.freshness||base.freshness.state).toUpperCase()==='LIVE'?'LIVE':'SNAPSHOT'}};
   }catch{return {...base,h0Stacks:base.h0Stacks||[]}}
  }
 };
 const modelLane=async(lane:keyof ScienceReadModelV2['investigation'])=>(await getScienceReadModel()).investigation[lane].map(researchRecord);
 const richRecords=async(route:string,type:string,context:AtlasContext={},fallback:()=>Promise<ResearchRecord[]>)=>{
  try{return records(await client.research(route,query(context)),type)}catch{return fallback()}
 };
 return {
  ...legacy,
  getScienceReadModel,
  getObservatorySummary:summary,
  getObservatoryQuestions:async()=>{try{return modelQuestions(await getScienceReadModel())}catch{return legacy.getObservatoryQuestions()}},
  getTests:(context:AtlasContext={})=>modelLane('tests').catch(()=>richRecords('lab-tests','TEST',context,()=>legacy.getTests(context))),
  getResults:(context:AtlasContext={})=>modelLane('results').catch(()=>richRecords('lab-results','RESULT',context,()=>legacy.getResults(context))),
  getRuns:(context:AtlasContext={})=>modelLane('runs').catch(()=>richRecords('lab-runs','RUN',context,()=>legacy.getRuns(context))),
  getEvidence:(context:AtlasContext={})=>modelLane('evidence').catch(()=>richRecords('lab-evidence','EVIDENCE',context,()=>legacy.getEvidence(context))),
  getClaims:(context:AtlasContext={})=>modelLane('claims').catch(()=>richRecords('lab-claims','CLAIM',context,()=>legacy.getClaims(context))),
  getHypotheses:(context:AtlasContext={})=>modelLane('hypotheses').catch(()=>richRecords('lab-hypotheses','HYPOTHESIS',context,()=>legacy.getHypotheses(context))),
  getPipelines:(context:AtlasContext={})=>modelLane('pipelines').catch(()=>richRecords('lab-pipelines','PIPELINE',context,()=>legacy.getPipelines(context))),
  getDecisions:()=>modelLane('decisions').catch(()=>[]),
  getKnowledge:()=>modelLane('knowledge').catch(()=>[])
 };
}