import { useEffect, useMemo, useState, type Ref } from 'react';
import type { GraphEdge } from '../contracts/system.ts';
import type { GalaxySnapshot } from '../contracts/galaxy.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { AtlasCanvas25D } from './AtlasCanvas25D.tsx';
import type { CanvasGraph25DHandle } from './CanvasGraph25D.tsx';
import { ThreeGalaxy } from './ThreeGalaxy.tsx';

function browserSupportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2', { powerPreference: 'high-performance' })
      || canvas.getContext('webgl', { powerPreference: 'high-performance' }),
    );
  } catch {
    return false;
  }
}

export function AtlasGalaxy({
  nodes,
  edges,
  snapshot,
  selectedId,
  onSelect,
  controllerRef,
}:{
  nodes:PlacedNode3D[];
  edges:GraphEdge[];
  snapshot:GalaxySnapshot;
  selectedId:string|null;
  onSelect:(id:string|null)=>void;
  controllerRef?:Ref<CanvasGraph25DHandle>;
}){
  const forceCanvas = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('renderer') === 'canvas',
    [],
  );
  const [webglAvailable,setWebglAvailable]=useState(false);
  const [checked,setChecked]=useState(false);

  useEffect(()=>{
    setWebglAvailable(!forceCanvas && browserSupportsWebGL());
    setChecked(true);
  },[forceCanvas]);

  if(!checked)return <AtlasCanvas25D
    nodes={nodes}
    edges={edges}
    selectedId={selectedId}
    onSelect={onSelect}
    controllerRef={controllerRef}
  />;

  if(!webglAvailable)return <AtlasCanvas25D
    nodes={nodes}
    edges={edges}
    selectedId={selectedId}
    onSelect={onSelect}
    controllerRef={controllerRef}
  />;

  return <ThreeGalaxy
    ref={controllerRef}
    nodes={nodes}
    edges={edges}
    snapshot={snapshot}
    selectedId={selectedId}
    onSelect={onSelect}
    onUnavailable={()=>setWebglAvailable(false)}
  />;
}
