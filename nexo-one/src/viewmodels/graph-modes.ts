import type {ActionRecord,Capability,Domain,GraphEdge,GraphNode,ProviderHealth,SystemState} from '../contracts/system.ts';

export type GraphMode='general'|'operations'|'truth'|'capabilities'|'learning'|'nexo';
export const GRAPH_MODES:readonly {id:GraphMode;label:string;description:string}[]=[
  {id:'general',label:'Mapa Geral',description:'Estrutura e proveniência do sistema.'},
  {id:'operations',label:'Operacional',description:'ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK.'},
  {id:'truth',label:'Truth / Evidence',description:'Claims, testes, evidência e fontes.'},
  {id:'capabilities',label:'Capabilities',description:'O que o NEXO consegue executar e com qual prova.'},
  {id:'learning',label:'Learning',description:'Filamentos derivados de evidência e readback.'},
  {id:'nexo',label:'NEXO Live',description:'Topologia operacional viva do NEXO.'}
] as const;

const nowFallback='1970-01-01T00:00:00.000Z';
const text=(value:unknown)=>String(value??'').trim();
const domain=(value:unknown):Domain=>{
  const v=text(value).toUpperCase();
  if(v==='SCIENCE'||v==='ENGINEERING'||v==='OLYMPUS'||v==='ARTIFACT')return v;
  return 'NEXO';
};
const stateFor=(value:unknown):GraphNode['state']=>{
  const v=text(value).toUpperCase();
  if(['PASS','UNVERIFIED','UNKNOWN','RETIRED_RUNTIME','LIVE','SNAPSHOT','STALE','DEGRADED','BLOCKED','CONFLICT','MISSING_PROVIDER'].includes(v))return v as GraphNode['state'];
  if(['APPLIED','SUCCEEDED','CONFIRMED','ESTABLISHED'].includes(v))return 'LIVE';
  if(['FAILED','AWAITING_HUMAN'].includes(v))return 'BLOCKED';
  if(['RUNNING','PENDING','ELIGIBLE','PROPOSED','PROVISIONAL'].includes(v))return 'SNAPSHOT';
  if(v==='CONTESTED')return 'CONFLICT';
  return 'UNKNOWN';
};
const fresh=(value:any)=>value?.freshness||{state:'UNKNOWN',observed_at:null,ttl_seconds:null};
const checked=(value:any,fallback=nowFallback)=>text(value?.checked_at||value?.updated_at||value?.last_verified_at||value?.last_success_at)||fallback;
const source=(value:any,fallback:string)=>text(value?.source_ref||value?.evidence_ref)||fallback;
const revision=(value:any)=>text(value?.source_revision||value?.fingerprint)||'projection';
const fingerprint=(prefix:string,value:any)=>text(value?.fingerprint||value?.input_fingerprint||value?.observed_fingerprint)||`${prefix}:${text(value?.id||value?.action_id||value?.capability_id||value?.run_id)}`;

function makeNode(id:string,type:GraphNode['type'],label:string,d:Domain,state:GraphNode['state'],value:any,summary:string,authority:GraphNode['authority_class']='DERIVED'):GraphNode{
  return {id,type,label,domain:d,state,authority_class:authority,source_ref:source(value,`projection:${id}`),source_revision:revision(value),fingerprint:fingerprint(id,value),freshness:fresh(value),checked_at:checked(value),summary};
}
const edge=(from:string,to:string,kind:GraphEdge['kind'],explanation:string,weight=1):GraphEdge=>({id:`${kind}:${from}->${to}`,from,to,kind,weight,explanation});
const dedupe=(nodes:GraphNode[])=>[...new Map(nodes.map(node=>[node.id,node])).values()];
const validEdges=(nodes:GraphNode[],edges:GraphEdge[])=>{const ids=new Set(nodes.map(n=>n.id));return [...new Map(edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>[e.id,e])).values()];};

