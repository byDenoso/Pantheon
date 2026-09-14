import {buildH0StackProjection} from './h0-stack-projection.mjs';

const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
const upper=v=>text(v).toUpperCase();
const splitDomains=v=>Array.isArray(v)?v.map(text).filter(Boolean):text(v).split('|').map(text).filter(Boolean);
const provenance=(sourceRef,sourceVersion)=>[{source:'GOOGLE_DRIVE',sourceRef:text(sourceRef)||undefined,observedAt:text(sourceVersion)||undefined}].filter(x=>x.sourceRef||x.observedAt);
const ready=(name,payload)=>({descriptor:{state:'READY',contract:payload.contract,path:`surfaces/${name}/index.json`},payload});
const campaignTestCount=row=>{
 const direct=Number(row?.testCount);
 if(Number.isFinite(direct))return direct;
 const match=text(row?.summary||row?.question).match(/\b(\d+)\s+test_ids?\b/i);
 return match?Number(match[1]):null;
};
const campaignQuestion=row=>{
 const summary=text(row?.question||row?.summary);
 const match=summary.match(/(?:^|\s)Pergunta:\s*(.*?)(?:\s+Mecanismo:|$)/i);
 return text(match?.[1]||summary);
};
const campaignLabel=row=>text(row?.label||row?.title||row?.id);

