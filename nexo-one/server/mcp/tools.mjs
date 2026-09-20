import {buildScienceChanges,buildScienceReadModelV2} from '../compiler/science-read-model-v2.mjs';

export const MCP_TOOL_NAMES=Object.freeze([
  'get_science_state','get_changes','search_atlas','get_program','get_campaign','get_observations','get_h0_stacks','get_evidence_chain','get_operations','get_activity','get_provenance'
]);

const text=value=>String(value??'').trim();
const arr=value=>Array.isArray(value)?value:[];
const lower=value=>text(value).toLocaleLowerCase();
const n=value=>Number.isFinite(Number(value))?Number(value):undefined;
const bounded=(value,def=50,max=200)=>Math.max(1,Math.min(n(value)??def,max));
const publicThread=row=>!/(OLYMPUS|CLIENT|PERSON|PRIVATE)/i.test(text(row?.thread_id));
const safeOperation=row=>({
  id:text(row?.work_id||row?.id),kind:text(row?.kind),title:text(row?.question||row?.title)||text(row?.work_id||row?.id),status:text(row?.status),priority:text(row?.priority),updatedAt:text(row?.updated_at||row?.updatedAt),threadId:text(row?.thread_id),resultRef:text(row?.result_ref)||undefined
});
const SCIENCE_MODEL_CACHE_LIMIT=4;
const scienceModelCache=new Map();
function scienceModelFor(snapshot){
  const key=text(snapshot?.fingerprint);
  if(!key)return buildScienceReadModelV2(snapshot);
  const cached=scienceModelCache.get(key);
  if(cached){
    scienceModelCache.delete(key);
    scienceModelCache.set(key,cached);
    return {...cached,generatedAt:text(snapshot?.generatedAt)};
  }
  const model=scienceModelFor(snapshot);
  scienceModelCache.set(key,model);
  while(scienceModelCache.size>SCIENCE_MODEL_CACHE_LIMIT)scienceModelCache.delete(scienceModelCache.keys().next().value);
  return model;
}
const withMeta=(model,data)=>({sourceVersion:model.sourceVersion,fingerprint:model.fingerprint,freshness:model.freshness,provenance:model.provenance,...data});

function allInvestigation(model){return Object.values(model.investigation).flatMap(arr);}
function searchable(model){
  return [
    ...model.structure.programs.map(item=>({...item,kind:'PROGRAM'})),
    ...model.structure.campaigns.map(item=>({...item,kind:'CAMPAIGN'})),
    ...model.structure.facets.map(item=>({...item,kind:'FACET'})),
    ...model.observations.map(item=>({...item,kind:'OBSERVATION'})),
    ...model.comparisons.map(item=>({...item,kind:'COMPARISON'})),
    ...model.syntheses.map(item=>({...item,kind:'SYNTHESIS'})),
    ...allInvestigation(model).map(item=>({...item,kind:item.type||'INVESTIGATION'}))
  ];
}
function matches(item,needle){
  if(!needle)return true;
  const haystack=[item.id,item.label,item.title,item.summary,item.question,item.metricId,item.status,item.kind,item.type,...arr(item.domains),...arr(item.facets)].map(text).join(' ').toLocaleLowerCase();
  return haystack.includes(needle);
}
function linkedToCampaign(item,campaignId){return text(item.primaryCampaign)===campaignId||text(item.campaignId)===campaignId;}
function evidenceChain(model,args){
  const campaignId=text(args?.campaignId||args?.campaign_id),testId=text(args?.testId||args?.test_id),sourceRef=text(args?.sourceRef||args?.source_ref);
  const evidence=model.investigation.evidence.filter(item=>(!campaignId||linkedToCampaign(item,campaignId))&&(!sourceRef||text(item.sourceRef)===sourceRef));
  const tests=model.investigation.tests.filter(item=>(!campaignId||linkedToCampaign(item,campaignId))&&(!testId||item.id===testId));
  const results=model.investigation.results.filter(item=>(!campaignId||linkedToCampaign(item,campaignId))&&(!sourceRef||text(item.sourceRef)===sourceRef));
  const observations=model.observations.filter(item=>(!campaignId||text(item.campaignId)===campaignId)&&(!testId||text(item.testId)===testId)&&(!sourceRef||text(item.sourceRef)===sourceRef));
  const provenance=[...tests,...results,...evidence,...observations].flatMap(item=>arr(item.provenance));
  return {campaignId:campaignId||undefined,testId:testId||undefined,sourceRef:sourceRef||undefined,tests,results,evidence,observations,provenance};
}
function findEntity(model,id){
  return searchable(model).find(item=>text(item.id)===id)||null;
}

