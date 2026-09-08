/** Bootstrap and orchestration only.
 *  Data access lives in lib/atlas-api.mjs, navigation state in lib/graph-session.mjs,
 *  rendering in ui/*, and agent tools in webmcp/tools.mjs. */
import {installTheme} from './ui/theme.mjs';
import {MAP_CONFIG} from './ui/visual-config.mjs';
import {nodeDisplayLabel} from './ui/cockpit-copy.mjs';
import {Graph3D, colors} from './graph3d.mjs';
import {state, safeUrl} from './lib/model.mjs';
import {createApi} from './lib/atlas-api.mjs';
import {createSession} from './lib/graph-session.mjs';
import {$, $$, esc, num, toast} from './ui/dom.mjs';
import {renderMetrics, renderSourceStatus, renderCharts, renderDomainNav} from './ui/metrics.mjs';
import {createInspector, closeDrawer} from './ui/inspector.mjs';
import {installFilters, syncFilterInputs, resetFilterInputs} from './ui/filters.mjs';
import {renderProvenance, renderFallbackNotice} from './ui/provenance.mjs';
import {renderRecortePanel} from './ui/recorte-view.mjs';
import {buildLearningGraph} from './ui/learning-graph.mjs';
import {renderBlackBox} from './ui/blackbox-view.mjs';
import {buildControlTowerModel, renderControlTower} from './ui/control-tower.mjs';
import {applyWorkspaceMode} from './ui/workspace.mjs';
import {consoleModel, renderLayerConsole, toggleLayer, LAYER_META} from './ui/layer-console.mjs';
import {resolveState, renderState, bindState, PROJECTION_STATE} from './ui/projection-state.mjs';
import {createPalette} from './ui/command-palette.mjs';
import {registerWebMcp} from './webmcp/tools.mjs';

const api = createApi();
let storedFilters = {};
try {storedFilters = JSON.parse(localStorage.getItem('atlas.filters') || '{}')} catch {}
const session = createSession(api, {
 limit: MAP_CONFIG.maxNodes,
 depth: Number($('#layers')?.value) || 1,
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
 onRelated: id => selectNode(id),
 // Projection tiers (derived claims, truth owners, ingestion runs, artefacts)
 // have no row in science_v1.entities. They are read back out of the projection
 // payload the backend already sent, with their edges, never re-invented.
 resolve: id => {
  const node = projection?.nodes?.find(n => n.id === id);
  if (!node) return null;
  const relations = (projection.edges || []).filter(e => e.source === id || e.target === id);
  return {entity: node, relations: relations.slice(0, 200), relationCount: relations.length, source: 'projection'};
 }
});

function selectNode(id) {
 session.select(id);
 graph.selected = id;
 graph.draw();
 inspector.inspect(id, {ui: session.state.ui});
}

/* ---------- decision-first command center ---------- */

const COMMAND_SEEN_KEY='atlas.commandCenterSeenAt';
const commandNow=new Date().toISOString();
let commandLastSeen=null;
try {commandLastSeen=localStorage.getItem(COMMAND_SEEN_KEY)||null} catch {}
const commandSources={health:null,ops:null,learning:null};
let commandMarked=false;
const SYSTEM_LABEL={
 'system:NEXO':'NEXO','system:SCIENCE':'Ciência','system:AUTOMATION':'Black Box','system:LEARNING':'Learning','system:ENGINEERING':'Engineering','system:OLYMPUS':'Olympus'
};

