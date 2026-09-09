// Deterministic layout for the NEXO Atlas graph.
// Pure functions only: no DOM, no WebGL. Imported by the engine and by tests.

export const LINEAGE_BREAKPOINT=620;

const hashL=s=>{let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0};
const jitter=(id,axis)=>(hashL(`${axis}:${id}`)%10000)/10000-.5;

// Hierarchy depth drives the Z plane, so the map reads as stacked layers
// instead of one flat disc. Lower rank sits closer to the camera.
const DEPTH_RANK={SYSTEM:0,DOMAIN:1,PROJECT:1,CAMPAIGN:2,CLAIM:3,HYPOTHESIS:3,DECISION_HYPOTHESIS:3,TEST:4,RESULT:5,DATASET:5,MODEL:5,PROBE:5,PUBLICATION:6,SOURCE:7,SOURCE_REF:8};
const DEPTH_STEP=132;

export function depthRank(node){const t=node?.visualType||node?.type;return DEPTH_RANK[t]??4}

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

function layoutLayered(list,{focus}){
  const byRank=new Map();
  for(const n of list){const rank=depthRank(n);if(!byRank.has(rank))byRank.set(rank,[]);byRank.get(rank).push(n)}
  const ranks=[...byRank.keys()].sort((a,b)=>a-b);
  const midRank=ranks.length?(ranks[0]+ranks[ranks.length-1])/2:0;
  const out=[];
  for(const rank of ranks){
    const group=byRank.get(rank).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const count=group.length;
    // Radius grows with sqrt(count) so a rank with 2000 nodes spreads instead
    // of stacking on top of a rank with 20. The floor of 1 matters: without it
    // a sparse rank shrinks towards the origin and a small graph — the Drive
    // bootstrap is seven nodes — collapses into a clump at the centre.
    const spread=118+rank*54;
    const scale=spread*Math.max(1,Math.sqrt(count)/Math.sqrt(6));
    const zPlane=(midRank-rank)*DEPTH_STEP;
    for(let i=0;i<count;i++){
      const n=group[i];
      if(n.id===focus){out.push({id:n.id,x:0,y:0,z:zPlane});continue}
      // Offset the spiral per rank so layers do not align vertically.
      const angle=i*GOLDEN_ANGLE+(hashL(String(rank))%6283)/1000;
      const radial=Math.sqrt((i+.6)/count);
      const radius=scale*radial*(1+jitter(n.id,'r')*.09);
      // Domain pulls a node towards a stable sector, so a domain stays legible
      // as a wedge across every layer instead of scattering.
      const domainBias=n.domain?((hashL(n.domain)%360)/360)*Math.PI*2:0;
      const theta=angle+domainBias*.22;
      out.push({
        id:n.id,
        x:Math.cos(theta)*radius+jitter(n.id,'x')*14,
        y:Math.sin(theta)*radius*.74+jitter(n.id,'y')*12,
        z:zPlane+(n.zBand??0)*.12+jitter(n.id,'z')*22
      });
    }
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
  return mobile?{max:7,maxChars:28}:{max:16,maxChars:42};
}
