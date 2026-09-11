import { provenanceLabel } from '../../lib/graph-contract.mjs';

type AnyRecord=Record<string,unknown>;
type GraphLike={nodes?:unknown;edges?:unknown;source?:string;freshness?:string;sourceVersion?:string}|null|undefined;

const UNIVERSE_IDS=['SCIENCE','ENGINEERING','OLYMPUS','AI'] as const;
const LABELS:Record<string,string>={SCIENCE:'Ciência',ENGINEERING:'Engenharia',OLYMPUS:'Olympus',AI:'IA'};
const DESCRIPTIONS:Record<string,string>={
 SCIENCE:'Pesquisa científica, hipóteses, testes e evidências.',
 ENGINEERING:'Runtimes, pipelines, ferramentas e infraestrutura.',
 OLYMPUS:'Pessoas, estado, evolução e programas estruturados.',
 AI:'Agentes, modelos, avaliações e ferramentas de IA.',
};
const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const text=(value:unknown):string=>typeof value==='string'?value:'';
const systemKey=(id:string)=>id.replace(/^system:/,'').toUpperCase();

function domainRank(id:string){
 const m=id.match(/^D(\d+)$/i); if(m)return Number(m[1]);
 if(/^M\d+$/i.test(id))return 1000+Number(id.slice(1));
 return 2000;
}
export function buildSubdomainsModel(universeId:string,graph:GraphLike){
 const g=record(graph),nodes=list(g.nodes);
 const items=nodes.filter(node=>text(node.type).toUpperCase()==='DOMAIN').map(node=>{
  const id=text(node.domain)||text(node.id).replace(/^domain:/,'');
  return {id,label:text(node.label)||id,status:text(node.status),summary:text(node.summary),path:`/universes/${universeId}/${id}`};
 }).filter(item=>item.id).sort((a,b)=>domainRank(a.id)-domainRank(b.id)||a.id.localeCompare(b.id));
 return {available:Boolean(graph),items};
}

export function buildUniversesModel(rootGraph:GraphLike,details:Record<string,GraphLike>={}){
 if(!rootGraph)return {available:false,sourceLabel:'INDISPONÍVEL',items:[]};
 const root=record(rootGraph),nodes=list(root.nodes),edges=list(root.edges);
 const children=new Set(edges.filter(e=>text(e.source)==='system:NEXO'&&text(e.type)==='CONTAINS').map(e=>text(e.target)));
 const systems=nodes.filter(node=>text(node.type).toUpperCase()==='SYSTEM'&&children.has(text(node.id)));
 const items=UNIVERSE_IDS.flatMap(key=>{
  const node=systems.find(item=>systemKey(text(item.id))===key); if(!node)return [];
  const id=key.toLowerCase(),detail=details[id]??null,detailNodes=list(record(detail).nodes);
  const entityCount=detail?Math.max(0,detailNodes.filter(n=>text(n.id)!==text(node.id)).length):null;
  const subdomainCount=detail?detailNodes.filter(n=>text(n.type).toUpperCase()==='DOMAIN').length:null;
  return [{id,label:LABELS[key],description:DESCRIPTIONS[key],status:text(node.status),path:`/universes/${id}`,entityCount,subdomainCount}];
 });
 const source=text(root.source)||'legacy',freshness=text(root.freshness)||'SNAPSHOT';
 return {available:true,sourceLabel:provenanceLabel({source,freshness}),items};
}
export function buildUniverseView(universeId:string,graph:GraphLike){
 const id=String(universeId||'').toLowerCase(),key=id.toUpperCase();
 const label=LABELS[key]||id||'Universo',description=DESCRIPTIONS[key]||'Contexto publicado pelo NEXO.';
 if(!graph)return {available:false,id,label,description,status:'',sourceLabel:'INDISPONÍVEL',subdomains:[],entities:[],facets:[]};
 const g=record(graph),nodes=list(g.nodes);
 const systemId=`system:${key}`;
 const system=nodes.find(node=>text(node.id).toUpperCase()===systemId.toUpperCase())||{};
 const subdomains=buildSubdomainsModel(id,graph).items;
 const entities=nodes.filter(node=>text(node.id)!==systemId&&text(node.type).toUpperCase()!=='DOMAIN').map(node=>({
  id:text(node.id),label:text(node.label)||text(node.id),type:text(node.type)||'ENTITY',status:text(node.status),summary:text(node.summary)
 })).filter(item=>item.id).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')).slice(0,24);
 const counts=new Map<string,number>();
 for(const item of entities)counts.set(item.type,(counts.get(item.type)||0)+1);
 const facets=[...counts.entries()].map(([type,count])=>({type,count})).sort((a,b)=>b.count-a.count||a.type.localeCompare(b.type));
 const source=text(g.source)||'legacy',freshness=text(g.freshness)||'SNAPSHOT';
 return {available:true,id,label,description,status:text(system.status),sourceLabel:provenanceLabel({source,freshness}),subdomains,entities,facets};
}
