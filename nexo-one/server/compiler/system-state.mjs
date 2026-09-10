import {hash} from './world-state.mjs';

const DOMAINS=['NEXO','SCIENCE','ENGINEERING','OLYMPUS'];
const STATE_RANK={LIVE:0,SNAPSHOT:1,STALE:2,DEGRADED:3,BLOCKED:4,MISSING_PROVIDER:5,CONFLICT:6};
const SHEET_REF='https://docs.google.com/spreadsheets/d/1twRpSoZCOXv77YyCh_5V9nAS2PM2nqzex2A37eI2Zas/edit';
const text=v=>String(v??'').trim();
const upper=v=>text(v).toUpperCase();
const num=v=>{const n=Number(text(v).replace(',','.'));return Number.isFinite(n)?n:0;};
const iso=(value,fallback)=>{const ms=Date.parse(text(value));return Number.isFinite(ms)?new Date(ms).toISOString():fallback;};

function domainOf(value){
  const v=upper(value);
  if(v.includes('OLYMPUS'))return 'OLYMPUS';
  if(v.includes('ENGINEERING')||v==='TI')return 'ENGINEERING';
  if(v.includes('SCIENCE')||v.includes('COSMO')||v.includes('PEER')||v.includes('PHYS'))return 'SCIENCE';
  return 'NEXO';
}
function freshness(value,now){
  const observed=iso(value,null);
  if(!observed)return {state:'UNKNOWN',observed_at:null,ttl_seconds:null};
  const age=Math.max(0,Date.parse(now)-Date.parse(observed));
  const state=age<=15*60e3?'LIVE':age<=6*3600e3?'RECENT':age<=24*3600e3?'AGING':'STALE';
  return {state,observed_at:observed,ttl_seconds:900};
}
function projectionState(value){
  const v=upper(value);
  return ['LIVE','SNAPSHOT','STALE','DEGRADED','BLOCKED','CONFLICT','MISSING_PROVIDER'].includes(v)?v:'DEGRADED';
}
function authorityClass(value){
  const v=upper(value);
  if(v.includes('TRUTH')||v.includes('CANONICAL'))return 'TRUTH_OWNER';
  if(v.includes('DELEGATED'))return 'DELEGATED';
  if(v.includes('DERIVED'))return 'DERIVED';
  return 'NON_AUTHORITATIVE';
}
function riskOf(value){
  const v=upper(value);
  if(v.startsWith('L1')||v==='LOW')return 'LOW';
  if(v.startsWith('L3')||v==='HIGH_RISK')return 'HIGH';
  return 'MEDIUM';
}
function operationOf(value){
  const v=upper(value);
  if(/NOTIFY|GMAIL|MAIL|MESSAGE/.test(v))return 'NOTIFY';
  if(/DEPLOY|VERCEL|PROMOTE/.test(v))return 'DEPLOY';
  if(/CALENDAR|SCHEDULE|CRON|REMINDER/.test(v))return 'SCHEDULE';
  if(/WRITE|CREATE|UPDATE|DELETE|PATCH|COMMIT|PUSH|MUTAT/.test(v))return 'WRITE';
  return 'READ';
}
function runtimeOf(value){
  const v=upper(value);
  if(v.includes('GITHUB'))return 'GITHUB_ACTIONS';
  if(v.includes('VERCEL'))return 'VERCEL';
  if(v.includes('HUMAN'))return 'HUMAN';
  if(v.includes('SCHEDULED')||v.includes('NEXO'))return 'NEXO_KERNEL';
  return 'LOCAL';
}
function capabilityStatus(value){
  const v=upper(value);
  return ['PASS','UNVERIFIED','UNKNOWN','BLOCKED'].includes(v)?v:'UNKNOWN';
}
function readbackOf(run,now){
  const raw=upper(run?.readback);
  const status=raw.includes('PASS')?'CONFIRMED':raw.includes('FAIL')?'FAILED':raw.includes('PENDING')?'PENDING':raw.includes('N/A')?'NOT_APPLICABLE':'UNVERIFIED';
  return {status,provider:text(run?.tools_used)||null,observed_fingerprint:status==='CONFIRMED'?(text(run?.context_fingerprint)||null):null,checked_at:iso(run?.ended_at||run?.started_at,null),explanation:text(run?.outcome||run?.failure_signature)||`Readback ${status.toLowerCase()}.`};
}
function requiredOperation(run,action){
  const signal=text(run?.signals_observed).match(/required_operation=([^;]+)/i)?.[1];
  return operationOf(signal||action?.action);
}
function latestByAction(rows){
  const out=new Map();
  for(const row of rows||[]){
    const id=text(row.action_id);if(!id)continue;
    const stamp=Date.parse(text(row.ended_at||row.started_at))||0;
    const old=out.get(id),oldStamp=old?(Date.parse(text(old.ended_at||old.started_at))||0):-1;
    if(stamp>=oldStamp)out.set(id,row);
  }
  return out;
}
function humanKind(row){
  const v=upper(`${row.required_resolution} ${row.blocker}`);
  if(/APPROV|APROV/.test(v))return 'APROVAR';
  if(/RESPOND|RESPONDER/.test(v))return 'RESPONDER';
  if(/DATA|DADO|INPUT|FILE|ARQUIVO/.test(v))return 'FORNECER_DADO';
  if(/CHOOSE|ESCOLH|SELECT/.test(v))return 'DECIDIR';
  return 'DECIDIR';
}
function runStatus(value){
  const v=upper(value);
  if(v.includes('BLOCK'))return 'BLOCKED';
  if(v.includes('FAIL'))return 'FAILED';
  if(v.includes('NO_OP')||v.includes('NOOP'))return 'NO_OP';
  if(v.includes('RUN')||v.includes('PROGRESS'))return 'RUNNING';
  return 'SUCCEEDED';
}
function actionStatus(row,run,human){
  const v=upper(row.status);
  const rb=readbackOf(run,'1970-01-01T00:00:00.000Z').status;
  if(human)return 'AWAITING_HUMAN';
  if(v.includes('WAITING_SIDE')||v==='WAITING')return 'WAITING_SIDE_QUEST';
  if(v.includes('BLOCK'))return 'BLOCKED';
  if(v.includes('FAIL'))return 'FAILED';
  if(v.includes('RUN'))return 'RUNNING';
  if(v.includes('NO_OP')||v.includes('NOOP'))return 'NO_OP_ALREADY_APPLIED';
  if(v.includes('DONE')||v.includes('COMPLETE')||v.includes('SUCCESS'))return rb==='CONFIRMED'?'APPLIED':'BLOCKED';
  if(v.includes('READY')||v.includes('ELIGIBLE')||v.includes('OPEN')||v.includes('QUEUED'))return 'ELIGIBLE';
  return 'PROPOSED';
}
function severityForFinding(row){
  const status=upper(row.status),domain=domainOf(row.domain);
  if(status==='CONFLICT'&&domain==='OLYMPUS')return 'P0';
  if(status==='CONFLICT'||status==='MISSING_PROVIDER')return 'P1';
  if(status==='BLOCKED'||status==='DEGRADED'||status==='STALE_DECLARATION')return 'P2';
  return 'INFO';
}
function providerState(p){
  if(p.status==='AVAILABLE')return p.partial?'DEGRADED':'LIVE';
  if(p.status==='AUTH_REQUIRED')return 'BLOCKED';
  return p.lastSuccessAt?'DEGRADED':'MISSING_PROVIDER';
}
function expectedDomains(id){
  if(id==='drive')return [...DOMAINS];
  if(id==='gmail'||id==='calendar')return ['NEXO','OLYMPUS'];
  if(id==='github'||id==='vercel'||id==='atlas')return ['NEXO','ENGINEERING'];
  if(id==='nexo')return [...DOMAINS];
  return ['NEXO'];
}
function worst(states){return [...states].map(projectionState).sort((a,b)=>(STATE_RANK[b]??3)-(STATE_RANK[a]??3))[0]||'LIVE';}

