export const ACTION_REGISTER_SPREADSHEET_ID='1twRpSoZCOXv77YyCh_5V9nAS2PM2nqzex2A37eI2Zas';
export const ACTION_REGISTER_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${ACTION_REGISTER_SPREADSHEET_ID}/edit`;
export const ASSOCIATIVE_TABS=['SEMANTIC_MEMORY','PROCEDURAL_MEMORY','LEARNING_FILAMENTS'];
export const ASSOCIATIVE_SNAPSHOT_URL=new URL('./associative-memory.snapshot.json',import.meta.url).href;

const AUTHORITY='DERIVED_NOT_TRUTH';
const text=value=>value==null?'':String(value);
const clean=value=>text(value).trim();
const upper=value=>clean(value).toUpperCase();
const asArray=value=>Array.isArray(value)?value:[];
const list=value=>clean(value).split(/[;|]/).map(clean).filter(Boolean);
const ids=value=>clean(value).split(/[|;]/).map(clean).filter(Boolean);
const number=value=>{const parsed=Number(clean(value).replace(',','.'));return Number.isFinite(parsed)?parsed:0};
const unique=value=>[...new Set(value.filter(Boolean))];
const tone=status=>{const state=upper(status);if(['ACTIVE','SUPPORTED','SUPPORTED_CANDIDATE'].includes(state))return'ok';if(['PROVISIONAL','CANDIDATE'].includes(state))return'warn';if(['SUPERSEDED','DORMANT'].includes(state))return'idle';return'idle'};
const cellValue=cell=>cell?.v==null?'':String(cell.v);

export function associativeGvizTableToRows(table){
 if(!table?.cols||!Array.isArray(table.rows))return[];
 const headers=table.cols.map((col,index)=>clean(col.label||col.id||`col_${index}`));
 return table.rows.map(row=>{const out={};headers.forEach((key,index)=>{if(key)out[key]=cellValue(row.c?.[index])});return out})
  .filter(row=>Object.values(row).some(value=>clean(value)));
}

function queryUrl(tab,handler){const params=new URLSearchParams({sheet:tab,tqx:`responseHandler:${handler}`});return `https://docs.google.com/spreadsheets/d/${ACTION_REGISTER_SPREADSHEET_ID}/gviz/tq?${params}`}

