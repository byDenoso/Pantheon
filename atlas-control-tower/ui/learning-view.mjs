/** Learning as its own entrance: the Observation → Policy ladder, emergent
 *  movement and declared lineage. Stages with no source in the projection say so
 *  and name the source they still need; nothing is filled in to look complete. */
import {$, $$, esc, num} from './dom.mjs';
import {relationRow} from './inspector.mjs';
import {buildLearningGraph} from './learning-graph.mjs';
import {Graph3D} from '../graph3d.mjs';

/** One renderer at a time: the panel replaces its own markup, so the previous
 *  canvas is detached and its animation loop has to be released. */
let filamentGraph = null;

function mountFilaments(report, theme) {
 const canvas = $('#learning-filaments');
 if (!canvas) return;
 if (filamentGraph) {filamentGraph.stop(); filamentGraph = null}
 const graph = buildLearningGraph(report);
 if (!graph.nodes.length) return;
 filamentGraph = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 filamentGraph.theme = theme;
 // This stage carries none of the map chrome, so the whole canvas is available
 // for labels; and the orbit is pulled in so the ladder has room to be read.
 filamentGraph.reserved = [];
 filamentGraph.set(graph, graph.focus);
 filamentGraph.camera.zoom = 0.72;
 filamentGraph.draw();
}

export function setLearningFilamentTheme(theme) {
 if (!filamentGraph) return;
 filamentGraph.theme = theme;
 filamentGraph.draw();
}

function stageBlock(stage) {
 const body = stage.available
  ? stage.items.slice(0, 6).map(i => `<li><button class="ladder-item" data-lineage="${esc(i.id)}"><b>${esc(i.relationType || i.id)}</b><small>${esc(i.status || 'sem estado')}</small></button></li>`).join('')
  : `<li class="pending">Sem registros na projeção · fonte pendente: <code>${esc(stage.source)}</code></li>`;
 return `<li class="ladder-stage${stage.available ? '' : ' is-pending'}" data-stage="${esc(stage.id)}">
  <div class="ladder-head"><b>${esc(stage.label)}</b><span>${num(stage.count)}</span></div>
  <ul class="ladder-items">${body}</ul></li>`;
}

/** Reading key for the filaments drawn on the map.
 *  The three classes are a reading of relations learning_v1 already declares
 *  (`domains[]`, `domain`, `relation_scope`): they are DERIVED_NOT_EVIDENCE and
 *  no filament is drawn for a connection the source does not state. */
function filamentLegend(crossDomain) {
 return `<div class="filament-legend" aria-label="Legenda de filamentos">
  <b>Filamentos</b>
  <span class="fl fl-intra"><i></i>intra-domínio</span>
  <span class="fl fl-test"><i></i>entre testes</span>
  <span class="fl fl-cross"><i></i>cross-domain${Number.isFinite(crossDomain) ? ` · ${num(crossDomain)}` : ''}</span>
  <small>Relações declaradas na fonte · DERIVED_NOT_EVIDENCE</small>
 </div>`;
}

/** The filament canvas plus an honest account of how thin the declared web is.
 *  Sparse counters are the point: they show where learning_v1 has not yet
 *  published the links, instead of hiding it behind a dense-looking picture. */
function filamentStage(stats) {
 const chip = (value, label, tone = '') =>
  `<span class="lf-stat${tone}"><b>${num(value)}</b>${esc(label)}</span>`;
 return `<section class="learning-filaments" aria-label="Filamentos de aprendizado">
  <div class="lf-head">
   <div><b>Filamentos de aprendizado</b>
    <small>ESCADA · DOMÍNIOS DECLARADOS · LINHAGEM RESOLVIDA · DERIVED_NOT_EVIDENCE</small></div>
   <div class="lf-stats">
    ${chip(stats.lineage, 'linhagens resolvidas')}
    ${chip(stats.crossDomain, 'pontes cross-domain')}
    ${chip(stats.hubs, 'domínios no mapa')}
    ${chip(stats.undeclaredDomain, 'sem domínio declarado', stats.undeclaredDomain ? ' is-gap' : '')}
   </div>
  </div>
  <div class="lf-stage"><canvas id="learning-filaments" tabindex="0"
    aria-label="Mapa de filamentos do Learning"></canvas></div>
  <p class="lf-note">Só é desenhada relação que a fonte declara: a escada do Learning, o domínio que
   cada registro nomeia em <code>domain_a</code>, uma ponte onde o escopo declarado é
   <code>CROSS_DOMAIN</code>, e uma linhagem quando <code>pattern_id</code> resolve para um padrão
   publicado. Semelhança de texto nunca vira relação.</p>
 </section>`;
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

export function renderLearning(report, {api, theme} = {}) {
 const host = $('#learning-panel');
 if (!host) return;
 if (!report) {
  if (filamentGraph) {filamentGraph.stop(); filamentGraph = null}
  host.innerHTML = '<p class="micro">Learning indisponível.</p>';
  return;
 }
 const stats = buildLearningGraph(report).stats;
 host.innerHTML = `<div class="audit-head"><span>${num(report.total)} relações registradas · ${num(report.crossDomain)} cross-domain · fonte <b>${esc(report.source || 'legacy')}</b></span>
   <small>${num(report.unresolvedEvidence.length)} evidências não resolvidas</small></div>
  ${filamentLegend(report.crossDomain)}
  ${filamentStage(stats)}
  <ol class="ladder">${report.ladder.map(stageBlock).join('')}</ol>
  <div id="learning-lineage" class="lineage-box" hidden></div>
  <h4 class="learning-sub">Aprendizado emergente</h4>
  <p class="micro">Cada balde é uma observação sobre os contadores da fonte; um registro pode aparecer em mais de um. Não há score sintético.</p>
  ${report.emergent.map(bucketBlock).join('')}
  ${report.unresolvedEvidence.length ? `<h4 class="learning-sub">Evidências não resolvidas</h4>${report.unresolvedEvidence.slice(0, 8).map(u =>
   `<div class="audit-item"><code>${esc(u.relationType)}</code><small>referência ausente: ${esc(u.missing)}</small></div>`).join('')}` : ''}`;
 if (api) $$('[data-lineage]').forEach(b => b.onclick = () => showLineage(api, b.dataset.lineage));
 mountFilaments(report, theme);
}

export async function loadLearning(api, {theme} = {}) {
 const host = $('#learning-panel');
 if (host) host.innerHTML = '<p class="micro">Lendo learning…</p>';
 try {
  renderLearning(await api.learning(), {api, theme});
 } catch {
  if (filamentGraph) {filamentGraph.stop(); filamentGraph = null}
  if (host) host.innerHTML = '<p class="micro">Learning indisponível no momento. Nenhum padrão foi inferido.</p>';
 }
}
