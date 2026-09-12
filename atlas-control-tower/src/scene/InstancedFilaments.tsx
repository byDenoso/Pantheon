import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { createFilamentMaterial } from './materials';
import type { AtlasEdge, PositionedNode } from './types';

const SEGMENTS=9;
const EDGE_COLOR: Record<string,string> = {
  CONTEXT:'#2677a6', STRUCTURAL:'#356e9b', CO_DECLARED:'#b695ff', CROSS_DOMAIN:'#b695ff', CONTAINS:'#4a89bd',
  SUPPORTS:'#69dec0', CONTRADICTS:'#f38999', DEPENDS_ON:'#efc379'
};

function hashSign(value:string){let h=0;for(let i=0;i<value.length;i++)h=(h*31+value.charCodeAt(i))|0;return h%2===0?1:-1}
function quadraticPoint(a:Vector3,c:Vector3,b:Vector3,t:number){const u=1-t;return a.clone().multiplyScalar(u*u).add(c.clone().multiplyScalar(2*u*t)).add(b.clone().multiplyScalar(t*t))}
function colorFor(edge:AtlasEdge){const kind=String(edge.type||'').toUpperCase();if(kind.includes('LEARNING'))return new Color('#b56dff');return new Color(EDGE_COLOR[kind]||'#366f9f')}
function widthFor(edge:AtlasEdge){const kind=String(edge.type||'').toUpperCase();if(kind.includes('LEARNING'))return .018;if(kind==='CONTAINS')return .014;if(kind==='SUPPORTS'||kind==='DEPENDS_ON')return .015;return .012}

type Props={edges:AtlasEdge[];nodes:PositionedNode[]};

export function InstancedFilaments({edges,nodes}:Props){
  const mesh=useRef<InstancedMesh>(null);
  const object=useMemo(()=>new Object3D(),[]);
  const material=useMemo(()=>createFilamentMaterial(),[]);

  useLayoutEffect(()=>{
    const target=mesh.current;if(!target)return;
    const positions=new Map(nodes.map(node=>[node.id,new Vector3(...node.position)]));
    const valid=edges.filter(edge=>positions.has(edge.source)&&positions.has(edge.target));
    const up=new Vector3(0,1,0);const axisZ=new Vector3(0,0,1);const axisY=new Vector3(0,1,0);const matrix=new Matrix4();let instance=0;
    valid.forEach(edge=>{
      const a=positions.get(edge.source)!;const b=positions.get(edge.target)!;const delta=b.clone().sub(a);const distance=Math.max(.001,delta.length());
      const tangent=delta.clone().normalize();const axis=Math.abs(tangent.dot(axisZ))>.86?axisY:axisZ;const perpendicular=tangent.clone().cross(axis).normalize();
      const bend=Math.min(1.08,.22+distance*.075)*hashSign(String(edge.id||`${edge.source}:${edge.target}`));
      const control=a.clone().add(b).multiplyScalar(.5).add(perpendicular.multiplyScalar(bend));const color=colorFor(edge);const width=widthFor(edge);
      for(let segment=0;segment<SEGMENTS;segment++){
        const p0=quadraticPoint(a,control,b,segment/SEGMENTS);const p1=quadraticPoint(a,control,b,(segment+1)/SEGMENTS);const direction=p1.clone().sub(p0);const length=Math.max(.001,direction.length());
        const midpoint=p0.clone().add(p1).multiplyScalar(.5);const quaternion=new Quaternion().setFromUnitVectors(up,direction.clone().normalize());
        object.position.copy(midpoint);object.quaternion.copy(quaternion);object.scale.set(width,length,width);object.updateMatrix();matrix.copy(object.matrix);
        target.setMatrixAt(instance,matrix);target.setColorAt(instance,color);instance++;
      }
    });
    target.count=instance;target.instanceMatrix.needsUpdate=true;if(target.instanceColor)target.instanceColor.needsUpdate=true;
  },[edges,nodes,object]);

  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,edges.length*SEGMENTS)]} frustumCulled={false}>
    <cylinderGeometry args={[1,1,1,6,1,false]}/><primitive object={material} attach="material"/>
  </instancedMesh>;
}