function capabilityNode(cap:Capability){return makeNode(`capability:${cap.capability_id}`,'CAPABILITY',cap.label||cap.capability_id,cap.domain,stateFor(cap.status),cap,`${cap.operation} · ${cap.status} · risco ${cap.risk}.`,'DELEGATED');}
function providerNode(provider:string,d:Domain,value:any,summary?:string){return makeNode(`provider:${provider}`,'PROVIDER',provider,d,stateFor(value?.state||value?.status||'LIVE'),value,summary||text(value?.explanation)||'Provider observado.','NON_AUTHORITATIVE');}
function runtimeNode(runtime:string,d:Domain,value:any){return makeNode(`runtime:${runtime}`,'PROJECTION',runtime,d,stateFor(value?.status||'LIVE'),value,`Runtime ${runtime}.`,'DERIVED');}

function operationsGraph(state:SystemState){
  const nodes:GraphNode[]=[],edges:GraphEdge[]=[];
  const capabilities=new Map((state.capabilities||[]).map(cap=>[cap.capability_id,cap]));
  for(const action of state.actions||[]){
    const d=domain(action.lane),actionId=`action:${action.action_id}`;
    nodes.push(makeNode(actionId,'ACTION',action.title,d,stateFor(action.status),action,`${action.status} · ${action.required_operation} · risco ${action.risk}.`,action.human_gate?'DELEGATED':'DERIVED'));
    if(action.capability_id){
      const cap=capabilities.get(action.capability_id);
      nodes.push(cap?capabilityNode(cap):makeNode(`capability:${action.capability_id}`,'CAPABILITY',action.capability_id,d,'UNKNOWN',action,'Capability referenciada sem projeção disponível.','DELEGATED'));
      edges.push(edge(actionId,`capability:${action.capability_id}`,'DEPENDS_ON','A ação depende desta capability.'));
    }
    if(action.runtime){nodes.push(runtimeNode(action.runtime,d,action));if(action.capability_id)edges.push(edge(`capability:${action.capability_id}`,`runtime:${action.runtime}`,'ROUTES_TO','A capability é roteada para este runtime.'));}
    if(action.effect_key){
      nodes.push(makeNode(`effect:${action.effect_key}`,'EFFECT',action.effect_key,d,stateFor(action.status),action,`Efeito esperado de ${action.title}.`,'DERIVED'));
      edges.push(edge(`runtime:${action.runtime}`,`effect:${action.effect_key}`,'PRODUCES','O runtime produz este efeito.'));
      const rb=action.readback;
      nodes.push(makeNode(`readback:${action.action_id}`,'PROJECTION',`Readback · ${action.title}`,d,stateFor(rb?.status),{...rb,source_ref:action.source_ref,fingerprint:rb?.observed_fingerprint||action.fingerprint,freshness:action.freshness,checked_at:rb?.checked_at||action.checked_at},rb?.explanation||`Readback ${rb?.status||'UNVERIFIED'}.`,'DERIVED'));
      edges.push(edge(`effect:${action.effect_key}`,`readback:${action.action_id}`,'VERIFIES','Readback confirma ou rejeita a aplicação do efeito.'));
    }
  }
  return {nodes:dedupe(nodes),edges:validEdges(dedupe(nodes),edges)};
}

function truthGraph(state:SystemState){
  const allowedTypes=new Set<GraphNode['type']>(['DOMAIN','CLAIM','TEST','PROVIDER','PROJECTION']);
  const relationKinds=new Set<GraphEdge['kind']>(['SUPPORTS','CONTRADICTS','VERIFIES','DERIVES_FROM','DEPENDS_ON','OWNS']);
  const nodes=(state.graph?.nodes||[]).filter(node=>allowedTypes.has(node.type));
  const edges=(state.graph?.edges||[]).filter(e=>relationKinds.has(e.kind));
  return {nodes,edges:validEdges(nodes,edges)};
}

