import type { PositionedNode } from './types';

export type ProjectedLabel={id:string;label:string;kind?:string;x:number;y:number;visible:boolean};
type Props={labels:ProjectedLabel[];labelIds:Set<string>;selectedId?:string|null;focusId?:string|null};

export function LabelOverlay({labels,labelIds,selectedId,focusId}:Props){
  return <div className="atlas-label-overlay" aria-hidden="true">
    {labels.filter(item=>item.visible&&labelIds.has(item.id)).map(item=><div
      key={item.id}
      className={`atlas-label ${item.id===selectedId?'selected':''} ${item.id===focusId?'focus':''}`}
      style={{transform:`translate3d(${Math.round(item.x+16)}px,${Math.round(item.y-30)}px,0)`}}
    ><strong>{item.label}</strong>{item.kind?<small>{item.kind}</small>:null}</div>)}
  </div>;
}

export function labelText(node:PositionedNode){return String(node.label||node.id)}
export const project = 'R3F_CAMERA_PROJECT';
