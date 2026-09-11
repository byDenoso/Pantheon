import type {GraphNode25D} from './types25d';

export function GraphLabel25D({node,visible}:{node:GraphNode25D;visible:boolean}){
  if(!visible)return null;
  return <span className="graph-25d-label" aria-hidden="true">
    <strong>{node.label}</strong>
    <small>{node.isFocus?'FOCO ATUAL':node.type}</small>
  </span>;
}
