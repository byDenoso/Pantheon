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

const isHierarchyNode=node=>['domain','program','campaign'].includes(node?.hierarchyLevel);
const normalizeQuery=value=>String(value||'').trim().toLocaleLowerCase('pt-BR');

export function hierarchyExpandableIds(source){
 const childLevels=new Map();
 for(const node of source?.nodes||[])if(node.parentId&&node.hierarchyLevel){const levels=childLevels.get(node.parentId)||new Set();levels.add(node.hierarchyLevel);childLevels.set(node.parentId,levels)}
 return new Set((source?.nodes||[]).filter(node=>{const levels=childLevels.get(node.id);return levels?.has('program')||levels?.has('campaign')}).map(node=>node.id));
}

export function hierarchyView(source,{expandedIds=new Set(),activeOnly=false,maxVisible=Infinity}={}){
 const visible=[];
 for(const node of source?.nodes||[]){
  if(activeOnly&&node.type!=='SYSTEM'&&String(node.status||'').toUpperCase()!=='ACTIVE')continue;
  if(node.hierarchyLevel==='program'&&!expandedIds.has(node.parentId))continue;
  if(node.hierarchyLevel==='campaign'&&!expandedIds.has(node.parentId))continue;
  visible.push(node);
 }
 const limited=Number.isFinite(maxVisible)?visible.slice(0,Math.max(1,maxVisible)):visible;
 const ids=new Set(limited.map(n=>n.id));
 return{nodes:limited,edges:(source?.edges||[]).filter(e=>ids.has(e.source)&&ids.has(e.target))};
}

export function expandForSearch(source,query,expandedIds=new Set()){
 const q=normalizeQuery(query);const next=new Set(expandedIds);
 if(!q)return{expandedIds:next,matchId:null};
 const byId=new Map((source?.nodes||[]).map(n=>[n.id,n]));
 const match=(source?.nodes||[]).find(n=>['program','campaign'].includes(n.hierarchyLevel)&&[n.label,n.recordId,n.id].some(v=>normalizeQuery(v).includes(q)));
 if(!match)return{expandedIds:next,matchId:null};
 let parent=byId.get(match.parentId);
 while(parent&&parent.hierarchyLevel){next.add(parent.id);parent=byId.get(parent.parentId)}
 return{expandedIds:next,matchId:match.id};
}
