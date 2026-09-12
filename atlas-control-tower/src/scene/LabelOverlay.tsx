import type { PositionedNode } from './types';

export type ProjectedLabel={
  id:string;
  label:string;
  type:string;
  status:string;
  x:number;
  y:number;
  visible:boolean;
  side:'left'|'right';
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
      className={`atlas-label ${item.side} ${item.id===selectedId?'selected':''}`}
      style={{transform:`translate3d(${Math.round(item.x)}px,${Math.round(item.y)}px,0)`}}
    ><strong>{item.label}</strong><span>{item.type}{item.status ? ` · ${item.status}` : ''}</span></div>)}
  </div>;
}

export function labelText(node:PositionedNode){
  return String(node.label||node.id);
}

export function labelType(node:PositionedNode){
  return String(node.type||'ENTITY').replaceAll('_',' ');
}

export function labelStatus(node:PositionedNode){
  const status=String(node.status||'').trim();
  return status ? status.replaceAll('_',' ') : '';
}

// Positions are projected by the R3F camera component; this layer intentionally owns text only.
export const project = 'R3F_CAMERA_PROJECT';
