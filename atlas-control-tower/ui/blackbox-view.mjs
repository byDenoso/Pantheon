import {esc, num} from './dom.mjs';

const sum = obj => Object.values(obj||{}).reduce((a,v)=>a+(Number(v)||0),0);
const stageMap = payload => new Map((payload?.ladder||[]).map(s=>[String(s.id||'').toUpperCase(),Number(s.count)||0]));

export async function renderBlackBox(api, graph, summary) {
 const section=document.querySelector('#blackbox-section'), root=document.querySelector('#blackbox-panel');
 if(!section||!root)return;
 const active=graph?.focus==='system:AUTOMATION' || graph?.nodes?.some(n=>n.id==='system:AUTOMATION'&&graph?.nodes?.length===1);
 section.hidden=!active;
 if(!active)return;
 root.innerHTML='<p class="empty-note">Lendo telemetria operacional…</p>';
 let learning=null; try{learning=await api.learning()}catch{}
 const counts=summary?.counts||{}, statuses=summary?.statuses||{}, projection=summary?.projection||{};
 const stages=stageMap(learning), tests=Number(counts.TEST)||0, results=Number(counts.RESULT)||0, claims=Number(counts.CLAIM)||0;
 const blockers=Number(statuses.blocked)||0, activity=sum(summary?.activity), learnTotal=Number(learning?.total)||0;
 const cards=[
  ['Execução científica',num(tests),`${num(results)} resultados · ${num(claims)} claims`],
  ['Pipeline cognitivo',num(learnTotal),`${num(stages.get('OBSERVATION')||0)} obs · ${num(stages.get('PATTERN')||0)} padrões · ${num(stages.get('POLICY')||0)} políticas`],
  ['Saúde operacional',blockers?`${num(blockers)} blockers`:'Operacional',`${num(projection.unresolvedDomain||0)} sem domínio · ${num(projection.unresolvedRelations||0)} relações pendentes`],
  ['Atividade observada',num(activity),`${esc(projection.freshness||'')} · ${esc(projection.source||'')}`]
 ];
 const emergent=(learning?.emergent||[]).filter(x=>Number(x.count)>0).sort((a,b)=>Number(b.count)-Number(a.count)).slice(0,6);
 root.innerHTML=`<div class="blackbox-intro"><div><small>FLIGHT RECORDER COGNITIVO</small><strong>Execução, aprendizado e integridade.</strong><span>A Black Box mostra o que o NEXO está processando; não cria evidência científica.</span></div><div class="live-mark"><i></i>${esc(projection.source||'v1')} · ${esc(projection.freshness||'LIVE')}</div></div>
 <div class="recorte-grid blackbox-grid">${cards.map(([label,value,detail])=>`<article class="recorte-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(detail)}</span></article>`).join('')}</div>
 <div class="recorte-split"><article><div class="subhead"><b>Aprendizado emergente</b><small>LEARNING V1</small></div><div class="activity-list">${emergent.length?emergent.map(x=>`<div><span>${esc(x.label||x.id)}</span><b>${num(x.count)}</b></div>`).join(''):'<p class="empty-note">Nenhum padrão emergente publicado.</p>'}</div></article>
 <article><div class="subhead"><b>Projeção oficial</b><small>DRIVE → NEON → ATLAS</small></div><div class="ops-lines"><div><span>Fingerprint</span><code>${esc(projection.fingerprint||'—')}</code></div><div><span>Versão da fonte</span><b>${esc(String(projection.sourceVersion||'—').slice(0,25))}</b></div><div><span>Fonte efetiva</span><b>${esc(projection.source||'—')} / ${esc(projection.freshness||'—')}</b></div></div></article></div>`;
}
