import {GraphExplorer} from './GraphExplorer';
import type {GraphSurfaceProps} from './GraphScene3D';

export function GraphRenderer(props:GraphSurfaceProps){
  return <div className="graph-renderer-canvas graph-renderer-canvas-25d"><GraphExplorer {...props}/></div>;
}