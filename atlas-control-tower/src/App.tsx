import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { cockpitCopy, nodeDisplayLabel } from '../ui/cockpit-copy.mjs';
import { FreshnessBadge, ProvenanceDrawer, ScientificStatusBadge } from './components/atlas-ui';
import { ControlPlaneDrawer } from './components/ControlPlaneDrawer';
import { CommandEntry } from './components/CommandEntry';
import { useAtlasRoute, routeFor, preserveGraphMode, normalizeGraphHydrationId, type AtlasArea } from './atlas-route';
import type { Provenance } from './api/types';
import { useAtlasSession, type AtlasActions, type AtlasUiState } from './state/useAtlasSession';
import { UnifiedObservatoryPage } from './pages/UnifiedObservatoryPage';
import { CockpitPage } from './pages/CockpitPage';
import { AtividadePage } from './pages/AtividadePage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { PrivateGate } from './components/PrivateGate';
import { ActivityDrawer } from './components/shell/ActivityDrawer';
import { isActiveNavItem } from './state/nav-active';
import type { AtlasNode } from './scene/types';

const LaboratoryPage = lazy(() => import('./pages/atlas-pages').then(module => ({ default: module.LaboratoryPage })));

const SYSTEMS = [
  ['system:NEXO', '◈', 'Visão do sistema'],
  ['system:SCIENCE', '✧', 'Ciência'],
  ['system:ENGINEERING', '◇', 'Engenharia'],
  ['system:OLYMPUS', '△', 'Olympus'],
  ['system:OPERATIONS', '▣', 'Operação']
] as const;

// Product navigation is intentionally smaller than the compatibility route model.
// /mapa and the internal graphs/universe areas remain valid deep-link infrastructure,
// while Observatório is the single visible spatial research destination.
const NAVIGATION: Array<{ area: AtlasArea; label: string; icon: string }> = [
  { area: 'cockpit', label: 'COCKPIT', icon: '◈' },
  { area: 'observatory', label: 'OBSERVATÓRIO', icon: '✧' },
  { area: 'lab', label: 'LABORATÓRIO', icon: '◇' },
  { area: 'atividade', label: 'ATIVIDADE', icon: '◔' }
];

const PAGE_TITLES: Record<AtlasArea, string> = {
  landing: 'NEXO Atlas',
  login: 'Acesso — NEXO Atlas',
  cockpit: 'Cockpit — NEXO Atlas',
  graphs: 'Observatório — NEXO Atlas',
  observatory: 'Observatório — NEXO Atlas',
  lab: 'Laboratório — NEXO Atlas',
  universe: 'Observatório · Síntese — NEXO Atlas',
  atividade: 'Atividade — NEXO Atlas'
};

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
  return <aside id="inspector" aria-label="Detalhes da entidade" className="atlas-inspector">
    <div className="inspector-sheet-handle" aria-hidden="true"/>
    <div className="inspector-top"><span className="eyebrow">INSPETOR DA ENTIDADE</span><button className="icon-button" onClick={actions.clearSelection} aria-label="Fechar detalhes">×</button></div>
    <div className="inspector-body">
      <div className="inspector-heading"><div><h2>{displayNode(selected)}</h2><p className="canonical-id">{state.selectedId}</p></div><ScientificStatusBadge status={selected.status || 'UNKNOWN'}/></div>
      <div className="inspector-triad"><article><small>O QUÊ</small><p>{copy.what}</p></article><article><small>COMO</small><p>{copy.how}</p></article><article><small>POR QUÊ</small><p>{copy.why}</p></article></div>
      <dl><dt>Tipo</dt><dd>{String(selected.type || '—')}</dd><dt>Status</dt><dd>{String(selected.status || '—')}</dd><dt>Autoridade</dt><dd>{String(selected.authority || 'DERIVED_NOT_EVIDENCE')}</dd></dl>
      <div className="inspector-links"><button onClick={() => onNavigate('observatory')}>Explorar no Observatório →</button><button onClick={() => onNavigate('lab')}>Investigar no laboratório →</button></div>
      <button className="source-button" onClick={() => onProvenance(`Proveniência · ${displayNode(selected)}`, refs)}>ⓘ Ver provenance</button>
      {related.length > 0 && <div className="related-links"><span className="eyebrow">RELAÇÕES DECLARADAS</span>{related.slice(0, 8).map(edge => { const id = edge.source === state.selectedId ? edge.target : edge.source; return <button key={edge.id || id} onClick={() => actions.select({ id })}>{id}<small>{edge.type || 'RELATES_TO'}</small></button>; })}</div>}
      <details className="technical-details"><summary>Metadados técnicos</summary><pre>{JSON.stringify(selected, null, 2).slice(0, 5000)}</pre></details>
    </div>
  </aside>;
}

