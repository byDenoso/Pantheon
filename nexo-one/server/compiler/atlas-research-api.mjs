export const RESEARCH_API_CONTRACT='NEXO_ATLAS_RESEARCH_API_V1';
export const RESEARCH_ROUTES=new Set([
  'atlas-graph',
  'observatory-summary','observatory-parameters','observatory-tensions','observatory-directional-signals',
  'lab-hypotheses','lab-claims','lab-tests','lab-runs','lab-results','lab-evidence','lab-pipelines',
  'universe-snapshot'
]);

const text=v=>String(v??'').trim();
const upper=v=>text(v).toUpperCase().replace(/[\s-]+/g,'_');
const safeArray=v=>Array.isArray(v)?v:[];

function provenance(snapshot){
  return [{authority:'GOOGLE_DRIVE',source:'NEXO_SSOT',projectionAuthority:'DERIVED_FROM_SSOT',modifiedAt:text(snapshot?.sourceModifiedAt),generatedAt:text(snapshot?.generatedAt)}];
}
function envelope(snapshot,data,status='OK'){
  return {contract:RESEARCH_API_CONTRACT,status,freshness:snapshot?.generatedAt?'SNAPSHOT':'DEGRADED',generatedAt:text(snapshot?.generatedAt),sourceModifiedAt:text(snapshot?.sourceModifiedAt),authority:'GOOGLE_DRIVE',projectionAuthority:'DERIVED_FROM_SSOT',access:'PUBLIC_SANITIZED',privacyGate:'OLYMPUS_EXCLUDED',data,provenance:provenance(snapshot)};
}
function scienceProjection(snapshot){return safeArray(snapshot?.projections?.Science);}
function engineeringProjection(snapshot){return safeArray(snapshot?.projections?.Engineering);}
function scienceWork(snapshot){return safeArray(snapshot?.sections?.WORK).filter(row=>text(row?.thread_id)==='THR::SCIENCE::ROOT');}

function graphView(snapshot){
  const nodes=[{id:'system:NEXO',type:'ROOT',label:'NEXO',status:'ACTIVE'},{id:'system:SCIENCE',type:'SYSTEM',label:'Ciência',status:'ACTIVE'},{id:'system:ENGINEERING',type:'SYSTEM',label:'Engenharia',status:'ACTIVE'},{id:'system:OPERATIONS',type:'SYSTEM',label:'Operação',status:'ACTIVE'}];
  const edges=[{source:'system:NEXO',target:'system:SCIENCE',relation:'CONTAINS'},{source:'system:NEXO',target:'system:ENGINEERING',relation:'CONTAINS'},{source:'system:NEXO',target:'system:OPERATIONS',relation:'CONTAINS'}];
  const domains=new Set();
  for(const row of scienceProjection(snapshot)){
    const id=text(row.record_id||row.id),type=upper(row.record_type||row.type),label=text(row.title)||id;if(!id||!type)continue;const domain=text(row.domain);
    if(type==='CAMPAIGN'&&domain){const domainId=`domain:${domain}`;if(!domains.has(domainId)){domains.add(domainId);nodes.push({id:domainId,type:'DOMAIN',label:domain,status:'ACTIVE',domain});edges.push({source:'system:SCIENCE',target:domainId,relation:'CONTAINS'});}nodes.push({id,type,label,status:text(row.status)||'UNKNOWN',summary:text(row.summary),domain,hasSourceRef:Boolean(text(row.source_ref))});edges.push({source:domainId,target:id,relation:'CONTAINS'});continue;}
    nodes.push({id,type,label,status:text(row.status)||'UNKNOWN',summary:text(row.summary),domain,hasSourceRef:Boolean(text(row.source_ref))});edges.push({source:'system:SCIENCE',target:id,relation:'CONTAINS'});
  }
  for(const row of engineeringProjection(snapshot)){const id=text(row.record_id||row.id),type=upper(row.record_type||row.type),label=text(row.title)||id;if(!id||!type)continue;nodes.push({id,type,label,status:text(row.status)||'UNKNOWN',summary:text(row.summary),hasSourceRef:Boolean(text(row.source_ref))});edges.push({source:'system:ENGINEERING',target:id,relation:'CONTAINS'});}
  return {nodes,edges,counts:{nodes:nodes.length,edges:edges.length}};
}
function labItems(snapshot,kinds){const wanted=new Set(kinds.map(upper));return scienceWork(snapshot).filter(row=>wanted.has(upper(row.kind))).map(row=>({id:text(row.work_id),type:upper(row.kind),title:text(row.question)||text(row.work_id),status:text(row.status)||'UNKNOWN',priority:text(row.priority),updatedAt:text(row.updated_at),hasResult:Boolean(text(row.result_ref))})).filter(item=>item.id);}
function structuralCoverage(snapshot){const science=scienceProjection(snapshot),engineering=engineeringProjection(snapshot),domains=new Set(science.map(row=>text(row.domain)).filter(Boolean));return {programs:[...science,...engineering].filter(row=>upper(row.record_type)==='PROGRAM').length,campaigns:science.filter(row=>upper(row.record_type)==='CAMPAIGN').length,domains:domains.size,tests:labItems(snapshot,['TEST']).length};}
const emptyScientific=(snapshot,kind)=>envelope(snapshot,{items:[],reason:`No structured canonical ${kind} records are available in the current SSOT.`},'EMPTY');
export function buildAtlasResearchView(snapshot,route){
  if(!RESEARCH_ROUTES.has(route))throw new Error(`UNKNOWN_RESEARCH_ROUTE:${route}`);
  if(route==='atlas-graph')return envelope(snapshot,graphView(snapshot),'OK');
  if(route==='observatory-summary')return envelope(snapshot,{coverage:structuralCoverage(snapshot),availability:{parameters:false,tensions:false,directionalSignals:false},note:'Scientific products remain empty until explicit machine-readable canonical records exist.'},'PARTIAL');
  if(route==='observatory-parameters')return emptyScientific(snapshot,'parameter estimate');
  if(route==='observatory-tensions')return emptyScientific(snapshot,'tension result');
  if(route==='observatory-directional-signals')return emptyScientific(snapshot,'directional signal');
  const labRoute={'lab-hypotheses':['HYPOTHESIS'],'lab-claims':['CLAIM'],'lab-tests':['TEST'],'lab-runs':['RUN'],'lab-results':['RESULT'],'lab-evidence':['EVIDENCE'],'lab-pipelines':['PIPELINE']}[route];
  if(labRoute){const items=labItems(snapshot,labRoute);return envelope(snapshot,{items},items.length?'OK':'EMPTY');}
  if(route==='universe-snapshot')return envelope(snapshot,{coverage:structuralCoverage(snapshot),parameters:[],tensions:[],directionalSignals:[],summary:null},'PARTIAL');
  throw new Error(`UNKNOWN_RESEARCH_ROUTE:${route}`);
}
