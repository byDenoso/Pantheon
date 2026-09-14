import {createAtlasAdapter as createLegacyAdapter} from './adapters';
import type {AtlasApiClient,AtlasContext,H0StackMeasurement,ObservatoryData,ResearchEnvelope,ResearchRecord} from './types';

const text=(v:unknown)=>String(v??'').trim();
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const query=(context:AtlasContext={})=>Object.fromEntries(Object.entries(context).filter(([,value])=>Boolean(value))) as Record<string,string>;

function h0Stacks(raw:unknown):H0StackMeasurement[]{
 const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
 return arr(data.h0Stacks).map((item):H0StackMeasurement|null=>{
  const row=obj(item),h0=Number(row.h0);
  if(!text(row.id)||!Number.isFinite(h0))return null;
  const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):undefined;
  return {id:text(row.id),stackLabel:text(row.stackLabel||row.label||row.id),domain:text(row.domain)||undefined,primaryCampaign:text(row.primaryCampaign)||undefined,h0,uncertaintyLow:n(row.uncertaintyLow),uncertaintyHigh:n(row.uncertaintyHigh),uncertaintyLevel:text(row.uncertaintyLevel)||undefined,datasets:arr(row.datasets).map(text).filter(Boolean),baselineId:text(row.baselineId)||undefined,deltaH0:n(row.deltaH0),status:text(row.status)||undefined,updatedAt:text(row.updatedAt)||undefined,sourceRef:text(row.sourceRef)||undefined};
 }).filter((item):item is H0StackMeasurement=>Boolean(item));
}

function records(raw:ResearchEnvelope,type:string):ResearchRecord[]{
 const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
 return arr(data.items).map((item):ResearchRecord|null=>{
  const row=obj(item),id=text(row.id);if(!id)return null;
  const label=text(row.label||row.title||id)||id;
  const resolvedType=text(row.type||type)||type;
  return {id,label,type:resolvedType,status:text(row.status)||undefined,domain:text(row.domain)||undefined,summary:text(row.summary||row.question)||undefined,updatedAt:text(row.updatedAt||row.timestamp)||undefined,provenance:arr(row.provenance) as ResearchRecord['provenance'],node:{id,label,type:resolvedType,status:text(row.status)||undefined,domain:text(row.domain)||undefined,summary:text(row.summary||row.question)||undefined,updatedAt:text(row.updatedAt||row.timestamp)||undefined}};
 }).filter((item):item is ResearchRecord=>Boolean(item));
}

export function createAtlasAdapter(client:AtlasApiClient){
 const legacy=createLegacyAdapter(client);
 const legacySummary=legacy.getObservatorySummary.bind(legacy);
 const summary=async(context:AtlasContext={}):Promise<ObservatoryData>=>{
  let base:ObservatoryData;
  try{base=await legacySummary(context)}catch{base={h0:null,h0Stacks:[],tensions:[],directionalSignals:[],parameters:[],sections:[],freshness:{state:'DEGRADED'}}}
  try{
   const raw=await client.research('observatory-summary',query(context));
   const stacks=h0Stacks(raw);
   const root=obj(raw),data=Object.keys(obj(root.data)).length?obj(root.data):root;
   return {...base,h0Stacks:stacks,narrative:text(data.narrative)||base.narrative,freshness:{...base.freshness,state:String(root.freshness||data.freshness||base.freshness.state).toUpperCase()==='LIVE'?'LIVE':'SNAPSHOT'}};
  }catch{return {...base,h0Stacks:base.h0Stacks||[]}}
 };
 const richRecords=async(route:string,type:string,context:AtlasContext={},fallback:()=>Promise<ResearchRecord[]>)=>{
  try{return records(await client.research(route,query(context)),type)}catch{return fallback()}
 };
 return {
  ...legacy,
  getObservatorySummary:summary,
  getTests:(context:AtlasContext={})=>richRecords('lab-tests','TEST',context,()=>legacy.getTests(context)),
  getResults:(context:AtlasContext={})=>richRecords('lab-results','RESULT',context,()=>legacy.getResults(context)),
  getRuns:(context:AtlasContext={})=>richRecords('lab-runs','RUN',context,()=>legacy.getRuns(context)),
  getEvidence:(context:AtlasContext={})=>richRecords('lab-evidence','EVIDENCE',context,()=>legacy.getEvidence(context)),
  getClaims:(context:AtlasContext={})=>richRecords('lab-claims','CLAIM',context,()=>legacy.getClaims(context)),
  getHypotheses:(context:AtlasContext={})=>richRecords('lab-hypotheses','HYPOTHESIS',context,()=>legacy.getHypotheses(context)),
  getPipelines:(context:AtlasContext={})=>richRecords('lab-pipelines','PIPELINE',context,()=>legacy.getPipelines(context)),
  getDecisions:(context:AtlasContext={})=>richRecords('lab-decisions','DECISION',context,async()=>[]),
  getKnowledge:(context:AtlasContext={})=>richRecords('lab-knowledge','KNOWLEDGE',context,async()=>[])
 };
}
