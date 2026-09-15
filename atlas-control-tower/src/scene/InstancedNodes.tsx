import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { createNodeAuraMaterial, createNodeMaterial } from './materials';
import { encodePickId } from './gpu-picking';
import type { PositionedNode } from './types';

const STATUS_COLOR: Record<string,string> = {
  SUPPORTED:'#69dec0', APPROVED:'#69dec0', SUCCESS:'#69dec0',
  PARTIAL:'#efc379', BLOCKED:'#ff687c', NEGATIVE:'#f38999',
  ACTIVE:'#6bceff', IN_PROGRESS:'#6bceff', OPEN:'#6bceff',
  LEGACY:'#73819b'
};
const TYPE_COLOR: Record<string,string> = {
  SYSTEM:'#d8f2ff', DOMAIN:'#74b9ff', CAMPAIGN:'#a88dff', CLAIM:'#ffc86b',
  TEST:'#71e3d0', RUN:'#79a9ff', RESULT:'#92a4ba', ACTION:'#ff8fa3'
};

function nodeRadius(node: PositionedNode, selectedId?: string | null, focusId?: string | null) {
  if (node.id === focusId) return 0.7;
  if (node.id === selectedId) return 0.38;
  const type=String(node.type||'').toUpperCase();
  if(type==='SYSTEM') return 0.31;
  if(type==='DOMAIN') return 0.24;
  if(type==='CAMPAIGN') return 0.19;
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
  // No vertexColors here -- see the comment on createNodeMaterial in materials.ts
  // for why that flag (not per-instance color itself) was the real black-node bug.
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
    // setColorAt only writes the CPU-side buffer; without this flag the instance
    // color never uploads to the GPU.
    if(target.instanceColor)target.instanceColor.needsUpdate=true;
  },[nodes,pickMode]);

  useFrame(()=>{
    const target=mesh.current;if(!target)return;
    const matrix=new Matrix4();
    nodes.forEach((node,index)=>{
      const position=positions?.get(node.id)||new Vector3(...node.position);
      // Keep the node graphic facing the user like the 2D reference. Depth is
      // still real: position, perspective, scale, occlusion and orbit controls
      // all operate in 3D; only the glyph itself is a camera-facing illustration
      // instead of a shaded sphere that would change visual language while orbiting.
      object.position.copy(position);
      object.quaternion.copy(camera.quaternion);
      const radius=nodeRadius(node,selectedId,focusId);
      object.scale.setScalar(aura ? radius * (node.id === focusId ? 1.72 : 1.54) : radius);
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
    <circleGeometry args={[1,32]}/>
    <primitive object={material} attach="material"/>
  </instancedMesh>;
}
