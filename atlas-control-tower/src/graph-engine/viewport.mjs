const MIN_ZOOM=0.55;
const MAX_ZOOM=2.4;

/** @param {number} value */
export function clampGraphZoom(value){
 const numeric=Number(value);
 if(!Number.isFinite(numeric))return 1;
 return Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,numeric));
}

/** @param {{devicePixelRatio?:number,width?:number,nodeCount?:number}} [options] */
export function graphDpr({devicePixelRatio=1,width=1280,nodeCount=0}={}){
 const native=Math.max(1,Number(devicePixelRatio)||1);
 let cap=2;
 if(Number(width)<=720)cap=1.25;
 if(Number(nodeCount)>=1000)cap=Math.min(cap,1.5);
 if(Number(nodeCount)>=5000)cap=Math.min(cap,1.25);
 return Math.min(native,cap);
}

/** @param {{width?:number,nodeCount?:number}} [options] */
export function graphNodeBudget({width=1280,nodeCount=0}={}){
 const count=Math.max(0,Number(nodeCount)||0);
 const cap=Number(width)<=720?700:Number(width)<=1024?1200:2000;
 return Math.min(count,cap);
}

/** @param {{width?:number,nodeCount?:number,zoom?:number}} [options] */
export function graphLabelBudget({width=1280,nodeCount=0,zoom=1}={}){
 const count=Math.max(0,Number(nodeCount)||0);
 const z=clampGraphZoom(zoom);
 let cap;
 if(Number(width)<=720)cap=z<.8?8:z<1.35?16:34;
 else if(Number(width)<=1024)cap=z<.8?12:z<1.35?26:56;
 else cap=z<.8?18:z<1.35?40:88;
 return Math.min(count,cap);
}

const TYPE_PRIORITY={ROOT:100,DOMAIN:90,SUBGRAPH:80,CAMPAIGN:72,HYPOTHESIS:68,CLAIM:66,TEST:62,RESULT:58,EVIDENCE:56};

/**
 * @template {{id?:string,type?:string}} T
 * @param {T[]} nodes
 * @param {{focusId?:string|null,selectedId?:string|null,budget?:number}} [options]
 * @returns {T[]}
 */
export function selectVisibleGraphNodes(nodes,{focusId=null,selectedId=null,budget=2000}={}){
 const source=Array.isArray(nodes)?nodes:[];
 const limit=Math.max(0,Math.min(source.length,Number(budget)||0));
 if(source.length<=limit)return source.slice();
 const ranked=source.map((node,index)=>{
  const id=String(node?.id||'');
  let score=Number(TYPE_PRIORITY[String(node?.type||'').toUpperCase()]||0);
  if(id===focusId)score+=10000;
  if(id===selectedId)score+=20000;
  return {node,index,score};
 }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).sort((a,b)=>a.index-b.index);
 return ranked.map(item=>item.node);
}

/**
 * @template {{id?:string,type?:string}} T
 * @param {T[]} nodes
 * @param {{focusId?:string|null,selectedId?:string|null,budget?:number}} [options]
 * @returns {T[]}
 */
export function selectGraphLabelNodes(nodes,{focusId=null,selectedId=null,budget=40}={}){
 const source=Array.isArray(nodes)?nodes:[];
 const limit=Math.max(0,Math.min(source.length,Number(budget)||0));
 if(limit===0)return [];
 return source.map((node,index)=>{
  const id=String(node?.id||'');
  let score=Number(TYPE_PRIORITY[String(node?.type||'').toUpperCase()]||0);
  if(id===focusId)score+=10000;
  if(id===selectedId)score+=20000;
  return {node,index,score};
 }).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(item=>item.node);
}
