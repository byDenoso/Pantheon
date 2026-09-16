export const PRIMARY_DOMAINS=['NEXO','SCIENCE','OPERATIONS','HEALTH'];
export const OVERLAYS=['LEARNING','AUTOMATIONS','EVIDENCE'];

const PRESENTATION_ROOT='__PRESENTATION_NEXO__';
const CLUSTER_PREFIX='__PRESENTATION_CLUSTER__:';
const DOMAIN_FOCUS={
  NEXO:PRESENTATION_ROOT,
  SCIENCE:`${CLUSTER_PREFIX}SCIENCE`,
  OPERATIONS:`${CLUSTER_PREFIX}OPERATIONS`,
  HEALTH:`${CLUSTER_PREFIX}OLYMPUS`
};
const OVERLAY_TYPES={
  LEARNING:new Set(['FILAMENT']),
  AUTOMATIONS:new Set(['AUTOMATION']),
  EVIDENCE:new Set(['REFERENCE','EVIDENCE'])
};
const ALL_OVERLAY_TYPES=new Set([...OVERLAY_TYPES.LEARNING,...OVERLAY_TYPES.AUTOMATIONS,...OVERLAY_TYPES.EVIDENCE]);
const SCIENCE_TYPES=new Set(['PROGRAM','CAMPAIGN','PROJECT','HYPOTHESIS','TEST_GROUP','CLAIM','TEST','RESULT','DATASET','ARTIFACT','PUBLICATION']);

const DEPTH_BY_TYPE={
  ROOT:0,DOMAIN:0,
  SYSTEM:1,PROGRAM:1,GROUP:1,
  CAMPAIGN:2,PROJECT:2,HYPOTHESIS:2,TEST_GROUP:2,
  CLAIM:3,TEST:3,EVIDENCE:3,REFERENCE:3,RESULT:3,DATASET:3,ARTIFACT:3,
  WORK:2,ACTION:2,AUTOMATION:2,FILAMENT:2
};

export function semanticDepthForNode(node){
  const type=String(node?.type||'').toUpperCase();
  return DEPTH_BY_TYPE[type] ?? 2;
}

function normalized(value){return String(value??'').trim().toUpperCase()}
function nodeId(value){return String(value?.id??'')}
function edgeEnd(value){return String(value??'')}
function matchesAny(value,tokens){return tokens.some(token=>value.includes(token))}
function isOverlayNode(node){return ALL_OVERLAY_TYPES.has(normalized(node?.type))}

export function semanticDomainForNode(node){
  if(!node||typeof node!=='object')return'UNCLASSIFIED';
  const type=normalized(node.type);
  const domain=normalized(node.domain);
  if(node.presentationOnly){
    if(domain==='SYSTEM')return'NEXO';
    if(domain==='SCIENCE')return'SCIENCE';
    if(domain==='OPERATIONS')return'OPERATIONS';
    if(domain==='OLYMPUS')return'HEALTH';
    if(['ENGINEERING','INTERDOMAIN','REFERENCES','OTHER','NEXO'].includes(domain))return'NEXO';
    return'UNCLASSIFIED';
  }
  if(matchesAny(domain,['OLYMPUS','BODYBUILD','HEALTH','FITNESS']))return'HEALTH';
  if(matchesAny(domain,['ENGINEERING','PROCEDURAL','NEXO','SYSTEM','INTERDOMAIN']))return'NEXO';
  if(matchesAny(domain,['OPERATIONS','OPERATION','RUNTIME','EXECUTION','AUTOMATION']))return'OPERATIONS';
  if(matchesAny(domain,['SCIENCE','COSMO','ASTRO','PHYSIC','CMB','GALAX','DARK_','DARK-']))return'SCIENCE';
  if(type==='WORK'||type==='ACTION')return domain?'UNCLASSIFIED':'OPERATIONS';
  if(type==='AUTOMATION')return'OPERATIONS';
  if(type==='FILAMENT')return'NEXO';
  if(SCIENCE_TYPES.has(type))return'SCIENCE';
  if(type==='SYSTEM'||type==='ROOT'||type==='DOMAIN'||type==='GROUP')return'NEXO';
  return'UNCLASSIFIED';
}

