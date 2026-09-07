import {esc, num} from './dom.mjs';

const sum = obj => Object.values(obj||{}).reduce((a,v)=>a+(Number(v)||0),0);
const stageMap = payload => new Map((payload?.ladder||[]).map(s=>[String(s.id||'').toUpperCase(),Number(s.count)||0]));
const list = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.runs) ? value.runs : Array.isArray(value?.relations) ? value.relations : [];
const first = (...xs) => xs.find(x=>x!==undefined&&x!==null&&String(x)!=='') ?? '';
const text = (v,f='—') => String(v===undefined||v===null||v===''?f:v);
const clamp = (n,min=0,max=1) => Math.max(min,Math.min(max,Number(n)||0));
const pct = n => `${Math.round(clamp(n)*100)}%`;
const statusTone = s => /FAIL|ERROR|BLOCK|CONTRADICT|ROLLED_BACK|NEGATIVE/i.test(s||'')?'bad':/PARTIAL|WARN|DEFER|CANARY|PENDING/i.test(s||'')?'warn':/PASS|OK|READY|ACTIVE|VALIDATED|COMPLETE|SUPPORTED/i.test(s||'')?'good':'new';
const dateLabel = v => {if(!v)return 'sem data'; const d=new Date(v); return Number.isNaN(d.valueOf())?String(v).slice(0,16):d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};

function normalizeRuns(payload){
 return list(payload).map((r,i)=>({
  id:text(first(r.id,r.run_id,r.automation_run_id,r.execution_id),`run-${i+1}`),
  name:text(first(r.name,r.automation_name,r.title,r.workflow,r.task),'Execução'),
  status:text(first(r.status,r.outcome,r.state),'UNKNOWN'),
  at:first(r.finished_at,r.completed_at,r.observed_at,r.updated_at,r.started_at,r.created_at),
  domain:text(first(r.domain,r.domain_id,r.scope),'global'),
  detail:text(first(r.summary,r.message,r.result,r.notes,r.detail),'')
 })).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
}

function normalizeRelations(payload){
 return list(payload).map((r,i)=>({
  id:text(first(r.id,r.relation_id),`relation-${i+1}`),
  from:text(first(r.from_label,r.from_entity_id,r.source,r.domain_a,r.domainA),'?'),
  to:text(first(r.to_label,r.to_entity_id,r.target,r.domain_b,r.domainB),'?'),
  type:text(first(r.relation_type,r.type,r.relationType),'DERIVED'),
  status:text(first(r.status,r.state),'DERIVED'),
  confidence:r.confidence_score ?? r.confidence ?? null,
  count:Number(first(r.supporting_count,r.evidence_count,r.count,0))||0,
  note:text(first(r.summary,r.description,r.notes),'')
 }));
}

function renderRunRows(runs){
 if(!runs.length)return '<p class="empty-note">Nenhuma execução operacional publicada neste endpoint.</p>';
 return runs.slice(0,8).map(r=>`<div class="bb-run"><i class="tone-${statusTone(r.status)}"></i><div><b>${esc(r.name)}</b><small>${esc(r.domain)} · ${esc(dateLabel(r.at))}${r.detail?` · ${esc(r.detail.slice(0,90))}`:''}</small></div><span class="bb-state tone-${statusTone(r.status)}">${esc(r.status)}</span></div>`).join('');
}

function renderRelations(relations){
 if(!relations.length)return '<p class="empty-note">Nenhuma relação derivada publicada.</p>';
 return relations.slice(0,8).map(r=>`<div class="bb-relation"><div><b>${esc(r.from)}</b><span>→</span><b>${esc(r.to)}</b></div><small>${esc(r.type)} · ${esc(r.status)}${r.count?` · ${num(r.count)} suportes`:''}</small>${r.confidence!==null?`<div class="bb-confidence"><i style="--p:${Math.round(clamp(r.confidence)*100)}%"></i><span>${pct(r.confidence)}</span></div>`:''}</div>`).join('');
}

function renderLadder(learning){
 const stages=learning?.ladder||[];
 if(!stages.length)return '<p class="empty-note">Pipeline de learning ainda sem estágios publicados.</p>';
 const max=Math.max(1,...stages.map(s=>Number(s.count)||0));
 return `<div class="bb-ladder">${stages.map((s,i)=>`<div class="bb-stage"><div class="bb-stage-top"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(s.label||s.id)}</b><strong>${num(s.count||0)}</strong></div><div class="bb-bar"><i style="--w:${Math.round((Number(s.count)||0)/max*100)}%"></i></div><small>${esc(s.source||'learning_v1')}</small></div>`).join('')}</div>`;
}

