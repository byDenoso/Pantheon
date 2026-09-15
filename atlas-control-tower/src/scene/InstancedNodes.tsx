import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { createNodeAuraMaterial, createNodeMaterial } from './materials';
import { encodePickId } from './gpu-picking';
import type { PositionedNode } from './types';

const STATUS_COLOR: Record<string,string> = {
  SUPPORTED:'#69dec0', APPROVED:'#69dec0', SUCCESS:'#69dec0', VERIFIED:'#69dec0',
  PARTIAL:'#efc379', BLOCKED:'#ff687c', NEGATIVE:'#f38999', WAIT_DEPENDENCY:'#efc379',
  ACTIVE:'#6bceff', IN_PROGRESS:'#6bceff', OPEN:'#6bceff', TESTING:'#a88dff',
  LEGACY:'#73819b'
};
const TYPE_COLOR: Record<string,string> = {
  ROOT:'#e8f8ff', SYSTEM:'#d8f2ff', DOMAIN:'#74b9ff', PROGRAM:'#55d7ff', CAMPAIGN:'#a88dff',
  HYPOTHESIS:'#b99dff', FILAMENT:'#a879ff', CLAIM:'#ffc86b', TEST:'#71e3d0', WORK:'#69aaff',
  RUN:'#79a9ff', RESULT:'#92a4ba', EVIDENCE:'#ff78b5', REFERENCE:'#ff78b5', ACTION:'#ff8fa3'
};

function nodeRadius(node: PositionedNode, selectedId?: string | null, focusId?: string | null) {
  if (node.id === focusId) return 0.74;
  if (node.id === selectedId) return 0.4;
  const type=String(node.type||'').toUpperCase();
  if(type==='ROOT') return 0.52;
  if(type==='SYSTEM') return 0.34;
  if(type==='DOMAIN'||type==='PROGRAM') return 0.26;
  if(type==='FILAMENT') return 0.23;
  if(type==='CAMPAIGN'||type==='HYPOTHESIS') return 0.2;
  if(type==='WORK'||type==='TEST') return 0.15;
  if(type==='REFERENCE'||type==='EVIDENCE') return 0.11;
  return 0.13;
}

function visualColor(node: PositionedNode) {
  const status=String(node.status||'').toUpperCase();
  const type=String(node.type||'').toUpperCase();
  return new Color(STATUS_COLOR[status] || TYPE_COLOR[type] || '#8ca8c4');
}

type Props={
  nodes: PositionedNode[];
  selectedId?: string | null;
  focusId?: string | null;
  pickMode?: boolean;
  aura?: boolean;
  onNodeClick?: (node: PositionedNode, event: ThreeEvent<MouseEvent>) => void;
  positions?: Map<string,Vector3>;
};

export function InstancedNodes({nodes,selectedId,focusId,pickMode=false,aura=false,onNodeClick,positions}:Props){
  const mesh=useRef<InstancedMesh>(null);
  const object=useMemo(()=>new Object3D(),[]);
  const {camera}=useThree();
  const material=useMemo(()=>pickMode
    ? new MeshBasicMaterial({toneMapped:false})
    : aura ? createNodeAuraMaterial() : createNodeMaterial(),[aura,pickMode]);

  useLayoutEffect(()=>{
    const target=mesh.current;if(!target)return;
    target.count=nodes.length;
    nodes.forEach((node,index)=>{
      if(pickMode){
        const [r,g,b]=encodePickId(node.pickId);
        target.setColorAt(index,new Color(r/255,g/255,b/255));
      }else target.setColorAt(index,visualColor(node));
    });
    if(target.instanceColor)target.instanceColor.needsUpdate=true;
  },[nodes,pickMode]);

  useFrame(()=>{
    const target=mesh.current;if(!target)return;
    const matrix=new Matrix4();
    nodes.forEach((node,index)=>{
      const position=positions?.get(node.id)||new Vector3(...node.position);
      object.position.copy(position);
      object.quaternion.copy(camera.quaternion);
      const radius=nodeRadius(node,selectedId,focusId);
      object.scale.setScalar(aura ? radius * (node.id === focusId ? 1.78 : 1.56) : radius);
      object.updateMatrix();matrix.copy(object.matrix);target.setMatrixAt(index,matrix);
    });
    target.instanceMatrix.needsUpdate=true;
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (pickMode || !onNodeClick || event.instanceId === undefined) return;
    const node = nodes[event.instanceId];
    if (node) onNodeClick(node, event);
  };

  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,nodes.length)]} frustumCulled={false} onClick={handleClick}>
    <circleGeometry args={[1,36]}/>
    <primitive object={material} attach="material"/>
  </instancedMesh>;
}
