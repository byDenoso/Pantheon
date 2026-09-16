import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { cockpitCopy, nodeDisplayLabel } from '../ui/cockpit-copy.mjs';
import { FreshnessBadge, ProvenanceDrawer, ScientificStatusBadge } from './components/atlas-ui';
import { CommandEntry } from './components/CommandEntry';
import { useAtlasRoute, routeFor, preserveGraphMode, normalizeGraphHydrationId, type AtlasArea } from './atlas-route';
import type { Provenance } from './api/types';
import { useAtlasSession, type AtlasActions, type AtlasUiState } from './state/useAtlasSession';
import { GraphsPage } from './pages/graphs-page';
import { CockpitPage } from './pages/CockpitPage';
import { AtividadePage } from './pages/AtividadePage';
import { LoginPage } from './pages/LoginPage';
import { PrivateGate } from './components/PrivateGate';
import { ActivityDrawer } from './components/shell/ActivityDrawer';
import { WorkspacePreferencesDrawer } from './components/WorkspacePreferencesDrawer';
import { DEFAULT_WORKSPACE_PREFERENCES, readWorkspacePreferences, writeWorkspacePreferences, type WorkspacePreferences } from './state/workspace-preferences';
import { isActiveNavItem } from './state/nav-active';
import type { AtlasNode } from './scene/types';
import { createAtlasSemanticCore } from './webmcp/atlas-semantic-core.mjs';
import { registerAtlasWebMcp } from './webmcp/atlas-webmcp.mjs';

const SYSTEMS = [
  ['system:NEXO', '◈', 'Visão do sistema'],
  ['system:SCIENCE', '✧', 'Ciência'],
  ['system:ENGINEERING', '◇', 'Engenharia'],
  ['system:OLYMPUS', '△', 'Olympus'],
  ['system:OPERATIONS', '▣', 'Operação'],
  ['system:LEARNING', '✦', 'Aprendizado']
] as const;

// Primary navigation contains the durable work surfaces. Atividade remains
// reachable from the notification button, but is not a separate top-level product
// area competing with Cockpit's operational timeline.
const NAVIGATION: Array<{ area: AtlasArea; label: string; icon: string; private?: boolean }> = [
  { area: 'cockpit', label: 'COCKPIT', icon: '◈' },
  { area: 'graphs', label: 'GRAFOS', icon: '✧' },
  { area: 'observatory', label: 'OBSERVATÓRIO', icon: '◔' },
  { area: 'lab', label: 'LABORATÓRIO', icon: '◇', private: true },
  { area: 'universe', label: 'RESUMO DO UNIVERSO', icon: '▤' }
];

const PAGE_TITLES: Record<AtlasArea, string> = {
  landing: 'NEXO Atlas',
  login: 'Acesso — NEXO Atlas',
  cockpit: 'Cockpit — NEXO Atlas',
  graphs: 'Grafos — NEXO Atlas',
  observatory: 'Observatório — NEXO Atlas',
  lab: 'Laboratório — NEXO Atlas',
  universe: 'Resumo do Universo — NEXO Atlas',
  atividade: 'Atividade — NEXO Atlas'
};

const ObservatoryPage = lazy(() => import('./pages/atlas-pages').then(module => ({ default: module.ObservatoryPage })));
const LaboratoryPage = lazy(() => import('./pages/atlas-pages').then(module => ({ default: module.LaboratoryPage })));
const UniversePage = lazy(() => import('./pages/atlas-pages').then(module => ({ default: module.UniversePage })));

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function displayNode(node: AtlasNode) { return String(nodeDisplayLabel(node, 32) || node.label || node.id); }

function headerFreshness(state: AtlasUiState) {
  const raw = state.health?.dataSource?.freshness?.toUpperCase();
  const freshness = raw === 'LIVE' ? 'LIVE' : raw === 'SNAPSHOT' ? 'SNAPSHOT' : raw === 'STALE' || raw === 'FALLBACK' ? 'STALE' : 'DEGRADED';
  return {
    state: freshness as 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED',
    source: state.health?.dataSource?.effective || state.health?.dataSource?.source,
    sourceVersion: state.health?.dataSource?.sourceVersion || state.health?.sourceVersion
  };
}

