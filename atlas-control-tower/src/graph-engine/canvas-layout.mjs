const hash=s=>{let h=2166136261;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const boxesOverlap=(a,b)=>!(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
export function layoutCanvasOrbit(nodes,{focusId,width,height}){
 const out=new Map();const cx=width/2,cy=height/2;const focus=nodes.find(n=>n.id===focusId)||nodes[0];if(focus)out.set(focus.id,{x:cx,y:cy,z:0,ring:0});
 const rest=nodes.filter(n=>!focus||n.id!==focus.id);
 const base=Math.min(width,height)*.24;
 const perRing=6;
 rest.forEach((node,i)=>{const ring=Math.floor(i/perRing)+1;const slot=i%perRing;const ringCount=Math.min(perRing,rest.length-(ring-1)*perRing);const seed=(hash(node.id)%360)*Math.PI/180;const angle=(slot/Math.max(1,ringCount))*Math.PI*2+seed*.025+ring*.18;const radius=base+(ring-1)*Math.min(width,height)*.13;out.set(node.id,{x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius*.74,z:((hash(node.id)%17)-8)/8,ring});});
 return out;
}
export function projectCanvasNode(pos,view){
 const z=Number(pos?.z||0);const depthScale=clamp(1+z*.08,.82,1.16);const depthAlpha=clamp(.74+z*.16,.42,1);const tiltX=(view?.tiltX||0)*Math.PI/180,tiltY=(view?.tiltY||0)*Math.PI/180;return{x:pos.x+z*Math.sin(tiltY)*44,y:pos.y-z*Math.sin(tiltX)*38,depthScale,depthAlpha};
}
export function placeCanvasLabels(items,{focusId,selectedId,measureText,fontHeight=14,padding=6}){
 const sorted=[...items].sort((a,b)=>{const af=a.id===focusId||a.id===selectedId?1:0,bf=b.id===focusId||b.id===selectedId?1:0;return bf-af||(b.priority||0)-(a.priority||0)||String(a.id).localeCompare(String(b.id))});
 const placed=[];const boxes=[];
 for(const item of sorted){const w=Math.max(24,measureText(item.label||item.id))+padding*2,h=fontHeight+padding*2;const box={x:item.x-w/2,y:item.y+12,w,h};const forced=item.id===focusId||item.id===selectedId;if(forced||boxes.every(b=>!boxesOverlap(box,b))){placed.push({...item,box});boxes.push(box)}}
 return placed;
}
export function nodeVisual(type,selected=false){const t=String(type||'').toUpperCase();const radius=t==='ROOT'?42:t==='DOMAIN'?32:t==='SUBGRAPH'?23:15;return{radius,glow:selected?20:t==='ROOT'?18:t==='DOMAIN'?13:8};}
