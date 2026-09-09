// Operational projection of NEXO · SSOT CANONICAL.
//
// The Atlas keeps exactly one hierarchy — NEXO -> Domain -> Program -> Campaign —
// and that hierarchy is built in ./ssot.mjs. This module never adds structure: it
// reads the remaining SSOT records and binds each one, read-only, to the node the
// SSOT itself names. Records the SSOT does not bind to a hierarchy node stay on the
// NEXO core as system-level context instead of being invented into the graph.

const text=v=>v==null?'':String(v);
const upper=v=>text(v).trim().toUpperCase();
const clean=v=>text(v).trim();

const BLOCKED_STATUS=/^(BLOCKED|BLOQUEAD|OPEN_GATE|FAILED|FAIL|REJECTED|INCOMPLETE|MISSING|NOT_IDENTIFIED)/;
const WARN_STATUS=/^(STALE|NEEDS_DATA|PENDING|PARTIAL|CANDIDATE|CHECKPOINTED|OPEN|IN_PROGRESS|REVIEW|WAITING)/;
const OK_STATUS=/^(ACTIVE|DONE|CLOSED|SUPPORTED|VALIDATED|PASS|SUPPORT_BOUNDED|ENGINEERING_CLOSED)/;

export const TEST_RECORD_TYPES=new Set(['current_test','running_test','blocked_test','open_test','open_gate','test']);
export const DOCTRINE_RECORD_TYPES=new Set(['objective','policy','rule','strategy','lesson','action','truth']);

export function isBlockedStatus(status){return BLOCKED_STATUS.test(upper(status))}
export function statusTone(status){
 const value=upper(status);
 if(!value)return'idle';
 if(BLOCKED_STATUS.test(value))return'blocked';
 if(WARN_STATUS.test(value))return'warn';
 if(OK_STATUS.test(value))return'ok';
 return'idle';
}

// Campaign summaries carry their own frozen test budget ("… 145 test_ids únicos.").
// That number is SSOT text, not a derived metric, so it is read and never recomputed.
export function parseTestIds(summary){const match=/(\d[\d.]*)\s*test_ids/i.exec(text(summary));return match?Number(match[1].replaceAll('.','')):null}

const asArray=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];
const parseJson=value=>{try{return value?JSON.parse(value):{}}catch{return{}}};
const parseRefs=value=>Array.isArray(value)?value.map(clean).filter(Boolean):clean(value)?clean(value).split(/[;,|]/).map(clean).filter(Boolean):[];

function contextItem(tab,row,kind){
 const payload=parseJson(row.payload_json);
 return{
  kind,tab,
  recordId:clean(row.record_id||row.effect||row.relation_id),
  title:clean(row.title||row.effect||row.record_id),
  status:clean(row.status),
  detail:clean(row.detail||row.summary||row.readback||payload.detail),
  scope:clean(row.scope||payload.scope),
  falsifier:clean(row.falsifier||payload.falsifier),
  boundary:clean(row.boundary||payload.boundary),
  authorityNote:clean(row.authority_note),
  evidenceRefs:parseRefs(row.evidence_refs??payload.evidence_refs),
  updatedAt:clean(row.updated_at||row.updatedAt),
  source:clean(row.source_ref||row.source),
  domain:clean(row.domain)
 };
}

// Every text an item carries in which the SSOT could have named a hierarchy record,
// reduced to identifier tokens.
const bindingTokens=item=>new Set([item.recordId,item.title,item.detail,item.scope,item.boundary,item.source,item.domain,...item.evidenceRefs].join(' ').split(/[^A-Za-z0-9_-]+/).filter(Boolean));

// Only structured SSOT identifiers (PROG-…, CAMP-…, ENG-DOM-…) are matchable: a derived
// domain code such as EXPANSION is an ordinary word and would bind records by accident.
export const isBindableRecordId=recordId=>/^[A-Za-z0-9]+[-_][A-Za-z0-9_-]+$/.test(text(recordId))&&text(recordId).length>=6;

