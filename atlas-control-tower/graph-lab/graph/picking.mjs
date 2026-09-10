export function pickNode(points,x,y,padding=9){
 const hits=points.filter(p=>Math.hypot(p.x-x,p.y-y)<=p.r+padding);
 if(!hits.length)return null;
 hits.sort((a,b)=>b.z-a.z||Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
 return hits[0];
}
