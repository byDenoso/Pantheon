const box=item=>({left:item.x-item.width/2,top:item.y-item.height/2,right:item.x+item.width/2,bottom:item.y+item.height/2});
const overlaps=(a,b,padding)=>!(a.right+padding<=b.left||a.left>=b.right+padding||a.bottom+padding<=b.top||a.top>=b.bottom+padding);

export function placeSpatialLabels(items,{padding=5,maxOrdinary=32}={}){
 const ordered=[...items].sort((a,b)=>Number(Boolean(b.forced))-Number(Boolean(a.forced))||(Number(b.priority)||0)-(Number(a.priority)||0)||String(a.id).localeCompare(String(b.id)));
 const accepted=[];
 const acceptedBoxes=[];
 let ordinary=0;
 for(const item of ordered){
  const forced=item.forced===true;
  if(!forced&&ordinary>=maxOrdinary)continue;
  const current=box(item);
  if(!forced&&acceptedBoxes.some(existing=>overlaps(current,existing,padding)))continue;
  accepted.push(item);
  acceptedBoxes.push(current);
  if(!forced)ordinary++;
 }
 return accepted;
}