function Inspector({ state, actions, onProvenance, onNavigate }: { state: AtlasUiState; actions: AtlasActions; onProvenance: (title: string, items: Provenance[]) => void; onNavigate: (area: AtlasArea) => void }) {
  if (!state.selectedId) return null;
  const selected = state.selectedEntity?.entity || { id: state.selectedId, label: state.selectedId };
  const copy = cockpitCopy(selected);
  const refs = state.selectedEntity?.provenance || [];
  const related = state.selectedEntity?.relations || [];
  return <aside id="inspector" aria-label="Detalhes da entidade" className="atlas-inspector"><div className="inspector-sheet-handle" aria-hidden="true"/><div className="inspector-top"><span className="eyebrow">INSPETOR DA ENTIDADE</span><button className="icon-button" onClick={actions.clearSelection} aria-label="Fechar detalhes">×</button></div><div className="inspector-body"><div className="inspector-heading"><div><h2>{displayNode(selected)}</h2><p className="canonical-id">{state.selectedId}</p></div><ScientificStatusBadge status={selected.status || 'UNKNOWN'}/></div><div className="inspector-triad"><article><small>O QUÊ</small><p>{copy.what}</p></article><article><small>COMO</small><p>{copy.how}</p></article><article><small>POR QUÊ</small><p>{copy.why}</p></article></div><dl><dt>Tipo</dt><dd>{String(selected.type || '—')}</dd><dt>Status</dt><dd>{String(selected.status || '—')}</dd><dt>Autoridade</dt><dd>{String(selected.authority || 'DERIVED_NOT_EVIDENCE')}</dd></dl><div className="inspector-links"><button onClick={() => onNavigate('graphs')}>Abrir no grafo →</button><button onClick={() => onNavigate('lab')}>Investigar no laboratório →</button></div><button className="source-button" onClick={() => onProvenance(`Proveniência · ${displayNode(selected)}`, refs)}>ⓘ Ver provenance</button>{related.length > 0 && <div className="related-links"><span className="eyebrow">RELAÇÕES DECLARADAS</span>{related.slice(0, 8).map(edge => { const id = edge.source === state.selectedId ? edge.target : edge.source; return <button key={edge.id || id} onClick={() => actions.select({ id })}>{id}<small>{edge.type || 'RELATES_TO'}</small></button>; })}</div>}<details className="technical-details"><summary>Metadados técnicos</summary><pre>{JSON.stringify(selected, null, 2).slice(0, 5000)}</pre></details></div></aside>;
}

