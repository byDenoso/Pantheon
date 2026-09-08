/** The layer console: which projections are on screen, at what semantic zoom,
 *  and how much of what is drawn the Atlas computed rather than read.
 *
 *  Three toggles, not a dropdown: composing layers is the primary gesture of
 *  this map, and a gesture you use constantly should not be hidden one click
 *  deep. Turning the last layer off is refused — an empty console would leave
 *  the operator with no way back except reloading. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);

export const LAYER_META = Object.freeze({
 science: {label: 'Ciência', glyph: '✧', hint: 'O que sabemos e o que testamos.'},
 execution: {label: 'Execução', glyph: '⌘', hint: 'O que rodou e o que travou.'},
 integrity: {label: 'Integridade', glyph: '◈', hint: 'De onde a verdade vem.'}
});

export const ZOOM_META = Object.freeze([
 {value: 1, label: 'Macro', hint: 'Domínios, campanhas e truth owners.'},
 {value: 2, label: 'Meso', hint: 'Hipóteses, claims, testes, tarefas e execuções.'},
 {value: 3, label: 'Micro', hint: 'Evidências, resultados, artefatos e linhagem.'}
]);

/** Signals are told apart by an icon and a word as well as by colour, so the
 *  map stays legible without colour vision and in a monochrome screenshot. */
export const SIGNAL_META = Object.freeze({
 supported: {label: 'Sustentado', glyph: '●', tone: 'supported'},
 partial:   {label: 'Parcial',    glyph: '◐', tone: 'partial'},
 negative:  {label: 'Negativo',   glyph: '▼', tone: 'negative'},
 blocked:   {label: 'Bloqueado',  glyph: '■', tone: 'blocked'},
 active:    {label: 'Ativo',      glyph: '◆', tone: 'active'},
 legacy:    {label: 'Legado',     glyph: '◇', tone: 'legacy'},
 unknown:   {label: 'Sem estado', glyph: '?', tone: 'unknown'}
});

/** Reads the console's model out of a projection. Never invents a number: a
 *  count the backend did not publish is absent, not zero. */
export function consoleModel({projection, layers = [], zoom = 3, syncing = false} = {}) {
 const meta = projection?.metadata || {};
 const integrity = projection?.integrity || {};
 const counts = meta.counts || {};
 // Signals are counted only over rows that carry a status. A dataset or a
 // runtime has no status column, so listing it as "sem estado" would invent a
 // gap that does not exist in the source.
 const signals = {};
 let statusless = 0;
 for (const n of projection?.nodes || []) {
  if (n.statusDeclared === false) {statusless += 1; continue}
  signals[n.signal] = (signals[n.signal] || 0) + 1;
 }

 return {
  layers: Object.keys(LAYER_META).map(id => ({
   id, ...LAYER_META[id],
   active: layers.includes(id),
   state: meta.layerStates?.[id] || (layers.includes(id) ? projection?.state : null)
  })),
  zoom: Number(zoom) || 3,
  syncing,
  drawn: meta.drawnNodes ?? projection?.nodes?.length ?? 0,
  edges: meta.edgeCount ?? projection?.edges?.length ?? 0,
  bridges: meta.bridgeCount ?? (projection?.bridges?.length || 0),
  hiddenByView: meta.hiddenByView ?? null,
  truncated: !!meta.truncated,
  // A tier can be empty for two very different reasons: the source has no rows
  // for it, or the current zoom and filters exclude the rows it does have. The
  // spine says which, so an operator never reads "hidden" as "missing".
  tiers: (projection?.tiers || []).map(t => {
   const drawn = counts[t] || 0;
   const declared = meta.tiers?.[t]?.declared ?? null;
   return {
    id: t, count: drawn, declared,
    empty: drawn === 0 && (declared === 0 || declared == null),
    hidden: drawn === 0 && declared > 0
   };
  }),
  signals: Object.entries(SIGNAL_META)
   .map(([id, m]) => ({id, ...m, count: signals[id] || 0}))
   .filter(s => s.count > 0),
  integrity: {
   canonical: integrity.canonicalNodes ?? null,
   derived: integrity.derivedNodes ?? null,
   ratio: integrity.derivedRatio ?? null,
   unlinked: integrity.unlinkedNodes ?? null,
   unknownSignal: integrity.unknownSignal ?? null,
   statusless: integrity.statuslessNodes ?? statusless,
   derivations: integrity.derivations || []
  },
  sourceVersion: projection?.sourceState?.sourceVersion || '',
  freshness: projection?.sourceState?.freshness || 'UNKNOWN',
  generatedAt: projection?.generatedAt || ''
 };
}