function focusSystem(id){
 session.focusNode({id,label:SYSTEM_LABEL[id]||String(id).split(':').at(-1)||id});
}
function openMap(){
 const target=$('#map-workspace');if(!target)return;
 const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
 target.scrollIntoView({behavior,block:'start'});
 try{target.focus({preventScroll:true})}catch{target.focus()}
}
function renderCommandCenter(summary=session.state.summary){
 const model=buildControlTowerModel({...commandSources,summary,lastSeenAt:commandLastSeen,now:commandNow});
 renderControlTower($('#command-center'),model,{onFocus:focusSystem,onMap:openMap});
}
function markCommandSeen(){
 if(commandMarked)return;commandMarked=true;
 try{localStorage.setItem(COMMAND_SEEN_KEY,commandNow)}catch{}
}
function settleCommandSource(key,promise){
 promise.then(value=>{commandSources[key]=value;markCommandSeen()}).catch(()=>{commandSources[key]=null}).finally(()=>renderCommandCenter());
}
function startCommandCenter(){
 renderCommandCenter();
 settleCommandSource('health',api.health());
 settleCommandSource('ops',api.ops());
 settleCommandSource('learning',api.learning());
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
  .map((p, i) => `${i ? '<span>/</span>' : ''}<button data-crumb="${i}" title="${esc(p.label || '')}">${esc(nodeDisplayLabel(p, 32))}</button>`).join('');
 $$('[data-crumb]').forEach(b => b.onclick = () => session.focusNode(session.state.path[+b.dataset.crumb]));
 $$('.nav').forEach(b => b.classList.toggle('active', b.dataset.focus === session.state.focus));
}

function applyFilter(patch) {
 Object.assign(session.state.filters, patch);
 syncFilterInputs(session.state.filters);
 session.setFilters(patch);
}

function focusDomain(domain) {
 session.focusNode({id:`domain:${domain}`, label:domain});
}

/* The Learning system draws its declared web on the map itself: the ladder, the
   domains records name, the resolved lineage links and the declared bridges.
   The report is read once and cached, so focusing Learning is not a round trip. */
const LEARNING_FOCUS = 'system:LEARNING';
let learningGraph = null, learningPending = null, presentedGraph = null;
function ensureLearningGraph() {
 if (learningGraph || learningPending) return learningPending;
 learningPending = api.learning()
  .then(report => {learningGraph = buildLearningGraph(report); return learningGraph})
  .catch(() => null)
  .finally(() => {learningPending = null});
 return learningPending;
}
/** Replaces the six-node stage list with the declared relation web, keeping the
 *  contract fields the map reads. Falls back to the API graph when unavailable. */
function learningView(g) {
 if (!learningGraph?.nodes?.length) return g;
 return {...g, nodes: learningGraph.nodes, edges: learningGraph.edges,
  total: learningGraph.nodes.length, hasMore: false, truncated: false};
}

function renderGraphView(rawGraph){
 const isLearning = session.state.focus === LEARNING_FOCUS;
 const g = isLearning ? learningView(rawGraph) : rawGraph;
 presentedGraph = g;
 // In projection mode the canvas belongs to the layered projection; the declared
 // systems map still owns it whenever the operator drills into one from the rail,
 // so neither way of reading the graph is taken away.
 if (mapMode === 'explorer') graph.set(g, session.state.focus);
 if (isLearning && !learningGraph) ensureLearningGraph().then(built => {
  if (built?.nodes?.length && session.state.focus === LEARNING_FOCUS) session.refresh();
 });
 // The undifferentiated banner belongs to the explorer only. A projection says
 // *why* it is empty, and that answer must never be overwritten by "no matches".
 $('#empty').hidden = mapMode === 'projection' || g.nodes.length > 1 || (g.nodes.length === 1 && session.state.mode === 'search');
 const drawn = graph.data.nodes.length, declared = graph.data.visualTotal ?? g.total ?? g.nodes.length;
 const bounded = drawn < declared || g.truncated;
 $('#graph-count').textContent = bounded
  ? `${num(drawn)} DE ${num(declared)} NÓS · ${num(graph.data.edges.length)} RELAÇÕES · RECORTE`
  : `${num(drawn)} NÓS · ${num(graph.data.edges.length)} RELAÇÕES`;
 $('#graph-count').title = bounded
  ? `O mapa desenha ${num(drawn)} de ${num(declared)} entidades declaradas para manter a leitura. Use "Mais entidades" para ampliar o recorte.`
  : 'Recorte completo para esta seleção.';
 $('#more').hidden = !(g.hasMore || bounded);
 renderRecortePanel(g, session.state.summary, {onEntity: id => selectNode(id)});
 renderBlackBox(api, g, session.state.summary).catch(() => {});
 renderProvenance({...api.provenance, sourceVersion: g.sourceVersion || api.provenance.sourceVersion});
 renderFallbackNotice(g.issues);
 breadcrumbs();
 modeChip();
 $('#selection-hint').textContent = session.state.focus === 'system:AUTOMATION'
  ? 'Black Box: execução, aprendizado e integridade operacional.'
  : 'Selecione um nó para ver fontes e relações.';
 renderDomainNav(api, node => session.focusNode(node));
}

