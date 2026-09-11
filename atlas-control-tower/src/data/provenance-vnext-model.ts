type AnyRecord=Record<string,unknown>;
type GraphLike={nodes?:unknown;edges?:unknown;source?:unknown;freshness?:unknown;focus?:unknown}|null|undefined;

const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const text=(value:unknown):string=>typeof value==='string'?value:'';
const finite=(value:unknown):number|null=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const present=(value:unknown)=>text(value)
 .replace(/Durable\s+Neon\s+Bridge\s+V1/gi,'Durable Bridge V1')
 .replace(/\bNeon\b/gi,'backend')
 .replace(/VERCEL_OIDC_NEON_DATA_API/gi,'runtime autenticado')
 .replace(/\bOIDC\b/gi,'identidade de runtime');

export function buildAuditModel(input:unknown){
 if(!input)return {available:false,metrics:{total:null,open:null,resolved:null},categories:[],issues:[]};
 const audit=record(input),categories=list(audit.categories).map(category=>{
  const items=list(category.items).map(item=>({
   id:text(item.id),label:text(item.label)||text(item.id),status:text(item.status),severity:text(item.severity),open:item.open===true,
   detail:present(item.detail),resolution:present(item.resolution),missing:present(item.missing),issueType:text(item.issueType)||text(category.id),
  }));
  return {id:text(category.id),label:text(category.label)||text(category.id).replaceAll('_',' '),severity:text(category.severity),count:finite(category.count),openCount:finite(category.openCount),items};
 });
 const issues=categories.flatMap(category=>category.items.map(item=>({...item,categoryId:category.id})))
  .sort((a,b)=>Number(b.open)-Number(a.open)||a.severity.localeCompare(b.severity));
 return {available:true,metrics:{total:finite(audit.total),open:finite(audit.open),resolved:finite(audit.resolved)},categories,issues};
}

export function buildLineageModel(input:GraphLike,focusId:string){
 if(!input)return {available:false,focusId,nodes:[],edges:[],source:'',freshness:''};
 const graph=record(input),nodes=list(graph.nodes).map(node=>({
  id:text(node.id),type:text(node.type),label:text(node.label)||text(node.id),status:text(node.status),summary:present(node.summary),
  sourceRefs:list(node.sourceRefs).map(ref=>({source:text(ref.source),sourceRef:text(ref.sourceRef),url:text(ref.url),observedAt:text(ref.observedAt)})),
 })).filter(node=>node.id);
 const ids=new Set(nodes.map(node=>node.id));
 const edges=list(graph.edges).map(edge=>({
  id:text(edge.id)||`${text(edge.source)}:${text(edge.type)}:${text(edge.target)}`,
  source:text(edge.source),target:text(edge.target),type:text(edge.type),authority:text(edge.authority),
 })).filter(edge=>ids.has(edge.source)&&ids.has(edge.target));
 return {
  available:true,focusId:focusId||text(graph.focus),nodes,edges,
  source:text(graph.source),freshness:text(graph.freshness),
 };
}