export function renderLayerConsole(root, model, handlers = {}) {
 if (!root) return;
 const {layers, zoom, drawn, edges, bridges, truncated, tiers, signals, integrity, freshness, hiddenByView} = model;

 const derivedShare = integrity.ratio == null ? null : Math.round(integrity.ratio * 100);

 root.innerHTML = `
 <div class="lc-row lc-layers" role="group" aria-label="Camadas da projeção">
  ${layers.map(l => `
   <button type="button" class="lc-layer${l.active ? ' is-on' : ''}" data-layer="${esc(l.id)}"
     aria-pressed="${l.active}" title="${esc(l.hint)}">
    <span class="lc-glyph" aria-hidden="true">${esc(l.glyph)}</span>
    <span class="lc-label">${esc(l.label)}</span>
    ${l.active && l.state && l.state !== 'OK' ? `<span class="lc-flag" title="${esc(l.state)}">!</span>` : ''}
   </button>`).join('')}
 </div>

 <div class="lc-row lc-zoom" role="group" aria-label="Zoom semântico">
  <span class="lc-caption">ZOOM SEMÂNTICO</span>
  ${ZOOM_META.map(z => `
   <button type="button" class="lc-zoom-step${zoom === z.value ? ' is-on' : ''}" data-zoom="${z.value}"
     aria-pressed="${zoom === z.value}" title="${esc(z.hint)}">${esc(z.label)}</button>`).join('')}
 </div>

 <div class="lc-row lc-readout">
  <span><b>${num(drawn)}</b> nós</span>
  <span><b>${num(edges)}</b> relações</span>
  ${bridges ? `<span class="lc-bridge"><b>${num(bridges)}</b> travessias</span>` : ''}
  ${truncated ? '<span class="lc-truncated" title="O recorte foi limitado para manter a leitura fluida. O total declarado continua no metadata.">recorte limitado</span>' : ''}
  ${hiddenByView ? `<span class="lc-hidden">${num(hiddenByView)} fora do recorte</span>` : ''}
  <span class="lc-fresh" data-freshness="${esc(freshness)}">${esc(freshness)}</span>
 </div>

 ${tiers.length ? `<div class="lc-row lc-tiers" aria-label="Espinha da camada">
  ${tiers.map((t, i) => `<button type="button" class="lc-tier${t.hidden ? ' is-hidden' : t.empty ? ' is-empty' : ''}" data-tier="${esc(t.id)}"
    title="${t.count
     ? `${num(t.count)} nós desenhados neste degrau${t.declared && t.declared > t.count ? ` de ${num(t.declared)} declarados` : ''}.`
     : t.hidden
      ? `${num(t.declared)} registros existem neste degrau, mas o zoom semântico ou o filtro atual os exclui.`
      : 'Nenhum registro neste degrau — estado real da fonte, não falha de leitura.'}">
    <i style="--tier-step:${i}"></i><span>${esc(t.id.replaceAll('_', ' '))}</span><em>${t.hidden ? `⌕${num(t.declared)}` : num(t.count)}</em>
   </button>`).join('')}
 </div>` : ''}

 ${signals.length ? `<div class="lc-row lc-signals" aria-label="Sinais">
  ${signals.map(s => `<button type="button" class="lc-signal" data-signal="${esc(s.id)}" data-tone="${esc(s.tone)}"
    title="Filtrar por ${esc(s.label.toLowerCase())}"><i aria-hidden="true">${esc(s.glyph)}</i>${esc(s.label)} <em>${num(s.count)}</em></button>`).join('')}
 </div>` : ''}

 <div class="lc-row lc-integrity" title="Quanto desta imagem o Atlas leu e quanto ele calculou.">
  <span class="lc-caption">INTEGRIDADE</span>
  ${integrity.canonical == null ? '<span class="lc-unknown">não publicada</span>' : `
   <span class="lc-bar" role="img" aria-label="${derivedShare}% derivado">
    <i style="width:${100 - derivedShare}%"></i>
   </span>
   <span><b>${num(integrity.canonical)}</b> lidos</span>
   <span><b>${num(integrity.derived)}</b> derivados (${derivedShare}%)</span>
   ${integrity.unlinked ? `<span class="lc-warn" title="Registros reais que a base não liga a nenhum outro. Ausência declarada, não inferida.">${num(integrity.unlinked)} sem relação declarada</span>` : ''}
   ${integrity.unknownSignal ? `<span class="lc-warn" title="Linhas que deveriam declarar um estado e não declaram.">${num(integrity.unknownSignal)} sem estado</span>` : ''}
   ${integrity.statusless ? `<span class="lc-note" title="Degraus cujas tabelas não têm coluna de estado. Não é lacuna de leitura.">${num(integrity.statusless)} sem conceito de estado</span>` : ''}`}
 </div>`;

 for (const button of root.querySelectorAll('[data-layer]')) {
  button.onclick = () => handlers.onLayer?.(button.dataset.layer);
 }
 for (const button of root.querySelectorAll('[data-zoom]')) {
  button.onclick = () => handlers.onZoom?.(Number(button.dataset.zoom));
 }
 for (const button of root.querySelectorAll('[data-tier]')) {
  button.onclick = () => handlers.onTier?.(button.dataset.tier);
 }
 for (const button of root.querySelectorAll('[data-signal]')) {
  button.onclick = () => handlers.onSignal?.(button.dataset.signal);
 }
}

/** Toggling a layer. Refuses to leave the console with nothing selected, and
 *  keeps the declared order so the Z bands do not swap under the operator. */
export function toggleLayer(current = [], id, order = Object.keys(LAYER_META)) {
 if (!order.includes(id)) return current;
 const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
 if (!next.length) return current;
 return order.filter(x => next.includes(x));
}