function renderSummaryView(summary){
 if(!summary)return;
 // In projection mode the header belongs to the projection; the summary only
 // fills it in when the declared-systems explorer owns the map.
 if(mapMode!=='projection'){
  const heroSystems=$('#hero-systems'),heroTests=$('#hero-tests'),heroClaims=$('#hero-claims'),heroDomains=$('#hero-domains');
  if(heroSystems)heroSystems.textContent=String(Object.keys(SYSTEM_LABEL).length-1);
  if(heroTests)heroTests.textContent=num(summary.counts?.TEST||0);
  if(heroClaims)heroClaims.textContent=num(summary.counts?.CLAIM||0);
  if(heroDomains)heroDomains.textContent=num(Object.keys(summary.domains||{}).length);
 }
 renderMetrics(summary, {onMetric: type => {syncFilterInputs({...session.state.filters, type}); applyFilter({type})}});
 renderSourceStatus(summary);
 renderCharts(summary, colors, {
  onDomain: domain => focusDomain(domain),
  onStatus: status => applyFilter({status, type: 'CLAIM'}),
  onDate: since => applyFilter({since})
 });
 const count=$('#list-count');if(count&&presentedGraph)count.textContent=`${num(summary.total??presentedGraph.nodes?.length??0)} NO RECORTE`;
 renderProvenance(api.provenance);
 renderCommandCenter(summary);
}

session.on((event, payload) => {
 if (event === 'loading') $('#graph-count').textContent = 'Lendo recorte…';
 if (event === 'graph-error') {
  $('#graph-count').textContent = 'Leitura indisponível';
  toast('Não foi possível atualizar o mapa. A visualização anterior foi preservada.');
 }
 if (event === 'summary-error') {
  $('#source-status').textContent = 'Resumo indisponível · mapa preservado';
  renderCommandCenter(session.state.summary);
 }
 if (event === 'focus') {closeDrawer(); inspector.invalidate(); resetFilterInputs(); $('#sidebar').classList.remove('open')}
 if (event === 'syncing') {
  $('#sync').disabled = payload.on;
  $('#sync span').textContent = payload.on ? 'Lendo fontes…' : 'Sincronizar';
 }
 if(event==='graph')renderGraphView(payload.graph);
 if(event==='summary')renderSummaryView(payload.summary);
});

/* ---------- layered projection: the map itself ---------- */

/* The canvas has two readings and neither replaces the other.
   `projection` is the layered command centre — one to three real backend
   projections composed with genuine depth. `explorer` is the declared-systems
   drill-down that already existed; the rail still opens it, so nothing that
   used to work stopped working. */
const VIEW_KEY = 'atlas.projectionView';
const DEFAULT_VIEW = {layers: ['science'], zoom: 2, tier: '', signal: '', q: ''};
let mapMode = 'projection';
let projection = null;
let projectionSeq = 0;
let projectionLoading = false;
let view = {...DEFAULT_VIEW};
try {
 const stored = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
 if (Array.isArray(stored.layers) && stored.layers.every(l => l in LAYER_META) && stored.layers.length)
  view = {...view, ...stored, layers: stored.layers};
} catch {}
const persistView = () => {try {localStorage.setItem(VIEW_KEY, JSON.stringify(view))} catch {}};

