import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { createFilamentMaterial } from './materials';
import type { AtlasEdge, PositionedNode } from './types';

const EDGE_COLOR: Record<string,string> = {
  CO_DECLARED:'#b695ff', CROSS_DOMAIN:'#b695ff', CONTAINS:'#496e93',
  SUPPORTS:'#69dec0', CONTRADICTS:'#f38999', DEPENDS_ON:'#efc379'
};

type Props={edges:AtlasEdge[];nodes:PositionedNode[];positions?:Map<string,Vector3>;focusId?:string|null;selectedId?:string|null};

export function InstancedFilaments({edges,nodes,positions:sharedPositions,focusId,selectedId}:Props){
  const mesh=useRef<InstancedMesh>(null);
  const object=useMemo(()=>new Object3D(),[]);
  const material=useMemo(()=>createFilamentMaterial(),[]);

  useLayoutEffect(()=>{
    const target=mesh.current;if(!target)return;
    const positions=new Map(nodes.map(node=>[node.id,sharedPositions?.get(node.id)||new Vector3(...node.position)]));
    const valid=edges.filter(edge=>positions.has(edge.source)&&positions.has(edge.target));
    target.count=valid.length;
    valid.forEach((edge,index)=>{
      const a=positions.get(edge.source)!;
      const b=positions.get(edge.target)!;
      const kind=String(edge.type||'').toUpperCase();
      const color=new Color(EDGE_COLOR[kind]||'#36526f');
      const active=edge.source===focusId||edge.target===focusId||edge.source===selectedId||edge.target===selectedId;
      if(active) color.lerp(new Color('#d4f5ff'),0.46);
      target.setColorAt(index,color);
    });
    if(target.instanceColor)target.instanceColor.needsUpdate=true;
  },[edges,focusId,nodes,object,selectedId,sharedPositions]);

  useFrame(()=>{
    const target=mesh.current;if(!target)return;
    const positions=new Map(nodes.map(node=>[node.id,sharedPositions?.get(node.id)||new Vector3(...node.position)]));
    const valid=edges.filter(edge=>positions.has(edge.source)&&positions.has(edge.target));
    const up=new Vector3(0,1,0);const matrix=new Matrix4();
    valid.forEach((edge,index)=>{
      const a=positions.get(edge.source)!;const b=positions.get(edge.target)!;
      const direction=b.clone().sub(a);const length=Math.max(0.001,direction.length());
      const midpoint=a.clone().add(b).multiplyScalar(0.5);
      object.position.copy(midpoint);object.quaternion.copy(new Quaternion().setFromUnitVectors(up,direction.normalize()));
      const active=edge.source===focusId||edge.target===focusId||edge.source===selectedId||edge.target===selectedId;
      object.scale.set(active ? 0.032 : 0.014,length,active ? 0.032 : 0.014);object.updateMatrix();target.setMatrixAt(index,matrix.copy(object.matrix));
    });
    target.instanceMatrix.needsUpdate=true;
  });

  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,edges.length)]} frustumCulled={false}>
    <cylinderGeometry args={[1,1,1,6,1,false]}/>
    <primitive object={material} attach="material"/>
  </instancedMesh>;
}
