import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, type MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { createFilamentMaterial } from './materials';
import type { AtlasEdge, PositionedNode } from './types';
import { edgeVisualRole } from './neural-visuals.mjs';

const EDGE_COLOR: Record<string,string> = {
  CO_DECLARED:'#b695ff', CROSS_DOMAIN:'#b695ff', CONTAINS:'#496e93',
  SUPPORTS:'#69dec0', CONTRADICTS:'#f38999', DEPENDS_ON:'#efc379'
};
const LIGHT_EDGE_COLOR: Record<string,string> = {
  CO_DECLARED:'#7654c7', CROSS_DOMAIN:'#7654c7', CONTAINS:'#3d6f9e',
  SUPPORTS:'#168d72', CONTRADICTS:'#c94f69', DEPENDS_ON:'#b87508'
};

type Props={edges:AtlasEdge[];nodes:PositionedNode[];positions?:Map<string,Vector3>;focusId?:string|null;selectedId?:string|null;theme?:'dark'|'light'};

export function InstancedFilaments({edges,nodes,positions:sharedPositions,focusId,selectedId,theme='dark'}:Props){
  const mesh=useRef<InstancedMesh>(null);
  const object=useMemo(()=>new Object3D(),[]);
  const material=useMemo(()=>createFilamentMaterial(),[]);

  useLayoutEffect(()=>{
    const target=mesh.current;if(!target)return;
    const positions=new Map(nodes.map(node=>[node.id,sharedPositions?.get(node.id)||new Vector3(...node.position)]));
    const valid=edges.filter(edge=>positions.has(edge.source)&&positions.has(edge.target));
    const palette=theme==='light'?LIGHT_EDGE_COLOR:EDGE_COLOR;
    target.count=valid.length;
    valid.forEach((edge,index)=>{
      const kind=String(edge.type||'').toUpperCase();
      const role=edgeVisualRole(edge);
      const rolePalette=theme==='light'?{hierarchy:'#3d6f9e',learning:'#7654c7',evidence:'#168d72',attention:'#c94f69',association:'#416b91'}:{hierarchy:'#496e93',learning:'#b695ff',evidence:'#69dec0',attention:'#f38999',association:'#36526f'};
      const color=new Color(rolePalette[role]||palette[kind]||(theme==='light'?'#416b91':'#36526f'));
      const active=edge.source===focusId||edge.target===focusId||edge.source===selectedId||edge.target===selectedId;
      if(active) color.lerp(new Color(theme==='light'?'#175d92':'#d4f5ff'),theme==='light'?0.28:0.46);
      target.setColorAt(index,color);
    });
    if(target.instanceColor)target.instanceColor.needsUpdate=true;
  },[edges,focusId,nodes,selectedId,sharedPositions,theme]);

  useFrame(({clock})=>{
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
      const role=edgeVisualRole(edge);const width=role==='hierarchy'?0.014:role==='attention'?0.018:role==='evidence'?0.012:0.009;object.scale.set(active ? width*2.1 : width,length,active ? width*2.1 : width);object.updateMatrix();target.setMatrixAt(index,matrix.copy(object.matrix));
    });
    target.instanceMatrix.needsUpdate=true;
    const base=theme==='light'?0.62:0.76;
    const pulse=theme==='light'?0.10:0.14;
    (material as MeshBasicMaterial).opacity=base+Math.sin(clock.elapsedTime*1.35)*pulse;
  });

  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,edges.length)]} frustumCulled={false}>
    <cylinderGeometry args={[1,1,1,6,1,false]}/>
    <primitive object={material} attach="material"/>
  </instancedMesh>;
}
