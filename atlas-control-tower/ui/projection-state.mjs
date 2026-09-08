/** Empty and degraded states for a projection.
 *
 *  "There is nothing", "you filtered it all out", "the source is down" and "you
 *  are not allowed to read this" are four different answers. Collapsing them
 *  into one blank canvas is how a broken read gets mistaken for a healthy empty
 *  system, so each one gets its own title, explanation, tone and next action.
 *
 *  Presentation only — no reads, no guessing. The state always arrives from the
 *  backend, and one state is never substituted for another. */

/** Mirrors lib/projections.mjs so the browser does not have to download the
 *  whole server-side builder for seven strings. A test asserts the two lists
 *  stay identical, so drift fails the build instead of the UI. */
export const PROJECTION_STATE = Object.freeze({
 OK: 'OK',
 NO_DATA: 'NO_DATA',
 FILTER_EMPTY: 'FILTER_EMPTY',
 BACKEND_ERROR: 'BACKEND_ERROR',
 SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
 SYNCING: 'SYNCING',
 GRAPH_BUILDING: 'GRAPH_BUILDING',
 PERMISSION_ERROR: 'PERMISSION_ERROR'
});

/** `tone` drives colour AND an icon plus a written label, so the difference is
 *  never carried by hue alone. */
export const STATE_COPY = Object.freeze({
 [PROJECTION_STATE.OK]: {
  tone: 'ok', icon: '◉', badge: 'ATIVO',
  title: 'Projeção ativa',
  detail: 'A leitura chegou completa.',
  action: null
 },
 [PROJECTION_STATE.NO_DATA]: {
  tone: 'neutral', icon: '○', badge: 'SEM REGISTROS',
  title: 'Esta camada não tem registros',
  detail: 'A leitura funcionou. As tabelas desta camada estão vazias — não há nada para desenhar, e isso é um estado real, não uma falha.',
  action: {label: 'Ver outra camada', kind: 'switch-layer'}
 },
 [PROJECTION_STATE.FILTER_EMPTY]: {
  tone: 'neutral', icon: '⌕', badge: 'RECORTE VAZIO',
  title: 'Existem dados, mas este recorte não alcança nenhum',
  detail: 'A camada tem registros. O zoom semântico ou os filtros ativos excluíram todos eles.',
  action: {label: 'Limpar recorte', kind: 'clear-view'}
 },
 [PROJECTION_STATE.BACKEND_ERROR]: {
  tone: 'error', icon: '✕', badge: 'ERRO',
  title: 'A projeção não pôde ser montada',
  detail: 'As linhas foram lidas, mas a montagem do grafo falhou. Nada foi inventado para preencher a tela.',
  action: {label: 'Tentar novamente', kind: 'retry'}
 },
 [PROJECTION_STATE.SOURCE_UNAVAILABLE]: {
  tone: 'error', icon: '⚠', badge: 'FONTE INDISPONÍVEL',
  title: 'Um truth owner não respondeu',
  detail: 'A tabela de origem não pôde ser lida. O Atlas não substitui uma fonte ausente pela projeção anterior nem por zeros.',
  action: {label: 'Tentar novamente', kind: 'retry'}
 },
 [PROJECTION_STATE.SYNCING]: {
  tone: 'busy', icon: '↻', badge: 'SINCRONIZANDO',
  title: 'Releitura das fontes em andamento',
  detail: 'Uma sincronização está em curso. O que aparecer depois disto é o estado novo, não o anterior.',
  action: null
 },
 [PROJECTION_STATE.GRAPH_BUILDING]: {
  tone: 'busy', icon: '◐', badge: 'MONTANDO',
  title: 'Montando a projeção',
  detail: 'As linhas já foram lidas; o grafo está sendo assemblado.',
  action: null
 },
 [PROJECTION_STATE.PERMISSION_ERROR]: {
  tone: 'error', icon: '⊘', badge: 'SEM PERMISSÃO',
  title: 'Leitura recusada',
  detail: 'O transporte não tem autorização para ler esta fonte. Isto é um problema de credencial, não de dados.',
  action: {label: 'Ver diagnóstico', kind: 'diagnostics'}
 }
});

/** Resolves the state to show, without ever inventing one.
 *  A composition that is partially degraded stays OK and reports the degraded
 *  layers separately: hiding a working layer because a sibling failed would lose
 *  real information. */
export function resolveState(projection, {syncing = false} = {}) {
 if (syncing) return {state: PROJECTION_STATE.SYNCING, ...STATE_COPY[PROJECTION_STATE.SYNCING], degraded: []};
 if (!projection) return {state: PROJECTION_STATE.GRAPH_BUILDING, ...STATE_COPY[PROJECTION_STATE.GRAPH_BUILDING], degraded: []};
 const state = STATE_COPY[projection.state] ? projection.state : PROJECTION_STATE.BACKEND_ERROR;
 const degraded = (projection.degraded || []).filter(d => d?.layer);
 return {
  state,
  ...STATE_COPY[state],
  degraded,
  errors: projection.errors || [],
  layerStates: projection.metadata?.layerStates || {}
 };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Renders the resolved state. Returns '' when there is nothing to say, so the
 *  caller can keep the map visible instead of covering it with a banner. */
export function renderState(resolved, {compact = false} = {}) {
 if (!resolved) return '';
 const {state, tone, icon, badge, title, detail, action, degraded = [], errors = []} = resolved;
 const isOk = state === PROJECTION_STATE.OK;
 if (isOk && !degraded.length) return '';

 const reason = errors.length
  ? `<ul class="ps-reasons">${errors.map(e =>
     `<li><b>${esc(e.layer)}</b> · ${esc(e.kind || e.state || '')}${e.table ? ` · <code>${esc(e.table)}</code>` : ''}${e.status ? ` · HTTP ${esc(e.status)}` : ''}</li>`).join('')}</ul>`
  : '';
 const partial = !isOk || !degraded.length ? '' :
  `<p class="ps-degraded">Camadas degradadas nesta composição: ${degraded.map(d => `<b>${esc(d.layer)}</b> (${esc(d.state)})`).join(', ')}. As demais continuam sendo desenhadas.</p>`;

 if (isOk) return `<div class="projection-state is-warn" data-tone="warn" role="status"><span class="ps-icon" aria-hidden="true">⚠</span><div><p class="ps-badge">PARCIAL</p>${partial}</div></div>`;

 return `<div class="projection-state is-${esc(tone)}${compact ? ' is-compact' : ''}" data-tone="${esc(tone)}" data-state="${esc(state)}" role="status">
  <span class="ps-icon" aria-hidden="true">${esc(icon)}</span>
  <div class="ps-body">
   <p class="ps-badge">${esc(badge)}</p>
   <h3>${esc(title)}</h3>
   <p class="ps-detail">${esc(detail)}</p>
   ${reason}${partial}
   ${action ? `<button type="button" class="ps-action" data-action="${esc(action.kind)}">${esc(action.label)}</button>` : ''}
  </div>
 </div>`;
}

/** Wires the state's single action back to the host. */
export function bindState(root, handlers = {}) {
 if (!root?.querySelector) return;
 const button = root.querySelector('.ps-action');
 if (!button) return;
 const kind = button.dataset.action;
 if (handlers[kind]) button.onclick = () => handlers[kind]();
}
