/** Learning as its own entrance: the Observation → Policy ladder plus emergent
 *  movement. Stages with no source in the projection say so and name the source
 *  they still need; nothing is filled in to make the ladder look complete. */
import {$, $$, esc, num} from './dom.mjs';
import {relationRow} from './inspector.mjs';

function stageBlock(stage) {
 const body = stage.available
  ? stage.items.slice(0, 6).map(i => `<li><b>${esc(i.relationType || i.id)}</b><small>${esc(i.status || 'sem estado')}</small></li>`).join('')
  : `<li class="pending">Sem registros na projeção · fonte pendente: <code>${esc(stage.source)}</code></li>`;
 return `<li class="ladder-stage${stage.available ? '' : ' is-pending'}">
  <div class="ladder-head"><b>${esc(stage.label)}</b><span>${num(stage.count)}</span></div>
  <ul class="ladder-items">${body}</ul></li>`;
}

function bucketBlock(bucket) {
 return `<details class="audit-cat"${bucket.count ? '' : ''}>
  <summary><b>${esc(bucket.label)}</b><span class="audit-count">${num(bucket.count)}</span></summary>
  <p class="micro">Critério observado: ${esc(bucket.basis)}.</p>
  ${bucket.count ? bucket.items.slice(0, 6).map(relationRow).join('') : '<p class="micro">Sem ocorrências registradas.</p>'}
 </details>`;
}

export function renderLearning(report) {
 const host = $('#learning-panel');
 if (!host) return;
 if (!report) {host.innerHTML = '<p class="micro">Learning indisponível.</p>'; return}
 host.innerHTML = `<div class="audit-head"><span>${num(report.total)} relações registradas · ${num(report.crossDomain)} cross-domain</span>
   <small>${num(report.unresolvedEvidence.length)} evidências não resolvidas</small></div>
  <ol class="ladder">${report.ladder.map(stageBlock).join('')}</ol>
  <h4 class="learning-sub">Aprendizado emergente</h4>
  <p class="micro">Cada balde é uma observação sobre os contadores da fonte; um registro pode aparecer em mais de um. Não há score sintético.</p>
  ${report.emergent.map(bucketBlock).join('')}
  ${report.unresolvedEvidence.length ? `<h4 class="learning-sub">Evidências não resolvidas</h4>${report.unresolvedEvidence.slice(0, 8).map(u =>
   `<div class="audit-item"><code>${esc(u.relationType)}</code><small>referência ausente: ${esc(u.missing)}</small></div>`).join('')}` : ''}`;
}

export async function loadLearning(api) {
 const host = $('#learning-panel');
 if (host) host.innerHTML = '<p class="micro">Lendo learning…</p>';
 try {
  renderLearning(await api.learning());
 } catch {
  if (host) host.innerHTML = '<p class="micro">Learning indisponível no momento. Nenhum padrão foi inferido.</p>';
 }
}
