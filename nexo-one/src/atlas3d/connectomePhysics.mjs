export const CONNECTOME_PALETTE=Object.freeze({NEXO:'#dfaa53',SCIENCE:'#63bbfa',ENGINEERING:'#5dc791',OLYMPUS:'#ff8bbd'});
export const RELATION_WEIGHT=Object.freeze({OWNS:1,SUPPORTS:.35});
export const CONDUCTION=Object.freeze({ESTABLISHED:1,PROVISIONAL:.5,TESTING:.24});
const DOMAINS=['NEXO','SCIENCE','ENGINEERING','OLYMPUS'];
export const CONNECTOME_DOMAINS=Object.freeze(DOMAINS);
export function connectomeDomain(node){
 const declared=String(node?.domain||'').toUpperCase();
 if(['SCIENCE','OLYMPUS','ENGINEERING'].includes(declared))return declared;
 const token=[node?.id,node?.sourceId,node?.name,node?.summary].filter(Boolean).join(' ').toUpperCase();
 return /ENGINEER|ENGENHARIA|INFRA|RUNTIME|HOSTING|SECURITY|DEPLOY|VERCEL|GITHUB/.test(token)?'ENGINEERING':'NEXO';
}
export function subtreeMass(rootId,childrenMap){const seen=new Set();const visit=id=>{if(seen.has(id))return 0;seen.add(id);return 1+(childrenMap.get(id)||[]).reduce((s,c)=>s+visit(c),0)};return visit(rootId)}
export const transportedMass=subtreeMass;
export function filamentConductance(status){return CONDUCTION[String(status||'PROVISIONAL').toUpperCase()]??CONDUCTION.PROVISIONAL}
export function aggregateDomainFilaments(filaments){
 const buckets=new Map();
 for(const f of filaments||[]){const a=String(f.fromDomain||f.from_domain||'').toUpperCase(),b=String(f.toDomain||f.to_domain||'').toUpperCase();if(!DOMAINS.includes(a)||!DOMAINS.includes(b)||a===b)continue;
  const key=[a,b].sort().join('::'),row=buckets.get(key)||{domains:key.split('::'),weights:[],conductance:[],count:0};row.weights.push(Number(f.weight)||0);row.conductance.push(filamentConductance(f.status));row.count++;buckets.set(key,row)}
 return [...buckets.values()].map(r=>{const mean=r.weights.reduce((a,b)=>a+b,0)/Math.max(1,r.weights.length),weight=Math.min(2,mean*Math.sqrt(r.count)),cadence=weight*(r.conductance.reduce((a,b)=>a+b,0)/Math.max(1,r.conductance.length));return{a:r.domains[0],b:r.domains[1],count:r.count,mean,weight,cadence}})
}
export function domainSpringLength(count,meanWeight=.72){if(!count)return 270;const w=Math.min(2,Math.max(0,meanWeight)*Math.sqrt(count));return 235/(1+.92*w)}
export function repulsion(mi,mj,distance,crossDomain=true){const d=Math.max(1,Number(distance)||1);return Math.sqrt(Math.max(1,mi)*Math.max(1,mj))/(d*d)*(crossDomain?3.4:1)}
function hashUnit(text,salt=0){let h=2166136261^salt;for(const ch of String(text))h=Math.imul(h^ch.charCodeAt(0),16777619);return((h>>>0)/0xffffffff)*2-1}
export function layoutDomainCenters({masses,filaments,iterations=480}){
 const links=aggregateDomainFilaments(filaments),linkMap=new Map(links.map(x=>[[x.a,x.b].sort().join('::'),x])),pos=new Map(),vel=new Map();
 DOMAINS.forEach((d,i)=>{const a=i/DOMAINS.length*Math.PI*2+.31;pos.set(d,{x:Math.cos(a)*125,y:Math.sin(a)*125,z:hashUnit(d,19)*35});vel.set(d,{x:0,y:0,z:0})});
 for(let step=0;step<iterations;step++){const force=new Map(DOMAINS.map(d=>[d,{x:0,y:0,z:0}]));
  for(let i=0;i<DOMAINS.length;i++)for(let j=i+1;j<DOMAINS.length;j++){const a=DOMAINS[i],b=DOMAINS[j],pa=pos.get(a),pb=pos.get(b);let dx=pb.x-pa.x,dy=pb.y-pa.y,dz=pb.z-pa.z,dist=Math.hypot(dx,dy,dz)||1;dx/=dist;dy/=dist;dz/=dist;
   const repel=repulsion(masses[a]||1,masses[b]||1,dist,true)*1750,key=[a,b].sort().join('::'),link=linkMap.get(key),target=domainSpringLength(link?.count||0,link?.mean||.72),spring=(dist-target)*(link?(.006+.012*link.weight):.0025),net=spring-repel;
   for(const [d,sign] of [[a,1],[b,-1]]){const f=force.get(d);f.x+=dx*net*sign;f.y+=dy*net*sign;f.z+=dz*net*sign}}
  for(const d of DOMAINS){const p=pos.get(d),v=vel.get(d),f=force.get(d);f.x+=-p.x*.0009;f.y+=-p.y*.0009;f.z+=-p.z*.0009;v.x=(v.x+f.x)*.86;v.y=(v.y+f.y)*.86;v.z=(v.z+f.z)*.86;p.x+=v.x;p.y+=v.y;p.z+=v.z}}
 return Object.fromEntries([...pos])
}
export function layoutNodes(model){
 const byDomain=new Map(DOMAINS.map(d=>[d,[]]));for(const node of model.nodes||[])byDomain.get(connectomeDomain(node))?.push(node);
 const masses=Object.fromEntries(DOMAINS.map(d=>[d,byDomain.get(d).length]));
 const filaments=(model.crossLinks||[]).filter(x=>x.isLearning).map(link=>({fromDomain:connectomeDomain(model.nodeMap.get(link.source)),toDomain:connectomeDomain(model.nodeMap.get(link.target)),weight:link.weight,status:/ESTABLISHED/i.test(link.label)?'ESTABLISHED':/TESTING/i.test(link.label)?'TESTING':'PROVISIONAL'}));
 const centers=layoutDomainCenters({masses,filaments}),positions=new Map();
 for(const domain of DOMAINS){const center=centers[domain],nodes=byDomain.get(domain)||[],roots=nodes.filter(n=>!n.parentId||connectomeDomain(model.nodeMap.get(n.parentId))!==domain),root=roots[0]||nodes[0];if(root)positions.set(root.id,center);
  const ordered=nodes.filter(n=>!positions.has(n.id)).sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
  ordered.forEach((node,i)=>{const parent=node.parentId?positions.get(node.parentId):center,depth=Math.max(1,node.depth||1),angle=(i*2.399963229728653+hashUnit(node.id,7))%(Math.PI*2),radius=11+depth*13+Math.sqrt(i+1)*2.2;positions.set(node.id,{x:(parent?.x??center.x)+Math.cos(angle)*radius,y:(parent?.y??center.y)+Math.sin(angle)*radius,z:(parent?.z??center.z)+hashUnit(node.id,31)*(9+depth*4)})})}
 return{positions,masses,centers,filaments,aggregates:aggregateDomainFilaments(filaments)}
}
export function readingDistance(cameraDistance){return cameraDistance>255?'panorama':cameraDistance>120?'estrutura':'detalhe'}
