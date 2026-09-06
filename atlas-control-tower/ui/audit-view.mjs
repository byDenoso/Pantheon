/** Migration Health. Migration problems live here and nowhere else:
 *  they are never rendered as scientific domains or nodes on the map. */
import {$, $$, esc, num, age} from './dom.mjs';

const empty = '<p class="micro">Sem ocorrências registradas.</p>';

function itemRow(item) {
 if (item.type === 'EDGE')
  return `<div class="audit-item"><code>${esc(item.source || '')} → ${esc(item.target || '')}</code><small>ponta ausente: ${esc(item.missing || '')}</small></div>`;
 const domains = item.domains ? `<small>${esc(item.domains.join(' · '))}</small>` : `<small>${esc(item.type || '')}${item.domain ? ' · ' + esc(item.domain) : ''}</small>`;
 return `<div class="audit-item"><button class="relation" data-audit-entity="${esc(item.id)}">${esc(item.label)}</button>${domains}</div>`;
}

export function renderAudit(report, {onEntity}) {
 const host = $('#audit-panel');
 if (!host) return;
 if (!report) {host.innerHTML = '<p class="micro">Auditoria indisponível.</p>'; return}
 host.innerHTML = `<div class="audit-head"><span>${num(report.total)} ocorrências observadas na projeção atual</span><small>${esc(age(report.generatedAt))}</small></div>`
  + report.categories.map(c => `<details class="audit-cat"${c.count ? ' open' : ''}>
   <summary><b>${esc(c.label)}</b><span class="audit-count">${num(c.count)}</span></summary>
   <p class="micro">${esc(c.detail)}</p>
   ${c.count ? c.items.map(itemRow).join('') + (c.count > c.items.length ? `<p class="micro">…e mais ${num(c.count - c.items.length)}. Amostra limitada; a contagem é completa.</p>` : '') : empty}
  </details>`).join('');
 $$('[data-audit-entity]').forEach(b => b.onclick = () => onEntity(b.dataset.auditEntity));
}

export async function loadAudit(api, handlers) {
 const host = $('#audit-panel');
 if (host) host.innerHTML = '<p class="micro">Lendo auditoria…</p>';
 try {
  renderAudit(await api.audit(), handlers);
 } catch {
  if (host) host.innerHTML = '<p class="micro">Auditoria indisponível no momento. Nenhum dado foi inferido.</p>';
 }
}