export function focusIdForPrimaryDomain(domain){
  return DOMAIN_FOCUS[PRIMARY_DOMAINS.includes(String(domain))?String(domain):'NEXO'];
}

export function overlayAvailability(scene){
  const nodes=Array.isArray(scene?.graph?.nodes)?scene.graph.nodes:[];
  const count=types=>nodes.filter(node=>!node.presentationOnly&&types.has(normalized(node.type))).length;
  return {
    LEARNING:count(OVERLAY_TYPES.LEARNING),
    AUTOMATIONS:count(OVERLAY_TYPES.AUTOMATIONS),
    EVIDENCE:count(OVERLAY_TYPES.EVIDENCE)
  };
}

function presentationVisibleForDomain(node,domain,overlays){
  if(!node.presentationOnly)return false;
  if(node.id===PRESENTATION_ROOT)return true;
  const presentationDomain=normalized(node.domain);
  if(domain==='SCIENCE')return presentationDomain==='SCIENCE';
  if(domain==='OPERATIONS')return presentationDomain==='OPERATIONS';
  if(domain==='HEALTH')return presentationDomain==='OLYMPUS';
  if(domain==='NEXO'){
    if(presentationDomain==='REFERENCES')return overlays.includes('EVIDENCE');
    return ['SCIENCE','ENGINEERING','INTERDOMAIN','OLYMPUS','OPERATIONS','OTHER'].includes(presentationDomain);
  }
  return false;
}

function baseVisibleForDomain(node,domain){
  if(node.presentationOnly)return false;
  if(isOverlayNode(node))return false;
  const semanticDomain=semanticDomainForNode(node);
  if(domain==='NEXO')return semanticDomain==='NEXO'||semanticDomain==='UNCLASSIFIED';
  return semanticDomain===domain;
}

function connectedOverlayIds(graph,types,domain){
  const nodes=Array.isArray(graph?.nodes)?graph.nodes:[];
  const edges=Array.isArray(graph?.edges)?graph.edges:[];
  const byId=new Map(nodes.map(node=>[nodeId(node),node]));
  const seeds=new Set(nodes.filter(node=>!node.presentationOnly&&types.has(normalized(node.type))).map(nodeId));
  const include=new Set(seeds);
  for(const edge of edges){
    const source=edgeEnd(edge?.source);const target=edgeEnd(edge?.target);
    const sourceSeed=seeds.has(source);const targetSeed=seeds.has(target);
    if(!sourceSeed&&!targetSeed)continue;
    const otherId=sourceSeed?target:source;
    const other=byId.get(otherId);
    if(!other)continue;
    const otherDomain=semanticDomainForNode(other);
    const isLearning=types===OVERLAY_TYPES.LEARNING;
    if(isLearning||domain==='NEXO'||otherDomain===domain||other.presentationOnly)include.add(otherId);
  }
  return include;
}

export function graphForSemanticContext(scene,domain='NEXO',overlays=[]){
  const graph=scene?.graph||{nodes:[],edges:[]};
  const primary=PRIMARY_DOMAINS.includes(String(domain))?String(domain):'NEXO';
  const activeOverlays=[...new Set(Array.isArray(overlays)?overlays.map(String):[])].filter(item=>OVERLAYS.includes(item));
  const ids=new Set();
  for(const node of graph.nodes||[]){
    if(presentationVisibleForDomain(node,primary,activeOverlays)||baseVisibleForDomain(node,primary))ids.add(nodeId(node));
  }
  for(const overlay of activeOverlays){
    const overlayIds=connectedOverlayIds(graph,OVERLAY_TYPES[overlay],primary);
    for(const id of overlayIds)ids.add(id);
  }
  const nodes=(graph.nodes||[]).filter(node=>ids.has(nodeId(node)));
  const visible=new Set(nodes.map(nodeId));
  const edges=(graph.edges||[]).filter(edge=>visible.has(edgeEnd(edge.source))&&visible.has(edgeEnd(edge.target)));
  return {...graph,nodes,edges,visualTotal:nodes.length};
}