function kindForRow(tab,row){
 const type=clean(row.record_type).toLowerCase();
 if(['domain','program','campaign'].includes(type))return null;
 if(TEST_RECORD_TYPES.has(type))return'test';
 if(type==='mini_claim')return'mini_claim';
 if(type==='engineering_effect')return'engineering_effect';
 if(type==='person')return'person';
 if(type==='state')return tab==='Olympus'?'person_state':'state';
 if(DOCTRINE_RECORD_TYPES.has(type))return type;
 return type||'record';
}

/** Reads the non-hierarchy SSOT tabs into flat, typed context items. */
export function collectContext(rowsByTab={}){
 const items=[];
 for(const tab of ['Science','Engineering','NEXO','Olympus'])
  for(const row of asArray(rowsByTab[tab])){const kind=kindForRow(tab,row);if(kind)items.push(contextItem(tab,row,kind))}
 for(const row of asArray(rowsByTab.NEXO_mini_claims))items.push(contextItem('NEXO_mini_claims',row,'mini_claim'));
 for(const row of asArray(rowsByTab.EngineeringEffects))items.push(contextItem('EngineeringEffects',row,'engineering_effect'));
 return items;
}

/**
 * The NEXO recursive loop, mini-claims and engineering effects, read from either
 * projection shape the SSOT emits: inline NEXO rows (live Drive read) or the
 * dedicated RecursiveState / NEXO_mini_claims / EngineeringEffects tabs (snapshot).
 */
export function extractLiveState(rowsByTab={}){
 const inlineLoop=asArray(rowsByTab.NEXO).find(row=>clean(row.record_type)==='state'&&clean(row.record_id)==='NEXO Recursive Loop');
 const loopRow=asArray(rowsByTab.RecursiveState)[0]||inlineLoop||{};
 const payload=parseJson(loopRow.payload_json);
 const context=collectContext(rowsByTab);
 const shape=item=>({recordId:item.recordId,status:item.status||'UNKNOWN',title:item.title||item.recordId,detail:item.detail,scope:item.scope,effect:item.title,falsifier:item.falsifier,evidenceRefs:item.evidenceRefs,source:item.source,updatedAt:item.updatedAt});
 return{
  loop:{
   currentState:clean(loopRow.CURRENT_STATE||payload.CURRENT_STATE),
   nextAction:clean(loopRow.NEXT_ACTION||payload.NEXT_ACTION),
   lastEffect:clean(loopRow.LAST_EFFECT||payload.LAST_EFFECT),
   status:clean(loopRow.status),
   detail:clean(loopRow.detail)
  },
  miniClaims:context.filter(i=>i.kind==='mini_claim').map(shape),
  engineeringEffects:context.filter(i=>i.kind==='engineering_effect').map(shape)
 };
}

const ITEM_LABEL={mini_claim:'MINI-CLAIM',engineering_effect:'EFEITO',test:'TESTE',person:'PESSOA',person_state:'ESTADO',state:'ESTADO',objective:'OBJETIVO',policy:'POLÍTICA',rule:'REGRA',strategy:'ESTRATÉGIA',lesson:'LIÇÃO',action:'AÇÃO',truth:'VERDADE',record:'REGISTRO'};

const toItem=(item,extra={})=>({
 title:item.title||item.recordId,
 detail:item.detail||item.scope||'',
 status:item.status,
 tone:statusTone(item.status),
 meta:[ITEM_LABEL[item.kind]||upper(item.kind),item.tab,item.recordId].filter(Boolean).join(' · '),
 ...extra
});

const byRecency=(a,b)=>text(b.updatedAt).localeCompare(text(a.updatedAt));
const section=(id,title,items,empty)=>({id,title,items,empty});
const dedupe=items=>items.filter((item,index,all)=>all.findIndex(other=>other.title===item.title&&other.meta===item.meta)===index);

/**
 * Attaches the read-only cockpit projection to every hierarchy node and to the graph.
 * Called by rowsToGraph; the graph shape itself is untouched.
 */
