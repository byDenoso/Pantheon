import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D } from 'three';
import { createNodeMaterial } from './materials';
import { encodePickId } from './gpu-picking';
import type { PositionedNode } from './types';

const STATUS_COLOR: Record<string,string> = {
  SUPPORTED:'#69dec0', APPROVED:'#69dec0', SUCCESS:'#69dec0',
  PARTIAL:'#efc379', BLOCKED:'#ff687c', NEGATIVE:'#f38999',
  ACTIVE:'#6bceff', IN_PROGRESS:'#6bceff', OPEN:'#6bceff', LEGACY:'#73819b'
};
const TYPE_COLOR: Record<string,string> = {
  ROOT:'#55dfff', SYSTEM:'#8be4ff', DOMAIN:'#4fb8ff', SUBGRAPH:'#7e9cff', CAMPAIGN:'#a88dff',
  CLAIM:'#d782ff', TEST:'#71e3d0', RUN:'#79a9ff', RESULT:'#69dec0', EVIDENCE:'#69dec0', ACTION:'#ff8fa3'
};

function nodeRadius(node: PositionedNode, selectedId?: string | null) {
  if (node.id === selectedId) return 0.58;
  const type=String(node.type||'').toUpperCase();
  if(type==='ROOT'||type==='SYSTEM') return 0.54;
  if(type==='DOMAIN') return 0.38;
  if(type==='SUBGRAPH'||type==='CAMPAIGN') return 0.28;
  if(type==='CLAIM'||type==='TEST') return 0.2;
  return 0.15;
}

function visualColor(node: PositionedNode) {
  const status=String(node.status||'').toUpperCase();
  const type=String(node.type||'').toUpperCase();
  return new Color(STATUS_COLOR[status] || TYPE_COLOR[type] || '#73bfff');
}

type Props={nodes: PositionedNode[];selectedId?: string | null;pickMode?: boolean};

export function InstancedNodes({nodes,selectedId,pickMode=false}:Props){
  const body=useRef<InstancedMesh>(null);
  const glow=useRef<InstancedMesh>(null);
  const highlight=useRef<InstancedMesh>(null);
  const object=useMemo(()=>new Object3D(),[]);
  const material=useMemo(()=>pickMode
    ? new MeshBasicMaterial({vertexColors:true,toneMapped:false})
    : createNodeMaterial(),[pickMode]);

  useLayoutEffect(()=>{
    const target=body.current;if(!target)return;
    const glowTarget=glow.current;const highlightTarget=highlight.current;
    target.count=nodes.length;if(glowTarget)glowTarget.count=nodes.length;if(highlightTarget)highlightTarget.count=nodes.length;
    const matrix=new Matrix4();
    nodes.forEach((node,index)=>{
      const radius=nodeRadius(node,selectedId);
      object.position.set(...node.position);object.scale.setScalar(radius);object.updateMatrix();matrix.copy(object.matrix);target.setMatrixAt(index,matrix);
      if(pickMode){
        const [r,g,b]=encodePickId(node.pickId);target.setColorAt(index,new Color(r/255,g/255,b/255));
      }else{
        const color=visualColor(node);target.setColorAt(index,color);
        if(glowTarget){object.position.set(...node.position);object.scale.setScalar(radius*1.65);object.updateMatrix();glowTarget.setMatrixAt(index,object.matrix);glowTarget.setColorAt(index,color)}
        if(highlightTarget){object.position.set(node.position[0]-radius*.22,node.position[1]+radius*.24,node.position[2]+radius*.72);object.scale.setScalar(radius*.2);object.updateMatrix();highlightTarget.setMatrixAt(index,object.matrix)}
      }
    });
    target.instanceMatrix.needsUpdate=true;if(target.instanceColor)target.instanceColor.needsUpdate=true;
    if(glowTarget){glowTarget.instanceMatrix.needsUpdate=true;if(glowTarget.instanceColor)glowTarget.instanceColor.needsUpdate=true}
    if(highlightTarget)highlightTarget.instanceMatrix.needsUpdate=true;
  },[nodes,object,pickMode,selectedId]);

  if(pickMode)return <instancedMesh ref={body} args={[undefined,undefined,Math.max(1,nodes.length)]} frustumCulled={false}>
    <sphereGeometry args={[1,18,12]}/><primitive object={material} attach="material"/>
  </instancedMesh>;

  return <>
    <instancedMesh ref={glow} args={[undefined,undefined,Math.max(1,nodes.length)]} frustumCulled={false}>
      <sphereGeometry args={[1,14,10]}/><meshBasicMaterial vertexColors transparent opacity={0.13} depthWrite={false} toneMapped={false} blending={AdditiveBlending}/>
    </instancedMesh>
    <instancedMesh ref={body} args={[undefined,undefined,Math.max(1,nodes.length)]} frustumCulled={false}>
      <sphereGeometry args={[1,24,16]}/><primitive object={material} attach="material"/>
    </instancedMesh>
    <instancedMesh ref={highlight} args={[undefined,undefined,Math.max(1,nodes.length)]} frustumCulled={false}>
      <sphereGeometry args={[1,12,8]}/><meshBasicMaterial color="#ecfbff" transparent opacity={0.82} depthWrite={false} toneMapped={false}/>
    </instancedMesh>
  </>;
}
