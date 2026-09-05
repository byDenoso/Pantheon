import {MAP_CONFIG} from './visual-config.mjs';
/** Root overview includes only real immediate children and their existing edges. */
export async function expandOverview(base,read){
 const groups=base.nodes.filter(n=>n.type==='SYSTEM'&&n.id!=='system:NEXO');
 const parts=await Promise.allSettled(groups.map(n=>read('graph',{focus:n.id,limit:MAP_CONFIG.previewPerGroup})));
 const nodes=new Map(base.nodes.map(n=>[n.id,n])),edges=new Map(base.edges.map(e=>[e.id||`${e.source}:${e.type}:${e.target}`,e]));
 for(const result of parts){if(result.status!=='fulfilled')continue;for(const n of result.value.nodes)if(nodes.size<MAP_CONFIG.maxNodes||nodes.has(n.id))nodes.set(n.id,n);for(const e of result.value.edges)edges.set(e.id||`${e.source}:${e.type}:${e.target}`,e)}
 return {...base,nodes:[...nodes.values()],edges:[...edges.values()].filter(e=>nodes.has(e.source)&&nodes.has(e.target)),preview:true,total:nodes.size};
}
export function clusteredPositions(data,focus,fallback){
 if(data.nodes.some(n=>n.layer!=null))return layeredPositions(data,focus);if(focus!=='system:NEXO')return fallback(data.nodes,focus);
 const groups=data.nodes.filter(n=>n.type==='SYSTEM'&&n.id!==focus),centers=new Map();
 groups.forEach((n,i)=>{const a=i/groups.length*Math.PI*2-.9;centers.set(n.id,[Math.cos(a)*300,Math.sin(a)*195,Math.sin(a*2)*65])});
 const parent=new Map();for(const e of data.edges)if(centers.has(e.source)&&e.target!==focus&&!centers.has(e.target)&&!parent.has(e.target))parent.set(e.target,e.source);
 const counters=new Map();return data.nodes.map(n=>{if(n.id===focus)return[0,0,0];if(centers.has(n.id))return centers.get(n.id);const pid=parent.get(n.id),center=centers.get(pid);if(!center)return[0,0,-250];const i=counters.get(pid)||0;counters.set(pid,i+1);const a=i*2.39996323,r=42+Math.sqrt(i)*13;return[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r*.75,center[2]+Math.sin(a*1.7)*42]});
}

function layeredPositions(data,focus){
 const positions=new Map([[focus,[0,0,0]]]),siblings=new Map();
 for(const n of data.nodes)if(n.layoutParent){if(!siblings.has(n.layoutParent))siblings.set(n.layoutParent,[]);siblings.get(n.layoutParent).push(n)}
 for(let layer=1;layer<=3;layer++)for(const [parent,children]of siblings){const center=positions.get(parent);if(!center)continue;children.forEach((n,i)=>{if(n.layer!==layer)return;const a=i/children.length*Math.PI*2-.9,r=layer===1?290:layer===2?74:27;positions.set(n.id,[center[0]+Math.cos(a)*r,center[1]+Math.sin(a)*r*.7,center[2]+Math.sin(a*2)*r*.25])})}
 return data.nodes.map(n=>positions.get(n.id)||[0,0,0]);
}
