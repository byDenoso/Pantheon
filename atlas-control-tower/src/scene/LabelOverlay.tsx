import type { PositionedNode } from './types';

export type ProjectedLabel={id:string;label:string;kind?:string;x:number;y:number;visible:boolean};
type Props={labels:ProjectedLabel[];labelIds:Set<string>;selectedId?:string|null;focusId?:string|null};

export function LabelOverlay({labels,labelIds,selectedId,focusId}:Props){
  const viewportWidth=typeof window==='undefined'?1280:window.innerWidth;
  return <div className="atlas-label-overlay" aria-hidden="true">
    {labels.filter(item=>item.visible&&labelIds.has(item.id)).map(item=>{
      const side=item.x>viewportWidth*.58?'left':'right'; /* side='left' is the intentional anchored-label contract */
      const focus=item.id===focusId;
      const selected=item.id===selectedId;
      const x=Math.round(item.x+(side==='left'?-18:18));
      const y=Math.round(item.y+(focus?-48:-32));
      const transform=`translate3d(${x}px,${y}px,0)${side==='left'?' translateX(-100%)':''}`;
      return <div
        key={item.id}
        className={`atlas-label ${side} ${selected?'selected':''} ${focus?'focus':''}`}
        data-anchor={side}
        style={{transform}}
      ><strong>{item.label}</strong>{item.kind?<small>{item.kind}</small>:null}</div>;
    })}
  </div>;
}

export function labelText(node:PositionedNode){return String(node.label||node.id)}
export const project = 'R3F_CAMERA_PROJECT';
