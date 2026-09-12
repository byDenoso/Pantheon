import type {CSSProperties,MouseEvent} from 'react';
import {GraphLabel25D} from './GraphLabel25D';
import type {GraphNode25D as Node25D} from './types25d';

type Props={node:Node25D;selected:boolean;highlighted:boolean;dimmed:boolean;showLabel:boolean;onSelect:(id:string)=>void;onFocus?:(id:string)=>void};

export function GraphNode25D({node,selected,highlighted,dimmed,showLabel,onSelect,onFocus}:Props){
  const style={
    '--node-x':`${node.x}%`,
    '--node-y':`${node.y}%`,
    '--node-z':`${node.z}px`,
    '--node-size':`${node.size}px`,
    '--node-scale':selected?1.12:highlighted?1.06:1,
    zIndex:Math.max(1,Math.round(node.z+120)),
  } as CSSProperties;
  const click=(event:MouseEvent<HTMLButtonElement>)=>{event.stopPropagation();onSelect(node.id)};
  const doubleClick=(event:MouseEvent<HTMLButtonElement>)=>{event.stopPropagation();onSelect(node.id);onFocus?.(node.id)};
  return <button
    type="button"
    className={`graph-25d-node${node.isFocus?' is-focus':''}${selected?' is-selected':''}${highlighted?' is-highlighted':''}${dimmed?' is-dimmed':''}`}
    style={style}
    aria-label={`${node.label}, ${node.type}`}
    aria-pressed={selected}
    onClick={click}
    onDoubleClick={doubleClick}
  >
    <span className="graph-25d-halo" aria-hidden="true"/>
    <span className="graph-25d-sphere" aria-hidden="true"/>
    {node.isFocus?<span className="graph-25d-node-ring" aria-hidden="true"/>:null}
    <GraphLabel25D node={node} visible={showLabel}/>
  </button>;
}
