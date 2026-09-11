import type {GraphEdge,GraphNode,GraphProjection} from './types';

const hash=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const clamp=(value:number,min=5,max=95)=>Math.max(min,Math.min(max,value));
export const ringRadius=(total:number,level:'atlas'|'domain'|'detail')=>{
 const base=level==='atlas'?30:level==='domain'?34:level==='detail'?21:28;
 return Math.min(level==='detail'?34:40,base+Math.max(0,Math.sqrt(Math.max(0,total-6))*2.2));
};
export const clusterSpread=(total:number)=>Math.min(9,3.8+Math.sqrt(Math.max(total,1))*0.9);
export const orbitPoint=(id:string,index:number,total:number,radius:number,ring=0)=>{
 const perRing=Math.max(6,Math.ceil(Math.sqrt(Math.max(total,1))*3.2));
 const localIndex=index%perRing;
 const ringIndex=ring||Math.floor(index/perRing);
 const ringCount=Math.min(perRing,Math.max(1,total-ringIndex*perRing));
 const seed=(hash(id)%360)*Math.PI/180;
 const a=(localIndex/Math.max(ringCount,1))*Math.PI*2+seed*.055+ringIndex*.31;
 const r=radius+ringIndex*clusterSpread(total);
 return{x:clamp(50+Math.cos(a)*r),y:clamp(50+Math.sin(a)*r*.72),z:(hash(id)%21-10)/10};
};
const validEdges=(nodes:GraphNode[],edges:GraphEdge[])=>{const ids=new Set(nodes.map(n=>n.id));return edges.filter(e=>e.declared===true&&ids.has(e.source)&&ids.has(e.target))};

export function atlasProjection(model:any):GraphProjection{
 const items=Array.isArray(model?.items)?model.items:[];
 const root:GraphNode={id:'system:NEXO',label:'NEXO',type:'ROOT',x:50,y:50,z:0};
 const radius=ringRadius(items.length,'atlas');
 const children:GraphNode[]=items.map((item:any,i:number)=>({...orbitPoint(String(item.id),i,items.length,radius),id:String(item.id),label:String(item.label||item.id),type:'DOMAIN',parentId:root.id,summary:item.summary||null,metrics:{subgraphs:item.subdomainCount??null}}));
 const edges:GraphEdge[]=children.map(n=>({id:`root:${n.id}`,source:root.id,target:n.id,type:'CONTEXT',declared:true}));
 return{id:'atlas',version:'v2',level:'atlas',focusId:root.id,nodes:[root,...children],edges,breadcrumbs:[{id:'system:NEXO',label:'NEXO',path:'/graphs'}],capabilities:{drillDown:true,learning:true,provenance:true,search:true}};
}

export function domainProjection(domainId:string,model:any):GraphProjection{
 const items=Array.isArray(model?.domains)?model.domains:[];
 const parentId=`system:${domainId.toUpperCase()}`;
 const parent:GraphNode={id:parentId,label:String(model?.universeLabel||domainId),type:'DOMAIN',x:50,y:50,z:0};
 const radius=ringRadius(items.length,'domain');
 const children:GraphNode[]=items.map((item:any,i:number)=>({...orbitPoint(String(item.id),i,items.length,radius),id:String(item.id),label:String(item.label||item.id),type:'SUBGRAPH',parentId,summary:item.summary||null,status:item.status||null,metrics:{relations:item.relationCount??null,strength:item.relationStrength??null}}));
 const relationEdges:GraphEdge[]=(Array.isArray(model?.relations)?model.relations:[]).map((edge:any)=>({id:String(edge.id),source:String(edge.source),target:String(edge.target),type:'STRUCTURAL',declared:true,strength:edge.strength??null}));
 const contextEdges:GraphEdge[]=children.map(n=>({id:`context:${n.id}`,source:parent.id,target:n.id,type:'CONTEXT',declared:true}));
 return{id:`domain:${domainId}`,version:'v2',level:'domain',focusId:parent.id,nodes:[parent,...children],edges:validEdges([parent,...children],[...relationEdges,...contextEdges]),breadcrumbs:[{id:'system:NEXO',label:'NEXO',path:'/graphs'},{id:parent.id,label:parent.label,path:`/graphs/${domainId}`}],capabilities:{drillDown:true,learning:true,provenance:true,search:true}};
}

export function detailProjection(focusId:string,graph:any):GraphProjection{
 const raw=Array.isArray(graph?.nodes)?graph.nodes:[];
 const rootRaw=raw.find((node:any)=>String(node.id)===focusId)||raw[0]||null;
 const rest=rootRaw?raw.filter((node:any)=>node!==rootRaw):raw;
 const radius=ringRadius(rest.length,'detail');
 const nodes:GraphNode[]=[];
 if(rootRaw)nodes.push({id:String(rootRaw.id),label:String(rootRaw.label||rootRaw.id),type:String(rootRaw.type||'ENTITY'),x:50,y:50,z:0,parentId:rootRaw.parentId||null,summary:rootRaw.summary||null,status:rootRaw.status||null});
 rest.forEach((node:any,i:number)=>nodes.push({...orbitPoint(String(node.id),i,rest.length,radius),id:String(node.id),label:String(node.label||node.id),type:String(node.type||'ENTITY'),parentId:node.parentId||focusId,summary:node.summary||null,status:node.status||null}));
 const edges:GraphEdge[]=(Array.isArray(graph?.edges)?graph.edges:[]).map((edge:any,i:number)=>({id:String(edge.id||`edge:${i}`),source:String(edge.source),target:String(edge.target),type:String(edge.type||'STRUCTURAL'),declared:true,strength:edge.weight??edge.strength??null}));
 return{id:`detail:${focusId}`,version:String(graph?.fingerprint||'v2'),level:'detail',focusId,nodes,edges:validEdges(nodes,edges),breadcrumbs:[],capabilities:{drillDown:true,learning:true,provenance:true,search:true}};
}

export function learningOverlay(relations:any,nodes:GraphNode[]){
 const ids=new Set(nodes.map(n=>n.id));
 const rows=Array.isArray(relations?.relations)?relations.relations:Array.isArray(relations)?relations:[];
 const edges:GraphEdge[]=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i]||{};const source=String(r.source||r.sourceId||r.from||'');const target=String(r.target||r.targetId||r.to||'');
  if(!source||!target||!ids.has(source)||!ids.has(target))continue;
  edges.push({id:String(r.id||`learning:${i}:${source}:${target}`),source,target,type:String(r.type||r.learningType||'LEARNING'),declared:true,direction:r.direction||null,strength:r.strength??null,metadata:{scope:r.scope||null,evidenceRefs:r.evidenceRefs||null}});
 }
 return{id:'learning',type:'learning',enabled:true,edges} as const;
}