function publicTest(test,domain,sourceVersion){
 return {
  id:text(test.id),type:'TEST',label:text(test.label||test.id),status:text(test.status)||undefined,domain:text(domain||arr(test.domains)[0])||undefined,
  primaryCampaign:text(test.primaryCampaign||test.primary_campaign)||undefined,summary:text(test.summary)||undefined,keyMetrics:text(test.keyMetrics||test.key_metrics)||undefined,
  updatedAt:text(test.lastVerified||test.last_verified||test.updatedAt||test.updated_at)||undefined,
  provenance:provenance(test.sourceRef||test.source_ref||'PEER_CONTROL_TOWER_CANONICAL/Test Registry',sourceVersion)
 };
}
function publicResult(test,domain,sourceVersion){
 const base=publicTest(test,domain,sourceVersion);
 return {id:`result:${base.id}`,type:'RESULT',label:`Resultado · ${base.label}`,status:base.status,domain:base.domain,primaryCampaign:base.primaryCampaign,summary:base.summary,keyMetrics:base.keyMetrics,updatedAt:base.updatedAt,provenance:base.provenance};
}
function scienceTests(scienceShards,sourceVersion){
 const rows=[];
 for(const [domain,shard] of Object.entries(scienceShards||{}))for(const raw of arr(shard?.tests))if(text(raw?.id))rows.push(publicTest(raw,domain,sourceVersion));
 return rows;
}
function rawScienceTests(scienceShards){
 const rows=[];
 for(const [domain,shard] of Object.entries(scienceShards||{}))for(const raw of arr(shard?.tests))if(text(raw?.id))rows.push({...raw,domain:text(raw.domain||arr(raw.domains)[0]||domain)});
 return rows;
}
function laboratorySurface(scienceShards,sourceVersion){
 const tests=scienceTests(scienceShards,sourceVersion);
 const results=[];
 for(const [domain,shard] of Object.entries(scienceShards||{}))for(const raw of arr(shard?.tests))if(text(raw?.id))results.push(publicResult(raw,domain,sourceVersion));
 const items=[...tests,...results];
 return {contract:'NEXO_ATLAS_LABORATORY_V1',state:'READY',sourceVersion,provenance:provenance('PEER_CONTROL_TOWER_CANONICAL/Test Registry',sourceVersion),items};
}
function canonicalDomainQuestions(scienceIndex,sourceVersion){
 const explicit=arr(scienceIndex?.domains);
 if(explicit.length)return explicit.map(row=>({
  id:text(row.id||`domain:${row.code}`),code:text(row.code),label:text(row.label||row.code),question:text(row.question)||undefined,status:text(row.scientificState||row.status)||undefined,
  campaigns:arr(scienceIndex?.campaigns).filter(campaign=>upper(campaign.domain)===upper(row.code)).map(campaign=>({id:text(campaign.id),label:campaignLabel(campaign),status:text(campaign.status)||undefined,testCount:campaignTestCount(campaign)})),
  testCountKnown:arr(scienceIndex?.campaigns).filter(campaign=>upper(campaign.domain)===upper(row.code)).every(campaign=>campaignTestCount(campaign)!==null),
  testCount:arr(scienceIndex?.campaigns).filter(campaign=>upper(campaign.domain)===upper(row.code)).reduce((sum,campaign)=>sum+(campaignTestCount(campaign)||0),0),
  availability:text(row.question)?'QUESTION_PUBLISHED':'DATA_UNAVAILABLE',
  unavailableReason:text(row.question)?'A fonte publica a pergunta e o recorte de campanhas, mas ainda não publica uma síntese quantitativa para este domínio.':'A fonte ainda não publicou uma pergunta semântica para este domínio.',
  synthesis:null,
  provenance:provenance('PEER_CONTROL_TOWER_CANONICAL/Scientific Domains',sourceVersion)
 }));
 const grouped=new Map();
 for(const campaign of arr(scienceIndex?.campaigns)){
  const code=upper(campaign.domain);
  if(!/^D\d+$/.test(code))continue;
  const group=grouped.get(code)||[];group.push(campaign);grouped.set(code,group);
 }
 return [...grouped.entries()].sort((a,b)=>Number(a[0].slice(1))-Number(b[0].slice(1))).map(([code,campaigns])=>{
  const first=campaigns[0];
  const counts=campaigns.map(campaignTestCount);
  const testCountKnown=counts.every(value=>value!==null);
  const question=campaignQuestion(first);
  return {
   id:`domain:${code}`,code,label:campaigns.length===1?campaignLabel(first):code,question:question||undefined,status:text(first?.status)||undefined,
   campaigns:campaigns.map(campaign=>({id:text(campaign.id),label:campaignLabel(campaign),status:text(campaign.status)||undefined,testCount:campaignTestCount(campaign)})),
   testCountKnown,testCount:counts.reduce((sum,value)=>sum+(value||0),0),counts:{campaigns:campaigns.length,tests:testCountKnown?counts.reduce((sum,value)=>sum+(value||0),0):null},
   synthesis:null,availability:question?'QUESTION_PUBLISHED':'DATA_UNAVAILABLE',
   unavailableReason:question?'A fonte publica a pergunta e o recorte de campanhas, mas ainda não publica uma síntese quantitativa para este domínio.':'A fonte ainda não publicou uma pergunta semântica para este domínio.',
   nextAction:campaigns.length?'Abrir as campanhas para revisar testes, evidências e relações publicadas.':'Aguardar a publicação de uma campanha vinculada a este domínio.',
   provenance:provenance('DENER · SSOT CANONICAL / Science',sourceVersion)
  };
 });
}
function observatorySurface(scienceIndex,scienceShards,sourceVersion){
 const questions=canonicalDomainQuestions(scienceIndex,sourceVersion);
 const campaigns=arr(scienceIndex?.campaigns).map(row=>({id:text(row.id),label:campaignLabel(row),domain:text(row.domain)||undefined,question:campaignQuestion(row)||undefined,status:text(row.status)||undefined,testCount:campaignTestCount(row)??undefined,provenance:provenance('DENER · SSOT CANONICAL / Science',sourceVersion)}));
 const h0=buildH0StackProjection(rawScienceTests(scienceShards));
 return {contract:'NEXO_ATLAS_OBSERVATORY_V1',state:'READY',sourceVersion,provenance:provenance('DENER · SSOT CANONICAL / Science',sourceVersion),questions,campaigns,h0Stacks:h0.measurements,h0Rejected:h0.rejected,aggregate:null};
}
function learningSurface(drive,sourceVersion){
 const map=row=>({id:text(row.id),label:text(row.title||row.id),status:text(row.status)||undefined,domains:splitDomains(row.domains),summary:text(row.summary)||undefined,rule:text(row.rule)||undefined,support:Number.isFinite(Number(row.support))?Number(row.support):undefined,contradict:Number.isFinite(Number(row.contradict))?Number(row.contradict):undefined,confidence:Number.isFinite(Number(row.confidence))?Number(row.confidence):undefined,scope:text(row.scope)||undefined,provenance:provenance(row.provenance||'NEXO Learning',sourceVersion)});
 const items=[...arr(drive?.learning),...arr(drive?.crossDomain)].filter(row=>text(row?.id)).map(map);
 return {contract:'NEXO_ATLAS_LEARNING_V1',state:'READY',sourceVersion,provenance:provenance('NEXO Learning',sourceVersion),runtime:{state:'DATA_UNAVAILABLE'},items};
}
function operationsSurface(drive,sourceVersion){
 const actions=arr(drive?.actions).filter(row=>text(row?.id)).map(row=>({id:text(row.id),label:text(row.title||row.id),status:text(row.status)||undefined,summary:text(row.summary)||undefined,updatedAt:text(row.updatedAt||row.updated_at)||undefined,provenance:provenance('NEXO Action Register',sourceVersion)}));
 const integrity=arr(drive?.integrity).filter(row=>text(row?.id)).map(row=>({id:text(row.id),scope:text(row.scope)||undefined,type:text(row.type)||undefined,status:text(row.status)||undefined,severity:text(row.severity)||undefined,checkedAt:text(row.checkedAt||row.checked_at)||undefined}));
 return {contract:'NEXO_ATLAS_OPERATIONS_V1',state:'READY',sourceVersion,provenance:provenance('NEXO Operations',sourceVersion),actions,integritySummary:{total:integrity.length,open:integrity.filter(x=>!['PASS','RESOLVED','LIVE'].includes(upper(x.status))).length},lastSync:null};
}
function activitySurface(drive,sourceVersion){
 const items=arr(drive?.actions).filter(row=>text(row?.id)&&text(row?.updatedAt||row?.updated_at)).map(row=>({id:`activity:${text(row.id)}:${text(row.updatedAt||row.updated_at)}`,stage:'ACTION_STATE',status:text(row.status)||undefined,timestamp:text(row.updatedAt||row.updated_at),workId:text(row.id),label:text(row.title||row.id),summary:text(row.summary)||undefined,provenance:provenance('NEXO Action Register',sourceVersion)})).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 return {contract:'NEXO_ATLAS_ACTIVITY_V1',state:'READY',sourceVersion,provenance:provenance('NEXO Action Register',sourceVersion),items};
}
function auditSurface(drive,sourceVersion){
 const items=arr(drive?.integrity).filter(row=>text(row?.id)).map(row=>({id:text(row.id),scope:text(row.scope)||undefined,type:text(row.type)||undefined,target:text(row.target)||undefined,status:text(row.status)||undefined,severity:text(row.severity)||undefined,observed:text(row.observed)||undefined,readbackRef:text(row.readbackRef||row.readback_ref)||undefined,checkedAt:text(row.checkedAt||row.checked_at)||undefined,provenance:provenance(row.readbackRef||row.readback_ref||'NEXO Integrity',sourceVersion)}));
 return {contract:'NEXO_ATLAS_AUDIT_V1',state:'READY',sourceVersion,provenance:provenance('NEXO Integrity',sourceVersion),items};
}
function searchSurface(scienceIndex,lab,observatory,learning,operations,sourceVersion){
 const items=[];
 for(const row of arr(scienceIndex?.programs))items.push({id:text(row.id),label:campaignLabel(row),type:'PROGRAM',domain:text(row.domain)||undefined,status:text(row.status)||undefined,route:'/mapa'});
 for(const row of canonicalDomainQuestions(scienceIndex,sourceVersion))items.push({id:text(row.id),label:text(row.label||row.code),type:'DOMAIN',domain:text(row.code)||undefined,status:text(row.status)||undefined,route:'/mapa'});
 for(const row of arr(scienceIndex?.campaigns))items.push({id:text(row.id),label:campaignLabel(row),type:'CAMPAIGN',domain:text(row.domain)||undefined,status:text(row.status)||undefined,route:'/mapa'});
 for(const row of arr(lab.items))items.push({id:row.id,label:row.label,type:row.type,domain:row.domain,status:row.status,route:'/laboratorio'});
 for(const row of arr(observatory.h0Stacks))items.push({id:`h0:${row.id}`,label:row.stackLabel,type:'H0_MEASUREMENT',domain:row.domain,status:row.status,route:'/observatorio'});
 for(const row of arr(learning.items))items.push({id:row.id,label:row.label,type:'LEARNING',status:row.status,route:'/learning'});
 for(const row of arr(operations.actions))items.push({id:row.id,label:row.label,type:'ACTION',status:row.status,route:'/atividade'});
 return {contract:'NEXO_ATLAS_SEARCH_V1',state:'READY',sourceVersion,provenance:provenance('NEXO public projections',sourceVersion),items};
}

export function buildPublicSurfaces({sourceVersion='',scienceIndex={},scienceShards={},drive={}}={}){
 const laboratory=laboratorySurface(scienceShards,sourceVersion);
 const observatory=observatorySurface(scienceIndex,scienceShards,sourceVersion);
 const learning=learningSurface(drive,sourceVersion);
 const operations=operationsSurface(drive,sourceVersion);
 const activity=activitySurface(drive,sourceVersion);
 const audit=auditSurface(drive,sourceVersion);
 const search=searchSurface(scienceIndex,laboratory,observatory,learning,operations,sourceVersion);
 return {
  observatory:ready('observatory',observatory),
  laboratory:ready('laboratory',laboratory),
  learning:ready('learning',learning),
  operations:ready('operations',operations),
  activity:ready('activity',activity),
  audit:ready('audit',audit),
  search:ready('search',search)
 };
}
