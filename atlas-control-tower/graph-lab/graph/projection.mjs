export const DEFAULT_FOCAL_LENGTH=760;

export function defaultCamera(){
 return {yaw:.22,pitch:-.18,zoom:1,panX:0,panY:0,flat:false};
}

export function rotatePoint([x,y,z],camera=defaultCamera()){
 if(camera.flat)return[x,y,0];
 const cy=Math.cos(camera.yaw||0),sy=Math.sin(camera.yaw||0);
 const cp=Math.cos(camera.pitch||0),sp=Math.sin(camera.pitch||0);
 const xx=x*cy+z*sy;
 const zz=z*cy-x*sy;
 const yy=y*cp-zz*sp;
 const depth=y*sp+zz*cp;
 return[xx,yy,depth];
}

export function projectPoint(point,camera,width,height,options={}){
 const focalLength=Number(options.focalLength||DEFAULT_FOCAL_LENGTH);
 const baseScale=Number(options.baseScale||Math.min(width/1000,height/700));
 const [xx,yy,depth]=rotatePoint(point,camera);
 const perspective=camera.flat?1:focalLength/Math.max(80,focalLength-depth);
 const scale=perspective*(camera.zoom||1)*baseScale;
 return {
  x:width/2+xx*scale+(camera.panX||0),
  y:height/2+yy*scale+(camera.panY||0),
  z:depth,
  scale
 };
}

// ---------------------------------------------------------------------------
// Progressive hierarchy projection: NEXO -> Domain -> Program -> Campaign.
// The first screen is the core plus its Domains. Programs appear only when their
// Domain is open, Campaigns only when their Program is open, and a Campaign is
// always a leaf. Nothing is pre-rendered and then hidden — the view is computed.
// ---------------------------------------------------------------------------

export const HIERARCHY_LEVELS=['root','domain','program','campaign'];
const LEVEL_RANK={root:0,domain:1,program:2,campaign:3};
const normalizeQuery=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');

const indexOf=source=>{
 const byId=new Map((source?.nodes||[]).map(n=>[n.id,n]));
 const children=new Map();
 for(const node of source?.nodes||[])if(node.parentId){const list=children.get(node.parentId)||[];list.push(node);children.set(node.parentId,list)}
 return{byId,children};
};

export function ancestorsOf(source,id){
 const {byId}=indexOf(source);
 const trail=[];
 let node=byId.get(id);
 let guard=0;
 while(node&&guard++<16){trail.unshift(node);node=node.parentId?byId.get(node.parentId):null}
 return trail;
}

/** Ids that own a subgraph, i.e. the nodes a click can open or collapse. */
export function hierarchyExpandableIds(source){
 const {children}=indexOf(source);
 return new Set((source?.nodes||[]).filter(node=>(children.get(node.id)||[]).length>0).map(node=>node.id));
}

/** Removes a node and everything under it from the expansion set. */
export function collapseSubtree(source,id,expandedIds=new Set()){
 const {children}=indexOf(source);
 const next=new Set(expandedIds);
 const walk=nodeId=>{next.delete(nodeId);for(const child of children.get(nodeId)||[])walk(child.id)};
 walk(id);
 return next;
}

export function hierarchyView(source,{expandedIds=new Set(),activeOnly=false,maxVisible=Infinity}={}){
 const nodes=source?.nodes||[];
 const {byId,children}=indexOf(source);
 const rootId=source?.rootId;

 const visibleIds=new Set();
 const walk=node=>{
  visibleIds.add(node.id);
  if(node.id!==rootId&&!expandedIds.has(node.id))return;
  for(const child of children.get(node.id)||[]){
   if(activeOnly&&String(child.status||'').toUpperCase()!=='ACTIVE')continue;
   walk(child);
  }
 };
 const root=byId.get(rootId)||nodes[0];
 if(root)walk(root);
 for(const node of nodes)if(!node.parentId&&!visibleIds.has(node.id))visibleIds.add(node.id);

 const ranked=nodes.filter(n=>visibleIds.has(n.id))
  .map((node,index)=>({node,index}))
  .sort((a,b)=>(LEVEL_RANK[a.node.hierarchyLevel]??9)-(LEVEL_RANK[b.node.hierarchyLevel]??9)||a.index-b.index);
 const limited=Number.isFinite(maxVisible)?ranked.slice(0,Math.max(1,maxVisible)):ranked;
 const shown=new Set(limited.map(entry=>entry.node.id));

 // Each visible node reports how much of its subgraph is still folded away, so the
 // renderer can show the weight of what a click would open.
 const projected=limited
  .sort((a,b)=>a.index-b.index)
  .map(({node})=>{
   const kids=children.get(node.id)||[];
   const hidden=kids.filter(child=>!shown.has(child.id)).length;
   return{...node,childCount:kids.length,hiddenChildren:hidden,expanded:expandedIds.has(node.id),expandable:kids.length>0&&node.id!==rootId};
  });

 return{
  rootId,
  nodes:projected,
  edges:(source?.edges||[]).filter(e=>shown.has(e.source)&&shown.has(e.target))
 };
}

/**
 * Locates a Domain, Program or Campaign and opens every ancestor on the way to it,
 * so a search result lands on an already-visible node.
 */
export function expandForSearch(source,query,expandedIds=new Set()){
 const q=normalizeQuery(query);
 const next=new Set(expandedIds);
 if(!q)return{expandedIds:next,matchId:null,matches:[]};
 const {byId}=indexOf(source);
 const candidates=(source?.nodes||[]).filter(n=>['domain','program','campaign'].includes(n.hierarchyLevel));
 const scored=candidates.filter(n=>[n.label,n.recordId,n.id,n.summary].some(value=>normalizeQuery(value).includes(q)));
 const match=scored.find(n=>normalizeQuery(n.recordId)===q||normalizeQuery(n.label)===q)
  ||scored.find(n=>[n.label,n.recordId].some(value=>normalizeQuery(value).startsWith(q)))
  ||scored[0];
 if(!match)return{expandedIds:next,matchId:null,matches:[]};
 let parent=byId.get(match.parentId);
 let guard=0;
 while(parent&&parent.id!==source?.rootId&&guard++<16){next.add(parent.id);parent=parent.parentId?byId.get(parent.parentId):null}
 return{expandedIds:next,matchId:match.id,matches:scored.slice(0,8)};
}
