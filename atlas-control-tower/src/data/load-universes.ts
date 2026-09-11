import {createApi} from '../../lib/atlas-api.mjs';
type GraphApi={graph:(query:Record<string,unknown>)=>Promise<any>};
const ALLOWED=new Set(['SCIENCE','ENGINEERING','OLYMPUS']);
export async function loadUniversesSources(api:GraphApi=createApi() as GraphApi){
 let root:any=null;try{root=await api.graph({focus:'system:NEXO',depth:1,limit:32})}catch{return{root:null,details:{}}}
 const nodes:any[]=Array.isArray(root?.nodes)?root.nodes:[];const edges:any[]=Array.isArray(root?.edges)?root.edges:[];
 const childIds=new Set<string>(edges.filter(e=>e?.source==='system:NEXO'&&e?.type==='CONTAINS').map(e=>String(e.target||'')));
 const keys:string[]=nodes.filter(n=>n?.type==='SYSTEM'&&childIds.has(String(n.id||''))).map(n=>String(n.id||'').replace(/^system:/,'').toUpperCase()).filter(key=>ALLOWED.has(key));
 const settled=await Promise.allSettled(keys.map(key=>api.graph({focus:`system:${key}`,depth:1,limit:96})));const details:Record<string,any>={};
 keys.forEach((key,index)=>{details[key.toLowerCase()]=settled[index].status==='fulfilled'?settled[index].value:null});return{root,details};
}