export function loadAssociativeTab(tab,{timeoutMs=9000,documentRef=globalThis.document,windowRef=globalThis}={}){
 if(!ASSOCIATIVE_TABS.includes(tab))return Promise.reject(new Error(`Unknown associative tab: ${tab}`));
 if(!documentRef?.createElement)return Promise.reject(new Error('Browser document is required to read associative memory.'));
 return new Promise((resolve,reject)=>{
  const safe=tab.replace(/[^A-Za-z0-9_]/g,'_');
  const handler=`__nexoAssoc_${safe}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const script=documentRef.createElement('script');let settled=false;
  const cleanup=()=>{try{delete windowRef[handler]}catch{};script.remove?.();clearTimeout(timer)};
  const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
  windowRef[handler]=response=>{if(response?.status==='error')return finish(reject,new Error(response.errors?.[0]?.detailed_message||`Action Register query failed for ${tab}`));finish(resolve,associativeGvizTableToRows(response?.table))};
  script.async=true;script.referrerPolicy='no-referrer-when-downgrade';script.onerror=()=>finish(reject,new Error(`Action Register could not be loaded for ${tab}.`));script.src=queryUrl(tab,handler);
  const timer=setTimeout(()=>finish(reject,new Error(`Action Register timed out for ${tab}.`)),timeoutMs);
  (documentRef.head||documentRef.documentElement).appendChild(script);
 });
}

function semanticOps(row){
 const evidence=list(row.support_refs).map(ref=>({title:ref,detail:'Referência declarada pela memória semântica.',status:'DECLARED',tone:'idle'}));
 return{
  level:'memory',status:clean(row.status)||'UNKNOWN',tone:tone(row.status),summary:clean(row.meaning),rollup:{},
  sections:[
   {id:'next',title:'Ativação',empty:'Sem fluxo declarado.',items:[
    clean(row.activated_flow)&&{title:'Fluxo ativado',detail:clean(row.activated_flow),tone:'ok'},
    clean(row.expected_output)&&{title:'Saída esperada',detail:clean(row.expected_output),tone:'warn'}
   ].filter(Boolean)},
   {id:'tests',title:'Semântica operacional',empty:'Sem termos declarados.',items:[clean(row.term_or_phrase)&&{title:'Termos',detail:clean(row.term_or_phrase),tone:'idle'}].filter(Boolean)},
   {id:'relations',title:'Escopo',empty:'Sem escopo declarado.',items:[clean(row.cross_domain_mapping)&&{title:clean(row.domain_scope)||'Escopo',detail:clean(row.cross_domain_mapping),tone:'idle'}].filter(Boolean)},
   {id:'evidence',title:'Suporte declarado',empty:'Sem referências declaradas.',items:evidence},
   {id:'integrity',title:'Limites',empty:'Sem limites publicados.',items:[
    clean(row.negative_examples)&&{title:'Não significa',detail:clean(row.negative_examples),tone:'warn'},
    clean(row.rollback_ref)&&{title:'Rollback / supersede',detail:clean(row.rollback_ref),tone:'idle'},
    clean(row.confidence)&&{title:'Confiança publicada',detail:clean(row.confidence),tone:'idle'}
   ].filter(Boolean)},
   {id:'blockers',title:'Contradições',empty:'Nenhuma contradição publicada.',items:list(row.contradiction_refs).map(ref=>({title:ref,status:'CONTRADICTION',tone:'blocked'}))},
   {id:'changes',title:'Atualização',empty:'Sem timestamp publicado.',items:[clean(row.last_seen)&&{title:'Última observação',detail:clean(row.last_seen),tone:'idle'}].filter(Boolean)}
  ]
 };
}

function proceduralOps(row){
 return{
  level:'memory',status:clean(row.status)||'UNKNOWN',tone:tone(row.status),summary:clean(row.observation||row.context),rollup:{},
  sections:[
   {id:'next',title:'Regra reutilizável',empty:'Sem regra publicada.',items:[clean(row.proposed_rule)&&{title:'Aplicar',detail:clean(row.proposed_rule),tone:'ok'}].filter(Boolean)},
   {id:'tests',title:'Contexto',empty:'Sem contexto publicado.',items:[clean(row.context)&&{title:'Quando usar',detail:clean(row.context),tone:'idle'}].filter(Boolean)},
   {id:'relations',title:'Boundary',empty:'Sem limite declarado.',items:[clean(row.forbidden_generalization)&&{title:'Generalização proibida',detail:clean(row.forbidden_generalization),tone:'warn'}].filter(Boolean)},
   {id:'evidence',title:'Suporte',empty:'Sem suporte publicado.',items:[clean(row.source_refs)&&{title:'Referências',detail:clean(row.source_refs),tone:'idle'}].filter(Boolean)},
   {id:'integrity',title:'Validação',empty:'Sem contadores publicados.',items:[
    {title:'Suporte',detail:String(number(row.support_count)),tone:'ok'},
    {title:'Contradições',detail:String(number(row.contradiction_count)),tone:number(row.contradiction_count)?'blocked':'idle'},
    clean(row.measured_benefit)&&{title:'Benefício esperado/medido',detail:clean(row.measured_benefit),tone:'idle'},
    clean(row.rollback_ref)&&{title:'Rollback',detail:clean(row.rollback_ref),tone:'idle'}
   ].filter(Boolean)},
   {id:'blockers',title:'Contradições',empty:'Nenhuma contradição publicada.',items:number(row.contradiction_count)?[{title:'Contradições registradas',detail:String(number(row.contradiction_count)),tone:'blocked'}]:[]},
   {id:'changes',title:'Atualização',empty:'Sem timestamp publicado.',items:[clean(row.last_seen)&&{title:'Última observação',detail:clean(row.last_seen),tone:'idle'}].filter(Boolean)}
  ]
 };
}

function semanticNode(row){const id=clean(row.semantic_id);if(!id)return null;return{
 id,recordId:id,label:clean(row.term_or_phrase).split(/[;|]/)[0]||id,type:'CLAIM',kind:'SEMANTIC_MEMORY',hierarchyLevel:'memory',system:'LEARNING',domain:'LEARNING',status:clean(row.status)||'UNKNOWN',authority:AUTHORITY,overlayOnly:true,associative:true,source:ACTION_REGISTER_SPREADSHEET_URL,ssotUrl:ACTION_REGISTER_SPREADSHEET_URL,summary:clean(row.meaning),detail:clean(row.expected_output),confidence:number(row.confidence),metadata:{memoryLayer:'SEMANTIC_MEMORY',domainScope:clean(row.domain_scope),activatedFlow:clean(row.activated_flow),associativeAnchors:[]},ops:semanticOps(row)
}}
function proceduralNode(row){const id=clean(row.lesson_id);if(!id)return null;return{
 id,recordId:id,label:clean(row.context)||id,type:'RESULT',kind:'PROCEDURAL_MEMORY',hierarchyLevel:'memory',system:'LEARNING',domain:'LEARNING',status:clean(row.status)||'UNKNOWN',authority:AUTHORITY,overlayOnly:true,associative:true,source:ACTION_REGISTER_SPREADSHEET_URL,ssotUrl:ACTION_REGISTER_SPREADSHEET_URL,summary:clean(row.proposed_rule),detail:clean(row.forbidden_generalization),metadata:{memoryLayer:'PROCEDURAL_MEMORY',associativeAnchors:[]},ops:proceduralOps(row)
}}

function kindFor(type){switch(upper(type)){case'TRANSFERABLE_METHOD':return'alternative-transfer';case'ROBUSTNESS_GATE_BRIDGE':return'alternative-validation';case'SHARED_FAILURE_MODE':return'alternative-risk';case'ENABLING_PATTERN':return'alternative-transfer';case'INTRA_DOMAIN_CASE_GENERALIZATION':return'alternative-learning';default:return'alternative-learning'}}

function makeReferenceNode(id){return{
 id:`ref:${id}`,recordId:id,label:id,type:'RESULT',kind:'ASSOCIATIVE_REFERENCE',hierarchyLevel:'memory',system:'LEARNING',domain:'LEARNING',status:'REFERENCE',authority:AUTHORITY,overlayOnly:true,associative:true,source:ACTION_REGISTER_SPREADSHEET_URL,summary:'Referência declarada por Learning Filaments; o endpoint canônico não está materializado nesta projeção do Atlas.',metadata:{memoryLayer:'REFERENCE',associativeAnchors:[]},ops:{level:'memory',status:'REFERENCE',tone:'idle',summary:'Endpoint declarado pela rede associativa, sem promoção a verdade canônica.',rollup:{},sections:[{id:'relations',title:'Referência',empty:'',items:[{title:id,detail:'Ghost anchor derivado de um ID explicitamente declarado no ACTION_REGISTER.',tone:'idle'}]},{id:'integrity',title:'Autoridade',empty:'',items:[{title:'DERIVED_NOT_TRUTH',detail:'Serve apenas para roteamento visual.',tone:'warn'}]}]}
}}

function baseIndex(baseGraph){const out=new Map();for(const node of baseGraph?.nodes||[]){out.set(node.id,node.id);if(node.recordId)out.set(node.recordId,node.id)}return out}
function domainAnchor(baseGraph,domain){const key=upper(domain);if(!key||key==='CROSS'||key==='CROSS_DOMAIN')return null;const lane=`lane:${key}`;if((baseGraph?.nodes||[]).some(node=>node.id===lane))return lane;const node=(baseGraph?.nodes||[]).find(node=>upper(node.recordId)===key||upper(node.domain)===key||upper(node.label)===key);return node?.id||null}

export function buildAssociativeOverlay(rowsByTab={},baseGraph={nodes:[],edges:[]}){
 const nodes=[...asArray(rowsByTab.SEMANTIC_MEMORY).map(semanticNode),...asArray(rowsByTab.PROCEDURAL_MEMORY).map(proceduralNode)].filter(Boolean);
 const nodeMap=new Map(nodes.map(node=>[node.id,node]));const base=baseIndex(baseGraph);const refs=new Map();const edges=[];
 const endpoint=raw=>{if(nodeMap.has(raw))return raw;if(base.has(raw))return base.get(raw);if(!refs.has(raw)){const node=makeReferenceNode(raw);refs.set(raw,node);nodeMap.set(node.id,node)}return refs.get(raw).id};
 const addAnchor=(id,anchor)=>{const node=nodeMap.get(id);if(!node?.overlayOnly||!anchor)return;node.metadata.associativeAnchors=unique([...(node.metadata.associativeAnchors||[]),anchor])};
 for(const row of asArray(rowsByTab.LEARNING_FILAMENTS)){
  const filamentId=clean(row.filament_id);if(!filamentId)continue;
  const sources=ids(row.source_id),targets=ids(row.target_id);if(!sources.length||!targets.length)continue;
  const sourceAnchor=domainAnchor(baseGraph,row.source_domain),targetAnchor=domainAnchor(baseGraph,row.target_domain);
  const weight=Math.max(0,Math.min(1,number(row.weight)||.5));const status=clean(row.status)||'UNKNOWN';const kind=kindFor(row.filament_type);
  let index=0;
  for(const sourceRaw of sources)for(const targetRaw of targets){
   const source=endpoint(sourceRaw),target=endpoint(targetRaw);if(!source||!target||source===target)continue;
   addAnchor(source,sourceAnchor);addAnchor(source,targetAnchor);addAnchor(target,sourceAnchor);addAnchor(target,targetAnchor);
   edges.push({id:index?`${filamentId}:${index}`:filamentId,source,target,type:'ALTERNATIVE_FILAMENT',kind,alternative:true,associative:true,authority:AUTHORITY,status,weight,filamentType:clean(row.filament_type),activationRule:clean(row.activation_rule),supportCount:number(row.support_count),contradictionCount:number(row.contradiction_count),evidenceRefs:list(row.evidence_refs),nextDiscriminant:clean(row.next_discriminant),sourceDomain:clean(row.source_domain),targetDomain:clean(row.target_domain),title:filamentId,summary:clean(row.notes)});index++;
   if(sourceAnchor&&nodeMap.get(source)?.overlayOnly)edges.push({id:`${filamentId}:context:source:${index}`,source:sourceAnchor,target:source,type:'ALTERNATIVE_FILAMENT',kind:'alternative-learning',alternative:true,associative:true,contextEdge:true,authority:AUTHORITY,status,weight:weight*.55,title:`${row.source_domain} → memória`});
   if(targetAnchor&&nodeMap.get(target)?.overlayOnly)edges.push({id:`${filamentId}:context:target:${index}`,source:target,target:targetAnchor,type:'ALTERNATIVE_FILAMENT',kind:'alternative-learning',alternative:true,associative:true,contextEdge:true,authority:AUTHORITY,status,weight:weight*.55,title:`memória → ${row.target_domain}`});
  }
 }
 nodes.push(...refs.values());
 const incident=new Map();for(const edge of edges.filter(edge=>!edge.contextEdge)){for(const id of [edge.source,edge.target]){const list=incident.get(id)||[];list.push(edge);incident.set(id,list)}}
 for(const node of nodes){const links=incident.get(node.id)||[];const section=node.ops?.sections?.find(entry=>entry.id==='relations');if(section&&links.length)section.items.push(...links.slice(0,8).map(edge=>({title:edge.title,detail:`${edge.filamentType||edge.kind} · peso ${edge.weight.toFixed(2)} · ${edge.status}`,status:edge.status,tone:tone(edge.status)})))}
 return{nodes,edges,authority:AUTHORITY,source:{kind:'action-register-associative-memory',spreadsheetId:ACTION_REGISTER_SPREADSHEET_ID,url:ACTION_REGISTER_SPREADSHEET_URL,tabs:[...ASSOCIATIVE_TABS]},stats:{semantic:asArray(rowsByTab.SEMANTIC_MEMORY).length,procedural:asArray(rowsByTab.PROCEDURAL_MEMORY).length,filaments:asArray(rowsByTab.LEARNING_FILAMENTS).length,references:refs.size}};
}

export function mergeAssociativeOverlay(baseGraph,overlay){
 if(!overlay)return baseGraph;
 const baseNodes=(baseGraph?.nodes||[]).filter(node=>!node.associative);
 const baseEdges=(baseGraph?.edges||[]).filter(edge=>!edge.associative&&!edge.seedAlternative);
 const known=new Set(baseNodes.map(node=>node.id));const nodes=[...baseNodes];for(const node of overlay.nodes||[])if(!known.has(node.id)){known.add(node.id);nodes.push(node)}
 const edges=[...baseEdges,...(overlay.edges||[]).filter(edge=>known.has(edge.source)&&known.has(edge.target))];
 return{...baseGraph,nodes,edges,associative:{authority:overlay.authority,source:overlay.source,stats:overlay.stats},alternativeFilamentsDefault:baseGraph?.alternativeFilamentsDefault===true};
}

export async function loadAssociativeMemory({baseGraph,...options}={}){
 const pairs=await Promise.all(ASSOCIATIVE_TABS.map(async tab=>[tab,await loadAssociativeTab(tab,options)]));
 return buildAssociativeOverlay(Object.fromEntries(pairs),baseGraph);
}

export async function loadAssociativeSnapshot({baseGraph,fetchRef=globalThis.fetch,url=ASSOCIATIVE_SNAPSHOT_URL}={}){
 if(typeof fetchRef!=='function')throw new Error('Fetch is required to load associative snapshot.');
 const response=await fetchRef(url,{cache:'no-store'});if(!response?.ok)throw new Error(`Associative snapshot HTTP ${response?.status||'ERR'}`);
 const snapshot=await response.json();if(snapshot?.authority!=='action-register-projection'||snapshot?.spreadsheet_id!==ACTION_REGISTER_SPREADSHEET_ID)throw new Error('Invalid associative snapshot authority or spreadsheet id.');
 return buildAssociativeOverlay(snapshot.tabs||{},baseGraph);
}