export function buildSemanticVisibility(graph,{focusId='',selectedId='',level=0,budget=24}={}){
  const nodes=Array.isArray(graph?.nodes)?graph.nodes:[];
  const edges=Array.isArray(graph?.edges)?graph.edges:[];
  const ids=new Set(nodes.map(nodeId).filter(Boolean));
  const forced=new Set();
  if(ids.has(focusId))forced.add(focusId);
  if(ids.has(selectedId))forced.add(selectedId);
  for(const edge of edges){
    const source=edgeEnd(edge?.source);const target=edgeEnd(edge?.target);
    if((source===focusId||source===selectedId)&&ids.has(target))forced.add(target);
    if((target===focusId||target===selectedId)&&ids.has(source))forced.add(source);
  }
  const forceLayoutNeighborhood=id=>{
    if(!id||!ids.has(id))return;
    const current=nodes.find(node=>nodeId(node)===id);
    const parent=typeof current?.layoutParent==='string'?current.layoutParent:'';
    if(parent&&ids.has(parent))forced.add(parent);
    for(const node of nodes)if(node.layoutParent===id&&ids.has(nodeId(node)))forced.add(nodeId(node));
  };
  forceLayoutNeighborhood(focusId);
  forceLayoutNeighborhood(selectedId);
  const eligible=nodes
    .map(node=>({id:nodeId(node),depth:semanticDepthForNode(node)}))
    .filter(item=>item.id&&item.depth<=level&&!forced.has(item.id))
    .sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
  const ordered=[...forced].filter(ids.has.bind(ids));
  const limit=Math.max(forced.size,Math.max(1,Number.isFinite(budget)?Math.floor(budget):24));
  for(const item of eligible){if(ordered.length>=limit)break;ordered.push(item.id)}
  return new Set(ordered);
}

export function serializeSemanticLocation(location={}){
  const normalizedLocation={
    domain:String(location.domain||'NEXO'),
    focusId:String(location.focusId||''),
    selectedId:String(location.selectedId||''),
    overlays:[...new Set(Array.isArray(location.overlays)?location.overlays.map(String):[])].filter(value=>OVERLAYS.includes(value)),
    level:Math.max(0,Math.min(4,Number(location.level)||0))
  };
  return encodeURIComponent(JSON.stringify(normalizedLocation));
}

export function parseSemanticLocation(value){
  try{
    const raw=JSON.parse(decodeURIComponent(String(value||'')));
    if(!raw||typeof raw!=='object')return null;
    const domain=PRIMARY_DOMAINS.includes(String(raw.domain))?String(raw.domain):'NEXO';
    return {
      domain,
      focusId:String(raw.focusId||''),
      selectedId:String(raw.selectedId||''),
      overlays:[...new Set(Array.isArray(raw.overlays)?raw.overlays.map(String):[])].filter(item=>OVERLAYS.includes(item)),
      level:Math.max(0,Math.min(4,Number(raw.level)||0))
    };
  }catch{return null}
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}

export function diffSnapshots(previous,next){
  const before=previous?.entities&&typeof previous.entities==='object'?previous.entities:{};
  const after=next?.entities&&typeof next.entities==='object'?next.entities:{};
  const beforeIds=Object.keys(before);const afterIds=Object.keys(after);
  const beforeSet=new Set(beforeIds);const afterSet=new Set(afterIds);
  const added=afterIds.filter(id=>!beforeSet.has(id)).sort();
  const removed=beforeIds.filter(id=>!afterSet.has(id)).sort();
  const updated=afterIds.filter(id=>beforeSet.has(id)&&JSON.stringify(stable(before[id]))!==JSON.stringify(stable(after[id]))).sort();
  return {added,removed,updated};
}