function paintProjectionState(resolved){
 const host = $('#projection-state');
 if (!host) return;
 host.innerHTML = renderState(resolved);
 bindState(host, {
  'switch-layer': () => palette?.open(),
  'clear-view': () => setView({tier: '', signal: '', q: '', zoom: 3}),
  retry: () => loadProjection({refresh: true}),
  diagnostics: () => toast('Leitura recusada pelo transporte OIDC → Neon Data API. As credenciais do deployment precisam ser revistas; nenhum dado foi substituído.')
 });
}

function renderProjectionView(){
 if (!projection) return;
 const omitted = graph.setProjection(projection, {focus: session.state.selected || ''});
 graph.selected = session.state.selected || null;
 renderLayerConsole($('#layer-console'), consoleModel({
  projection, layers: view.layers, zoom: view.zoom, syncing: session.state.syncing
 }), {
  onLayer: id => setView({layers: toggleLayer(view.layers, id)}),
  onZoom: zoom => setView({zoom}),
  onTier: tier => setView({tier: view.tier === tier ? '' : tier}),
  onSignal: signal => setView({signal: view.signal === signal ? '' : signal})
 });
 paintProjectionState(resolveState(projection, {syncing: session.state.syncing}));
 const drawn = projection.nodes?.length || 0;
 $('#graph-count').textContent = omitted?.nodes
  ? `${num(drawn - omitted.nodes)} DE ${num(drawn)} NÓS DESENHADOS · ${num(projection.edges?.length || 0)} RELAÇÕES`
  : `${num(drawn)} NÓS · ${num(projection.edges?.length || 0)} RELAÇÕES`;
 $('#graph-count').title = omitted?.nodes
  ? `O orçamento de desenho manteve ${num(drawn - omitted.nodes)} corpos para preservar a fluidez. Os demais continuam na projeção e voltam ao aproximar o zoom semântico.`
  : 'Projeção completa para este recorte.';
 $('#more').hidden = true;
 // The header counts describe the projection on screen, read from its own tier
 // counts. A tier the current recorte excludes shows as such rather than as 0.
 const counts = projection.metadata?.counts || {};
 const tierTotal = tier => counts[tier] ?? (projection.metadata?.tiers?.[tier]?.declared ?? null);
 const write = (selector, value) => {const el = $(selector); if (el) el.textContent = value == null ? '—' : num(value)};
 write('#hero-systems', drawn);
 write('#hero-tests', tierTotal('TEST'));
 write('#hero-claims', tierTotal('CLAIM'));
 write('#hero-domains', tierTotal('DOMAIN'));
 palette?.refresh();
}

async function loadProjection({refresh = false} = {}){
 const seq = ++projectionSeq;
 projectionLoading = true;
 if (!projection) paintProjectionState(resolveState(null));
 try {
  const payload = await api.projection({
   layers: view.layers.join(','), zoom: view.zoom,
   tier: view.tier, signal: view.signal, q: view.q,
   ...(refresh ? {refresh: 1} : {})
  });
  if (seq !== projectionSeq) return null;
  projection = payload;
  renderProjectionView();
  return payload;
 } catch (error) {
  if (seq !== projectionSeq) return null;
  // The read failed. The previous projection stays on screen and is labelled as
  // such — it is never presented as if it were the current state.
  paintProjectionState({
   state: PROJECTION_STATE.SOURCE_UNAVAILABLE,
   tone: 'error', icon: '⚠', badge: 'LEITURA FALHOU',
   title: 'A projeção não pôde ser lida',
   detail: projection
    ? 'A leitura anterior continua desenhada e está desatualizada. Nada foi recalculado nem preenchido com zeros.'
    : 'Nenhuma projeção foi publicada nesta sessão.',
   action: {label: 'Tentar novamente', kind: 'retry'},
   errors: [{layer: view.layers.join('+'), kind: String(error?.message || error).slice(0, 120)}],
   degraded: []
  });
  return null;
 } finally {
  if (seq === projectionSeq) projectionLoading = false;
 }
}

