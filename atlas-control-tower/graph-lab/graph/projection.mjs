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
// Progressive hierarchy projection: NEXO -> Lane -> Domain/System -> Program
// -> Campaign. Associative-memory nodes are overlayOnly: they are never children
// of the canonical hierarchy and appear only when the alternative-filament layer
// is enabled and connected to something already visible.
// ---------------------------------------------------------------------------

export const HIERARCHY_LEVELS=['root','lane','domain','group','program','person','project','campaign','state','record','memory'];
const LEVEL_RANK={root:0,lane:1,domain:2,group:2,program:3,person:3,project:3,campaign:4,state:4,record:5,memory:8};
const normalizeQuery=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');
const isAlternativeEdge=edge=>String(edge?.kind||edge?.type||'').toLowerCase().startsWith('alternative')||edge?.alternative===true;

const indexOf=source=>{
 const byId=new Map((source?.nodes||[]).map(n=>[n.id,n]));
 const children=new Map();
 for(const node of source?.nodes||[])if(node.parentId&&!node.overlayOnly){const list=children.get(node.parentId)||[];list.push(node);children.set(node.parentId,list)}
 return{byId,children};
};

export function ancestorsOf(source,id){
 const {byId}=indexOf(source);
 const trail=[];
 let node=byId.get(id);
 let guard=0;
 while(node&&guard++<24){trail.unshift(node);node=node.parentId?byId.get(node.parentId):null}
 return trail;
}

function primaryLaneId(source,id){
 return ancestorsOf(source,id).find(step=>step.hierarchyLevel==='lane')?.id||null;
}

function keepPrimaryLane(source,expandedIds,laneId){
 if(!laneId)return new Set(expandedIds);
 const next=new Set();
 for(const expandedId of expandedIds){
  const expandedLane=primaryLaneId(source,expandedId);
  if(!expandedLane||expandedLane===laneId)next.add(expandedId);
 }
 return next;
}

/** Ids that own a subgraph, i.e. the nodes a click can open or collapse. */
export function hierarchyExpandableIds(source){
 const {children}=indexOf(source);
 return new Set((source?.nodes||[]).filter(node=>!node.overlayOnly&&(children.get(node.id)||[]).length>0).map(node=>node.id));
}

/** Removes a node and everything under it from the expansion set. */
export function collapseSubtree(source,id,expandedIds=new Set()){
 const {children}=indexOf(source);
 const next=new Set(expandedIds);
 const walk=nodeId=>{next.delete(nodeId);for(const child of children.get(nodeId)||[])walk(child.id)};
 walk(id);
 return next;
}

/**
 * Opens a hierarchy owner without allowing all three macro lanes to remain
 * exploded simultaneously. A lane is a primary workspace: opening Ciência,
 * Olympus or Engenharia folds the previously opened macro lane. Descendants
 * keep their canonical ancestors open so drill-down remains stable.
 */
export function expandHierarchyNode(source,id,expandedIds=new Set()){
 const {byId}=indexOf(source);
 const node=byId.get(id);
 if(!node||node.overlayOnly)return new Set(expandedIds);
 const laneId=node.hierarchyLevel==='lane'?node.id:primaryLaneId(source,id);
 if(node.hierarchyLevel==='lane')return new Set([id]);
 const next=keepPrimaryLane(source,expandedIds,laneId);
 for(const step of ancestorsOf(source,id).slice(0,-1))if(step.id!==source?.rootId)next.add(step.id);
 next.add(id);
 return next;
}

function addConnectedOverlayNodes(source,shown,{limit=36}={}){
 const overlayById=new Map((source?.nodes||[]).filter(node=>node.overlayOnly).map(node=>[node.id,node]));
 if(!overlayById.size)return shown;
 const next=new Set(shown);let changed=true,round=0,added=0;
 const alternatives=(source?.edges||[]).filter(isAlternativeEdge);
 while(changed&&round++<16&&added<limit){
  changed=false;
  for(const edge of alternatives){
   const sourceShown=next.has(edge.source),targetShown=next.has(edge.target);
   if(sourceShown&&!targetShown&&overlayById.has(edge.target)&&added<limit){next.add(edge.target);added++;changed=true}
   if(targetShown&&!sourceShown&&overlayById.has(edge.source)&&added<limit){next.add(edge.source);added++;changed=true}
  }
 }
 return next;
}

