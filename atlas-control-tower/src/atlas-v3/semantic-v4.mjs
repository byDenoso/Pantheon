export const PRIMARY_DOMAINS=['NEXO','SCIENCE','OPERATIONS','HEALTH'];
export const OVERLAYS=['LEARNING','AUTOMATIONS','EVIDENCE'];

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

function nodeId(value){return String(value?.id??'')}
function edgeEnd(value){return String(value??'')}

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
  for(const node of nodes){
    const id=nodeId(node);if(!id)continue;
    if(semanticDepthForNode(node)<=level)forced.add(id);
  }
  const ordered=[...forced].filter(ids.has.bind(ids));
  const remainder=nodes
    .map(node=>({id:nodeId(node),depth:semanticDepthForNode(node)}))
    .filter(item=>item.id&&!forced.has(item.id))
    .sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
  const limit=Math.max(forced.size,Math.max(1,Number.isFinite(budget)?Math.floor(budget):24));
  for(const item of remainder){if(ordered.length>=limit)break;ordered.push(item.id)}
  return new Set(ordered);
}

export function serializeSemanticLocation(location={}){
  const normalized={
    domain:String(location.domain||'NEXO'),
    focusId:String(location.focusId||''),
    selectedId:String(location.selectedId||''),
    overlays:[...new Set(Array.isArray(location.overlays)?location.overlays.map(String):[])].filter(value=>OVERLAYS.includes(value)),
    level:Math.max(0,Math.min(4,Number(location.level)||0))
  };
  return encodeURIComponent(JSON.stringify(normalized));
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