function mapFindings(world,now){
  return (world?.truthGraph?.results||[]).map(row=>({
    id:`truth:${domainOf(row.domain)}`,domain:domainOf(row.domain),status:['LIVE','DEGRADED','CONFLICT','STALE_DECLARATION','MISSING_PROVIDER','BLOCKED'].includes(upper(row.status))?upper(row.status):'BLOCKED',
    source_ref:text(row.source_ref)||SHEET_REF,fingerprint:text(row.fingerprint)||`TG-${hash(row)}`,checked_at:iso(row.checked_at,now),
    authority:{owner:text(row.authority?.canonical_truth||row.authority?.operational_truth)||'UNRESOLVED',class:upper(row.status)==='LIVE'?'TRUTH_OWNER':'NON_AUTHORITATIVE'},
    provider:{expected:text(row.provider?.expected)||'owner-dependent',observed:text(row.provider?.actual)||null},capability:(row.capability?.ids||[])[0]||null,
    severity:severityForFinding(row),explanation:text(row.explanation)||'Sem explicação de integridade.',freshness:freshness(row.provider?.checked_at||row.checked_at,now)
  }));
}
function mapCapabilities(rows,now){
  return (rows||[]).filter(r=>text(r.capability_id)).map(row=>({
    capability_id:text(row.capability_id),label:text(row.operation)||text(row.capability_id),domain:domainOf(row.domain),runtime:runtimeOf(row.runtime),operation:operationOf(row.operation),
    status:capabilityStatus(row.status),risk:riskOf(row.risk_level),provider:text(row.runtime)||'UNRESOLVED',last_verified_at:capabilityStatus(row.status)==='PASS'?iso(row.last_tested_at,null):null,
    evidence_ref:text(row.evidence_pointer)||null,explanation:text(row.notes)||text(row.readback)||'Sem evidência adicional.'
  }));
}
function mapRuns(rows,now){
  return [...(rows||[])].filter(r=>text(r.run_id)).sort((a,b)=>(Date.parse(text(b.started_at))||0)-(Date.parse(text(a.started_at))||0)).slice(0,100).map(row=>{
    const rb=readbackOf(row,now),status=runStatus(row.status),cap=text(row.capability_refs).split(/[;,]/).find(x=>x.startsWith('CAP-'))||text(row.tools_used).split(/[;,]/).find(x=>x.startsWith('CAP-'))||null;
    const stepStatus=stage=>stage==='READBACK'?(rb.status==='CONFIRMED'?'OK':rb.status==='FAILED'?'FAIL':'WARN'):status==='FAILED'?'FAIL':status==='BLOCKED'?'WARN':'OK';
    const at=iso(row.ended_at||row.started_at,null),fp=text(row.context_fingerprint)||null;
    return {run_id:text(row.run_id),action_id:text(row.action_id)||`run:${text(row.run_id)}`,lane:domainOf(row.lane||row.domain),title:text(row.outcome)||text(row.automation)||text(row.run_id),started_at:iso(row.started_at,now),ended_at:iso(row.ended_at,null),status,effect_key:text(row.effect_key)||null,capability_id:cap,runtime:runtimeOf(row.runtime),retries:Math.max(0,num(row.attempts)-1),receipt_ref:text(row.receipt_ref)||null,
      steps:['ACTION','CAPABILITY','RUNTIME','EFFECT','READBACK'].map(stage=>({stage,label:stage,status:stepStatus(stage),at,fingerprint:fp,detail:stage==='READBACK'?rb.explanation:text(row.outcome||row.signals_observed)||stage})),readback:rb};
  });
}
function mapActions(rows,runs,sideQuests,now){
  const latest=latestByAction(runs),humanByAction=new Map((sideQuests||[]).filter(q=>upper(q.type)==='HUMAN'&&upper(q.status)==='WAITING').map(q=>[text(q.parent_action_id),q]));
  return (rows||[]).filter(r=>text(r.action_id)).map(row=>{
    const run=latest.get(text(row.action_id)),human=humanByAction.get(text(row.action_id)),rb=readbackOf(run,now),status=actionStatus(row,run,human),cap=text(run?.capability_refs).split(/[;,]/).find(x=>x.startsWith('CAP-'))||text(run?.tools_used).split(/[;,]/).find(x=>x.startsWith('CAP-'))||null;
    const fp=text(run?.context_fingerprint)||text(row.fingerprint)||`ACT-${hash(row)}`;
    return {action_id:text(row.action_id),lane:domainOf(row.domain),title:text(row.action)||text(row.action_id),status,required_operation:requiredOperation(run,row),capability_id:cap,runtime:runtimeOf(run?.runtime),effect_key:text(run?.effect_key)||null,input_fingerprint:fp,readback:rb,receipt_ref:text(run?.receipt_ref||row.evidence_pointer)||null,
      blocker:text(human?.blocker||row.blocker)||(status==='BLOCKED'&&upper(row.status).match(/DONE|COMPLETE|SUCCESS/)?'Ação terminal sem readback confirmado na execução mais recente.':null),next_action:text(row.next_action)||'Reavaliar no próximo ciclo.',risk:riskOf(run?.risk_class||row.authority),reversible:!upper(row.authority).startsWith('L3'),eligibility:status==='ELIGIBLE'?'Elegível no ACTION_REGISTER; execução ainda depende de capability PASS e lease quando aplicável.':status==='APPLIED'?'Efeito com readback confirmado.':'Estado projetado do ACTION_REGISTER; nenhum sucesso foi inferido.',
      human_gate:human?{kind:humanKind(human),question:text(human.required_resolution)||text(human.blocker),options:[]}:null,source_ref:text(row.evidence_pointer)||SHEET_REF,fingerprint:text(row.fingerprint)||`ACT-${hash(row)}`,checked_at:iso(row.last_checked,now),freshness:freshness(row.last_checked,now),updated_at:iso(row.last_checked,now)};
  });
}
function mapInbox(sideQuests,now){
  return (sideQuests||[]).filter(row=>upper(row.type)==='HUMAN'&&upper(row.status)==='WAITING').map(row=>({id:text(row.side_quest_id),kind:humanKind(row),domain:domainOf(row.lane),title:text(row.blocker)||text(row.side_quest_id),question:text(row.required_resolution)||text(row.blocker),why:`Bloqueia apenas ${text(row.blocks_scope)||'a ação pai'}.`,action_id:text(row.parent_action_id)||null,options:[],severity:domainOf(row.lane)==='OLYMPUS'?'P0':'P1',due_at:null,source_ref:text(row.source_ref)||SHEET_REF,fingerprint:text(row.fingerprint)||`SQ-${hash(row)}`,checked_at:iso(row.last_presented_at||row.created_at,now),freshness:freshness(row.last_presented_at||row.created_at,now)}));
}
function mapFilaments(rows){
  return (rows||[]).filter(r=>text(r.filament_id)).map(row=>({id:text(row.filament_id),label:text(row.filament_type)||text(row.filament_id),domain:domainOf(row.source_domain||row.target_domain),kind:upper(row.source_layer).includes('SEMANTIC')?'SEMANTIC':'PROCEDURAL',weight:num(row.weight),support:num(row.support_count),contradiction:num(row.contradiction_count),status:upper(row.status)==='ACTIVE'?'ESTABLISHED':upper(row.status).includes('CONTEST')?'CONTESTED':upper(row.status).includes('RETIR')||upper(row.status).includes('SUPERSE')?'RETIRED':'PROVISIONAL',evidence:text(row.evidence_refs).split(/[;,]/).map(x=>x.trim()).filter(Boolean),source_ref:SHEET_REF,boundary:text(row.next_discriminant)||text(row.activation_rule)||'Sem boundary explícito.',from_label:text(row.source_id),to_label:text(row.target_id)}));
}
function mapProviders(rows,now){return (rows||[]).map(p=>({id:text(p.id),label:text(p.label)||text(p.id),expected_for:expectedDomains(text(p.id)),state:providerState(p),capabilities:[],last_success_at:iso(p.lastSuccessAt,null),checked_at:iso(p.checkedAt,now),explanation:text(p.message)||text(p.status)}));}
function mapEnvelopes(bus,now){return (bus?.envelopes||[]).map(e=>({entity_id:text(e.entity_id),domain:domainOf(e.domain),authority_class:authorityClass(e.authority_class),source_ref:text(e.source_ref)||text(e.source)||'UNRESOLVED',source_revision:text(e.source_revision)||'UNREVISIONED',fingerprint:text(e.fingerprint)||`PRJ-${hash(e)}`,freshness:{state:['LIVE','RECENT','AGING','STALE','UNKNOWN'].includes(upper(e.freshness?.state))?upper(e.freshness?.state):'UNKNOWN',observed_at:iso(e.freshness?.observed_at,null),ttl_seconds:Number.isFinite(e.freshness?.age_ms)?Math.max(0,Math.round((Number(e.freshness.age_ms)+60000)/1000)):null},derivation_rule:text(e.derivation_rule)||'projection-bus',state:projectionState(e.state),checked_at:iso(e.checked_at,now),projection_role:'COCKPIT',authoritative:false,title:text(e.payload?.title)||text(e.entity_id),summary:text(e.payload?.summary)||text(e.error?.message)||undefined}));}
function mapBus(bus,providers,now){
  const pById=new Map(providers.map(p=>[p.id,p]));
  return {fingerprint:text(bus?.fingerprint)||`BUS-${hash(bus||{})}`,generated_at:iso(bus?.generated_at,now),state:projectionState(bus?.state),envelope_count:(bus?.envelopes||[]).length,sources:(bus?.sources||[]).map(s=>{const provider=pById.get(text(s.id).toLowerCase())||providers.find(p=>text(s.id).toLowerCase().includes(p.id));return {id:text(s.id),label:text(s.id),source_revision:text(s.revision)||null,freshness:provider?freshness(provider.checked_at,now):{state:'UNKNOWN',observed_at:null,ttl_seconds:null},state:projectionState(s.state),envelopes:num(s.count)};}),consumers:[{id:'nexo_one',label:'NEXO ONE',state:projectionState(bus?.state),last_pull_at:iso(bus?.generated_at,now)},{id:'atlas',label:'Atlas',state:projectionState(bus?.state),last_pull_at:iso(bus?.generated_at,now)}]};
}
function mapLanes(actions,runs,sideQuests,findings,now){
  return DOMAINS.map(domain=>{
    const ownActions=actions.filter(a=>a.lane===domain).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)),ownRuns=runs.filter(r=>r.lane===domain).sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at)),quests=(sideQuests||[]).filter(q=>domainOf(q.lane)===domain),finding=findings.find(f=>f.domain===domain);
    const active=ownActions.find(a=>!['APPLIED','NO_OP_ALREADY_APPLIED'].includes(a.status))||ownActions[0],last=ownRuns.find(r=>r.effect_key);
    const blockers=[...new Set([...ownActions.filter(a=>['BLOCKED','FAILED','WAITING_SIDE_QUEST'].includes(a.status)).map(a=>a.blocker||a.title),...quests.filter(q=>upper(q.status)==='WAITING').map(q=>text(q.blocker))].filter(Boolean))];
    return {domain,current_state:active?`${active.status}: ${active.title}`:(finding?.explanation||'Sem ação operacional aberta.'),next_action:active?.next_action||'Aguardar próximo sinal material.',last_effect:last?.effect_key?{effect_key:last.effect_key,at:last.ended_at||last.started_at,status:last.status}:null,blockers,side_quests:quests.map(q=>({id:text(q.side_quest_id),title:text(q.blocker)||text(q.side_quest_id),status:upper(q.status)==='WAITING'?'WAITING':upper(q.status)==='DONE'||upper(q.status)==='RESOLVED'?'DONE':'OPEN'})),freshness:active?.freshness||finding?.freshness||{state:'UNKNOWN',observed_at:null,ttl_seconds:null},state:projectionState(finding?.status|| (blockers.length?'BLOCKED':'LIVE')),source_ref:active?.source_ref||finding?.source_ref||SHEET_REF,fingerprint:`LANE-${hash({domain,active:active?.fingerprint,last:last?.run_id,blockers})}`,checked_at:active?.checked_at||finding?.checked_at||now};
  });
}
function buildGraph({actions,capabilities,providers,envelopes,filaments,sideQuests,findings,now}){
  const nodes=[],edges=[];const add=n=>{if(!nodes.some(x=>x.id===n.id))nodes.push(n);};const edge=(from,to,kind,explanation,weight=1)=>edges.push({id:`edge:${hash({from,to,kind})}`,from,to,kind,weight,explanation});
  for(const domain of DOMAINS)add({id:`domain:${domain}`,type:'DOMAIN',label:domain,domain,state:projectionState(findings.find(f=>f.domain===domain)?.status||'LIVE'),authority_class:'NON_AUTHORITATIVE',source_ref:SHEET_REF,source_revision:'LIVE',fingerprint:`DOMAIN-${hash(domain)}`,freshness:{state:'LIVE',observed_at:now,ttl_seconds:900},checked_at:now,summary:'Domínio operacional projetado.'});
  for(const p of providers){const id=`provider:${p.id}`;add({id,type:'PROVIDER',label:p.label,domain:p.expected_for[0]||'NEXO',state:p.state,authority_class:'NON_AUTHORITATIVE',source_ref:p.id,source_revision:p.checked_at,fingerprint:`PROV-${hash(p)}`,freshness:freshness(p.last_success_at,now),checked_at:p.checked_at,summary:p.explanation});edge(`domain:${p.expected_for[0]||'NEXO'}`,id,'DEPENDS_ON','Domínio observa saúde do provider.');}
  for(const c of capabilities){const id=`capability:${c.capability_id}`;add({id,type:'CAPABILITY',label:c.label,domain:c.domain,state:c.status,authority_class:'NON_AUTHORITATIVE',source_ref:c.evidence_ref||SHEET_REF,source_revision:c.last_verified_at||'UNVERIFIED',fingerprint:`CAP-${hash(c)}`,freshness:freshness(c.last_verified_at,now),checked_at:c.last_verified_at||now,summary:c.explanation,capability_id:c.capability_id,runtime:c.runtime});edge(`domain:${c.domain}`,id,'OWNS','Capability pertence ao domínio operacional.');}
  for(const a of actions){const id=`action:${a.action_id}`;add({id,type:'ACTION',label:a.title,domain:a.lane,state:['BLOCKED','FAILED','WAITING_SIDE_QUEST'].includes(a.status)?'BLOCKED':'LIVE',authority_class:'NON_AUTHORITATIVE',source_ref:a.source_ref,source_revision:a.updated_at,fingerprint:a.fingerprint,freshness:a.freshness,checked_at:a.checked_at,summary:a.eligibility,runtime:a.runtime,evidence:a.receipt_ref?[a.receipt_ref]:[]});edge(`domain:${a.lane}`,id,'OWNS','Ação pertence à lane.');if(a.capability_id&&nodes.some(n=>n.id===`capability:${a.capability_id}`))edge(id,`capability:${a.capability_id}`,'ROUTES_TO','Ação roteada pela capability.');if(a.effect_key){const eff=`effect:${a.effect_key}`;add({id:eff,type:'EFFECT',label:a.effect_key,domain:a.lane,state:a.readback.status==='CONFIRMED'?'LIVE':a.readback.status==='FAILED'?'BLOCKED':'DEGRADED',authority_class:'NON_AUTHORITATIVE',source_ref:a.receipt_ref||a.source_ref,source_revision:a.checked_at,fingerprint:`EFF-${hash(a.effect_key)}`,freshness:a.freshness,checked_at:a.checked_at,summary:a.readback.explanation});edge(id,eff,'PRODUCES','Ação produz efeito projetado.');}}
  for(const e of envelopes){const id=`projection:${e.entity_id}`;add({id,type:'PROJECTION',label:e.title,domain:e.domain,state:e.state,authority_class:e.authority_class,source_ref:e.source_ref,source_revision:e.source_revision,fingerprint:e.fingerprint,freshness:e.freshness,checked_at:e.checked_at,summary:e.summary||e.derivation_rule});edge(`domain:${e.domain}`,id,'PROJECTS','Envelope do Universal Projection Bus.');}
  for(const q of sideQuests||[]){const domain=domainOf(q.lane),id=`sidequest:${text(q.side_quest_id)}`;add({id,type:'SIDE_QUEST',label:text(q.blocker)||text(q.side_quest_id),domain,state:upper(q.status)==='WAITING'?'BLOCKED':'LIVE',authority_class:'NON_AUTHORITATIVE',source_ref:text(q.source_ref)||SHEET_REF,source_revision:iso(q.created_at,now),fingerprint:text(q.fingerprint)||`SQ-${hash(q)}`,freshness:freshness(q.created_at,now),checked_at:iso(q.last_presented_at||q.created_at,now),summary:text(q.required_resolution)});const parent=`action:${text(q.parent_action_id)}`;if(nodes.some(n=>n.id===parent))edge(id,parent,'BLOCKS','Side quest bloqueia somente a ação pai.');}
  for(const f of filaments){const id=`filament:${f.id}`;add({id,type:'FILAMENT',label:f.label,domain:f.domain,state:f.status==='CONTESTED'?'DEGRADED':'LIVE',authority_class:'DERIVED',source_ref:f.source_ref,source_revision:'LEARNING',fingerprint:`FIL-${hash(f)}`,freshness:{state:'RECENT',observed_at:now,ttl_seconds:null},checked_at:now,summary:f.boundary,evidence:f.evidence});edge(`domain:${f.domain}`,id,'SUPPORTS','Filamento de aprendizado projetado.',f.weight);}
  return {nodes,edges:edges.filter(e=>nodes.some(n=>n.id===e.from)&&nodes.some(n=>n.id===e.to))};
}

