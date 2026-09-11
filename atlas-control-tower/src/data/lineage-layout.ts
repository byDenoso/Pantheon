type NodeLike={id:string;[key:string]:unknown};
type EdgeLike={source:string;target:string;[key:string]:unknown};
type Model={nodes:NodeLike[];edges:EdgeLike[];focusId?:string};

export function buildLineageLayout(model:Model){
 const nodes=Array.isArray(model?.nodes)?model.nodes:[];
 const edges=Array.isArray(model?.edges)?model.edges:[];
 const ids=new Set(nodes.map(node=>node.id));
 const incoming=new Map<string,number>(nodes.map(node=>[node.id,0]));
 const outgoing=new Map<string,string[]>(nodes.map(node=>[node.id,[]]));
 for(const edge of edges){
  if(!ids.has(edge.source)||!ids.has(edge.target))continue;
  incoming.set(edge.target,(incoming.get(edge.target)||0)+1);
  outgoing.get(edge.source)?.push(edge.target);
 }
 const queue=nodes.filter(node=>(incoming.get(node.id)||0)===0).map(node=>node.id).sort();
 const rank=new Map<string,number>(queue.map(id=>[id,0]));
 const indegree=new Map(incoming);
 while(queue.length){
  const id=queue.shift()!;const base=rank.get(id)||0;
  for(const target of outgoing.get(id)||[]){
   rank.set(target,Math.max(rank.get(target)||0,base+1));
   indegree.set(target,(indegree.get(target)||1)-1);
   if(indegree.get(target)===0){queue.push(target);queue.sort()}
  }
 }
 for(const node of nodes)if(!rank.has(node.id))rank.set(node.id,0);
 const maxRank=Math.max(0,...rank.values());
 const groups=new Map<number,NodeLike[]>();
 for(const node of nodes){const r=rank.get(node.id)||0;if(!groups.has(r))groups.set(r,[]);groups.get(r)!.push(node)}
 const positioned=nodes.map(node=>{
  const r=rank.get(node.id)||0,group=(groups.get(r)||[]).sort((a,b)=>a.id.localeCompare(b.id));
  const index=group.findIndex(item=>item.id===node.id);
  const x=maxRank===0?50:10+(r/maxRank)*80;
  const y=group.length===1?50:12+(index/(group.length-1))*76;
  return {...node,x,y,rank:r,focused:node.id===model.focusId};
 });
 const by=new Map(positioned.map(node=>[node.id,node]));
 const laidEdges=edges.filter(edge=>by.has(edge.source)&&by.has(edge.target)).map(edge=>{
  const a=by.get(edge.source)!,b=by.get(edge.target)!;
  const bend=Math.max(4,(b.x-a.x)*0.45);
  return {...edge,path:`M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`};
 });
 return {nodes:positioned,edges:laidEdges,width:100,height:100};
}
