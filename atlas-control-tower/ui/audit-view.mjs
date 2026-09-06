/** Migration Health. Migration problems live here and nowhere else:
 *  they are never rendered as scientific domains or nodes on the map. */
import {$, $$, esc, num, age} from './dom.mjs';

const empty = '<p class="micro">Sem ocorrências registradas.</p>';
const sev = s => `<span class="sev sev-${esc(String(s || 'INFO').toLowerCase())}">${esc(s || 'INFO')}</span>`;

function itemRow(item, category) {
 const meta = [
  item.type && item.type !== 'EDGE' ? esc(item.type) : '',
  item.domain ? esc(item.domain) : '',
  item.status ? 'estado ' + esc(item.status) : '',
  item.authority ? esc(item.authority) : '',
  item.domains ? esc(item.domains.join(' · ')) : '',
  item.source ? 'fonte ' + esc(item.source) : ''
 ].filter(Boolean).join(' · ');
 const head = item.type === 'EDGE'
  ? `<code>${esc(item.source || '')} → ${esc(item.target || '')}</code>`
  : `<button class="relation" data-audit-entity="${esc(item.id)}">${esc(item.label)}</button>`;
 return `<div class="audit-item">${head}
  <small>${sev(item.severity || category.severity)} ${esc(item.issueType || category.id)}${meta ? ' · ' + meta : ''}</small>
  ${item.missing ? `<small>ponta ausente: ${esc(item.missing)}</small>` : ''}
  ${item.resolution ? `<small class="resolution">${esc(item.resolution)}</small>` : ''}</div>`;
}

export function renderAudit(report, {onEntity}) {
 const host = $('#audit-panel');
 if (!host) return;
 if (!report) {host.innerHTML = '<p class="micro">Auditoria indisponível.</p>'; return}
 host.innerHTML = `<div class="audit-head"><span>${num(report.total)} ocorrências observadas · fonte <b>${esc(report.source || 'legacy')}</b></span><small>${esc(age(report.generatedAt))}</small></div>`
  + report.categories.map(c => `<details class="audit-cat"${c.count ? '' : ''}>
   <summary><b>${esc(c.label)}</b> ${sev(c.severity)}<span class="audit-count">${num(c.count)}</span></summary>
   <p class="micro">${esc(c.detail)}</p>
   ${c.count ? c.items.map(i => itemRow(i, c)).join('') + (c.count > c.items.length ? `<p class="micro">…e mais ${num(c.count - c.items.length)}. Amostra limitada; a contagem é completa.</p>` : '') : empty}
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
