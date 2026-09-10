import type { AtlasNode, PositionedNode } from './types';
import { buildOrbitalNodes } from './types';

export type BreakthroughPoint = PositionedNode & {
  x: number;
  y: number;
  z: number;
  depth: number;
  visualScale: number;
  domainKey: string;
};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

function domainKey(node:AtlasNode){
  const declared=String(node.domain||'').trim().toUpperCase();
  if(declared)return declared;
  const id=String(node.id||'').toUpperCase();
  if(id.includes('SCIENCE')||id.includes('EXPANSION')||id.includes('STRUCTURE')||id.includes('EARLY')||id.includes('HIGHZ')||id.includes('HOMOGENEITY')||id.includes('VALIDATION'))return 'SCIENCE';
  if(id.includes('OLYMPUS'))return 'OLYMPUS';
  if(id.includes('ENGINEER')||id.includes('RUNTIME')||id.includes('DEPLOY')||id.includes('AUTOMATION')||id.includes('INTEGRITY'))return 'ENGINEERING';
  if(id.includes('LEARNING')||id.includes('MEMORY')||id.includes('FILAMENT'))return 'LEARNING';
  return 'NEXO';
}

export function buildBreakthroughLayout(nodes:AtlasNode[],focusId?:string|null,width=1200,height=800):BreakthroughPoint[]{
  const orbital=buildOrbitalNodes(nodes,focusId);
  return orbital.map(node=>{
    const [ox,oy,oz]=node.position;
    const depth=clamp((oz+9)/18,0,1);
    const perspective=0.84+depth*0.34;
    const visualScale=clamp(0.76+depth*0.42,0.72,1.22);
    return {
      ...node,
      x:width/2+ox*58*perspective,
      y:height/2+oy*58*perspective,
      z:oz,
      depth,
      visualScale,
      domainKey:domainKey(node)
    };
  });
}

export function nodeVisualRadius(node:BreakthroughPoint,selectedId?:string|null){
  const type=String(node.type||'').toUpperCase();
  const base=node.id===selectedId?17:type==='SYSTEM'?15:type==='DOMAIN'?12:type==='CAMPAIGN'?9:type==='CLAIM'?8:6.2;
  return base*node.visualScale;
}

export function relationOpacity(a:BreakthroughPoint,b:BreakthroughPoint){
  return clamp(0.2+Math.max(a.depth,b.depth)*0.52,0.2,0.72);
}
