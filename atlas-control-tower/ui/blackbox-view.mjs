import {esc, num} from './dom.mjs';

const statusTone = s => /FAIL|ERROR|BLOCK|CONTRADICT|ROLLED_BACK|NEGATIVE/i.test(s||'')?'bad':/PARTIAL|WARN|DEFER|CANARY|PENDING/i.test(s||'')?'warn':/PASS|OK|READY|ACTIVE|VALIDATED|COMPLETE|SUPPORTED|SUCCESS/i.test(s||'')?'good':'new';
const dateLabel = v => {
 if(!v)return 'sem data';
 const d=new Date(v);
 return Number.isNaN(d.valueOf())?String(v).slice(0,16):d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
};
const payloadOf = e => e?.metadata?.payload && typeof e.metadata.payload === 'object' ? e.metadata.payload : {};
const clamp = n => Math.max(0,Math.min(100,Number(n)||0));
const percent = (n,d) => d ? Math.round((Number(n)||0)/Number(d)*100) : 0;

function actionRows(actions=[]){
 if(!actions.length)return '<p class="empty-note">Nenhuma ação operacional publicada.</p>';
 return actions.slice(0,8).map(a=>`<div class="bb-row bb-action"><div><b>${esc(a.label||a.id)}</b><small>${esc(a.domain||'global')} · prioridade ${esc(a.metadata?.priority??'—')}</small>${a.summary?`<em>${esc(String(a.summary).slice(0,132))}</em>`:''}</div><span class="bb-state tone-${statusTone(a.status)}">${esc(a.status||'UNKNOWN')}</span></div>`).join('');
}
function runRows(runs=[]){
 if(!runs.length)return '<p class="empty-note">Nenhuma execução publicada.</p>';
 return runs.slice(0,8).map(r=>`<div class="bb-row bb-run"><i class="tone-${statusTone(r.status)}"></i><div><b>${esc(r.label||r.id)}</b><small>${esc(r.domain||'global')} · ${esc(dateLabel(r.updatedAt))}</small>${r.summary?`<em>${esc(String(r.summary).slice(0,138))}</em>`:''}</div><span class="bb-state tone-${statusTone(r.status)}">${esc(r.status||'UNKNOWN')}</span></div>`).join('');
}
function eventRows(events=[]){
 if(!events.length)return '<p class="empty-note">Nenhum evento de runtime publicado.</p>';
 return events.slice(0,12).map(e=>{
  const baseline=/BLACKBOX_BASELINE/i.test(e.metadata?.event_type||'')||/BLACKBOX-BASELINE/i.test(e.canonicalId||e.id||'');
  return `<div class="bb-row bb-event${baseline?' baseline':''}"><time>${esc(dateLabel(e.updatedAt))}</time><div><b>${esc(e.label||e.id)}${baseline?' <span class="bb-baseline-tag">BASELINE</span>':''}</b><small>${esc(e.metadata?.event_type||e.domain||'runtime')} · ${esc(e.status||'UNKNOWN')}</small>${e.summary?`<em>${esc(String(e.summary).slice(0,170))}</em>`:''}</div></div>`;
 }).join('');
}
function integrityBars(p={}){
 const components=[
  ['Proveniência',p.provenance_completeness],
  ['Lineage',p.lineage_completeness],
  ['Source / readback',p.source_readback_integrity],
  ['Orphan / stale',p.orphan_stale_blocker_health],
  ['Maturidade de validação',p.validation_maturity],
  ['Telemetria histórica',p.historical_telemetry_completeness]
 ].filter(([,v])=>v!==undefined&&v!==null);
 if(!components.length)return '<p class="empty-note">Baseline sem decomposição de integridade publicada.</p>';
 return `<div class="bb-integrity-bars">${components.map(([label,value])=>`<div><span>${esc(label)}</span><i><b style="--w:${clamp(value)}%"></b></i><strong>${Math.round(clamp(value))}</strong></div>`).join('')}</div>`;
}

