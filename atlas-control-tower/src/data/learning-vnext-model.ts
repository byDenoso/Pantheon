type AnyRecord=Record<string,unknown>;
type LearningReport={source?:string;total?:number;crossDomain?:number;ladder?:unknown;emergent?:unknown}|null|undefined;

const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const strings=(value:unknown):string[]=>Array.isArray(value)?value.map(String).filter(Boolean):[];
const text=(value:unknown):string=>typeof value==='string'?value:'';
const finite=(value:unknown):number|null=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null};

function refsOf(item:AnyRecord){
 const raw=item.evidenceRefs;
 if(raw&&typeof raw==='object')return record(raw);
 if(typeof raw!=='string'||!raw.trim())return {};
 try{return record(JSON.parse(raw))}catch{return {}}
}

function contextId(value:unknown){
 const raw=text(value).trim().toUpperCase();
 if(!raw||raw==='CROSS_DOMAIN')return '';
 if(raw.includes('SCIENCE'))return 'science';
 if(raw.includes('ENGINEER'))return 'engineering';
 if(raw.includes('OLYMPUS'))return 'olympus';
 if(raw==='AI'||raw.includes('_AI')||raw.includes('AGENT'))return 'ai';
 if(raw.includes('NEXO')||raw.includes('CONTINUITY')||raw.includes('AUTOMATION')||raw.includes('OPS')||raw.includes('RUNTIME'))return 'operation';
 return raw.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
const CONTEXT_LABELS:Record<string,string>={science:'Ciência',engineering:'Engenharia',olympus:'Olympus',ai:'IA',operation:'Operação'};
const contextNode=(id:string)=>({id,anchorId:`context:${id}`,label:CONTEXT_LABELS[id]||id,type:'CONTEXT'});

function normalizeItem(item:AnyRecord,stage:string){
 const refs=refsOf(item);
 const explicitConfidence=finite(item.confidence);
 const refConfidence=finite(refs.confidence_raw??refs.confidence);
 return {
  id:text(item.id),stage:text(item.stage)||stage,
  label:text(item.relationType)||text(item.label)||text(item.id),
  status:text(item.status),domainA:text(item.domainA),domainB:text(item.domainB),contextId:contextId(item.domainA)||null,
  confidence:explicitConfidence??refConfidence,
  evidenceCount:finite(item.evidenceCount),contradictionCount:finite(item.contradictionCount),
  support:finite(refs.support_count??item.evidenceCount),failures:finite(refs.failed_uses),successes:finite(refs.successful_uses),
  notes:text(item.notes)||text(item.summary),derivedFrom:strings(item.derivedFrom),refs,
 };
}

function emergentCount(report:AnyRecord,id:string){
 const bucket=list(report.emergent).find(item=>text(item.id)===id);
 return bucket?finite(bucket.count):null;
}

export function buildLearningMeshModel(input:LearningReport){
 if(!input||!Array.isArray(record(input).ladder))return {available:false,contexts:[],nodes:[],items:[],filaments:[],metrics:{total:null,promoted:null,crossDomain:null}};
 const report=record(input);
 const items=list(report.ladder).flatMap(stage=>list(stage.items).map(item=>normalizeItem(item,text(stage.id)))).filter(item=>item.id);
 const itemIds=new Set(items.map(item=>item.id));
 const contextIds=new Set<string>();
 for(const item of items){
  const direct=contextId(item.domainA);if(direct)contextIds.add(direct);
  const secondary=contextId(item.domainB);if(secondary)contextIds.add(secondary);
  const a=contextId(item.refs.domain_a);if(a)contextIds.add(a);
  const b=contextId(item.refs.domain_b);if(b)contextIds.add(b);
 }
 const order=['science','engineering','olympus','ai','operation'];
 const contexts=[...contextIds].sort((a,b)=>{
  const ai=order.indexOf(a),bi=order.indexOf(b);
  return (ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b);
 }).map(contextNode);
 const filaments:Array<Record<string,unknown>>=[];

 for(const item of items){
  const context=contextId(item.domainA);
  if(context&&contextIds.has(context))filaments.push({
   id:`context:${context}:${item.id}`,source:`context:${context}`,target:item.id,type:'association',status:item.status
  });
  for(const parent of item.derivedFrom){
   if(itemIds.has(parent))filaments.push({id:`lineage:${parent}:${item.id}`,source:parent,target:item.id,type:'lineage'});
  }
  const scope=text(item.refs.relation_scope).toUpperCase();
  const a=contextId(item.refs.domain_a),b=contextId(item.refs.domain_b);
  if(scope==='CROSS_DOMAIN'&&a&&b&&a!==b)filaments.push({
   id:`transfer:${item.id}:${a}:${b}`,source:`context:${a}`,target:`context:${b}`,type:'transfer',
   relationType:text(item.refs.relation_type),confidence:finite(item.refs.confidence_raw??item.refs.confidence),
   support:finite(item.refs.support_count),status:item.status,sourceRecord:item.id
  });
 }
 const nodes=[...contexts.map(context=>({id:context.anchorId,type:'CONTEXT',contextId:context.id,label:context.label})),...items.map(item=>({
  id:item.id,type:'LEARNING_ITEM',stage:item.stage,label:item.label,status:item.status,
  contextId:contextId(item.domainA)||null,confidence:item.confidence
 }))];
 return {
  available:true,contexts,nodes,items,filaments,
  metrics:{
   total:finite(report.total),
   promoted:emergentCount(report,'promoted'),
   crossDomain:finite(report.crossDomain),
  }
 };
}
