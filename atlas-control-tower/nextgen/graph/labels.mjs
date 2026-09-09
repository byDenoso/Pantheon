// HTML label overlay for the Atlas graph.
// Labels live in the DOM rather than the WebGL canvas so they stay crisp at any
// devicePixelRatio, remain selectable and are reachable by assistive tech.
//
// placeLabels() is pure and DOM-free so the placement invariants can be tested.

import {labelPolicy} from './layout.mjs';

const NORMAL_PRIORITY={SYSTEM:10,DOMAIN:9,PROJECT:9,CAMPAIGN:8,HYPOTHESIS:7,CLAIM:7,TEST:5,RESULT:4,SOURCE:3};
const PROVENANCE_PRIORITY={CLAIM:10,HYPOTHESIS:10,SOURCE:9,SOURCE_REF:8,PUBLICATION:7,DATASET:7,RESULT:6,TEST:6,MODEL:5,PROBE:5,CAMPAIGN:4,DOMAIN:3,SYSTEM:2};

// Rough advance width per character for the label font. Measuring in the DOM
// would force a layout flush per node per frame; the estimate only feeds
// collision boxes, and CSS ellipsis handles any residual overflow.
// Deliberately a slight over-estimate: the value also caps the element's
// max-width, and under-estimating truncates short labels ("OLYMPUS" -> "OLYMPU").
// Over-estimating only loosens collision packing a little.
const CHAR_W=7.6;
// A label wider than this stops being an annotation and becomes a caption
// competing with the map, so it is truncated with an ellipsis instead.
export const MAX_W=210;
// How far a label box may sit from its anchor before it stops reading as
// belonging to that node.
export const SLACK=26;
export const LABEL_H=24;

/**
 * Decide which nodes get a label and where the box goes.
 * @returns {Array<{id,node,text,x,y,w,h,color}>}
 */
export function placeLabels(points,{width,height,semanticView,selected,hover,focus,related}={}){
  const policy=labelPolicy(width,semanticView);
  const priorities=semanticView==='provenance'?PROVENANCE_PRIORITY:NORMAL_PRIORITY;
  const weight=p=>{
    const n=p.node;
    if(n.id===selected)return 1000;
    if(n.id===hover)return 900;
    if(n.id===focus)return 800;
    return priorities[n.visualType||n.type]||0;
  };
  // Nearer nodes win ties so the label set stays stable while orbiting.
  const ordered=points
    .filter(p=>p.visible!==false)
    .sort((a,b)=>weight(b)-weight(a)||a.depth-b.depth);

  const boxes=[],out=[];
  let count=0;
  for(const p of ordered){
    const n=p.node;
    const pinned=n.id===selected||n.id===hover;
    if(count>=policy.max&&!pinned)continue;
    if(related&&related.size&&!related.has(n.id)&&!pinned)continue;
    // A label only belongs to a node the viewer can actually see.
    if(p.x<-4||p.y<-4||p.x>width+4||p.y>height+4)continue;

    const text=String(n.label||n.id).replace(/\s+/g,' ').slice(0,policy.maxChars);
    const w=Math.min(text.length*CHAR_W+18,MAX_W,width*.3);
    const h=LABEL_H;

    // Constrain the box to a window around the anchor rather than merely to the
    // viewport. Viewport-only clamping lets every wide label near an edge land
    // on the same x, which reads as a column of captions belonging to nothing.
    const lo=Math.max(6,p.x-w-SLACK),hi=Math.min(width-w-6,p.x+SLACK);
    if(lo>hi)continue;
    const x=Math.max(lo,Math.min(hi,p.x-w/2));

    // Prefer below the node, fall back to above before giving up.
    let y=null;
    for(const candidate of [p.y+p.r+9,p.y-p.r-h-9]){
      if(candidate<6||candidate>height-h-6)continue;
      const clash=boxes.some(o=>x<o.x+o.w+6&&x+w+6>o.x&&candidate<o.y+o.h+5&&candidate+h+5>o.y);
      if(!clash||pinned){y=candidate;break}
    }
    if(y===null)continue;

    boxes.push({x,y,w,h});
    out.push({id:n.id,node:n,text,x,y,w,h,color:p.color});
    count++;
  }
  return out;
}

export class LabelLayer{
  constructor(host){this.host=host;this.pool=[];this.active=new Map()}
  acquire(){
    const el=this.pool.pop()||(()=>{
      const node=document.createElement('button');
      node.type='button';node.className='atlas-label';node.tabIndex=-1;
      this.host.appendChild(node);
      return node;
    })();
    el.hidden=false;
    return el;
  }
  release(el){el.hidden=true;el.className='atlas-label';this.pool.push(el)}
  clear(){for(const el of this.active.values())this.release(el);this.active.clear()}
  destroy(){this.clear();for(const el of this.pool)el.remove();this.pool=[]}

  render(points,opts={}){
    const placed=placeLabels(points,opts);
    const {selected,hover,focus,onSelect}=opts;
    const keep=new Set();
    for(const item of placed){
      keep.add(item.id);
      let el=this.active.get(item.id);
      if(!el){el=this.acquire();this.active.set(item.id,el);el.onclick=()=>onSelect?.(item.node)}
      if(el.textContent!==item.text)el.textContent=item.text;
      const cls=`atlas-label${item.id===selected?' is-selected':''}${item.id===focus?' is-focus':''}${item.id===hover?' is-hover':''}`;
      if(el.className!==cls)el.className=cls;
      el.style.transform=`translate3d(${Math.round(item.x)}px,${Math.round(item.y)}px,0)`;
      el.style.maxWidth=`${Math.round(item.w)}px`;
      el.style.setProperty('--label-tint',item.color||'#cfe0ff');
    }
    for(const [id,el] of this.active){
      if(keep.has(id))continue;
      this.release(el);this.active.delete(id);
    }
    return placed.length;
  }
}