export function buildSystemState({world,bus,systemInput={},now=world?.generatedAt||new Date().toISOString()}={}){
  const generated=iso(now,new Date().toISOString()),providers=mapProviders(world?.providers||[],generated),findings=mapFindings(world||{},generated),capabilities=mapCapabilities(systemInput.capabilities||[],generated),rawRuns=systemInput.executionRuns||[],runs=mapRuns(rawRuns,generated),actions=mapActions(systemInput.actions||[],rawRuns,systemInput.sideQuests||[],generated),inbox=mapInbox(systemInput.sideQuests||[],generated),filaments=mapFilaments(systemInput.learningFilaments||[]),envelopes=mapEnvelopes(bus||{},generated),projectionBus=mapBus(bus||{},providers,generated),lanes=mapLanes(actions,runs,systemInput.sideQuests||[],findings,generated);
  const graph=buildGraph({actions,capabilities,providers,envelopes,filaments,sideQuests:systemInput.sideQuests||[],findings,now:generated});
  const global_state=worst([projectionBus.state,...providers.map(p=>p.state),...findings.map(f=>f.status),...lanes.map(l=>l.state)]);
  return {contract_version:'1',scenario_id:'live',scenario_label:'Estado real · fontes conectadas',generated_at:generated,global_state,bus:projectionBus,envelopes,findings,actions,inbox,capabilities,runs,lanes,graph,filaments,providers};
}