export default function App() {
  const { route, navigate } = useAtlasRoute();
  const { api, state, actions } = useAtlasSession();
  const [query, setQuery] = useState(route.context.query || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ title: string; items: Provenance[] } | null>(null);
  const [controlOpen, setControlOpen] = useState(false);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>(() => readWorkspacePreferences());
  const compact = useMedia('(max-width: 760px)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const appliedContext = useRef('');
  const hydratedGraphRoute = useRef('');
  const stateRef = useRef(state);
  const routeRef = useRef(route);
  stateRef.current = state;
  routeRef.current = route;
  const freshness = useMemo(() => headerFreshness(state), [state]);
  const graph = state.graph;
  const domains = useMemo(() => graph?.nodes.filter(node => String(node.type || '').toUpperCase() === 'DOMAIN').slice(0, 12) || [], [graph]);
  const webMcpActions = useMemo(() => ({
    select: actions.select,
    open: actions.open,
    focusSystem: actions.focusSystem,
    search: actions.search,
    sync: actions.sync
  }), [actions.select, actions.open, actions.focusSystem, actions.search, actions.sync]);
  const webMcpCore = useMemo(() => createAtlasSemanticCore({
    getState: () => stateRef.current,
    actions: webMcpActions,
    getRoute: () => routeRef.current,
    getCapabilities: () => ({ towerWriteConfigured: false })
  }), [webMcpActions]);

  useEffect(() => {
    let disposed = false;
    let registration: { dispose: () => void } | null = null;
    void registerAtlasWebMcp({ documentLike: document, core: webMcpCore }).then(handle => {
      if (disposed) handle.dispose();
      else registration = handle;
    }).catch(error => console.warn('[atlas:webmcp-registration]', error));
    return () => {
      disposed = true;
      registration?.dispose();
    };
  }, [webMcpCore, route.area, state.selectedId]);

  useEffect(() => {
    document.body.classList.add('atlas-react-body');
    return () => { document.body.classList.remove('atlas-react-body'); };
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLES[route.area] || 'NEXO Atlas';
  }, [route.area]);

  useEffect(() => {
    if (route.context.graphPath?.length) return;
    const contextKey = `${route.area}:${route.context.domain || ''}`;
    if (appliedContext.current === contextKey) return;
    appliedContext.current = contextKey;
    if (route.context.domain && state.focusId !== `domain:${route.context.domain}`) {
      const domain = { id: `domain:${route.context.domain}`, type: 'DOMAIN', label: route.context.domain } as AtlasNode;
      if (state.focusId === 'system:NEXO') void actions.focusSystem('system:SCIENCE', 'Ciência').then(() => actions.open(domain));
      else void actions.open(domain);
    }
  }, [actions, route.area, route.context.domain, state.focusId]);

  useEffect(() => {
    if (route.area !== 'graphs' || hydratedGraphRoute.current === route.path) return;
    const segments = route.context.graphPath || (route.context.domain ? ['science', route.context.domain.toLowerCase()] : []);
    if (!segments.length) return;
    hydratedGraphRoute.current = route.path;
    void (async () => {
      for (const [index, segment] of segments.entries()) {
        const raw = segment.includes(':') ? segment : index === 0 && segment.toLowerCase() === 'science' ? 'system:SCIENCE' : `domain:${segment}`;
        const id = normalizeGraphHydrationId(raw);
        await actions.focusSystem(id, segment);
      }
    })();
  }, [actions, route.area, route.context.domain, route.context.graphPath, route.path]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('#global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => { setQuery(route.context.query || ''); }, [route.context.query]);

  useEffect(() => {
    if (route.path !== '/' || workspacePreferences.startArea === 'graphs') return;
    navigate(routeFor(workspacePreferences.startArea, route.context));
  }, [navigate, route.context, route.path, workspacePreferences.startArea]);

  useEffect(() => {
    if (route.area !== 'graphs' || state.loading || state.path.length < 2) return;
    const graphPath = state.path.slice(1).map(item => item.id);
    const desired = preserveGraphMode(routeFor('graphs', { ...route.context, graphPath }), window.location.search);
    const current = `${window.location.pathname}${window.location.search}`;
    if (desired !== current) window.history.replaceState({}, '', desired);
  }, [route.area, route.context, state.loading, state.path]);

  // No Google OAuth client is configured anywhere in this deployment (checked, not
  // assumed -- see src/core/auth.ts). There is no code path here that can produce a
  // real session, so this stays null rather than a fake signed-in stand-in.
  const session = null;
  const go = (area: AtlasArea) => { setSidebarOpen(false); if (area === 'graphs') void actions.home(); navigate(routeFor(area, route.context)); };
  const runSearch = () => {
    const value = query.trim();
    navigate(routeFor('graphs', { ...route.context, query: value || undefined }));
    if (value) void actions.search(value); else void actions.clearFilters();
  };

  if (route.area === 'login') return <LoginPage/>;

  const updateWorkspacePreferences = (patch: Partial<WorkspacePreferences>) => {
    const next = { ...workspacePreferences, ...patch };
    setWorkspacePreferences(next);
    try { writeWorkspacePreferences(localStorage, next); } catch { /* local preferences are best effort */ }
  };

  const visibleNavigation = NAVIGATION.filter(item => item.area !== 'cockpit' || workspacePreferences.showOperations).filter(item => !['observatory', 'universe'].includes(item.area) || workspacePreferences.showResearch);
  const visibleSystems = SYSTEMS.filter(([id]) => id !== 'system:OPERATIONS' || workspacePreferences.showOperations).filter(([id]) => id !== 'system:LEARNING' || workspacePreferences.showLearning);

  return <div className="atlas-app premium-shell"><header className="atlas-topbar"><button className="menu-button" onClick={() => setSidebarOpen(value => !value)} aria-label="Abrir menu">☰</button><a className="atlas-brand" href={routeFor('graphs', route.context)} onClick={event => { event.preventDefault(); navigate(routeFor('graphs', route.context)); }}><span className="brand-orbit" aria-hidden="true">✧</span><span><b>NEXO <em>Atlas</em></b><small>MAPEANDO O UNIVERSO EM DADOS</small></span></a><div className="top-actions"><CommandEntry value={query} onChange={setQuery} onSubmit={runSearch}/><button className="sync-button" onClick={() => void actions.sync()} disabled={state.syncing} aria-label="Sincronizar dados">↻ <span>{state.syncing ? 'Lendo…' : 'Sincronizar'}</span></button><FreshnessBadge freshness={freshness}/><button className="notifications-button" onClick={() => go('atividade')} aria-label="Abrir Atividade">🔔</button><button className="profile-button" onClick={() => setControlOpen(true)} aria-label="Abrir preferências do workspace">OPS</button></div></header><div className="atlas-body">{sidebarOpen && <button type="button" className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}/>}<aside className={`atlas-sidebar ${sidebarOpen ? 'open' : ''}`}><div className="sidebar-heading"><span className="eyebrow">ATLAS</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">×</button></div><nav className="sidebar-primary-nav" aria-label="Navegação principal">{visibleNavigation.map(item => <a key={item.area} className={isActiveNavItem(route.area, item.area) ? 'active' : ''} href={routeFor(item.area, route.context)} onClick={event => { event.preventDefault(); go(item.area); }}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.private && <small aria-hidden="true">🔒</small>}</a>)}</nav><div className="sidebar-divider"/><span className="eyebrow">NAVEGAÇÃO DO GRAFO</span>{visibleSystems.map(([id, icon, label]) => <button key={id} className={`graph-nav-item ${route.area === 'graphs' && state.focusId === id ? 'active' : ''}`} onClick={() => { navigate(routeFor('graphs')); void actions.focusSystem(id, label); setSidebarOpen(false); }}>{icon}<span>{label}</span></button>)}<div className="sidebar-divider"/><span className="eyebrow">DOMÍNIOS VISÍVEIS</span><div className="domain-nav">{domains.map(node => <button key={node.id} className="graph-nav-item" onClick={() => { const domain = String(node.domain || node.id.replace('domain:', '')); navigate(routeFor('graphs', { ...route.context, domain })); void actions.open(node); setSidebarOpen(false); }}>◎<span>{displayNode(node)}</span></button>)}</div><div className="sidebar-foot"><span className="tiny-orbit" aria-hidden="true">◎</span><b>Estado rastreável</b><p>Tower é canônica.<br/>Atlas opera via NEXO e WebMCP.</p><small>React · R3F · WebGPU</small></div></aside><main id="atlas-main" className="atlas-main">{route.area === 'graphs' && <GraphsPage state={state} actions={actions} reducedMotion={reducedMotion} compact={compact}/>} {route.area !== 'graphs' && <Suspense fallback={<div className="page-wrap panel-empty"><p>Carregando projeção…</p></div>}>{route.area === 'observatory' && <ObservatoryPage api={api} state={state} actions={actions} context={route.context} reducedMotion={reducedMotion} compact={compact} navigate={navigate} onProvenance={(title, items) => setDrawer({ title, items })}/>} {route.area === 'lab' && <PrivateGate session={session} area="Laboratório" onGoToLogin={() => go('login')}><LaboratoryPage api={api} state={state} actions={actions} context={route.context} reducedMotion={reducedMotion} compact={compact} navigate={navigate} onProvenance={(title, items) => setDrawer({ title, items })}/></PrivateGate>} {route.area === 'universe' && <UniversePage api={api} state={state} actions={actions} context={route.context} reducedMotion={reducedMotion} compact={compact} navigate={navigate} onProvenance={(title, items) => setDrawer({ title, items })}/>}</Suspense>}{route.area === 'cockpit' && <CockpitPage api={api} navigate={navigate}/>}{route.area === 'atividade' && <PrivateGate session={session} area="Atividade" onGoToLogin={() => go('login')}><AtividadePage/></PrivateGate>}{route.area !== 'graphs' && <footer className="atlas-footer"><b>NEXO Atlas</b><span>Observatório para uma ciência mais conectada.</span><span className="footer-spacer"/><FreshnessBadge freshness={freshness}/><span>API configurável</span><span>v4.1</span></footer>}<ActivityDrawer api={api}/></main></div>{route.area !== 'graphs' && <Inspector state={state} actions={actions} onProvenance={(title, items) => setDrawer({ title, items })} onNavigate={go}/>}<ProvenanceDrawer open={Boolean(drawer)} title={drawer?.title} items={drawer?.items || []} onClose={() => setDrawer(null)} onNavigate={ref => { if (ref.url) window.open(ref.url, '_blank', 'noopener,noreferrer'); }} /><WorkspacePreferencesDrawer open={controlOpen} preferences={workspacePreferences} onChange={updateWorkspacePreferences} onReset={() => updateWorkspacePreferences(DEFAULT_WORKSPACE_PREFERENCES)} onClose={() => setControlOpen(false)} /></div>;
}