function capabilitiesGraph(state:SystemState){
  const nodes:GraphNode[]=[],edges:GraphEdge[]=[];
  for(const cap of state.capabilities||[]){
    const d=cap.domain,capId=`capability:${cap.capability_id}`,provider=text(cap.provider)||'UNRESOLVED';
    nodes.push(capabilityNode(cap),providerNode(provider,d,cap,`Provider ${provider} para ${cap.operation}.`),runtimeNode(cap.runtime,d,cap));
    edges.push(edge(capId,`provider:${provider}`,'DEPENDS_ON','A capability depende deste provider.'));
    edges.push(edge(capId,`runtime:${cap.runtime}`,'ROUTES_TO','A capability executa neste runtime.'));
    if(cap.evidence_ref){
      nodes.push(makeNode(`evidence:${cap.capability_id}`,'PROJECTION','Evidência',d,stateFor(cap.status),cap,cap.evidence_ref,'DERIVED'));
      edges.push(edge(`evidence:${cap.capability_id}`,capId,'VERIFIES','A evidência suporta o estado declarado da capability.'));
    }
  }
  const unique=dedupe(nodes);return {nodes:unique,edges:validEdges(unique,edges)};
}

function learningGraph(state:SystemState){
  const nodes:GraphNode[]=[],edges:GraphEdge[]=[];
  for(const f of state.filaments||[]){
    const d=f.domain,id=`filament:${f.id}`;
    nodes.push(makeNode(id,'FILAMENT',f.label,d,stateFor(f.status),{...f,fingerprint:f.id,source_ref:f.source_ref},`${f.kind} · peso ${f.weight.toFixed(2)} · ${f.support} support · ${f.contradiction} contradiction · limite: ${f.boundary}.`,'DERIVED'));
    const from=`memory:${f.id}:from`,to=`memory:${f.id}:to`;
    nodes.push(makeNode(from,'MEMORY',f.from_label,d,'SNAPSHOT',f,`Origem observada do filamento ${f.id}.`,'DERIVED'));
    nodes.push(makeNode(to,'MEMORY',f.to_label,d,'SNAPSHOT',f,`Destino observado do filamento ${f.id}.`,'DERIVED'));
    edges.push(edge(from,id,'SUPPORTS','Observação de origem participa do filamento.',Math.max(.1,f.weight)));
    edges.push(edge(id,to,f.contradiction>f.support?'CONTRADICTS':'DERIVES_FROM','Filamento projeta o efeito com suporte e contradição explícitos.',Math.max(.1,f.weight)));
  }
  const unique=dedupe(nodes);return {nodes:unique,edges:validEdges(unique,edges)};
}

function nexoGraph(state:SystemState,access:'PUBLIC'|'PRIVATE'){
  const nodes=[...(state.graph?.nodes||[])],edges=[...(state.graph?.edges||[])];
  for(const p of state.providers||[]){
    const privateProvider=['gmail','calendar'].includes(text(p.id).toLowerCase());
    const summary=access==='PUBLIC'&&privateProvider?`AUTH_REQUIRED · conteúdo privado oculto.`:text(p.explanation)||`Provider ${p.label}.`;
    nodes.push(providerNode(text(p.id),p.expected_for?.[0]||'NEXO',p,summary));
    const root=nodes.find(n=>n.type==='DOMAIN'&&n.domain===(p.expected_for?.[0]||'NEXO'));
    if(root)edges.push(edge(root.id,`provider:${p.id}`,'DEPENDS_ON','Domínio depende da disponibilidade deste provider.'));
  }
  for(const cap of state.capabilities||[])nodes.push(capabilityNode(cap));
  const unique=dedupe(nodes);return {nodes:unique,edges:validEdges(unique,edges)};
}

export function buildGraphMode(state:SystemState,mode:GraphMode='general',access:'PUBLIC'|'PRIVATE'='PUBLIC'):{nodes:GraphNode[];edges:GraphEdge[]}{
  if(mode==='operations')return operationsGraph(state);
  if(mode==='truth')return truthGraph(state);
  if(mode==='capabilities')return capabilitiesGraph(state);
  if(mode==='learning')return learningGraph(state);
  if(mode==='nexo')return nexoGraph(state,access);
  return {nodes:state.graph?.nodes||[],edges:state.graph?.edges||[]};
}
