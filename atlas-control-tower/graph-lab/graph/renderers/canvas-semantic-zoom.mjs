const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const SEMANTIC_ZOOM_THRESHOLDS=Object.freeze({
 overview:.70,
 domain:1.35,
 program:2.25
});

const LEVEL_RANK=Object.freeze({root:0,lane:1,domain:2,group:2,program:3,person:3,project:3,campaign:4,state:4,record:5,memory:6});

const edgeId=edge=>edge.id||`${edge.source}->${edge.target}:${edge.kind||edge.type||''}`;
const kindOf=edge=>String(edge?.kind||edge?.type||'').toLowerCase().replaceAll('_','-');
const alternative=edge=>Boolean(edge?.associative||edge?.alternative||kindOf(edge).startsWith('alternative'));
const isMemory=node=>Boolean(node?.overlayOnly||node?.hierarchyLevel==='memory'||String(node?.type||'').toUpperCase().includes('MEMORY'));

function indexes(graph){
 const byId=new Map((graph?.nodes||[]).map(node=>[node.id,node]));
 const children=new Map();
 for(const node of graph?.nodes||[])if(node.parentId&&!node.overlayOnly){const list=children.get(node.parentId)||[];list.push(node);children.set(node.parentId,list)}
 const incident=new Map();
 for(const edge of graph?.edges||[]){
  const listA=incident.get(edge.source)||[];listA.push(edge);incident.set(edge.source,listA);
  const listB=incident.get(edge.target)||[];listB.push(edge);incident.set(edge.target,listB);
 }
 return{byId,children,incident};
}

function ancestors(byId,id){
 const out=[];let node=byId.get(id);let guard=0;
 while(node&&guard++<32){out.unshift(node);node=node.parentId?byId.get(node.parentId):null}
 return out;
}

function descendants(children,id,limit=Infinity){
 const out=[];const stack=[...(children.get(id)||[])];let guard=0;
 while(stack.length&&guard++<5000&&out.length<limit){const node=stack.shift();out.push(node);stack.push(...(children.get(node.id)||[]))}
 return out;
}

function oneHopIds(graph,id){
 const ids=new Set();if(!id)return ids;
 for(const edge of graph?.edges||[]){
  if(edge.source===id)ids.add(edge.target);
  if(edge.target===id)ids.add(edge.source);
 }
 return ids;
}

export function semanticZoomBand(cameraZoom=1){
 const z=Number(cameraZoom)||1;
 if(z<SEMANTIC_ZOOM_THRESHOLDS.overview)return'overview';
 if(z<SEMANTIC_ZOOM_THRESHOLDS.domain)return'domain';
 if(z<SEMANTIC_ZOOM_THRESHOLDS.program)return'program';
 return'audit';
}

function domainOf(byId,node){
 if(!node)return null;
 const trail=ancestors(byId,node.id);
 return trail.find(step=>step.hierarchyLevel==='lane')?.id||trail.find(step=>step.hierarchyLevel==='domain')?.id||node.id;
}