export async function renderBlackBox(api, graph, summary) {
 const section=document.querySelector('#blackbox-section'), root=document.querySelector('#blackbox-panel');
 if(!section||!root)return;
 const active=graph?.focus==='system:AUTOMATION' || graph?.nodes?.some(n=>n.id==='system:AUTOMATION'&&graph?.nodes?.length===1);
 section.hidden=!active;
 if(!active)return;
 root.innerHTML='<p class="empty-note">Lendo flight recorder cognitivo…</p>';

 const [learningResult,runsResult,relationsResult]=await Promise.allSettled([api.learning(),api.automationRuns(),api.learningRelations()]);
 const learning=learningResult.status==='fulfilled'?learningResult.value:null;
 const runs=normalizeRuns(runsResult.status==='fulfilled'?runsResult.value:null);
 const relations=normalizeRelations(relationsResult.status==='fulfilled'?relationsResult.value:null);
 const counts=summary?.counts||{}, statuses=summary?.statuses||{}, projection=summary?.projection||{}, stages=stageMap(learning);
 const tests=Number(counts.TEST)||0, results=Number(counts.RESULT)||0, claims=Number(counts.CLAIM)||0, blockers=Number(statuses.blocked)||0;
 const activity=sum(summary?.activity), learnTotal=Number(learning?.total)||0, unresolved=Number(projection.unresolvedDomain||0)+Number(projection.unresolvedRelations||0);
 const failedRuns=runs.filter(r=>statusTone(r.status)==='bad').length;
 const crossDomain=Number(learning?.crossDomain)||relations.filter(r=>r.from!==r.to&&r.from!=='?'&&r.to!=='?').length;
 const healthPenalty=Math.min(100,blockers*8+failedRuns*12+unresolved*2);
 const healthScore=Math.max(0,100-healthPenalty);
 const emergent=(learning?.emergent||[]).filter(x=>Number(x.count)>0).sort((a,b)=>Number(b.count)-Number(a.count)).slice(0,6);
 const sourceOk=learningResult.status==='fulfilled'&&runsResult.status==='fulfilled'&&relationsResult.status==='fulfilled';

 root.innerHTML=`
 <div class="blackbox-intro bb-hero"><div><small>FLIGHT RECORDER COGNITIVO</small><strong>O que o NEXO executa, aprende e conecta.</strong><span>Telemetria operacional e relações derivadas. Nunca promove evidência científica automaticamente.</span></div><div class="bb-authority"><span>AUTHORITY</span><b>DERIVED_NOT_EVIDENCE</b><small>${esc(projection.source||'v1')} · ${esc(projection.freshness||'LIVE')}</small></div></div>
 <div class="bb-health"><div class="bb-health-score" style="--score:${healthScore}"><span>INTEGRIDADE</span><strong>${healthScore}</strong><small>/100</small></div><div class="bb-health-copy"><b>${sourceOk?'Flight recorder conectado':'Telemetria parcial'}</b><span>${num(blockers)} blockers · ${num(failedRuns)} execuções com falha · ${num(unresolved)} pendências de projeção</span></div><div class="bb-pulse"><i></i><span>${sourceOk?'LIVE':'DEGRADED'}</span></div></div>
 <div class="recorte-grid blackbox-grid">
  <article class="recorte-card"><small>Execução científica</small><strong>${num(tests)}</strong><span>${num(results)} resultados · ${num(claims)} claims</span></article>
  <article class="recorte-card"><small>Pipeline cognitivo</small><strong>${num(learnTotal)}</strong><span>${num(stages.get('OBSERVATION')||0)} obs · ${num(stages.get('PATTERN')||0)} padrões · ${num(stages.get('POLICY')||0)} políticas</span></article>
  <article class="recorte-card"><small>Relações aprendidas</small><strong>${num(relations.length)}</strong><span>${num(crossDomain)} sinais inter-domínio</span></article>
  <article class="recorte-card"><small>Atividade observada</small><strong>${num(activity)}</strong><span>${num(runs.length)} execuções recentes lidas</span></article>
 </div>
 <div class="bb-layout">
  <article class="bb-panel bb-wide"><div class="subhead"><b>Pipeline de aprendizado</b><small>OBSERVAÇÃO → POLÍTICA</small></div>${renderLadder(learning)}</article>
  <article class="bb-panel"><div class="subhead"><b>Sinais emergentes</b><small>LEARNING V1</small></div><div class="activity-list">${emergent.length?emergent.map(x=>`<div><span>${esc(x.label||x.id)}</span><b>${num(x.count)}</b></div>`).join(''):'<p class="empty-note">Nenhum sinal emergente publicado.</p>'}</div></article>
  <article class="bb-panel bb-wide"><div class="subhead"><b>Flight recorder</b><small>EXECUÇÕES RECENTES</small></div><div class="bb-runs">${renderRunRows(runs)}</div></article>
  <article class="bb-panel bb-wide"><div class="subhead"><b>Relações metodológicas aprendidas</b><small>INTER-DOMÍNIO · DERIVADO</small></div><div class="bb-relations">${renderRelations(relations)}</div></article>
  <article class="bb-panel"><div class="subhead"><b>Integridade da projeção</b><small>DRIVE → NEON → ATLAS</small></div><div class="ops-lines"><div><span>Fingerprint</span><code>${esc(projection.fingerprint||'—')}</code></div><div><span>Versão da fonte</span><b>${esc(text(projection.sourceVersion).slice(0,25))}</b></div><div><span>Fonte efetiva</span><b>${esc(projection.source||'—')} / ${esc(projection.freshness||'—')}</b></div><div><span>Domínio pendente</span><b>${num(projection.unresolvedDomain||0)}</b></div><div><span>Relações pendentes</span><b>${num(projection.unresolvedRelations||0)}</b></div></div></article>
 </div>`;
}
