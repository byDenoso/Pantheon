export const PRESENTATION_ROOT='__PRESENTATION_NEXO__';
export const DOMAIN_PREFIX='__PRESENTATION_CLUSTER__:';
const DOMAIN_ORDER=['SCIENCE','ENGINEERING','INTERDOMAIN','OLYMPUS','OPERATIONS','REFERENCES','OTHER'];
const HIERARCHY_EDGE_TYPES=new Set(['CONTAINS','PARENT_OF','HAS_CHILD','TESTS','PRODUCES','EXECUTED_AS','DERIVED_FROM','IMPLEMENTS','REPORTS_ON']);

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function stableHash(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0}
function fallbackLevel(node){const id=String(node?.id||'');const type=String(node?.type||'').toUpperCase();if(id===PRESENTATION_ROOT||type==='ROOT')return 0;if(id.startsWith(DOMAIN_PREFIX)||node?.presentationOnly)return 1;return 2}
function domainFromId(id){return id.startsWith(DOMAIN_PREFIX)?id.slice(DOMAIN_PREFIX.length):''}

export function buildStructuralIndex(nodes,edges=[]){
  const ordered=[...nodes].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const byId=new Map(ordered.map(node=>[String(node.id),node]));
  const parentByChild=new Map();
  for(const node of ordered){
    const id=String(node.id);const explicit=typeof node.layoutParent==='string'?node.layoutParent:typeof node.parentId==='string'?node.parentId:'';
    if(explicit&&explicit!==id)parentByChild.set(id,explicit);
  }
  for(const edge of edges){
    const type=String(edge?.type||'').toUpperCase();const source=String(edge?.source||'');const target=String(edge?.target||'');
    if(!HIERARCHY_EDGE_TYPES.has(type)||!source||!target||source===target||parentByChild.has(target))continue;
    parentByChild.set(target,source);
  }
  const degree=new Map(ordered.map(node=>[String(node.id),0]));
  for(const edge of edges){const s=String(edge?.source||''),t=String(edge?.target||'');if(degree.has(s))degree.set(s,(degree.get(s)||0)+1);if(degree.has(t))degree.set(t,(degree.get(t)||0)+1)}
  for(const [child,parent] of parentByChild){if(degree.has(child))degree.set(child,(degree.get(child)||0)+1);if(degree.has(parent))degree.set(parent,(degree.get(parent)||0)+1)}
  const levelMemo=new Map();
  const levelFor=(id,trail=new Set())=>{
    if(levelMemo.has(id))return levelMemo.get(id);
    const node=byId.get(id);if(!node)return 2;
    if(id===PRESENTATION_ROOT||String(node.type||'').toUpperCase()==='ROOT'){levelMemo.set(id,0);return 0}
    if(trail.has(id)){const fallback=fallbackLevel(node);levelMemo.set(id,fallback);return fallback}
    const next=new Set(trail);next.add(id);const parent=parentByChild.get(id);
    let level;
    if(parent&&byId.has(parent))level=levelFor(parent,next)+1;
    else level=fallbackLevel(node);
    level=clamp(level,0,8);levelMemo.set(id,level);return level;
  };
  const domainMemo=new Map();
  const domainFor=(id,trail=new Set())=>{
    if(domainMemo.has(id))return domainMemo.get(id);
    const node=byId.get(id);if(!node)return'OTHER';const direct=domainFromId(id);if(direct){domainMemo.set(id,direct);return direct}
    if(id===PRESENTATION_ROOT){domainMemo.set(id,'SYSTEM');return'SYSTEM'}
    if(trail.has(id))return String(node.domain||'OTHER').toUpperCase()||'OTHER';
    const next=new Set(trail);next.add(id);const parent=parentByChild.get(id);
    const parentDomain=parent?domainFromId(parent):'';
    const result=parentDomain||((parent&&byId.has(parent))?domainFor(parent,next):String(node.domain||'OTHER').toUpperCase()||'OTHER');
    domainMemo.set(id,result);return result;
  };
  return new Map(ordered.map(node=>{
    const id=String(node.id);const level=levelFor(id);const connections=degree.get(id)||0;const type=String(node.type||'').toUpperCase();
    const kindBoost=id===PRESENTATION_ROOT?4:id.startsWith(DOMAIN_PREFIX)?3:type==='SYSTEM'?2.2:type==='CAMPAIGN'||type==='PROGRAM'?1.5:1;
    const priority=Number.isFinite(Number(node.priority))?clamp(Number(node.priority),0,10)*.12:0;
    const importance=kindBoost+Math.log2(connections+1)*.85+priority;
    return[id,{level,domain:domainFor(id),connections,importance,parentId:parentByChild.get(id)||null}];
  }));
}

