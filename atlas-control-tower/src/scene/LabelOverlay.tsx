import type { PositionedNode } from './types';

export type ProjectedLabel={
  id:string;
  label:string;
  x:number;
  y:number;
  visible:boolean;
};

type Props={
  labels:ProjectedLabel[];
  labelIds:Set<string>;
  selectedId?:string|null;
};

export function LabelOverlay({labels,labelIds,selectedId}:Props){
  return <div className="atlas-label-overlay" aria-hidden="true">
    {labels.filter(item=>item.visible&&labelIds.has(item.id)).map(item=><div
      key={item.id}
      className={`atlas-label ${item.id===selectedId?'selected':''}`}
      style={{transform:`translate3d(${Math.round(item.x)}px,${Math.round(item.y)}px,0)`}}
    >{item.label}</div>)}
  </div>;
}

export function labelText(node:PositionedNode){
  return String(node.label||node.id);
}

// Positions are projected by the R3F camera component; this layer intentionally owns text only.
export const project = 'R3F_CAMERA_PROJECT';
