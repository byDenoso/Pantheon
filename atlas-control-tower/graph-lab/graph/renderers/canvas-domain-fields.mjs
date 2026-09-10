const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function domainKey(id=''){
 const raw=String(id||'').toUpperCase();
 if(raw.includes('SCIENCE')||raw.includes('CIENCIA')||raw.includes('CIÊNCIA'))return'SCIENCE';
 if(raw.includes('OLYMPUS'))return'OLYMPUS';
 if(raw.includes('ENGINEERING')||raw.includes('ENGENHARIA'))return'ENGINEERING';
 if(raw.includes('NEXO'))return'NEXO';
 return'DEFAULT';
}

function fieldColor(id,style={}){
 return style.color||style.domainFields?.[domainKey(id)]||style.domainFields?.DEFAULT||'rgba(205,225,245,0.08)';
}

export function buildDomainField(points,domainId,options={}){
 const visible=(points||[]).filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y));
 if(!visible.length)return null;
 const cx=visible.reduce((sum,p)=>sum+p.x,0)/visible.length;
 const cy=visible.reduce((sum,p)=>sum+p.y,0)/visible.length;
 const avgDepth=visible.reduce((sum,p)=>sum+Number(p.z||0),0)/visible.length;
 const rawRadius=Math.max(...visible.map(p=>Math.hypot(p.x-cx,p.y-cy)),28);
 const radius=clamp(rawRadius+Number(options.padding??56),64,520);
 const hull=visible
  .map(p=>({x:p.x,y:p.y,id:p.id||p.node?.id||null,angle:Math.atan2(p.y-cy,p.x-cx)}))
  .sort((a,b)=>a.angle-b.angle)
  .map(({x,y,id})=>({x,y,id}));
 return Object.freeze({domainId,center:Object.freeze({x:cx,y:cy}),radius,hull:Object.freeze(hull),depth:avgDepth,nodeIds:Object.freeze(hull.map(p=>p.id).filter(Boolean))});
}

export function buildDomainFields(graph,projectedPoints,options={}){
 const byId=new Map((graph?.nodes||[]).map(node=>[node.id,node]));
 const lanes=(graph?.nodes||[]).filter(node=>!node.overlayOnly&&(node.hierarchyLevel==='lane'||node.parentId===graph?.rootId));
 const pointsById=new Map((projectedPoints||[]).map(point=>[point.node?.id||point.id,point]));
 const fields=[];
 for(const lane of lanes){
  const ids=new Set([lane.id]);
  for(const node of graph?.nodes||[]){
   let cur=node;let guard=0;
   while(cur&&guard++<24){
    if(cur.id===lane.id){ids.add(node.id);break}
    cur=cur.parentId?byId.get(cur.parentId):null;
   }
  }
  const points=[...ids].map(id=>pointsById.get(id)).filter(Boolean).map(point=>({...point,id:point.node?.id||point.id}));
  const field=buildDomainField(points,lane.id,options);
  if(field)fields.push(field);
 }
 return fields;
}

export function drawDomainField(ctx,field,style={}){
 if(!ctx||!field)return;
 const color=fieldColor(field.domainId,style);
 const alpha=clamp(Number(style.alpha??.12),0,.16);
 ctx.save();
 ctx.globalAlpha=alpha;
 ctx.strokeStyle=color;
 ctx.fillStyle=color;
 ctx.lineWidth=Number(style.lineWidth||1);
 const {x,y}=field.center;
 const r=field.radius;
 ctx.beginPath();
 ctx.ellipse(x,y,r,r*.58,-.18,0,Math.PI*2);
 ctx.stroke();
 ctx.globalAlpha=alpha*.42;
 for(let i=1;i<=3;i++){
  ctx.beginPath();
  ctx.ellipse(x,y,r*(1-i*.12),r*.58*(1-i*.10),-.18+i*.04,0,Math.PI*2);
  ctx.stroke();
 }
 ctx.globalAlpha=alpha*.34;
 for(const p of field.hull){
  ctx.beginPath();
  ctx.moveTo(x+(p.x-x)*.18,y+(p.y-y)*.18);
  ctx.lineTo(p.x,p.y);
  ctx.stroke();
 }
 ctx.restore();
}

export {domainKey};