function domainCenters(domains){
  const sorted=[...domains].filter(Boolean).sort((a,b)=>{
    const ai=DOMAIN_ORDER.indexOf(a),bi=DOMAIN_ORDER.indexOf(b);if(ai!==-1||bi!==-1)return(ai===-1?999:ai)-(bi===-1?999:bi);return a.localeCompare(b)
  });
  const map=new Map();const count=Math.max(1,sorted.length);
  sorted.forEach((domain,index)=>{const angle=-Math.PI/2+(index/count)*Math.PI*2;const radiusX=count<=3?5.6:6.4;const radiusY=count<=3?2.5:3.4;map.set(domain,{x:Math.cos(angle)*radiusX,y:Math.sin(angle)*radiusY+1.2})});
  return map;
}

export function buildCanvas25DLayout(nodes,edges=[]){
  const structural=buildStructuralIndex(nodes,edges);const nodeById=new Map(nodes.map(node=>[String(node.id),node]));
  const domains=new Set([...structural.values()].map(meta=>meta.domain).filter(domain=>domain!=='SYSTEM'));
  const centers=domainCenters(domains);const grouped=new Map();
  for(const [id,meta] of structural){if(id===PRESENTATION_ROOT)continue;const key=meta.domain==='SYSTEM'?'OTHER':meta.domain;const list=grouped.get(key)||[];list.push(id);grouped.set(key,list)}
  for(const list of grouped.values())list.sort((a,b)=>{const ma=structural.get(a),mb=structural.get(b);return ma.level-mb.level||a.localeCompare(b)});
  const result=[];
  if(nodeById.has(PRESENTATION_ROOT)){const meta=structural.get(PRESENTATION_ROOT);result.push({id:PRESENTATION_ROOT,x:0,y:-4.9,z:0,...meta})}
  for(const [domain,ids] of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    const center=centers.get(domain)||{x:0,y:1};const clusterId=`${DOMAIN_PREFIX}${domain}`;const clusterIndex=ids.indexOf(clusterId);
    if(clusterIndex!==-1){const meta=structural.get(clusterId);result.push({id:clusterId,x:center.x,y:center.y,z:meta.level,...meta});ids.splice(clusterIndex,1)}
    const buckets=new Map();for(const id of ids){const level=structural.get(id).level;const list=buckets.get(level)||[];list.push(id);buckets.set(level,list)}
    for(const [level,bucket] of [...buckets.entries()].sort((a,b)=>a[0]-b[0])){
      bucket.sort();const count=bucket.length;
      bucket.forEach((id,index)=>{const meta=structural.get(id);const seed=stableHash(`${domain}:${level}`)%360;const angle=((seed/180)*Math.PI)+(index/Math.max(1,count))*Math.PI*2;const ring=1.18+Math.max(0,level-1)*.72+Math.min(1.25,Math.sqrt(count)*.13);result.push({id,x:center.x+Math.cos(angle)*ring,y:center.y+Math.sin(angle)*ring*.64+(level-2)*.16,z:level,...meta})})
    }
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}

export function radiusForImportance(meta,{cluster=false,root=false}={}){const base=root?11:cluster?22:7.5;return base+clamp(Math.sqrt(Math.max(0,meta?.importance||0))*3.2,2,13)}
export function zoomCameraAt(camera,anchor,viewport,nextScale){const old=Math.max(.0001,camera.scale);const scale=clamp(nextScale,.28,3);const factor=scale/old;return{scale,panX:anchor.x-viewport.width/2-(anchor.x-viewport.width/2-camera.panX)*factor,panY:anchor.y-viewport.height/2-(anchor.y-viewport.height/2-camera.panY)*factor}}
export function stateRole(status){const value=String(status||'').toUpperCase();if(/BLOCK|ERROR|FAIL|ATTENTION|STALE/.test(value))return'attention';if(/CHECKPOINT|PENDING|READY|QUEUED/.test(value))return'pending';if(/ACTIVE|LIVE|PASS|DONE|VALID|COMPLETE|FROZEN/.test(value))return'healthy';return'neutral'}
