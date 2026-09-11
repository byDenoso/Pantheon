const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const list=value=>Array.isArray(value)?value.map(record):[];
const text=value=>typeof value==='string'?value:'';
const finite=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const domainRank=id=>{const d=String(id).match(/^D(\d+)$/i);if(d)return Number(d[1]);const m=String(id).match(/^M(\d+)$/i);return m?1000+Number(m[1]):2000};
const universeLabel=id=>({science:'Ciência',engineering:'Engenharia',olympus:'Olympus',ai:'IA'}[String(id).toLowerCase()]||String(id));

function layoutDomains(domains){
  const total=Math.max(domains.length,1);
  return domains.map((domain,index)=>{
    const angle=-Math.PI/2+(Math.PI*2*index/total);const depth=Math.sin(angle*2)*1.35;const perspective=1+depth*.055;
    return {...domain,position:{x:Number((50+36*Math.cos(angle)*perspective).toFixed(3)),y:Number((51+31*Math.sin(angle)).toFixed(3)),z:Number(depth.toFixed(3))}};
  });
}

export function buildDomainNavigatorModel(universeId,graph){
  const g=record(graph);const nodes=list(g.nodes);
  const base=nodes.filter(node=>text(node.type).toUpperCase()==='DOMAIN').map(node=>{
    const meta=record(node.metadata);const id=text(node.domain)||text(node.id).replace(/^domain:/,'');
    return {id,label:text(meta.short_label_pt)||text(node.label)||id,summary:text(meta.what_pt)||text(node.summary),status:text(node.status),entityCount:null,activity:null,relationCount:0,relationStrength:null};
  }).filter(domain=>domain.id).sort((a,b)=>domainRank(a.id)-domainRank(b.id)||a.id.localeCompare(b.id));
  const known=new Set(base.map(domain=>domain.id));
  const relations=list(g.domainLinks).flatMap(link=>{const source=text(link.a),target=text(link.b);if(!known.has(source)||!known.has(target)||source===target)return [];return [{id:`${source}:${target}`,source,target,type:'CROSS_DOMAIN',strength:finite(link.tests),declared:true}]});
  const byId=new Map(base.map(domain=>[domain.id,{count:0,strength:0,knownStrength:0}]));
  for(const relation of relations)for(const id of [relation.source,relation.target]){const item=byId.get(id);if(item){item.count+=1;if(relation.strength!==null){item.strength+=relation.strength;item.knownStrength+=1}}}
  const enriched=base.map(domain=>{const stat=byId.get(domain.id);return {...domain,relationCount:stat?.count??0,relationStrength:stat&&stat.knownStrength>0?stat.strength:null}});
  return {available:Boolean(graph),universeId:String(universeId),universeLabel:universeLabel(universeId),domains:layoutDomains(enriched),relations};
}