export function attachOperations(graph,rowsByTab={},meta={}){
 const nodes=graph.nodes||[];
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const byRecordId=new Map(nodes.filter(n=>n.recordId).map(n=>[n.recordId,n]));
 const children=new Map();
 for(const node of nodes)if(node.parentId){const list=children.get(node.parentId)||[];list.push(node);children.set(node.parentId,list)}

 const context=collectContext(rowsByTab);
 const relations=asArray(rowsByTab.Relations).map(row=>({
  id:clean(row.relation_id),type:clean(row.relation_type),status:clean(row.status),
  source:clean(row.source_entity),target:clean(row.target_entity),
  sourceDomain:clean(row.source_domain),targetDomain:clean(row.target_domain)
 })).filter(r=>r.source||r.target);

 // Bind context strictly by a record id the SSOT text itself names.
 const bound=new Map();
 const unbound=[];
 for(const item of context){
  const tokens=bindingTokens(item);
  const targets=[...byRecordId.keys()].filter(recordId=>isBindableRecordId(recordId)&&tokens.has(recordId));
  if(!targets.length){unbound.push(item);continue}
  for(const recordId of targets){const node=byRecordId.get(recordId);const list=bound.get(node.id)||[];list.push(item);bound.set(node.id,list)}
 }

 const live=extractLiveState(rowsByTab);
 const descendants=id=>{const out=[];const walk=parent=>{for(const child of children.get(parent)||[]){out.push(child);walk(child.id)}};walk(id);return out};
 const scopeItems=node=>{
  const ids=[node.id,...descendants(node.id).map(n=>n.id)];
  const seen=new Set();const out=[];
  for(const id of ids)for(const item of bound.get(id)||[]){const key=`${item.tab}:${item.kind}:${item.recordId}`;if(seen.has(key))continue;seen.add(key);out.push(item)}
  return out;
 };

 const generatedAt=clean(meta.generatedAt);
 const ageHours=generatedAt&&Number.isFinite(Date.parse(generatedAt))?Math.max(0,(Date.now()-Date.parse(generatedAt))/36e5):null;
 const orphans=nodes.filter(n=>n.hierarchyOrphan);
 const blockedNodes=nodes.filter(n=>isBlockedStatus(n.status));
 const loopBlocked=isBlockedStatus(live.loop.currentState);

 for(const node of nodes){
  const kids=children.get(node.id)||[];
  const subtree=descendants(node.id);
  const items=scopeItems(node);
  const isRoot=node.id===graph.rootId;
  const nodeRelations=node.recordId?relations.filter(r=>r.source===node.recordId||r.target===node.recordId):[];
  const testBudget=parseTestIds(node.summary);

  const byStatus=new Map();
  for(const child of subtree){const key=upper(child.status)||'UNKNOWN';byStatus.set(key,(byStatus.get(key)||0)+1)}

  const blockers=dedupe([
   ...(isRoot&&loopBlocked?[{title:live.loop.currentState.split(':')[0],detail:live.loop.currentState,status:'BLOCKED',tone:'blocked',meta:'LOOP NEXO · RecursiveState'}]:[]),
   ...subtree.filter(n=>isBlockedStatus(n.status)).map(n=>({title:n.label,detail:n.summary||'',status:n.status,tone:'blocked',meta:`${upper(n.hierarchyLevel)} · ${n.recordId}`,nodeId:n.id})),
   ...items.filter(i=>isBlockedStatus(i.status)).map(i=>toItem(i)),
   ...(isRoot?unbound.filter(i=>isBlockedStatus(i.status)).map(i=>toItem(i)):[])
  ]);

  const nextActions=dedupe([
   ...(isRoot&&live.loop.nextAction?[{title:'NEXT_ACTION',detail:live.loop.nextAction,tone:loopBlocked?'blocked':'warn',meta:'LOOP NEXO · RecursiveState'}]:[]),
   ...items.filter(i=>i.kind==='action'||WARN_STATUS.test(upper(i.status))).map(i=>toItem(i)),
   ...(isRoot?unbound.filter(i=>i.kind==='action').map(i=>toItem(i)):[])
  ]);

  const tests=items.filter(i=>i.kind==='test').sort(byRecency).map(i=>toItem(i));

  const evidence=dedupe([
   ...items.filter(i=>i.kind==='mini_claim').map(i=>toItem(i,{detail:[i.scope&&`Escopo: ${i.scope}`,i.evidenceRefs.length&&`Refs: ${i.evidenceRefs.join(' · ')}`,i.falsifier&&`Falsificador: ${i.falsifier}`].filter(Boolean).join('\n')})),
   ...(isRoot?unbound.filter(i=>i.kind==='mini_claim').map(i=>toItem(i,{detail:[i.scope&&`Escopo: ${i.scope}`,i.evidenceRefs.length&&`Refs: ${i.evidenceRefs.join(' · ')}`].filter(Boolean).join('\n')})):[]),
   ...(node.source?[{title:'Fonte SSOT',detail:node.source,tone:'idle',meta:[node.sheetTab||'SSOT',node.recordId].filter(Boolean).join(' · '),href:node.source}]:[])
  ]);

  const relationItems=dedupe([
   ...(node.parentId&&byId.has(node.parentId)?[{title:byId.get(node.parentId).label,detail:'Ancestral direto',tone:'idle',meta:`${upper(byId.get(node.parentId).hierarchyLevel||'root')} · pai`,nodeId:node.parentId}]:[]),
   ...kids.map(child=>({title:child.label,detail:child.summary||'',status:child.status,tone:statusTone(child.status),meta:`${upper(child.hierarchyLevel)} · ${child.recordId||child.id}`,nodeId:child.id})),
   ...nodeRelations.map(r=>{const other=r.source===node.recordId?r.target:r.source;return{title:`${r.type} · ${other}`,detail:`${r.sourceDomain||'—'} → ${r.targetDomain||'—'}`,status:r.status,tone:statusTone(r.status),meta:`RELAÇÃO · ${r.id}`,nodeId:byRecordId.get(other)?.id}})
  ]);

  const effectDetail=i=>[i.detail,i.authorityNote&&`Autoridade: ${i.authorityNote}`,i.source&&`Fonte: ${i.source}`].filter(Boolean).join('\n');
  const changes=dedupe([
   ...(isRoot&&live.loop.lastEffect?[{title:'LAST_EFFECT',detail:live.loop.lastEffect,tone:'ok',meta:'LOOP NEXO · RecursiveState'}]:[]),
   ...items.filter(i=>i.kind==='engineering_effect').sort(byRecency).map(i=>toItem(i,{detail:effectDetail(i)})),
   ...(isRoot?unbound.filter(i=>i.kind==='engineering_effect').sort(byRecency).map(i=>toItem(i,{detail:effectDetail(i)})):[]),
   ...items.filter(i=>i.updatedAt&&i.kind!=='engineering_effect').sort(byRecency).slice(0,4).map(i=>toItem(i))
  ]);

  const integrity=[
   {title:'Autoridade da leitura',detail:meta.authority||node.authority||'canonical',tone:meta.authority==='drive-ssot'?'ok':'warn',meta:meta.projection||'SSOT'},
   ...(generatedAt?[{title:'Projeção gerada em',detail:generatedAt,tone:ageHours!=null&&ageHours>24?'warn':'ok',meta:ageHours!=null?`${ageHours.toFixed(1)} h atrás`:''}]:[]),
   ...(isRoot?[
    {title:'Cobertura da hierarquia',detail:`${nodes.filter(n=>n.hierarchyLevel==='domain').length} domínios · ${nodes.filter(n=>n.hierarchyLevel==='program').length} programs · ${nodes.filter(n=>n.hierarchyLevel==='campaign').length} campaigns`,tone:'ok',meta:'SSOT'},
    {title:'Campaigns sem Program primário',detail:orphans.length?orphans.map(n=>n.recordId).join(' · '):'nenhum',tone:orphans.length?'blocked':'ok',meta:'Relations · PRIMARY_PROGRAM'},
    {title:'Registros fora da hierarquia',detail:`${unbound.length} registros do SSOT permanecem no núcleo por não declararem vínculo com Domain/Program/Campaign`,tone:unbound.length?'warn':'ok',meta:'contexto do núcleo'},
    {title:'Nós bloqueados',detail:blockedNodes.length?blockedNodes.map(n=>n.recordId||n.label).join(' · '):'nenhum',tone:blockedNodes.length?'blocked':'ok',meta:'status do SSOT'}
   ]:[]),
   ...(node.hierarchyOrphan?[{title:'Program primário ausente',detail:`PRIMARY_PROGRAM declarado: ${node.primaryProgramId||'—'}`,tone:'blocked',meta:'Relations'}]:[]),
   ...(node.authority==='derived-from-ssot'?[{title:'Domínio derivado',detail:'Derivado do campo domain dos Programs; o SSOT não traz uma linha domain própria.',tone:'warn',meta:'derived-from-ssot'}]:[]),
   ...(testBudget!=null?[{title:'test_ids declarados',detail:`${testBudget} test_ids únicos, conforme o resumo do SSOT`,tone:'ok',meta:'Campaign · resumo'}]:[])
  ];

  node.ops={
   level:node.hierarchyLevel||'root',
   status:node.status||'UNKNOWN',
   tone:isRoot&&loopBlocked?'blocked':statusTone(node.status),
   summary:node.summary||node.detail||'',
   rollup:{
    domains:subtree.filter(n=>n.hierarchyLevel==='domain').length,
    programs:subtree.filter(n=>n.hierarchyLevel==='program').length,
    campaigns:subtree.filter(n=>n.hierarchyLevel==='campaign').length,
    children:kids.length,
    blocked:blockers.length,
    byStatus:[...byStatus.entries()].sort((a,b)=>b[1]-a[1])
   },
   core:isRoot?{
    currentState:live.loop.currentState,nextAction:live.loop.nextAction,lastEffect:live.loop.lastEffect,
    groups:[
     {id:'olympus',title:'Olympus',items:unbound.filter(i=>['person','person_state'].includes(i.kind)).map(i=>toItem(i))},
     {id:'doutrina',title:'Doutrina NEXO',items:unbound.filter(i=>DOCTRINE_RECORD_TYPES.has(i.kind)&&i.kind!=='action').map(i=>toItem(i))}
    ].filter(group=>group.items.length)
   }:null,
   sections:[
    section('blockers','Bloqueios',blockers,'Nenhum bloqueio declarado no SSOT para este escopo.'),
    section('next','Próximas ações',nextActions,'Nenhuma ação pendente declarada no SSOT.'),
    section('tests','Últimos testes',tests,testBudget!=null?`Sem linhas de teste no recorte projetado; o SSOT declara ${testBudget} test_ids únicos no resumo.`:'Sem linhas de teste no recorte atual do SSOT.'),
    section('evidence','Evidências',evidence,'Sem evidência vinculada a este nó no SSOT.'),
    section('relations','Relações',relationItems,'Sem relações declaradas.'),
    section('changes','Mudanças recentes',changes,'Sem mudanças registradas no SSOT.'),
    section('integrity','Integridade',integrity,'Sem sinais de integridade.')
   ]
  };
 }

 graph.ops={
  authority:meta.authority||'canonical',projection:meta.projection||'',generatedAt,ageHours,loopBlocked,
  counts:{
   domains:nodes.filter(n=>n.hierarchyLevel==='domain').length,
   programs:nodes.filter(n=>n.hierarchyLevel==='program').length,
   campaigns:nodes.filter(n=>n.hierarchyLevel==='campaign').length,
   blocked:blockedNodes.length,orphans:orphans.length,unbound:unbound.length
  }
 };
 return graph;
}
