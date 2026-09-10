const TYPE_RANK={SYSTEM:700,DOMAIN:520,PROGRAM:410,CAMPAIGN:360,CLAIM:220,TEST:180,RESULT:120};

function overlap(a,b,pad=0){return a.x<a.x+a.w&&a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y}
function boxCircle(box,p){
 const cx=Math.max(box.x,Math.min(p.x,box.x+box.w));
 const cy=Math.max(box.y,Math.min(p.y,box.y+box.h));
 return Math.hypot(p.x-cx,p.y-cy)<p.r+4;
}

export function semanticLabelRank(point,{focusId,selectedId,hoverId}={}){
 const id=point.node.id;
 if(id===focusId)return 100000;
 if(id===selectedId)return 90000;
 if(id===hoverId)return 80000;
 // What a click just revealed must be readable: children of the selection label next.
 if(selectedId&&point.node.parentId===selectedId)return 70000;
 return (TYPE_RANK[point.node.type]||0)+(point.z||0);
}

export function placeLabels(points,{width,height,focusId=null,selectedId=null,hoverId=null,maxLabels=24,reserved=[]}={}){
 const sorted=[...points].sort((a,b)=>semanticLabelRank(b,{focusId,selectedId,hoverId})-semanticLabelRank(a,{focusId,selectedId,hoverId}));
 const placed=[];
 for(const p of sorted){
  if(placed.length>=maxLabels&&p.node.id!==focusId&&p.node.id!==selectedId&&p.node.id!==hoverId)continue;
  const label=String(p.node.label||p.node.id);
  const w=Math.max(54,Math.min(210,label.length*7.2+26));
  const h=32;
  const d=p.r+12;
  const candidates=[
   [p.x-w/2,p.y+d],[p.x-w/2,p.y-d-h],[p.x+d,p.y-h/2],[p.x-d-w,p.y-h/2],
   [p.x-w/2,p.y+d+28],[p.x-w/2,p.y-d-h-28]
  ];
  let chosen=null;
  for(const [x,y] of candidates){
   const box={x,y,w,h};
   if(x<6||y<6||x+w>width-6||y+h>height-6)continue;
   if(reserved.some(r=>overlap(box,r,2)))continue;
   if(placed.some(r=>overlap(box,r,6)))continue;
   if(points.some(q=>q.node.id!==p.node.id&&boxCircle(box,q)))continue;
   chosen={id:p.node.id,label,type:p.node.type,x,y,w,h,point:p};break;
  }
  if(chosen)placed.push(chosen);
 }
 return placed;
}
