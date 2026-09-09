// Deterministic layout for the NEXO Atlas graph.
// Pure functions only: no DOM, no WebGL. Imported by the engine and by tests.

export const LINEAGE_BREAKPOINT=620;

const hashL=s=>{let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0};
const jitter=(id,axis)=>(hashL(`${axis}:${id}`)%10000)/10000-.5;

// Hierarchy depth drives the Z plane, so the map reads as stacked layers
// instead of one flat disc. Lower rank sits closer to the camera.
const DEPTH_RANK={SYSTEM:0,DOMAIN:1,PROJECT:1,CAMPAIGN:2,CLAIM:3,HYPOTHESIS:3,DECISION_HYPOTHESIS:3,TEST:4,RESULT:5,DATASET:5,MODEL:5,PROBE:5,PUBLICATION:6,SOURCE:7,SOURCE_REF:8};
const DEPTH_STEP=150;

export function depthRank(node){const t=node?.visualType||node?.type;return DEPTH_RANK[t]??4}

// A node inherits the identity of the system that owns it. Colouring a whole
// branch with one hue is what makes the map read as constellations of systems
// rather than as an undifferentiated rainbow of node types.
export function systemOf(node,byId){
  if(!node)return 'NEXO';
  let current=node,guard=0;
  while(current&&guard++<32){
    if(String(current.id||'').startsWith('system:'))return String(current.id).slice(7).toUpperCase();
    const parent=current.parentId?byId?.get(current.parentId):null;
    if(!parent)break;
    current=parent;
  }
  const domain=node.domain?String(node.domain).toUpperCase():'';
  return domain||'NEXO';
}

export function systemIndex(nodes){
  const byId=new Map((nodes||[]).map(n=>[n.id,n]));
  const out=new Map();
  for(const n of nodes||[])out.set(n.id,systemOf(n,byId));
  return out;
}

function lineageLevels(list,edges,focus){
  const ids=new Set(list.map(n=>n.id));
  const start=ids.has(focus)?focus:list[0]?.id;
  const adj=new Map(list.map(n=>[n.id,[]]));
  for(const e of edges||[]){if(!ids.has(e.source)||!ids.has(e.target))continue;adj.get(e.source).push(e.target);adj.get(e.target).push(e.source)}
  const level=new Map();
  if(start){level.set(start,0);const queue=[start];for(let i=0;i<queue.length;i++){const id=queue[i],next=(level.get(id)||0)+1;for(const other of adj.get(id)||[]){if(level.has(other))continue;level.set(other,next);queue.push(other)}}}
  const maxReachable=Math.max(0,...level.values());
  for(const n of list)if(!level.has(n.id))level.set(n.id,maxReachable+1);
  return level;
}

function layoutLineage(list,{focus,edges,mobile}){
  const levelById=lineageLevels(list,edges,focus),byLevel=new Map();
  for(const n of list){const level=levelById.get(n.id)||0;if(!byLevel.has(level))byLevel.set(level,[]);byLevel.get(level).push(n)}
  const typeOrder={CLAIM:1,HYPOTHESIS:1,TEST:2,RESULT:3,DATASET:4,MODEL:4,PROBE:4,PUBLICATION:5,SOURCE:6,SOURCE_REF:7};
  const levels=[...byLevel.keys()].sort((a,b)=>a-b),maxLevel=Math.max(0,...levels),primarySpacing=mobile?148:185,primaryOffset=-(maxLevel*primarySpacing)/2,out=[];
  for(const level of levels){
    const group=byLevel.get(level).sort((a,b)=>(typeOrder[a.visualType||a.type]||9)-(typeOrder[b.visualType||b.type]||9)||String(a.id).localeCompare(String(b.id)));
    const laneSpacing=mobile?Math.max(46,Math.min(92,300/Math.max(1,group.length-1))):88;
    for(let i=0;i<group.length;i++){
      const n=group[i],lane=i-(group.length-1)/2,primary=primaryOffset+level*primarySpacing,cross=lane*laneSpacing,z=(n.id===focus?0:(n.zBand??0)*.05)+jitter(n.id,'lineage-z')*6;
      out.push({id:n.id,x:mobile?cross:primary,y:mobile?primary:cross,z});
    }
  }
  return out;
}

