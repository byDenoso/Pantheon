/** Learning as its own entrance: the Observation → Policy ladder, emergent
 *  movement and declared lineage. Stages with no source in the projection say so
 *  and name the source they still need; nothing is filled in to look complete. */
import {$, $$, esc, num} from './dom.mjs';
import {relationRow} from './inspector.mjs';

function stageBlock(stage) {
 const body = stage.available
  ? stage.items.slice(0, 6).map(i => `<li><button class="ladder-item" data-lineage="${esc(i.id)}"><b>${esc(i.relationType || i.id)}</b><small>${esc(i.status || 'sem estado')}</small></button></li>`).join('')
  : `<li class="pending">Sem registros na projeção · fonte pendente: <code>${esc(stage.source)}</code></li>`;
 return `<li class="ladder-stage${stage.available ? '' : ' is-pending'}" data-stage="${esc(stage.id)}">
  <div class="ladder-head"><b>${esc(stage.label)}</b><span>${num(stage.count)}</span></div>
  <ul class="ladder-items">${body}</ul></li>`;
}

function bucketBlock(bucket) {
 return `<details class="audit-cat">
  <summary><b>${esc(bucket.label)}</b><span class="audit-count">${num(bucket.count)}</span></summary>
  <p class="micro">Critério observado: ${esc(bucket.basis)}.</p>
  ${bucket.count ? bucket.items.slice(0, 6).map(relationRow).join('') : '<p class="micro">Sem ocorrências registradas nesta categoria.</p>'}
 </details>`;
}

async function showLineage(api, id) {
 const box = $('#learning-lineage');
 if (!box) return;
 box.hidden = false;
 box.innerHTML = '<p class="micro">Lendo linhagem…</p>';
 try {
  const l = await api.learningLineage(id);
  if (!l.node) {box.innerHTML = '<p class="micro">Registro não encontrado.</p>'; return}
  const chain = (list, title) => list.length
   ? `<div class="lineage-col"><h5>${title} · ${num(list.length)}</h5>${list.slice(0, 6).map(relationRow).join('')}</div>`
   : `<div class="lineage-col"><h5>${title}</h5><p class="micro">Nenhum declarado na fonte.</p></div>`;
  box.innerHTML = `<div class="lineage-head"><b>${esc(l.node.relationType)}</b><button data-close-lineage>Fechar</button></div>
   ${l.available ? '' : '<p class="micro">A fonte não declara <code>derived_from</code> para este registro; a linhagem aparece quando learning_v1 publicar o encadeamento.</p>'}
   <div class="lineage">${chain(l.ancestors, 'Origem')}${chain(l.descendants, 'Descendentes')}</div>`;
  box.querySelector('[data-close-lineage]')?.addEventListener('click', () => {box.hidden = true});
 } catch {
  box.innerHTML = '<p class="micro">Linhagem indisponível no momento.</p>';
 }
}

export function renderLearning(report, {api} = {}) {
 const host = $('#learning-panel');
 if (!host) return;
 if (!report) {host.innerHTML = '<p class="micro">Learning indisponível.</p>'; return}
 host.innerHTML = `<div class="audit-head"><span>${num(report.total)} relações registradas · ${num(report.crossDomain)} cross-domain · fonte <b>${esc(report.source || 'legacy')}</b></span>
   <small>${num(report.unresolvedEvidence.length)} evidências não resolvidas</small></div>
  <ol class="ladder">${report.ladder.map(stageBlock).join('')}</ol>
  <div id="learning-lineage" class="lineage-box" hidden></div>
  <h4 class="learning-sub">Aprendizado emergente</h4>
  <p class="micro">Cada balde é uma observação sobre os contadores da fonte; um registro pode aparecer em mais de um. Não há score sintético.</p>
  ${report.emergent.map(bucketBlock).join('')}
  ${report.unresolvedEvidence.length ? `<h4 class="learning-sub">Evidências não resolvidas</h4>${report.unresolvedEvidence.slice(0, 8).map(u =>
   `<div class="audit-item"><code>${esc(u.relationType)}</code><small>referência ausente: ${esc(u.missing)}</small></div>`).join('')}` : ''}`;
 if (api) $$('[data-lineage]').forEach(b => b.onclick = () => showLineage(api, b.dataset.lineage));
}

export async function loadLearning(api) {
 const host = $('#learning-panel');
 if (host) host.innerHTML = '<p class="micro">Lendo learning…</p>';
 try {
  renderLearning(await api.learning(), {api});
 } catch {
  if (host) host.innerHTML = '<p class="micro">Learning indisponível no momento. Nenhum padrão foi inferido.</p>';
 }
}
