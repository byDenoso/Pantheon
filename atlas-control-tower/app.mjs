/** Bootstrap and orchestration only.
 *  Data access lives in lib/atlas-api.mjs, navigation state in lib/graph-session.mjs,
 *  rendering in ui/*, and agent tools in webmcp/tools.mjs. */
import {installTheme} from './ui/theme.mjs';
import {MAP_CONFIG} from './ui/visual-config.mjs';
import {Graph3D, colors} from './graph3d.mjs';
import {state, safeUrl} from './lib/model.mjs';
import {createApi} from './lib/atlas-api.mjs';
import {createSession} from './lib/graph-session.mjs';
import {$, $$, esc, num, toast} from './ui/dom.mjs';
import {renderMetrics, renderSourceStatus, renderCharts, renderDomainNav} from './ui/metrics.mjs';
import {createInspector, closeDrawer} from './ui/inspector.mjs';
import {installFilters, syncFilterInputs, resetFilterInputs} from './ui/filters.mjs';
import {loadAudit} from './ui/audit-view.mjs';
import {renderProvenance, renderFallbackNotice} from './ui/provenance.mjs';
import {renderData} from './ui/data-view.mjs';
import {loadLearning} from './ui/learning-view.mjs';
import {registerWebMcp} from './webmcp/tools.mjs';

const api = createApi();
let storedFilters = {};
try {storedFilters = JSON.parse(localStorage.getItem('atlas.filters') || '{}')} catch {}
const session = createSession(api, {
 limit: MAP_CONFIG.maxNodes,
 depth: Number($('#layers')?.value) || 3,
 onPersist: filters => {try {localStorage.setItem('atlas.filters', JSON.stringify(filters))} catch {}}
});
session.restoreFilters(storedFilters);

const graph = new Graph3D($('#graph'), {
 select: n => selectNode(n.id),
 open: n => session.focusNode(n),
 edge: e => inspector.inspectEdge(e)
});
installTheme($('#theme-toggle'), theme => {graph.theme = theme; graph.draw()});

const inspector = createInspector({
 api, colors, state, safeUrl,
 onFocus: n => session.focusNode(n),
 onLineage: n => {session.state.focus = n.id; session.setMode('lineage')},
 onRelated: id => selectNode(id)
});

function selectNode(id) {
 session.select(id);
 graph.selected = id;
 graph.draw();
 inspector.inspect(id, {ui: session.state.ui});
}

/* ---------- rendering ---------- */

const MODE_LABEL = {neighbors:'VIZINHANÇA', ancestors:'ANCESTRAIS', descendants:'DESCENDENTES', critical:'BLOCKERS', lineage:'LINHAGEM', search:'BUSCA'};
function modeChip() {
 const chip = $('#mode-chip'), mode = session.state.mode;
 const label = MODE_LABEL[mode];
 chip.hidden = !label;
 if (!label) return;
 chip.textContent = label + ' ✕';
 chip.title = 'Voltar à expansão por camadas';
 chip.onclick = () => session.setMode('children');
}

function breadcrumbs() {
 $('#breadcrumbs').innerHTML = session.state.path
  .map((p, i) => `${i ? '<span>/</span>' : ''}<button data-crumb="${i}">${esc(String(p.label).slice(0, 40))}</button>`).join('');
 $$('[data-crumb]').forEach(b => b.onclick = () => session.focusNode(session.state.path[+b.dataset.crumb]));
 $$('[data-focus]').forEach(b => b.classList.toggle('active', b.dataset.focus === session.state.focus));
}

function renderList(nodes) {
 $('#entities').innerHTML = nodes.map(n =>
  `<button class="entity-item" data-entity="${esc(n.id)}"><span>${esc(n.label)}<small>${esc(n.type)}${n.domain ? ' · ' + esc(n.domain) : ''}</small></span>`
  + `<span class="status-chip" style="--chip:${colors[state(n.status)]}">${esc(n.status ? state(n.status) : 'ver')}</span></button>`).join('');
 $$('[data-entity]').forEach(b => {
  b.onclick = () => selectNode(b.dataset.entity);
  b.ondblclick = () => session.focusNode(nodes.find(n => n.id === b.dataset.entity));
 });
}

