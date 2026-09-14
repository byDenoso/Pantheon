import {Canvas25DGraph} from './Canvas25DGraph';
import {deriveGraphNavigation} from './navigation-contract.mjs';
import type {GraphSurfaceProps} from './GraphScene3D';

export function GraphRenderer(props:GraphSurfaceProps&{zoom?:number;onZoomChange?:(zoom:number)=>void}){
  const navigation=deriveGraphNavigation(props.projection.nodes,props.projection.edges);
  const openIfExpandable=(id:string)=>{
    const state=navigation.get(id);
    if(state?.expandable)props.onOpenNode?.(id);
    else props.onSelect(id);
  };
  return <div className="graph-renderer-canvas graph-renderer-spatial">
    <Canvas25DGraph
      projection={props.projection}
      selectedId={props.selectedId??null}
      onSelect={props.onSelect}
      onOpenNode={openIfExpandable}
      zoom={props.zoom}
      onZoomChange={props.onZoomChange}
    />
  </div>;
}
