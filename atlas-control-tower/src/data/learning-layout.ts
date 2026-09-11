type Point={id:string;label:string;kind:'context'|'item';stage?:string;status?:string;position:[number,number];contextId?:string|null};
type Filament=Record<string,any>;

const FIXED:Record<string,[number,number]>={
 science:[180,150],engineering:[820,150],olympus:[180,470],ai:[820,470],operation:[500,525]
};
const STAGE_RADIUS:Record<string,number>={OBSERVATION:64,PATTERN:82,LESSON:102,STRATEGY:124,POLICY:146};
const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5));

function hash01(value:string){
 let h=2166136261;
 for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0)/0xffffffff;
}
function contextId(value:unknown){
 const raw=String(value??'').trim().toUpperCase();
 if(!raw||raw==='CROSS_DOMAIN')return '';
 if(raw.includes('SCIENCE'))return 'science';
 if(raw.includes('ENGINEER'))return 'engineering';
 if(raw.includes('OLYMPUS'))return 'olympus';
 if(raw==='AI'||raw.includes('_AI')||raw.includes('AGENT'))return 'ai';
 if(raw.includes('NEXO')||raw.includes('CONTINUITY')||raw.includes('AUTOMATION')||raw.includes('OPS')||raw.includes('RUNTIME'))return 'operation';
 return raw.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function contextPosition(id:string,index:number,total:number):[number,number]{
 if(FIXED[id])return FIXED[id];
 const angle=(index/Math.max(1,total))*Math.PI*2-Math.PI/2;
 return [500+Math.cos(angle)*300,310+Math.sin(angle)*190];
}

export function layoutLearningMesh(model:any){
 const contexts=Array.isArray(model?.contexts)?model.contexts:[];
 const items=Array.isArray(model?.items)?model.items:[];
 const points:Point[]=[];
 contexts.forEach((context:any,index:number)=>{
  const id=String(context.id||'');
  points.push({id:String(context.anchorId||`context:${id}`),label:String(context.label||id),kind:'context',position:contextPosition(id,index,contexts.length),contextId:id});
 });
 const anchors=new Map(points.filter(point=>point.kind==='context').map(point=>[point.contextId||'',point.position]));
 const grouped=new Map<string,any[]>();
 for(const item of items){const id=contextId(item.domainA);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id)!.push(item)}
 for(const [ctx,group] of grouped){
  const anchor=anchors.get(ctx)||[500,310] as [number,number];
  group.forEach((item,index)=>{
   const stage=String(item.stage||'').toUpperCase();
   const ringStep=ctx?14:18;const ringIndex=Math.floor(index/ringStep);
   const radius=(STAGE_RADIUS[stage]||92)+ringIndex*(ctx?18:26);
   const angle=index*GOLDEN_ANGLE+(hash01(String(item.id))*.5-.25);
   const depthSquash=.58+((index%5)*.035);
   const x=Math.max(28,Math.min(972,anchor[0]+Math.cos(angle)*radius));
   const y=Math.max(34,Math.min(586,anchor[1]+Math.sin(angle)*radius*depthSquash));
   points.push({id:String(item.id),label:String(item.label||item.id),kind:'item',stage,status:String(item.status||''),position:[x,y],contextId:ctx||null});
  });
 }
 const byId=new Map(points.map(point=>[point.id,point]));
 const filaments=(Array.isArray(model?.filaments)?model.filaments:[]).filter((item:any)=>byId.has(String(item.source))&&byId.has(String(item.target)));
 return {points,byId,filaments};
}

export function filamentPath(filament:any,byId:Map<string,Point>){
 const a=byId.get(String(filament?.source)),b=byId.get(String(filament?.target));
 if(!a||!b)return '';
 const [x1,y1]=a.position,[x2,y2]=b.position;const dx=x2-x1,dy=y2-y1;
 const length=Math.max(1,Math.hypot(dx,dy));const nx=-dy/length,ny=dx/length;
 const bend=(String(filament?.type)==='transfer'?72:String(filament?.type)==='lineage'?38:22)*(hash01(String(filament?.id))>.5?1:-1);
 const c1x=x1+dx*.34+nx*bend,c1y=y1+dy*.34+ny*bend;const c2x=x1+dx*.66+nx*bend,c2y=y1+dy*.66+ny*bend;
 return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