// Golden-angle (phyllotaxis) placement. Unlike even angular division plus
// jitter, this never lines neighbours up into visible spokes and keeps areal
// density constant as the ring population grows, which is what stops the
// macro view from collapsing into a blob at the centre.
const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5));
const clampR=(v,a,b)=>Math.max(a,Math.min(b,v));

// Rings are chosen by a node's relationship to the current focus, not by its
// absolute type. The focus sits at the origin, its parent just inside it, its
// children on the first full ring, and everything else further out. That is what
// keeps the view readable: the thing you are looking at owns the centre.
const RING_PARENT=150,RING_CHILD=250,RING_DOMAIN=326,RING_OUTER=398;

function ringFor(node,{focusNode,children}){
  if(focusNode&&node.id===focusNode.parentId)return RING_PARENT;
  if(children.has(node.id))return RING_CHILD;
  const t=node.visualType||node.type;
  if(t==='DOMAIN'||t==='SYSTEM'||t==='PROJECT')return RING_DOMAIN;
  return RING_OUTER;
}

function layoutLayered(list,{focus}){
  const byId=new Map(list.map(n=>[n.id,n]));
  const focusNode=byId.get(focus);
  const children=new Set(list.filter(n=>n.parentId===focus).map(n=>n.id));
  const systems=systemIndex(list);
  // A stable sector per system keeps a branch together as a wedge.
  const sectors=[...new Set(systems.values())].sort();
  const sectorOf=name=>sectors.indexOf(name)+1;

  // Population per ring so a crowded ring widens instead of overlapping itself.
  const population=new Map();
  for(const n of list){
    if(n.id===focus)continue;
    const r=ringFor(n,{focusNode,children});
    population.set(r,(population.get(r)||0)+1);
  }
  const ranks=list.map(depthRank);
  const midRank=ranks.length?(Math.min(...ranks)+Math.max(...ranks))/2:0;

  const out=[];
  let k=0;
  for(const n of list){
    const rank=depthRank(n);
    // Depth stays shallow on purpose: enough to separate the layers and give
    // the map parallax, not so much that it turns into a tunnel.
    const zPlane=(midRank-rank)*DEPTH_STEP;
    if(n.id===focus){out.push({id:n.id,x:0,y:0,z:zPlane});continue}
    const ring=ringFor(n,{focusNode,children});
    const count=Math.max(1,population.get(ring)||1);
    // A crowded ring widens so its members do not overlap, but only up to a
    // point. Uncapped sqrt(population) growth pushed a 4000-node ring out to
    // ~8600 units, which framed the camera so far back that the inner rings
    // collapsed to a dot and only the crossing edges stayed visible.
    const widen=clampR(Math.sqrt(count)/Math.sqrt(9),1,2.6);
    const radius=ring*widen*(1+jitter(n.id,'r')*.07);
    const angle=k++*GOLDEN_ANGLE+jitter(n.id,'a')*.6+sectorOf(systems.get(n.id))*.19;
    out.push({
      id:n.id,
      x:Math.cos(angle)*radius,
      y:Math.sin(angle)*radius*.76,
      z:zPlane+Math.sin(angle*1.65+jitter(n.id,'z')*6.28)*44
    });
  }
  return out;
}

export function layoutGraph(nodes,{focus='system:NEXO',semanticView='macro',viewportWidth=1024,edges=[]}={}){
  const list=Array.isArray(nodes)?nodes:[];
  if(semanticView==='provenance')return layoutLineage(list,{focus,edges,mobile:Number(viewportWidth)<LINEAGE_BREAKPOINT});
  return layoutLayered(list,{focus});
}

export function labelPolicy(width,semanticView){
  const mobile=Number(width)<LINEAGE_BREAKPOINT;
  if(semanticView==='provenance')return mobile?{max:18,maxChars:36}:{max:24,maxChars:48};
  return mobile?{max:6,maxChars:26}:{max:11,maxChars:34};
}