function applyFilter(patch) {
 Object.assign(session.state.filters, patch);
 syncFilterInputs(session.state.filters);
 session.setFilters(patch);
}

session.on((event, payload) => {
 if (event === 'loading') $('#graph-count').textContent = 'Lendo recorte…';
 if (event === 'error') {
  $('#graph-count').textContent = 'Leitura indisponível';
  toast('Não foi possível atualizar este recorte. A visualização anterior foi preservada.');
 }
 if (event === 'focus') {closeDrawer(); inspector.invalidate(); resetFilterInputs(); $('#sidebar').classList.remove('open')}
 if (event === 'syncing') {
  $('#sync').disabled = payload.on;
  $('#sync span').textContent = payload.on ? 'Lendo fontes…' : 'Sincronizar';
 }
 if (event !== 'graph') return;

 const {graph: g, summary} = payload;
 graph.set(g, session.state.focus);
 $('#empty').hidden = g.nodes.length > 1 || (g.nodes.length === 1 && session.state.mode === 'search');
 $('#graph-count').textContent = `${num(g.nodes.length)} NÓS · ${num(g.edges.length)} RELAÇÕES${g.truncated ? ' · RECORTE' : ''}`;
 $('#graph-count').title = g.truncated
  ? 'Pré-visualização limitada. Abra um nó ou use 1 camada para os filhos paginados.'
  : 'Recorte completo para esta seleção.';
 $('#more').hidden = !g.hasMore;
 $('#list-count').textContent = `${num(g.total)} NO RECORTE`;
 renderMetrics(summary, {onMetric: type => {syncFilterInputs({...session.state.filters, type}); applyFilter({type})}});
 renderSourceStatus(summary);
 renderCharts(summary, colors, {
  onDomain: domain => applyFilter({domain}),
  onStatus: status => applyFilter({status, type: 'CLAIM'}),
  onDate: since => applyFilter({since}),
  onAudit: () => setMode('audit')
 });
 renderList(g.nodes);
 renderData(g, {onEntity: id => selectNode(id)});
 renderProvenance({...api.provenance, sourceVersion: g.sourceVersion || api.provenance.sourceVersion}, {onClick: () => setMode('audit')});
 renderFallbackNotice(g.issues);
 breadcrumbs();
 modeChip();
 $('#selection-hint').textContent = 'Selecione um nó para ver fontes e relações.';
 renderDomainNav(api, node => session.focusNode(node));
});

/* ---------- workspace modes ---------- */

