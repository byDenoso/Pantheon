import {useState} from 'react';
import {Canvas25DGraph} from './Canvas25DGraph';
import {GraphScene3D} from './GraphScene3D';
import {deriveGraphNavigation} from './navigation-contract.mjs';
import type {GraphSurfaceProps} from './types';

export function GraphRenderer(props:GraphSurfaceProps&{zoom?:number;onZoomChange?:(zoom:number)=>void}){
  const [mode,setMode]=useState<'3d'|'2d'>('3d');
  const navigation=deriveGraphNavigation(props.projection.nodes,props.projection.edges);
  const openIfExpandable=(id:string)=>{
    const state=navigation.get(id);
    if(state?.expandable)props.onOpenNode?.(id);
    else props.onSelect(id);
  };

  if(mode==='3d'){
    return <div className="graph-renderer-canvas graph-renderer-spatial" data-renderer="3d">
      <GraphScene3D
        {...props}
        onOpenNode={openIfExpandable}
        onRollback={()=>setMode('2d')}
      />
    </div>;
  }

  return <div className="graph-renderer-canvas graph-renderer-spatial" data-renderer="2d">
    <Canvas25DGraph
      projection={props.projection}
      selectedId={props.selectedId??null}
      onSelect={props.onSelect}
      onOpenNode={openIfExpandable}
      zoom={props.zoom}
      onZoomChange={props.onZoomChange}
    />
    <button className="graph-renderer-switch" onClick={()=>setMode('3d')}>3D</button>
  </div>;
}