export function semanticVisibility(node,{band='overview',selectedId=null,focusId=null,graph={nodes:[],edges:[]}}={}){
 if(!node)return Object.freeze({visible:false,priority:0,alpha:0,reason:'missing'});
 const {byId,children}=indexes(graph);
 const selected=selectedId&&node.id===selectedId;
 const focused=focusId&&node.id===focusId;
 const rank=LEVEL_RANK[node.hierarchyLevel]??(node.overlayOnly?6:4);
 const memory=isMemory(node);
 const selectedTrail=new Set(selectedId?ancestors(byId,selectedId).map(step=>step.id):[]);
 const focusTrail=new Set(focusId?ancestors(byId,focusId).map(step=>step.id):[]);
 const selectedHop=oneHopIds(graph,selectedId);
 const focusHop=oneHopIds(graph,focusId);
 const focusDomain=domainOf(byId,byId.get(focusId));
 const nodeDomain=domainOf(byId,node);
 const directChildOfFocus=focusId&&node.parentId===focusId;
 const belowFocus=focusId&&descendants(children,focusId,96).some(child=>child.id===node.id);
 if(selected||focused)return Object.freeze({visible:true,priority:100,alpha:1,reason:'selected'});
 if(selectedTrail.has(node.id)||focusTrail.has(node.id))return Object.freeze({visible:true,priority:92-rank,alpha:.96,reason:'ancestor'});
 if(band==='overview'){
  const visible=!memory&&rank<=1;
  return Object.freeze({visible,priority:visible?80-rank:0,alpha:visible?1:0,reason:visible?'overview':'overview-hidden'});
 }
 if(band==='domain'){
  const sameDomain=focusDomain&&nodeDomain===focusDomain;
  const visible=!memory&&(rank<=2||directChildOfFocus||belowFocus&&rank<=3||sameDomain&&rank<=3);
  return Object.freeze({visible,priority:visible?(sameDomain?74-rank:58-rank):0,alpha:visible?(sameDomain||rank<=1?1:.66):0,reason:visible?'domain':'domain-hidden'});
 }
 if(band==='program'){
  const connected=selectedHop.has(node.id)||focusHop.has(node.id);
  const sameDomain=focusDomain&&nodeDomain===focusDomain;
  const visible=rank<=3||sameDomain&&rank<=4||connected||memory&&connected;
  return Object.freeze({visible,priority:visible?(connected?86:66-rank):0,alpha:visible?(memory?.74:1):0,reason:visible?'program':'program-hidden'});
 }
 const auditContext=selectedTrail.has(node.id)||selectedHop.has(node.id)||focusHop.has(node.id)||node.parentId===selectedId||node.parentId===focusId||rank<=1;
 const visible=auditContext||selected||focused;
 return Object.freeze({visible,priority:visible?(auditContext?90-rank:40-rank):0,alpha:visible?(rank<=1?.30:1):0,reason:visible?'audit':'audit-hidden'});
}

export function semanticEdgeVisibility(edge,{visibleNodeIds=new Set(),band='overview',selectedId=null,focusId=null}={}){
 if(!edge||!visibleNodeIds.has(edge.source)||!visibleNodeIds.has(edge.target))return Object.freeze({visible:false,priority:0,alpha:0});
 const assoc=alternative(edge);
 const incident=edge.source===selectedId||edge.target===selectedId||edge.source===focusId||edge.target===focusId;
 const declared=edge.weight!=null&&String(edge.weight).trim()!=='';
 const weight=declared?Math.max(0,Math.min(1,Number(String(edge.weight).replace(',','.'))||0)):1;
 if(band==='overview'&&assoc&&!declared)return Object.freeze({visible:false,priority:0,alpha:0});
 if(band==='overview'&&assoc&&weight<.72)return Object.freeze({visible:false,priority:0,alpha:0});
 return Object.freeze({visible:true,priority:(incident?90:50)+(assoc?8:0)+weight*10,alpha:assoc?Math.max(.35,weight):1});
}

export function semanticGraphView(graph,{cameraZoom=1,selectedId=null,focusId=null,maxVisible=Infinity,enabled=true}={}){
 if(!enabled){
  const nodes=[...(graph?.nodes||[])],edges=[...(graph?.edges||[])];
  return{...graph,nodes,edges,band:'program',nodeState:new Map(nodes.map(node=>[node.id,{visible:true,priority:1,alpha:1}])),edgeState:new Map(edges.map(edge=>[edgeId(edge),{visible:true,priority:1,alpha:1}]))};
 }
 const band=semanticZoomBand(cameraZoom);
 const nodeState=new Map();
 const ranked=[];
 for(const node of graph?.nodes||[]){
  const state=semanticVisibility(node,{band,selectedId,focusId,graph});
  nodeState.set(node.id,state);
  if(state.visible)ranked.push({node,state});
 }
 ranked.sort((a,b)=>b.state.priority-a.state.priority);
 const limited=Number.isFinite(maxVisible)?ranked.slice(0,Math.max(1,maxVisible)):ranked;
 const nodes=limited.map(({node,state})=>({...node,semanticAlpha:state.alpha,semanticPriority:state.priority}));
 const visibleNodeIds=new Set(nodes.map(node=>node.id));
 const edgeState=new Map();
 const edges=[];
 for(const edge of graph?.edges||[]){
  const state=semanticEdgeVisibility(edge,{visibleNodeIds,band,selectedId,focusId});
  edgeState.set(edgeId(edge),state);
  if(state.visible)edges.push({...edge,semanticAlpha:state.alpha,semanticPriority:state.priority});
 }
 edges.sort((a,b)=>(b.semanticPriority||0)-(a.semanticPriority||0));
 return{...graph,nodes,edges,band,nodeState,edgeState,visibleNodeIds};
}
