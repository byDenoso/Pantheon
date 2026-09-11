type AnyRecord=Record<string,unknown>;
type Sources={query:string;science?:unknown;olympus?:unknown;learning?:unknown;ops?:unknown;runs?:unknown;audit?:unknown};

const record=(value:unknown):AnyRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as AnyRecord:{};
const list=(value:unknown):AnyRecord[]=>Array.isArray(value)?value.map(record):[];
const text=(value:unknown)=>typeof value==='string'?value:'';
const clean=(value:unknown)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const enc=(value:unknown)=>encodeURIComponent(text(value));
const matches=(query:string,...values:unknown[])=>{const terms=clean(query).split(/\s+/).filter(Boolean);const hay=clean(values.map(v=>text(v)).join(' '));return terms.length>0&&terms.every(term=>hay.includes(term))};

export type GlobalSearchResult={id:string;group:string;kind:string;title:string;description:string;status:string;path:string};
const push=(out:GlobalSearchResult[],item:GlobalSearchResult)=>{if(!out.some(x=>x.group===item.group&&x.id===item.id))out.push(item)};

function scienceResults(query:string,payload:unknown){
 const out:GlobalSearchResult[]=[];
 for(const node of list(record(payload).nodes)){
  if(!matches(query,node.id,node.label,node.summary,node.domain,node.status,node.type))continue;
  const id=text(node.id),domain=text(node.domain),path=domain?`/graphs/science/${enc(domain)}?entity=${enc(id)}`:`/provenance?id=${enc(id)}`;
  push(out,{id,group:'Ciência',kind:text(node.type)||'ENTIDADE',title:text(node.label)||id,description:text(node.summary),status:text(node.status),path});
 }
 return out.slice(0,8);
}
function olympusResults(query:string,payload:unknown){
 const out:GlobalSearchResult[]=[];
 for(const node of list(record(payload).nodes)){
  if(!matches(query,node.id,node.label,node.summary,node.status,node.type))continue;
  const id=text(node.id);push(out,{id,group:'Olympus',kind:text(node.type)||'ENTIDADE',title:text(node.label)||id,description:text(node.summary),status:text(node.status),path:`/graphs/olympus?entity=${enc(id)}`});
 }
 return out.slice(0,8);
}
function learningResults(query:string,payload:unknown){
 const out:GlobalSearchResult[]=[];
 for(const stage of list(record(payload).ladder))for(const item of list(stage.items)){
  if(!matches(query,item.id,item.relationType,item.notes,item.status,stage.id))continue;
  const id=text(item.id);push(out,{id,group:'Learning',kind:text(stage.id)||'APRENDIZADO',title:text(item.relationType)||id,description:text(item.notes),status:text(item.status),path:`/graphs?learning=1&entity=${enc(id)}`});
 }
 return out.slice(0,8);
}
function operationResults(query:string,ops:unknown,runs:unknown){
 const out:GlobalSearchResult[]=[];const o=record(ops);
 for(const action of list(o.actions))if(matches(query,action.id,action.label,action.summary,action.status,action.domain)){const id=text(action.id);push(out,{id,group:'Operação',kind:'AÇÃO',title:text(action.label)||id,description:text(action.summary),status:text(action.status),path:`/operations?action=${enc(id)}`})}
 for(const event of list(o.events))if(matches(query,event.id,event.label,event.summary,event.status,event.domain)){const id=text(event.id);push(out,{id,group:'Operação',kind:'EVENTO',title:text(event.label)||id,description:text(event.summary),status:text(event.status),path:`/operations?event=${enc(id)}`})}
 for(const run of list(runs))if(matches(query,run.id,run.label,run.summary,run.status,run.domain)){const id=text(run.id);push(out,{id,group:'Operação',kind:'RUN',title:text(run.label)||id,description:text(run.summary),status:text(run.status),path:`/operations?run=${enc(id)}`})}
 return out.slice(0,10);
}
function provenanceResults(query:string,payload:unknown){
 const out:GlobalSearchResult[]=[];
 for(const category of list(record(payload).categories)){
  if(!matches(query,category.id,category.label,category.severity))continue;
  const id=text(category.id);push(out,{id,group:'Proveniência',kind:'AUDITORIA',title:text(category.label)||id,description:`${category.count??'—'} itens · ${category.openCount??'—'} abertos`,status:text(category.severity),path:`/provenance?audit=${enc(id)}`});
 }
 return out.slice(0,6);
}
export function buildGlobalSearchModel(input:Sources){
 const query=text(input.query).trim();
 const availableSources=[input.science,input.olympus,input.learning,input.ops,input.runs,input.audit].filter(value=>value!==null&&value!==undefined).length;
 if(!query)return {query:'',availableSources,results:[] as GlobalSearchResult[]};
 const results=[...scienceResults(query,input.science),...olympusResults(query,input.olympus),...learningResults(query,input.learning),...operationResults(query,input.ops,input.runs),...provenanceResults(query,input.audit)];
 return {query,availableSources,results};
}