function setView(patch){
 view = {...view, ...patch};
 persistView();
 if (mapMode !== 'projection') enterProjectionMode();
 return loadProjection();
}

function enterProjectionMode(){
 mapMode = 'projection';
 document.body.dataset.mapMode = 'projection';
 $('#layer-console').hidden = false;
 $('#empty').hidden = true;
}
function enterExplorerMode(){
 mapMode = 'explorer';
 document.body.dataset.mapMode = 'explorer';
 $('#layer-console').hidden = true;
 $('#projection-state').innerHTML = '';
}

/* ---------- command palette ---------- */

const PALETTE_COMMANDS = [
 ...Object.entries(LAYER_META).map(([id, meta]) => ({
  id: `layer:${id}`, title: `Camada · ${meta.label}`, hint: 'alternar', keywords: `camada layer ${id} ${meta.label}`
 })),
 {id: 'zoom:1', title: 'Zoom semântico · Macro', hint: 'domínios', keywords: 'zoom macro domínios campanhas'},
 {id: 'zoom:2', title: 'Zoom semântico · Meso', hint: 'testes', keywords: 'zoom meso hipóteses claims testes'},
 {id: 'zoom:3', title: 'Zoom semântico · Micro', hint: 'evidências', keywords: 'zoom micro evidências resultados linhagem'},
 {id: 'view:clear', title: 'Limpar recorte da projeção', hint: 'filtros', keywords: 'limpar filtros recorte reset'},
 {id: 'map:projection', title: 'Voltar ao mapa em camadas', hint: 'mapa', keywords: 'projeção camadas mapa'},
 {id: 'map:explorer', title: 'Abrir sistemas declarados', hint: 'explorar', keywords: 'sistemas declarados explorar nexo'},
 {id: 'action:sync', title: 'Sincronizar fontes', hint: 'leitura', keywords: 'sync sincronizar fontes neon drive'},
 {id: 'action:refresh', title: 'Reler a projeção agora', hint: 'leitura', keywords: 'atualizar refresh reler projeção'},
 {id: 'action:fit', title: 'Enquadrar o mapa', hint: 'câmera', keywords: 'enquadrar fit câmera reset'},
 {id: 'action:flat', title: 'Alternar 2D / 3D', hint: 'câmera', keywords: 'plana 2d 3d perspectiva dimensão'}
];

const palette = createPalette({
 root: $('#palette'), input: $('#palette-input'), list: $('#palette-list'),
 getNodes: () => projection?.nodes || [],
 commands: PALETTE_COMMANDS,
 onRun: command => {
  const [kind, value] = command.id.split(':');
  if (kind === 'layer') return setView({layers: toggleLayer(view.layers, value)});
  if (kind === 'zoom') return setView({zoom: Number(value)});
  if (command.id === 'view:clear') return setView({tier: '', signal: '', q: ''});
  if (command.id === 'map:projection') {enterProjectionMode(); return loadProjection()}
  if (command.id === 'map:explorer') {enterExplorerMode(); return session.focusNode({id: 'system:NEXO', label: 'NEXO'})}
  if (command.id === 'action:sync') return runSync({manual: true});
  if (command.id === 'action:refresh') return loadProjection({refresh: true});
  if (command.id === 'action:fit') return graph.reset();
  if (command.id === 'action:flat') return $('#dimension').click();
 },
 onSelect: node => selectNode(node.id)
});

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
$('#sync').onclick = () => runSync({manual:true});
$('#close-inspector').onclick = () => {closeDrawer(); session.deselect()};
$('#home').onclick = () => {enterProjectionMode(); loadProjection(); return session.home()};
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
// The rail opens the declared-systems explorer; the layer console owns the
// projection. Both readings stay reachable, and which one is on screen is
// always the result of something the operator just clicked.
$$('[data-focus]').forEach(b => b.onclick = () => {enterExplorerMode(); session.focusNode({id: b.dataset.focus, label: b.textContent.trim()})});
$$('[data-alias-focus]').forEach(b => b.onclick = () => {enterExplorerMode(); session.focusNode({id: b.dataset.aliasFocus, label: b.textContent.trim()})});