export async function renderBlackBox(api, graph, summary, {onEntity}={}) {
 const section=document.querySelector('#blackbox-section'),root=document.querySelector('#blackbox-panel');
 if(!section||!root)return;
 const active=graph?.focus==='system:AUTOMATION'||graph?.nodes?.some(n=>n.id==='system:AUTOMATION'&&graph?.nodes?.length===1);
 section.hidden=!active;if(!active)return;

 root.innerHTML='<p class="empty-note">Lendo flight recorder operacional…</p>';
 let ops;
 try{ops=await api.ops()}catch{
  root.innerHTML='<p class="empty-note">Black Box indisponível. O recorte anterior do Atlas foi preservado.</p>';
  return;
 }

 const oc=ops?.counts||{},actions=ops?.actions||[],runs=ops?.runs||[],events=ops?.events||[];
 const baseline=events.find(e=>/BLACKBOX_BASELINE/i.test(e.metadata?.event_type||'')||/BLACKBOX-BASELINE/i.test(e.canonicalId||e.id||''))||null;
 const bp=payloadOf(baseline);
 const score=Number(bp.integrity_score)||Math.round(100-Math.min(100,(Number(oc.blocked)||0)*8+Math.max(0,(Number(oc.runs)||0)-(Number(oc.readbackVerified)||0))*16));
 const historicalRuns=Number(bp.drive_execution_runs_dated_analyzed)||0;
 const materializedRuns=Number(oc.runs)||0,materializedEvents=Number(oc.events)||0,readback=Number(oc.readbackVerified)||0;
 const missingReadbacks=Math.max(0,materializedRuns-readback);
 const missingSources=Number(bp.runtime_events_missing_source_ref)||0;
 const legacyLineage=Number(bp.legacy_action_id_mismatches)||0;
 const orphans=Number(bp.explicit_legacy_orphans)||0;
 const validationBlockers=Number(bp.pattern_validation_blockers_after??bp.pattern_validation_blockers)||0;
 const baselineAt=baseline?.updatedAt||'';
 const deltaEvents=baselineAt?events.filter(e=>String(e.updatedAt||'')>String(baselineAt)):events;
 const deltaLabel=baseline?`${num(deltaEvents.length)} evento${deltaEvents.length===1?'':'s'} após o baseline`:'baseline ainda não materializado';
 const readbackPct=percent(readback,materializedRuns);
 const coverageGap=bp.coverage_gap||'runtime_events é uma projeção de eventos materiais, não um replay 1:1 de todo o histórico.';
 const nextMode=bp.next_mode||'DELTA_FIRST';

 root.innerHTML=`<style>
 #blackbox-panel{--bb-cyan:#31d7ff;--bb-violet:#8b6cff;--bb-green:#63e6b3;--bb-amber:#ffc76b}
 #blackbox-panel .bb-hero,#blackbox-panel .bb-card,#blackbox-panel .bb-panel,#blackbox-panel .bb-integrity{border:1px solid var(--line);border-radius:13px;background:var(--bg);position:relative;overflow:hidden}
 #blackbox-panel .bb-hero:before,#blackbox-panel .bb-panel:before,#blackbox-panel .bb-integrity:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 0%,rgba(49,215,255,.08),transparent 34%),radial-gradient(circle at 100% 100%,rgba(139,108,255,.07),transparent 38%)}
 #blackbox-panel .bb-hero{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:16px 18px;margin-bottom:10px}
 #blackbox-panel .bb-hero small{display:block;font-size:8px;letter-spacing:1.7px;color:var(--muted)}
 #blackbox-panel .bb-hero strong{display:block;font-size:17px;letter-spacing:-.25px;margin:4px 0}
 #blackbox-panel .bb-hero span{display:block;font-size:9px;color:var(--muted);max-width:680px}
 #blackbox-panel .bb-mode{min-width:190px;text-align:right}
 #blackbox-panel .bb-mode b{display:block;color:var(--bb-cyan);font-size:10px;letter-spacing:1px}
 #blackbox-panel .bb-mode code{display:block;font-size:8px;color:var(--muted);margin-top:4px}
 #blackbox-panel .bb-scoreline{display:grid;grid-template-columns:auto 1fr auto;gap:15px;align-items:center;margin-bottom:10px}
 #blackbox-panel .bb-score{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--bb-cyan) calc(${clamp(score)} * 1%),var(--line) 0);position:relative;box-shadow:0 0 35px rgba(49,215,255,.1)}
 #blackbox-panel .bb-score:after{content:"";position:absolute;inset:7px;border-radius:50%;background:var(--bg);border:1px solid var(--line)}
 #blackbox-panel .bb-score div{position:relative;z-index:1;text-align:center}.bb-score strong{display:block;font-size:27px;line-height:1}.bb-score small{font-size:7px;color:var(--muted);letter-spacing:.8px}
 #blackbox-panel .bb-integrity{padding:13px 15px}
 #blackbox-panel .bb-integrity h4{font-size:10px;margin:0 0 8px}.bb-integrity p{font-size:8px;color:var(--muted);margin:7px 0 0}
 #blackbox-panel .bb-pulse{display:flex;align-items:center;gap:7px;font-size:8px;color:var(--muted);white-space:nowrap}.bb-pulse i{width:7px;height:7px;border-radius:50%;background:var(--bb-green);box-shadow:0 0 14px var(--bb-green)}
 #blackbox-panel .bb-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0}
 #blackbox-panel .bb-card{padding:12px 13px}.bb-card small{display:block;font-size:7px;letter-spacing:.7px;color:var(--muted)}.bb-card strong{display:block;font-size:22px;line-height:1.15;margin:4px 0}.bb-card span{font-size:8px;color:var(--muted)}
 #blackbox-panel .bb-history{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch;margin-bottom:10px}
 #blackbox-panel .bb-history .bb-card{min-height:92px}.bb-history-arrow{display:grid;place-items:center;color:var(--muted);font-size:18px}
 #blackbox-panel .bb-history .material strong{color:var(--bb-cyan)}#blackbox-panel .bb-history .historical strong{color:var(--bb-violet)}
 #blackbox-panel .bb-history-note{grid-column:1/-1;border-left:2px solid var(--bb-amber);padding:7px 10px;font-size:8px;color:var(--muted);background:color-mix(in srgb,var(--bb-amber) 4%,transparent)}
 #blackbox-panel .bb-integrity-bars{display:grid;gap:6px}.bb-integrity-bars>div{display:grid;grid-template-columns:130px 1fr 28px;align-items:center;gap:8px}.bb-integrity-bars span,.bb-integrity-bars strong{font-size:8px}.bb-integrity-bars span{color:var(--muted)}.bb-integrity-bars strong{text-align:right;font-weight:600}.bb-integrity-bars i{height:4px;border-radius:99px;background:var(--line);overflow:hidden}.bb-integrity-bars i b{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,var(--bb-violet),var(--bb-cyan));box-shadow:0 0 9px rgba(49,215,255,.35)}
 #blackbox-panel .bb-layout{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bb-panel{padding:14px;min-width:0}.bb-panel.bb-wide{grid-column:1/-1}.bb-panel .subhead{position:relative;z-index:1}
 #blackbox-panel .bb-row{position:relative;z-index:1;width:100%;border-bottom:1px solid var(--line);padding:9px 2px;color:inherit}
 #blackbox-panel .bb-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center}
 #blackbox-panel .bb-run{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:9px;align-items:center}.bb-run>i{width:7px;height:7px;border-radius:50%;background:currentColor}
 #blackbox-panel .bb-event{display:grid;grid-template-columns:78px 1fr;gap:11px}.bb-event time{font-size:8px;color:var(--muted);padding-top:2px}
 #blackbox-panel .bb-row b{display:block;font-size:10px}.bb-row small,.bb-row em{display:block;font-size:8px;color:var(--muted);margin-top:2px}.bb-row em{font-style:normal;line-height:1.45;margin-top:4px}
 #blackbox-panel .bb-state{font-size:7px;border:1px solid currentColor;border-radius:999px;padding:2px 7px}
 #blackbox-panel .bb-baseline-tag{display:inline-block!important;margin-left:6px;padding:1px 5px;border:1px solid var(--bb-violet);border-radius:999px;color:var(--bb-violet)!important;font-size:6px!important;letter-spacing:.5px}
 #blackbox-panel .bb-event.baseline{background:linear-gradient(90deg,rgba(139,108,255,.06),transparent)}
 #blackbox-panel .bb-integrity-flags{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.bb-flag{border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--soft)}.bb-flag b{display:block;font-size:13px}.bb-flag span{font-size:7px;color:var(--muted)}
 [data-theme="dark"] #blackbox-panel .bb-hero,[data-theme="dark"] #blackbox-panel .bb-card,[data-theme="dark"] #blackbox-panel .bb-panel,[data-theme="dark"] #blackbox-panel .bb-integrity{background:linear-gradient(180deg,rgba(4,13,24,.97),rgba(2,7,14,.99));border-color:#17466c}
 @media(max-width:1050px){#blackbox-panel .bb-cards{grid-template-columns:repeat(3,1fr)}}
 @media(max-width:820px){#blackbox-panel .bb-scoreline{grid-template-columns:1fr}#blackbox-panel .bb-layout{grid-template-columns:1fr}#blackbox-panel .bb-panel.bb-wide{grid-column:auto}#blackbox-panel .bb-history{grid-template-columns:1fr}.bb-history-arrow{display:none!important}#blackbox-panel .bb-integrity-flags{grid-template-columns:1fr 1fr}}
 @media(max-width:620px){#blackbox-panel .bb-hero{display:block}#blackbox-panel .bb-mode{text-align:left;margin-top:10px;min-width:0}#blackbox-panel .bb-cards{grid-template-columns:1fr 1fr}#blackbox-panel .bb-event{grid-template-columns:1fr}.bb-event time{padding:0}#blackbox-panel .bb-integrity-bars>div{grid-template-columns:95px 1fr 26px}}
 </style>
 <div class="bb-hero"><div><small>BLACK BOX · FLIGHT RECORDER</small><strong>O que o NEXO fez, registrou e consegue reconstruir.</strong><span>Telemetria operacional read-only. Learning permanece na aba própria; aqui a fronteira é execução, runtime, lineage e integridade.</span></div><div class="bb-mode"><small>MODO PÓS-BASELINE</small><b>${esc(nextMode)}</b><code>${baseline?esc(dateLabel(baselineAt)):'baseline não encontrado'}</code></div></div>
 <div class="bb-scoreline"><div class="bb-score"><div><strong>${Math.round(clamp(score))}</strong><small>INTEGRIDADE</small></div></div><div class="bb-integrity"><h4>BlackBox Integrity Score</h4>${integrityBars(bp.integrity_components||{})}<p>${bp.integrity_score_approximate?'Score operacional derivado e aproximado. ':''}Não mede evidência científica.</p></div><div class="bb-pulse"><i></i><span>${ops?.freshness||'LIVE'} · ${esc(deltaLabel)}</span></div></div>
 <div class="bb-history"><article class="bb-card material"><small>CURRENT / MATERIALIZED</small><strong>${num(materializedEvents)}</strong><span>runtime events · ${num(materializedRuns)} execution runs em nexo_ops</span></article><div class="bb-history-arrow">⇄</div><article class="bb-card historical"><small>HISTORICAL / RECONSTRUCTABLE</small><strong>${historicalRuns?num(historicalRuns):'—'}</strong><span>runs históricos datados auditados no Drive / ACTION_REGISTER</span></article><div class="bb-history-note">${esc(coverageGap)}</div></div>
 <div class="bb-cards"><article class="bb-card"><small>AÇÕES ATUAIS</small><strong>${num(oc.actions||0)}</strong><span>${num(oc.blocked||0)} bloqueadas</span></article><article class="bb-card"><small>READBACK</small><strong>${num(readback)}/${num(materializedRuns)}</strong><span>${readbackPct}% dos runs atuais</span></article><article class="bb-card"><small>SOURCE REF</small><strong>${num(missingSources)}</strong><span>eventos atuais sem source_ref</span></article><article class="bb-card"><small>LEGACY LINEAGE</small><strong>${num(legacyLineage)}</strong><span>IDs históricos parciais, não orphans automáticos</span></article><article class="bb-card"><small>ORPHAN CONFIRMADO</small><strong>${num(orphans)}</strong><span>${num(validationBlockers)} validation blockers no baseline</span></article></div>
 <div class="bb-integrity-flags"><div class="bb-flag"><b>${num(missingReadbacks)}</b><span>runs sem readback atual</span></div><div class="bb-flag"><b>${num(bp.pattern_observations_after||0)}</b><span>links pattern ↔ observation no baseline</span></div><div class="bb-flag"><b>${num(bp.unique_learning_validation_blocker_families_after||0)}</b><span>famílias de blocker de validação</span></div><div class="bb-flag"><b>${esc(ops?.sourceVersion?dateLabel(ops.sourceVersion):'—')}</b><span>último evento materializado</span></div></div>
 <div class="bb-layout">
  <article class="bb-panel"><div class="subhead"><b>Ações atuais</b><small>NEXO_OPS.ACTIONS</small></div>${actionRows(actions)}</article>
  <article class="bb-panel"><div class="subhead"><b>Execuções recentes</b><small>NEXO_OPS.EXECUTION_RUNS</small></div>${runRows(runs)}</article>
  <article class="bb-panel bb-wide"><div class="subhead"><b>Flight recorder</b><small>NEXO_OPS.RUNTIME_EVENTS · eventos materiais, não replay completo</small></div>${eventRows(events)}</article>
  <article class="bb-panel bb-wide"><div class="subhead"><b>Boundary de autoridade</b><small>DRIVE → NEON → ATLAS</small></div><div class="ops-lines"><div><span>Authority</span><b>DERIVED_NOT_EVIDENCE</b></div><div><span>Black Box fingerprint</span><code>${esc(ops?.fingerprint||'—')}</code></div><div><span>Baseline</span><b>${esc(baseline?.canonicalId||baseline?.id||'—')}</b></div><div><span>Histórico</span><b>${historicalRuns?'reconstruível sob demanda':'não inventado'}</b></div><div><span>Ciência</span><b>não alterada pela Black Box</b></div></div></article>
 </div>`;

}
