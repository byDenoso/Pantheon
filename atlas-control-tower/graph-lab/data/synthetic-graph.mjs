const STATUS=['active','supported','partial','active','active','blocked'];

const templates=[
 ['system:NEXO','NEXO','SYSTEM',null,'NEXO'],
 ['system:SCIENCE','Science','SYSTEM','system:NEXO','SCIENCE'],
 ['system:LEARNING','Learning','SYSTEM','system:NEXO','LEARNING'],
 ['system:ENGINEERING','Engineering','SYSTEM','system:NEXO','ENGINEERING'],
 ['system:OLYMPUS','Olympus','SYSTEM','system:NEXO','OLYMPUS'],
 ['system:BLACK_BOX','Black Box','SYSTEM','system:NEXO','BLACK_BOX'],
 ['domain:COSMOLOGY','Cosmology','DOMAIN','system:SCIENCE','SCIENCE'],
 ['domain:DARK_ENERGY','Dark Energy','DOMAIN','system:SCIENCE','SCIENCE'],
 ['domain:DARK_MATTER','Dark Matter','DOMAIN','system:SCIENCE','SCIENCE'],
 ['domain:EARLY_UNIVERSE','Early Universe','DOMAIN','system:SCIENCE','SCIENCE'],
 ['campaign:H0','Campaign H0','CAMPAIGN','domain:COSMOLOGY','SCIENCE'],
 ['campaign:LSS','Large Scale Structure','CAMPAIGN','domain:COSMOLOGY','SCIENCE'],
 ['campaign:DE','Dark Energy Tests','CAMPAIGN','domain:DARK_ENERGY','SCIENCE'],
 ['campaign:DM','Dark Matter Tests','CAMPAIGN','domain:DARK_MATTER','SCIENCE'],
 ['campaign:PRIMORDIAL','Primordial Tests','CAMPAIGN','domain:EARLY_UNIVERSE','SCIENCE'],
 ['domain:STRATEGY','Strategy','DOMAIN','system:LEARNING','LEARNING'],
 ['domain:POLICY','Policy','DOMAIN','system:LEARNING','LEARNING'],
 ['domain:LESSONS','Lessons','DOMAIN','system:LEARNING','LEARNING'],
 ['domain:GITHUB','GitHub','DOMAIN','system:ENGINEERING','ENGINEERING'],
 ['domain:VERCEL','Vercel','DOMAIN','system:ENGINEERING','ENGINEERING'],
 ['domain:RUNTIME','Runtime','DOMAIN','system:ENGINEERING','ENGINEERING'],
 ['domain:PEOPLE','People','DOMAIN','system:OLYMPUS','OLYMPUS'],
 ['domain:TRAINING','Training','DOMAIN','system:OLYMPUS','OLYMPUS'],
 ['domain:EVIDENCE','Evidence','DOMAIN','system:OLYMPUS','OLYMPUS'],
 ['domain:CONTINUITY','Continuity','DOMAIN','system:BLACK_BOX','BLACK_BOX'],
 ['domain:SCIENTIFIC_CORE','Scientific Core','DOMAIN','system:BLACK_BOX','BLACK_BOX'],
 ['domain:EXECUTOR','Executor','DOMAIN','system:BLACK_BOX','BLACK_BOX']
];

function nodeFromTemplate(t,i){
 return {id:t[0],label:t[1],type:t[2],parentId:t[3],system:t[4],status:STATUS[i%STATUS.length],hiddenChildren:0};
}

export function createSyntheticGraph(targetCount=50){
 const target=Math.max(6,Math.floor(Number(targetCount)||50));
 const nodes=[];
 for(let i=0;i<templates.length&&nodes.length<target;i++)nodes.push(nodeFromTemplate(templates[i],i));
 const parentPool=()=>nodes.filter(n=>['SYSTEM','DOMAIN','CAMPAIGN'].includes(n.type)&&n.id!=='system:NEXO');
 let i=0;
 while(nodes.length<target){
  const parents=parentPool();
  const parent=parents[i%parents.length];
  const type=i%5===4?'RESULT':i%5===3?'CLAIM':'TEST';
  const ordinal=String(i+1).padStart(3,'0');
  nodes.push({
   id:`${type.toLowerCase()}:${parent.id.replace(/[^a-z0-9]+/gi,'_')}:${ordinal}`,
   label:type==='RESULT'?`Result ${ordinal}`:type==='CLAIM'?`Claim ${ordinal}`:`Test ${ordinal}`,
   type,parentId:parent.id,system:parent.system,status:STATUS[(i+2)%STATUS.length],hiddenChildren:0
  });
  i++;
 }
 const byId=new Set(nodes.map(n=>n.id));
 const edges=[];
 for(const node of nodes){
  if(!node.parentId||!byId.has(node.parentId))continue;
  edges.push({id:`parent:${node.parentId}->${node.id}`,source:node.parentId,target:node.id,kind:'canonical',authority:'canonical'});
 }
 const candidates=nodes.filter(n=>n.type==='TEST'||n.type==='CLAIM');
 for(let j=0;j+7<candidates.length;j+=11){
  const a=candidates[j],b=candidates[j+7];
  if(a.system===b.system)continue;
  edges.push({id:`bridge:${a.id}->${b.id}`,source:a.id,target:b.id,kind:'cross-domain',authority:'derived'});
 }
 const childCounts=new Map();
 for(const e of edges)if(e.id.startsWith('parent:'))childCounts.set(e.source,(childCounts.get(e.source)||0)+1);
 for(const node of nodes)node.hiddenChildren=childCounts.get(node.id)||0;
 return {rootId:'system:NEXO',nodes,edges};
}