installFilters(session);

document.addEventListener('keydown', e => {
 if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {e.preventDefault(); palette.toggle()}
 if (e.key === 'Escape' && !palette.isOpen()) {immersive(false); closeDrawer()}
 // Digits switch layers, 1–3 on the semantic zoom with Shift. Both are the
 // gestures this map is used with constantly, so they get a bare key.
 if (!e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement?.tagName !== 'INPUT') {
  const layerKeys = Object.keys(LAYER_META);
  const index = Number(e.key) - 1;
  if (e.shiftKey && index >= 0 && index < 3) {e.preventDefault(); setView({zoom: index + 1})}
  else if (!e.shiftKey && index >= 0 && index < layerKeys.length) {e.preventDefault(); setView({layers: toggleLayer(view.layers, layerKeys[index])})}
 }
});
$('#search').addEventListener('focus', () => palette.open());

/* ---------- sync ---------- */

const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const AUTO_SYNC_KEY = 'atlas.lastAutoSync';
const lastAutoSync = () => {try{return Number(localStorage.getItem(AUTO_SYNC_KEY)||0)}catch{return 0}};
const markAutoSync = () => {try{localStorage.setItem(AUTO_SYNC_KEY,String(Date.now()))}catch{}};

async function runSync({manual=false}={}) {
 if (mapMode === 'projection') paintProjectionState(resolveState(projection, {syncing: true}));
 const result = await session.sync();
 // A sync changes the source; the projection is re-read from it rather than
 // being kept and relabelled as if it were current.
 if (mapMode === 'projection') await loadProjection({refresh: true});
 if (!result) return toast('Sincronização indisponível. Último recorte preservado.');
 markAutoSync();
 const warning = result.sources?.drive?.error === 'GOOGLE_AUTH_NOT_CONFIGURED'
  ? ' Drive: acesso do aplicativo não configurado; Neon preservado.' : '';
 const prefix = manual ? 'Sincronização manual concluída. ' : 'Sincronização automática concluída. ';
 toast(prefix + (result.changes ? `${result.changes} entidades alteradas.` : 'Nenhuma alteração nos dados lidos.') + warning);
 return result;
}
async function checkAutoSync() {
 if (document.hidden || session.state.syncing) return;
 const last=lastAutoSync();
 if (!last) {markAutoSync(); return}
 if (Date.now()-last >= AUTO_SYNC_INTERVAL_MS) await runSync();
}
setInterval(checkAutoSync, 60 * 1000);
document.addEventListener('visibilitychange', () => {if (!document.hidden) checkAutoSync()});

/* ---------- start ---------- */

applyWorkspaceMode();
syncFilterInputs(session.state.filters);
startCommandCenter();
enterProjectionMode();
// The projection and the summary are read side by side. Neither waits for the
// other, so a slow layer cannot hold the rest of the cockpit hostage.
await Promise.allSettled([loadProjection(), session.refresh()]);
await checkAutoSync();
registerWebMcp({
 api, session,
 actions: {focus: n => session.focusNode(n), compare: n => inspector.compare(n), sync: () => runSync({manual:true})},
 onStatus: text => {const el=$('#mcp');if(el)el.textContent=text}
}).catch(() => {const el=$('#mcp');if(el)el.textContent='WebMCP indisponível'});
