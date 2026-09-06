/** Source status and charts. The legacy top metrics strip is optional. */
import {$, $$, esc, num, age} from './dom.mjs';

const METRICS = [
 ['CAMPAIGN', 'CAMPANHAS', 'índice derivado'],
 ['TEST', 'TESTES', 'registros únicos'],
 ['CLAIM', 'HIPÓTESES / CLAIMS', 'escopos identificados'],
 ['RUN', 'EXECUÇÕES', 'registros científicos'],
 ['FILE', 'ARQUIVOS', 'referências explícitas'],
 ['LEARNING_RELATION', 'CONEXÕES', 'derivadas · não evidência']
];

export function renderMetrics(summary, {onMetric}) {
 const root = $('#metrics');
 if (!root) return;
 const counts = summary.counts || {};
 root.innerHTML = METRICS.map(([k, label, note]) =>
  `<div class="metric" role="button" tabindex="0" data-metric="${k}"><label>${label}</label><strong>${num(counts[k])}</strong><small>${note}</small></div>`).join('');
 $$('[data-metric]').forEach(b => {
  b.onclick = () => onMetric(b.dataset.metric);
  b.onkeydown = e => {if (e.key === 'Enter') b.click()};
 });
}

export function renderSourceStatus(summary) {
 const sources = summary.sources || {};
 $('#source-status').innerHTML = Object.entries(sources).map(([k, v]) => {
  const label = k === 'drive' ? 'DRIVE' : 'NEON / PROJEÇÃO';
  const text = v.status === 'READ_OK' ? 'LIDO'
   : v.error === 'GOOGLE_AUTH_NOT_CONFIGURED' ? 'SNAPSHOT · CONFIGURAR ACESSO' : v.status;
  return `<div><b>${label}</b> <span class="${v.status === 'READ_OK' ? '' : 'stale'}">${esc(text)}</span><br><span title="Data observada na fonte">${age(v.observedAt || v.snapshotAt)}</span></div>`;
 }).join('');
 const p = summary.projection || {};
 $('#revision').textContent = 'PROJECTION ' + (p.fingerprint || '—');
 $('#revision').title = p.sourceVersion ? 'Versão de origem: ' + age(p.sourceVersion) : '';
}

export function renderBars(el, data, onPick) {
 const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]).slice(0, 7);
 const max = Math.max(1, ...entries.map(([, n]) => n));
 el.innerHTML = entries.length
  ? entries.map(([k, v]) => `<button class="bar-row" data-key="${esc(k)}"><span>${esc(k.slice(0, 25))}</span><div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%"></div></div><strong>${num(v)}</strong></button>`).join('')
  : '<p class="chart-note">Nenhum teste neste recorte.</p>';
 el.querySelectorAll('[data-key]').forEach(b => b.onclick = () => onPick(b.dataset.key));
}

export function renderCharts(summary, colors, {onDomain, onStatus, onDate, onAudit}) {
 renderBars($('#domain-chart'), summary.domains, onDomain);
 const unresolved = summary.projection?.unresolvedDomain || 0;
 const note = $('#domain-unmapped');
 if (note) {
  note.hidden = !unresolved;
  note.innerHTML = unresolved ? `<button data-open-audit>${num(unresolved)} testes sem domínio resolvido → Auditoria</button>` : '';
  note.querySelector('[data-open-audit]')?.addEventListener('click', onAudit);
 }

 const entries = Object.entries(summary.claims || {});
 const total = entries.reduce((a, [, v]) => a + v, 0);
 $('#claim-chart').innerHTML = `<div class="claim-total">${num(total)}<small>${num(summary.claimKinds?.DECISION_CLAIM)} claims decisórios</small></div>`
  + `<div class="stack">${entries.map(([k, v]) => `<button data-status="${k}" title="${esc(k)}: ${num(v)}" style="width:${v / Math.max(total, 1) * 100}%;background:${colors[k]}"></button>`).join('')}</div>`
  + `<div class="claim-legend">${entries.map(([k, v]) => `<button data-status="${k}"><i style="background:${colors[k]}"></i>${esc(k)} <b>${num(v)}</b></button>`).join('')}</div>`;
 $$('[data-status]').forEach(b => b.onclick = () => onStatus(b.dataset.status));

 const act = Object.entries(summary.activity || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-20);
 const max = Math.max(1, ...act.map(([, v]) => v));
 $('#activity-chart').innerHTML = act.length
  ? `<div class="activity">${act.map(([date, v]) => `<button data-date="${date}" title="${date} · ${v} registros" aria-label="${date}: ${v} registros" style="height:${Math.max(3, v / max * 120)}px"></button>`).join('')}</div>`
  : '<p class="chart-note">Não há datas de registro neste recorte.</p>';
 $$('[data-date]').forEach(b => b.onclick = () => onDate(b.dataset.date));
}

export async function renderDomainNav(api, onPick) {
 if ($('#domain-nav').children.length) return;
 try {
  const g = await api.graph({focus:'system:SCIENCE', type:'DOMAIN', limit:200});
  const domains = g.nodes.filter(n => n.type === 'DOMAIN' && n.domain !== 'UNMAPPED' && n.id !== 'domain:UNMAPPED').slice(0, 16);
  $('#domain-nav').innerHTML = domains.map(n => `<button class="domain-nav" data-domain-id="${esc(n.id)}">${esc(String(n.label).slice(0, 27))}</button>`).join('');
  $$('[data-domain-id]').forEach(b => b.onclick = () => onPick({id: b.dataset.domainId, label: b.textContent}));
 } catch {/* sidebar stays empty; the map is the authoritative route */}
}