export default function App() {
  const { route, navigate } = useAtlasRoute();
  const { api, state, actions } = useAtlasSession();
  const [query, setQuery] = useState(route.context.query || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ title: string; items: Provenance[] } | null>(null);
  const [controlOpen, setControlOpen] = useState(false);
  const compact = useMedia('(max-width: 760px)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const appliedContext = useRef('');
  const hydratedGraphRoute = useRef('');
  const freshness = useMemo(() => headerFreshness(state), [state]);
  const graph = state.graph;
  const domains = useMemo(() => graph?.nodes.filter(node => String(node.type || '').toUpperCase() === 'DOMAIN').slice(0, 12) || [], [graph]);
  const unifiedResearch = route.area === 'graphs' || route.area === 'observatory' || route.area === 'universe';

  useEffect(() => {
    document.body.classList.add('atlas-react-body');
    return () => { document.body.classList.remove('atlas-react-body'); };
  }, []);

  useEffect(() => { document.title = PAGE_TITLES[route.area] || 'NEXO Atlas'; }, [route.area]);

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
  }, [actions, route.area, route.context.domain, route.context.graphPath, state.focusId]);

  // Compatibility hydration remains scoped to /mapa deep links. Normal product use
  // stays on /pesquisa while the scene-history state machine owns drill-down.
  useEffect(() => {
    if (route.area !== 'graphs' || hydratedGraphRoute.current === route.path) return;
    const segments = route.context.graphPath || (route.context.domain ? ['science', route.context.domain.toLowerCase()] : []);
    if (!segments.length) return;
    hydratedGraphRoute.current = route.path;
    void (async () => {
      for (const [index, segment] of segments.entries()) {
        const raw = segment.includes(':') ? segment : index === 0 && segment.toLowerCase() === 'science' ? 'system:SCIENCE' : `domain:${segment}`;
        await actions.focusSystem(normalizeGraphHydrationId(raw), segment);
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
    if (route.area !== 'graphs' || state.loading || state.path.length < 2) return;
    const graphPath = state.path.slice(1).map(item => item.id);
    const desired = preserveGraphMode(routeFor('graphs', { ...route.context, graphPath }), window.location.search);
    const current = `${window.location.pathname}${window.location.search}`;
    if (desired !== current) window.history.replaceState({}, '', desired);
  }, [route.area, route.context, state.loading, state.path]);

  const session = null;
  const go = (area: AtlasArea) => { setSidebarOpen(false); navigate(routeFor(area, route.context)); };
  const goHref = (href: string) => navigate(href);
  const runSearch = () => {
    const value = query.trim();
    navigate(routeFor('observatory', { ...route.context, query: value || undefined }));
    if (value) void actions.search(value); else void actions.clearFilters();
  };

  if (route.area === 'landing') return <LandingPage navigate={goHref}/>;
  if (route.area === 'login') return <LoginPage/>;

  return <div className="atlas-app premium-shell">
    <header className="atlas-topbar">
      <button className="menu-button" onClick={() => setSidebarOpen(value => !value)} aria-label="Abrir menu">☰</button>
      <a className="atlas-brand" href={routeFor('observatory', route.context)} onClick={event => { event.preventDefault(); navigate(routeFor('observatory', route.context)); }}><span className="brand-orbit" aria-hidden="true">✧</span><span><b>NEXO <em>Atlas</em></b><small>REDE VIVA DE CONHECIMENTO</small></span></a>
      <div className="top-actions"><CommandEntry value={query} onChange={setQuery} onSubmit={runSearch}/><button className="sync-button" onClick={() => void actions.sync()} disabled={state.syncing} aria-label="Sincronizar dados">↻ <span>{state.syncing ? 'Lendo…' : 'Sincronizar'}</span></button><FreshnessBadge freshness={freshness}/><button className="notifications-button" onClick={() => go('atividade')} aria-label="Abrir Atividade">🔔</button><button className="profile-button" onClick={() => setControlOpen(true)} aria-label="Abrir controle operacional">OPS</button></div>
    </header>
    <div className="atlas-body">
      {sidebarOpen && <button type="button" className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}/>} 
      <aside className={`atlas-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-heading"><span className="eyebrow">ATLAS</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">×</button></div>
        <nav className="sidebar-primary-nav" aria-label="Navegação principal">{NAVIGATION.map(item => <a key={item.area} className={isActiveNavItem(route.area, item.area) ? 'active' : ''} href={routeFor(item.area, route.context)} onClick={event => { event.preventDefault(); go(item.area); }}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></a>)}</nav>
        <div className="sidebar-divider"/><span className="eyebrow">EXPLORAÇÃO DO OBSERVATÓRIO</span>
        {SYSTEMS.map(([id, icon, label]) => <button key={id} className={`graph-nav-item ${unifiedResearch && state.focusId === id ? 'active' : ''}`} onClick={() => { navigate(routeFor('observatory')); void actions.focusSystem(id, label); setSidebarOpen(false); }}>{icon}<span>{label}</span></button>)}
        <div className="sidebar-divider"/><span className="eyebrow">DOMÍNIOS VISÍVEIS</span>
        <div className="domain-nav">{domains.map(node => <button key={node.id} className="graph-nav-item" onClick={() => { const domain = String(node.domain || node.id.replace('domain:', '')); navigate(routeFor('observatory', { ...route.context, domain })); void actions.open(node); setSidebarOpen(false); }}>◎<span>{displayNode(node)}</span></button>)}</div>
        <div className="sidebar-foot"><span className="tiny-orbit" aria-hidden="true">◎</span><b>Estado rastreável</b><p>Autoridade no backend.<br/>Atlas é projeção somente leitura.</p><small>React · Spatial Canvas</small></div>
      </aside>
      <main id="atlas-main" className="atlas-main">
        {unifiedResearch && <UnifiedObservatoryPage api={api} state={state} actions={actions} context={route.context} reducedMotion={reducedMotion} compact={compact} initialView={route.area === 'universe' ? 'synthesis' : 'structure'}/>} 
        {!unifiedResearch && <Suspense fallback={<div className="page-wrap panel-empty"><p>Carregando projeção…</p></div>}>{route.area === 'lab' && <PrivateGate session={session} area="Laboratório" onGoToLogin={() => go('login')}><LaboratoryPage api={api} state={state} actions={actions} context={route.context} reducedMotion={reducedMotion} compact={compact} navigate={navigate} onProvenance={(title, items) => setDrawer({ title, items })}/></PrivateGate>}</Suspense>}
        {route.area === 'cockpit' && <CockpitPage api={api} navigate={navigate}/>} 
        {route.area === 'atividade' && <PrivateGate session={session} area="Atividade" onGoToLogin={() => go('login')}><AtividadePage/></PrivateGate>}
        {!unifiedResearch && <footer className="atlas-footer"><b>NEXO Atlas</b><span>Observatório para uma ciência mais conectada.</span><span className="footer-spacer"/><FreshnessBadge freshness={freshness}/><span>API configurável</span><span>v4.1</span></footer>}
        <ActivityDrawer api={api}/>
      </main>
    </div>
    {!unifiedResearch && <Inspector state={state} actions={actions} onProvenance={(title, items) => setDrawer({ title, items })} onNavigate={go}/>} 
    <ProvenanceDrawer open={Boolean(drawer)} title={drawer?.title} items={drawer?.items || []} onClose={() => setDrawer(null)} onNavigate={ref => { if (ref.url) window.open(ref.url, '_blank', 'noopener,noreferrer'); }} />
    <ControlPlaneDrawer open={controlOpen} onClose={() => setControlOpen(false)} />
  </div>;
}