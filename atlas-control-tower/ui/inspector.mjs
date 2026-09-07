/** Entity, edge and comparison inspector, plus the Learning overlay.
 *  The overlay only shows learning records that cite the entity in their own
 *  `evidence_refs`; it never reclassifies the entity as a learning record. */
import {$, $$, esc, num, toast, confidenceLabel} from './dom.mjs';

let seq = 0;

export function openDrawer() {$('#inspector').hidden = false; $('#close-inspector').focus()}
export function closeDrawer() {$('#inspector').hidden = true; $('#graph')?.focus()}

const sourceBlock = (n, safeUrl) =>
 `<div class="detail-section"><h3>FONTES</h3>${(n.sourceRefs || []).map(r =>
  `<p class="micro">${esc(r.sourceRef || r.source || '')}<br>${safeUrl(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">Abrir fonte ↗</a>` : ''}</p>`).join('')
  || '<p class="micro">Estrutura de navegação derivada.</p>'}${safeUrl(n.url) ? `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">Abrir fonte ↗</a>` : ''}</div>`;

export function relationRow(r) {
 const scope = r.crossDomain ? `<em class="cross">cross-domain ${esc(r.domainA)} ↔ ${esc(r.domainB)}</em>` : esc(r.scope || 'mesmo domínio');
 return `<div class="learning-row"><b>${esc(r.relationType)}</b><span class="status-chip learning-chip">${esc(r.status || 'sem estado')}</span>
  <p class="micro">${esc(r.nodeA)} → ${esc(r.nodeB)}</p>
  <p class="micro">${scope} · ${esc(confidenceLabel(r.confidence))} · evidência ${num(r.evidenceCount ?? r.support)} / contradição ${num(r.contradictionCount ?? r.contradiction)}</p>
  ${r.notes ? `<p class="micro">${esc(String(r.notes).slice(0, 220))}</p>` : ''}</div>`;
}

async function renderLearningOverlay(api, id) {
 const box = $('#learning-overlay');
 if (!box) return;
 box.innerHTML = '<p class="micro">Lendo aprendizado relacionado…</p>';
 try {
  const {relations} = await api.learningFor(id);
  box.innerHTML = relations.length
   ? relations.map(relationRow).join('')
   : '<p class="micro">Nenhum aprendizado cita esta entidade em evidence_refs. Vínculo ausente na fonte, não inferido aqui.</p>';
 } catch {
  box.innerHTML = '<p class="micro">Aprendizado indisponível no momento.</p>';
 }
}

export function createInspector({api, colors, state, safeUrl, onFocus, onLineage, onRelated}) {
 let pinned = null;

 function compare(n) {
  if (!pinned) {pinned = n; toast('Primeira entidade fixada. Selecione outra e clique em Comparar.'); return}
  const a = pinned; pinned = null;
  $('#detail').innerHTML = `<h2 class="detail-title">Comparação</h2><div class="compare">${[a, n].map(x =>
   `<div><h4>${esc(x.label)}</h4><p>${esc(x.type)}</p><p>${esc(x.status)}</p><p>${esc(x.authority)}</p><p>${esc(x.summary)}</p><p>${esc(x.updatedAt || 'Sem data')}</p></div>`).join('')}</div>`;
 }

 function inspectEdge(e) {
  openDrawer();
  $('#detail').innerHTML = `<p class="eyebrow" style="margin-top:20px">RELAÇÃO</p><h2 class="detail-title">${esc(e.type)}</h2>`
   + `<p class="authority">${esc(e.authority)}</p><p class="detail-summary">${esc(e.source)}<br>↓<br>${esc(e.target)}</p>`
   + `<p class="detail-summary">${esc(e.reason || 'Relação registrada ou agrupamento explícito de navegação.')}</p>`
   + `${e.confidence != null ? `<p>${esc(confidenceLabel(e.confidence))}</p>` : ''}<button id="edge-target">Abrir destino</button>`;
  $('#edge-target').onclick = () => inspect(e.target);
 }

 async function inspect(id, {ui = 'overview'} = {}) {
  const mine = ++seq;
  $('#selection-hint').textContent = id;
  openDrawer();
  $('#detail').innerHTML = '<p class="detail-summary">Lendo entidade…</p>';
  try {
   // The inspector is intentionally independent from file/provenance lookups.
   // Structural nodes (Learning / Black Box) are valid entities even when they
   // have no FILE relation, so an auxiliary lookup must never make the drawer fail.
   const d = await api.entity(id);
   if (mine !== seq) return;
   const n = d.entity, shown = n.metadata || {};
   if (!n) throw Error('ENTITY_PAYLOAD_MISSING');
   $('#detail').innerHTML =
    `<p class="eyebrow" style="margin-top:20px">${esc(n.subtype || n.type)}</p><h2 class="detail-title">${esc(n.label)}</h2>`
    + `<span class="status-chip" style="--chip:${colors[state(n.status)]}">${esc(n.status || 'Estado não informado')}</span>`
    + `<p class="authority">${esc(n.authority)}</p>`
    + `<p class="canonical"><label>ID canônico</label><code>${esc(n.canonicalId || String(n.id).replace(/^[a-z_]+:/, ''))}</code>`
      + `${n.displaySource && n.displaySource !== 'CANONICAL_ID' ? `<small>rótulo: ${esc(n.displaySource)}</small>` : ''}`
      + `${n.canonicalTitle && n.canonicalTitle !== n.label ? `<small>título de origem: ${esc(n.canonicalTitle)}</small>` : ''}</p>`
    + `<p class="detail-summary">${esc(n.summary || 'Sem resumo adicional registrado na fonte.')}</p>`
    + `<div class="detail-actions"><button id="open-node">Explorar →</button><button id="lineage-node">Linhagem</button><button id="learning-node">Aprendizado relacionado</button><button id="compare-node">Comparar</button><button id="copy-node">Copiar ID</button></div>`
    + sourceBlock(n, safeUrl)
    + `<div class="detail-section" id="learning-section" hidden><h3>APRENDIZADO RELACIONADO</h3><div id="learning-overlay"></div></div>`
    + `<div class="detail-section"><h3>RELAÇÕES · ${d.relationCount || 0}</h3>${(d.relations || []).slice(0, 30).map(e =>
      `<button class="relation" data-related="${esc(e.source === id ? e.target : e.source)}">${esc((e.source === id ? e.target : e.source).slice(0, 85))}<small>${esc(e.type)} · ${esc(e.authority)}</small></button>`).join('')
      || '<p class="micro">Nenhuma relação explícita resolvida.</p>'}</div>`
    + `<div class="detail-section"><h3>REGISTRO DA FONTE</h3>${Object.entries(shown).filter(([k, v]) => v && k !== '_row').slice(0, 30).map(([k, v]) =>
      `<div class="metadata-item"><label>${esc(k)}</label><p>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</p></div>`).join('')}</div>`
    + (ui === 'audit' ? `<div class="detail-section"><h3>AUDIT JSON</h3><pre>${esc(JSON.stringify(d, null, 2))}</pre></div>` : '');

   $('#open-node').onclick = () => onFocus(n);
   $('#lineage-node').onclick = () => onLineage(n);
   $('#compare-node').onclick = () => compare(n);
   $('#copy-node').onclick = () => navigator.clipboard.writeText(n.canonicalId || id).then(() => toast('ID copiado.')).catch(() => toast(id));
   $('#learning-node').onclick = () => {$('#learning-section').hidden = false; renderLearningOverlay(api, id)};
   $$('[data-related]').forEach(b => b.onclick = () => onRelated(b.dataset.related));
  } catch (e) {
   if (mine === seq) $('#detail').innerHTML = `<p class="detail-summary">Não foi possível abrir esta entidade${e?.message ? ` · ${esc(e.message)}` : ''}.</p>`;
  }
 }

 return {inspect, inspectEdge, compare, invalidate: () => {++seq}};
}