function setMode(mode) {
 session.setUi(mode);
 document.body.dataset.mode = mode;
 $$('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
 $('#audit-section').hidden = mode !== 'audit';
 $('#learning-section-panel').hidden = mode !== 'learning';
 $('#data-section').hidden = mode !== 'explore';
 if (mode === 'explore' && session.state.graph) renderData(session.state.graph, {onEntity: id => selectNode(id)});
 if (mode === 'audit') loadAudit(api, {onEntity: id => selectNode(id)});
 if (mode === 'learning') loadLearning(api);
 if (session.state.selected) inspector.inspect(session.state.selected, {ui: mode});
}
$$('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* ---------- map controls ---------- */

let orbitFrame = 0, orbitTime = 0, orbitEnabled = false;
function animateOrbit(t) {
 if (!orbitEnabled || document.hidden) return;
 const dt = orbitTime ? Math.min(50, t - orbitTime) : 0;
 orbitTime = t;
 if (!graph.pointers.size) {graph.camera.yaw += dt * MAP_CONFIG.orbitSpeed; graph.draw()}
 orbitFrame = requestAnimationFrame(animateOrbit);
}
function stopOrbit() {
 orbitEnabled = false;
 cancelAnimationFrame(orbitFrame);
 $('#motion').setAttribute('aria-pressed', 'false');
 $('#motion').textContent = '▷';
 $('#motion').title = 'Ativar órbita automática';
}
$('#motion').onclick = () => {
 if (orbitEnabled) return stopOrbit();
 orbitEnabled = true; orbitTime = 0;
 $('#motion').setAttribute('aria-pressed', 'true');
 $('#motion').textContent = 'Ⅱ';
 $('#motion').title = 'Pausar órbita automática';
 orbitFrame = requestAnimationFrame(animateOrbit);
};
document.addEventListener('visibilitychange', () => {
 cancelAnimationFrame(orbitFrame);
 if (!document.hidden && orbitEnabled) {orbitTime = 0; orbitFrame = requestAnimationFrame(animateOrbit)}
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {if (e.matches) stopOrbit()});

function immersive(on) {
 document.body.classList.toggle('immersive', on);
 $('#immersive').setAttribute('aria-pressed', String(on));
 $('#immersive').innerHTML = on ? '⤡ <span>Sair da imersão</span>' : '⤢ <span>Imersão</span>';
 requestAnimationFrame(() => graph.draw());
}
$('#immersive').onclick = () => immersive(!document.body.classList.contains('immersive'));

$('#layers').onchange = e => session.setDepth(e.target.value);
$('#menu').onclick = () => $('#sidebar').classList.toggle('open');
$('#sync').onclick = () => runSync();
$('#close-inspector').onclick = () => {closeDrawer(); session.deselect()};
$('#home').onclick = () => session.home();
$('#back').onclick = () => session.back();
$('#fit').onclick = () => graph.reset();
$('#center').onclick = () => graph.center();
$('#zoom-in').onclick = () => graph.zoom(1.2);
$('#zoom-out').onclick = () => graph.zoom(.8);
$('#dimension').onclick = () => {
 stopOrbit();
 graph.camera.flat = !graph.camera.flat;
 graph.camera.yaw = graph.camera.flat ? 0 : .2;
 graph.camera.pitch = graph.camera.flat ? 0 : -.2;
 $('#dimension-label').textContent = graph.camera.flat ? 'VISTA PLANA' : 'PERSPECTIVA 3D';
 $('#dimension').textContent = graph.camera.flat ? 'Voltar ao 3D' : 'Vista plana';
 graph.draw();
};
$('#more').onclick = () => session.more();
for (const mode of ['neighbors', 'ancestors', 'descendants', 'critical'])
 $('#' + mode).onclick = () => {session.state.focus = session.state.selected || session.state.focus; session.setMode(mode)};
$$('[data-focus]').forEach(b => b.onclick = () => session.focusNode({id: b.dataset.focus, label: b.textContent.trim()}));

installFilters(session);

document.addEventListener('keydown', e => {
 if ((e.metaKey || e.ctrlKey) && e.key === 'k') {e.preventDefault(); $('#search').focus()}
 if (e.key === 'Escape') {immersive(false); closeDrawer()}
});

/* ---------- sync ---------- */

async function runSync() {
 const result = await session.sync();
 if (!result) return toast('Sincronização indisponível. Último recorte preservado.');
 const warning = result.sources?.drive?.error === 'GOOGLE_AUTH_NOT_CONFIGURED'
  ? ' Drive: acesso do aplicativo não configurado; snapshot preservado.' : '';
 toast((result.changes ? `${result.changes} entidades alteradas.` : 'Nenhuma alteração nos dados lidos.') + warning);
}
// Automatic synchronization is deliberately sparse: once every 12 hours while the app
// remains open. Opening/re-focusing the tab only refreshes the current projection; it does
// not trigger a source sync. The toolbar button remains the explicit immediate sync path.
const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
setInterval(() => {if (!document.hidden) runSync()}, AUTO_SYNC_INTERVAL_MS);

/* ---------- start ---------- */

syncFilterInputs(session.state.filters);
await session.refresh();
registerWebMcp({
 api, session,
 actions: {focus: n => session.focusNode(n), compare: n => inspector.compare(n), sync: runSync},
 onStatus: text => {$('#mcp').textContent = text}
}).catch(() => {$('#mcp').textContent = 'WebMCP indisponível'});