export function hierarchyView(source,{expandedIds=new Set(),activeOnly=false,maxVisible=Infinity,showAlternativeFilaments=source?.alternativeFilamentsDefault===true}={}){
 const nodes=source?.nodes||[];
 const {byId,children}=indexOf(source);
 const rootId=source?.rootId;

 const visibleIds=new Set();
 const walk=node=>{
  if(node.overlayOnly)return;
  visibleIds.add(node.id);
  if(node.id!==rootId&&!expandedIds.has(node.id))return;
  for(const child of children.get(node.id)||[]){
   if(activeOnly&&String(child.status||'').toUpperCase()!=='ACTIVE')continue;
   walk(child);
  }
 };
 const root=byId.get(rootId)||nodes.find(node=>!node.overlayOnly);
 if(root)walk(root);
 for(const node of nodes)if(!node.parentId&&!node.overlayOnly&&!visibleIds.has(node.id))visibleIds.add(node.id);

 const ranked=nodes.filter(n=>!n.overlayOnly&&visibleIds.has(n.id))
  .map((node,index)=>({node,index}))
  .sort((a,b)=>(LEVEL_RANK[a.node.hierarchyLevel]??9)-(LEVEL_RANK[b.node.hierarchyLevel]??9)||a.index-b.index);
 const limited=Number.isFinite(maxVisible)?ranked.slice(0,Math.max(1,maxVisible)):ranked;
 let shown=new Set(limited.map(entry=>entry.node.id));
 if(showAlternativeFilaments)shown=addConnectedOverlayNodes(source,shown,{limit:Math.min(36,Math.max(8,Number.isFinite(maxVisible)?Math.ceil(maxVisible*.4):36))});

 const projected=nodes.filter(node=>shown.has(node.id)).map(node=>{
   if(node.overlayOnly)return{...node,childCount:0,hiddenChildren:0,expanded:false,expandable:false};
   const kids=children.get(node.id)||[];
   const hidden=kids.filter(child=>!shown.has(child.id)).length;
   return{...node,childCount:kids.length,hiddenChildren:hidden,expanded:expandedIds.has(node.id),expandable:kids.length>0&&node.id!==rootId};
  });

 const edges=(source?.edges||[]).filter(edge=>{
  if(!shown.has(edge.source)||!shown.has(edge.target))return false;
  if(isAlternativeEdge(edge)){
   if(source?.associative&&!edge.associative)return false;
   return showAlternativeFilaments;
  }
  return true;
 });

 return{rootId,nodes:projected,edges};
}

/**
 * Locates a Lane, Domain, Program, Person or Campaign and opens every ancestor
 * on the way to it, so a search result lands on an already-visible node.
 */
export function expandForSearch(source,query,expandedIds=new Set()){
 const q=normalizeQuery(query);
 if(!q)return{expandedIds:new Set(expandedIds),matchId:null,matches:[]};
 const {byId}=indexOf(source);
 const searchableLevels=new Set(['lane','domain','group','program','person','project','campaign','state','record','memory']);
 const candidates=(source?.nodes||[]).filter(n=>searchableLevels.has(n.hierarchyLevel));
 const scored=candidates.filter(n=>[n.label,n.recordId,n.id,n.summary,n.detail,n.system].some(value=>normalizeQuery(value).includes(q)));
 const match=scored.find(n=>normalizeQuery(n.recordId)===q||normalizeQuery(n.label)===q)
  ||scored.find(n=>[n.label,n.recordId].some(value=>normalizeQuery(value).startsWith(q)))
  ||scored[0];
 if(!match)return{expandedIds:new Set(expandedIds),matchId:null,matches:[]};
 if(match.overlayOnly)return{expandedIds:new Set(expandedIds),matchId:match.id,matches:scored.slice(0,8)};
 const laneId=primaryLaneId(source,match.id);
 const next=keepPrimaryLane(source,expandedIds,laneId);
 let parent=byId.get(match.parentId);
 let guard=0;
 while(parent&&parent.id!==source?.rootId&&guard++<24){next.add(parent.id);parent=parent.parentId?byId.get(parent.parentId):null}
 return{expandedIds:next,matchId:match.id,matches:scored.slice(0,8)};
}