export async function executeMcpTool(snapshot,name,args={}){
  if(!MCP_TOOL_NAMES.includes(name))throw new Error(`UNKNOWN_MCP_TOOL:${name}`);
  const model=buildScienceReadModelV2(snapshot);
  switch(name){
    case 'get_science_state': return model;
    case 'get_changes': return buildScienceChanges(snapshot,model);
    case 'search_atlas': {
      const needle=lower(args.query||args.q),limit=bounded(args.limit,50,200);
      const items=searchable(model).filter(item=>matches(item,needle)).slice(0,limit);
      return withMeta(model,{query:text(args.query||args.q),items,total:items.length});
    }
    case 'get_program': {
      const id=text(args.id||args.programId||args.program_id),program=model.structure.programs.find(item=>item.id===id)||null;
      const campaigns=program?model.structure.campaigns.filter(item=>item.programId===program.id):[];
      return withMeta(model,{program,campaigns});
    }
    case 'get_campaign': {
      const id=text(args.id||args.campaignId||args.campaign_id),campaign=model.structure.campaigns.find(item=>item.id===id)||null;
      const tests=model.investigation.tests.filter(item=>linkedToCampaign(item,id));
      const runs=model.investigation.runs.filter(item=>linkedToCampaign(item,id));
      const results=model.investigation.results.filter(item=>linkedToCampaign(item,id));
      const evidence=model.investigation.evidence.filter(item=>linkedToCampaign(item,id));
      const observations=model.observations.filter(item=>text(item.campaignId)===id);
      const syntheses=model.syntheses.filter(item=>item.scopeId===id);
      return withMeta(model,{campaign,tests,runs,results,evidence,observations,syntheses});
    }
    case 'get_observations': {
      const metricId=text(args.metricId||args.metric_id),domain=text(args.domain).toUpperCase(),campaignId=text(args.campaignId||args.campaign_id),kind=text(args.kind).toLowerCase(),limit=bounded(args.limit,100,500);
      const items=model.observations.filter(item=>(!metricId||item.metricId===metricId)&&(!domain||item.domains.includes(domain))&&(!campaignId||text(item.campaignId)===campaignId)&&(!kind||item.kind===kind)).slice(0,limit);
      return withMeta(model,{items,total:items.length});
    }
    case 'get_h0_stacks': {
      const items=model.observations.filter(item=>item.metricId==='cosmology.H0');
      return withMeta(model,{metricId:'cosmology.H0',items,total:items.length});
    }
    case 'get_evidence_chain': return withMeta(model,evidenceChain(model,args));
    case 'get_operations': {
      const limit=bounded(args.limit,100,500);
      const items=arr(snapshot?.sections?.WORK).filter(publicThread).map(safeOperation).filter(item=>item.id).slice(0,limit);
      return withMeta(model,{items,total:items.length});
    }
    case 'get_activity': {
      const changes=buildScienceChanges(snapshot,model);
      const items=arr(changes.items).slice(0,bounded(args.limit,100,500));
      return {...changes,items,total:items.length};
    }
    case 'get_provenance': {
      const id=text(args.id||args.entityId||args.entity_id),entity=id?findEntity(model,id):null;
      return withMeta(model,{entityId:id||undefined,entity,provenance:entity?arr(entity.provenance):model.provenance});
    }
    default: throw new Error(`UNKNOWN_MCP_TOOL:${name}`);
  }
}
