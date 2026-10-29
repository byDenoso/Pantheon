import {Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import type {SystemState} from '../contracts/system.ts';
import {workspaceLab} from './workspace-lab.ts';
import {testRecordReader} from '../private-legacy/install.ts';
import {normDomain} from '../features/lab/domains.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import {createCosmosCache} from '../tower-web/cosmosCache.ts';
import type {TowerNode} from '../tower-web/model.ts';
import {WORKSPACE_COPY} from './copy.ts';
import {coverageOf, dateParts, navigationDomain, researchHref, testHref, type WorkspaceRoute} from './model.ts';
import './workspace.css';
import './premium-refinements.css';
import {PrivateNav} from '../private-design/PrivateNav.tsx';
const DomainView = lazy(() => import('./Views.tsx').then(module=>({default:module.DomainView})));
const ResearchView = lazy(() => import('./Views.tsx').then(module=>({default:module.ResearchView})));
const OperationView = lazy(() => import('./Views.tsx').then(module=>({default:module.OperationView})));
const MemoryPlaceholder = lazy(() => import('./Views.tsx').then(module=>({default:module.MemoryPlaceholder})));
const OnDemandTestDetail = lazy(() => import('./OnDemandTestDetail.tsx'));
const AgentBoardView = lazy(() => import('./AgentBoardView.tsx'));
const ContinuityView = lazy(() => import('./ContinuityView.tsx'));
const TowerCosmos = lazy(() => import('../tower-web/TowerCosmos.tsx'));
const KnowledgeGraph = lazy(() => import('../knowledge/KnowledgeGraph.tsx'));
const TowerWeb = lazy(() => import('../tower-web/TowerWeb.tsx'));
const nodeHref = (node: TowerNode) => node.kind === 'test' ? testHref(node.id.replace(/^test:/, '')) : node.domain ? researchHref(node.domain) : '#/teia/dominios';
const NAV_PATHS: Record<string, string> = {web:'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6M8 8h8v8H8z',domains:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',research:'M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10',operations:'M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6',board:'M3 3h18v15H9l-6 3V3M7 7h10M7 11h7',memory:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16'};

/** A view that cannot render with the current reading says so and offers the reading again; it never takes the shell down with it. */
class ViewBoundary extends Component<{message: string; retry: string; onRetry?: () => void; children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="pw-page" role="alert"><h1 data-private-heading tabIndex={-1}>{this.props.message}</h1>
      {this.props.onRetry && <button type="button" className="pw-button" onClick={() => { this.setState({failed: false}); this.props.onRetry?.(); }}>{this.props.retry}</button>}</main>;
  }
}

/**
 * Presentation only, behind the existing authenticated Host. No fetch, credentials or persistence of source data.
 * `memory` is the reserved presentation point for the memory view: when the integrator mounts one, it appears in the navigation;
 * without it the route explains that memory is not connected and the navigation does not advertise it.
 */
export default function PrivateWorkspace({state, generatedAt, route, refresh, memory}: {state: SystemState; generatedAt: string; route: WorkspaceRoute; refresh?: () => Promise<void>; memory?: ReactNode}) {
  const lang = useDocumentLang(), m = WORKSPACE_COPY[lang];
  const cosmosCache = useMemo(() => createCosmosCache(), [state]);
  useEffect(() => () => cosmosCache.clear(), [cosmosCache]);
  const lab = useMemo(() => workspaceLab(state), [state]);
  const tests = useMemo(() => [...lab.tests.values()], [lab]);
  const campaignLabel = useMemo(() => (id: string) => lab.campaigns.get(id)?.title ?? null, [lab]);
  const [theme, setTheme] = useState<'light'|'dark'>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [refreshing, setRefreshing] = useState(false), [notice, setNotice] = useState('');
  const flight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Reuse the shell's already-allowed theme preference. Browser storage events cross the same-origin frame boundary.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { let pref: string | null = null; try { pref = localStorage.getItem('atlas.theme'); } catch { /* unavailable storage */ }
      const next = pref === 'light' || pref === 'dark' ? pref : mq.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = next; setTheme(next);
    };
    const changed = (event: StorageEvent) => { if (event.key === 'atlas.theme' || event.key === null) apply(); };
    apply(); window.addEventListener('storage', changed); mq.addEventListener('change', apply);
    return () => { window.removeEventListener('storage', changed); mq.removeEventListener('change', apply); };
  }, []);
  const pageKey = JSON.stringify(route);
  const boundaryKey = route.page === 'research' ? `research:${route.domain ?? 'all'}` : pageKey;
  useEffect(() => {
    document.getElementById('pw-content')?.scrollTo({top: 0});
    if (route.page !== 'web' && route.page !== 'organogram' && route.page !== 'cosmos') document.querySelector<HTMLElement>('[data-private-heading]')?.focus({preventScroll: true});
  }, [pageKey]);
  const requestRefresh = async () => {
    if (!refresh || flight.current) return;
    flight.current = true; setRefreshing(true); setNotice('');
    try { await refresh(); if (mounted.current) setNotice(m.refreshed); } catch { if (mounted.current) setNotice(m.refreshError); }
    finally { flight.current = false; if (mounted.current) setRefreshing(false); }
  };
  const active = route.page === 'organogram' || route.page === 'cosmos' ? 'web' : route.page === 'test' ? 'research' : route.page;
  const coverage = coverageOf(state, route.page === 'operations' ? 'work' : 'tests');
  const coverageNote = coverage === 'unavailable' ? m.collectionUnavailable : coverage === 'partial' ? m.partial : null;
  const isWeb = route.page === 'web' || route.page === 'organogram' || route.page === 'cosmos';
  const stamp = dateParts(generatedAt, lang);
  const links = [['web', '#/teia', m.web], ['domains', '#/teia/dominios', m.domains], ['research', '#/teia/testes', m.tests], ['operations', '#/teia/operacao', m.operations], ['board', '#/teia/mural', m.board], ...(memory ? [['memory', '#/teia/memoria', m.memory]] : [])] as Array<[string, string, string]>;
  return <div className="pw pd" data-theme={theme} data-view={route.page}>
    {!isWeb && <a className="pw-skip" href="#pw-content" onClick={event => { event.preventDefault(); document.querySelector<HTMLElement>('[data-private-heading]')?.focus(); }}>{m.skip}</a>}
    <header className="pw-header"><a className="pw-brand" href="#/teia">NEXO<small>{m.private}</small></a>
      <span className="pw-mobile-context">{active === 'continuity' ? (lang === 'en' ? 'Now' : 'Agora') : links.find(([key]) => key === active)?.[2]}</span>
      <PrivateNav label={m.private} moreLabel={lang === 'en' ? 'More' : 'Mais'} current={active} items={[['continuity', '#/teia/continuidade', lang === 'en' ? 'Now' : 'Agora'], ...links].map(([key, href, label]) => ({key, href, label, icon: <svg className="pw-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={NAV_PATHS[key] ?? 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h4'}/></svg>}))}/>
      <div className="pw-header-end">
        {!isWeb && refresh && <button type="button" className="pw-button" disabled={refreshing} onClick={() => void requestRefresh()}>{refreshing ? m.refreshing : m.reload}</button>}
      </div>
    </header>
    <div id="pw-content" className={isWeb ? 'pw-content pw-web-content' : 'pw-content'}>
      {!isWeb && route.page !== 'memory' && route.page !== 'board' && coverageNote && route.page !== 'continuity' && <p className="pw-coverage" role="status">{coverageNote}</p>}
      {!isWeb && notice && <p className="pw-refresh-notice" role="status">{notice}</p>}
      <ViewBoundary key={boundaryKey} message={m.unavailable} retry={m.tryAgain} onRetry={refresh ? () => void requestRefresh() : undefined}>
        <Suspense fallback={<main className="pw-page" role="status" aria-busy="true"><p className="pw-loading">{m.loading}</p></main>}>
          {route.page === 'web' && <KnowledgeGraph state={state} lang={lang}/>}
          {route.page === 'cosmos' && <TowerCosmos tests={tests} cache={cosmosCache} campaignLabel={campaignLabel} normDomain={normDomain} theme={theme} generatedAt={generatedAt} refresh={refresh} backHref="#/teia/dominios" nodeHref={nodeHref} emptyMessage={coverageNote ?? undefined}/>}
          {route.page === 'organogram' && <TowerWeb tests={tests} campaignLabel={campaignLabel} normDomain={normDomain} theme={theme} backHref="#/teia"/>}
          {route.page === 'domains' && <DomainView tests={tests} lab={lab} state={state} lang={lang}/>}
          {route.page === 'research' && <ResearchView key={route.domain ?? 'all'} tests={tests} lab={lab} state={state} domain={route.domain === null ? null : navigationDomain(route.domain,state)} filter={route.filter} lang={lang}/>}
          {route.page === 'test' && (lab.tests.has(route.id) ? <OnDemandTestDetail reader={testRecordReader} key={route.id} test={lab.tests.get(route.id)!} lab={lab} state={state} lang={lang} refresh={refresh}/> : <main className="pw-page"><h1 data-private-heading tabIndex={-1}>{m.noTest}</h1><p><a href="#/teia/testes">← {m.back}</a></p></main>)}
          {route.page === 'operations' && <OperationView state={state} lang={lang}/>}
          {route.page === 'board' && <AgentBoardView state={state} lang={lang}/>}
          {route.page === 'continuity' && <ContinuityView lang={lang} sourceRevision={state.bus?.fingerprint}/>}
          {route.page === 'memory' && (memory ?? <MemoryPlaceholder lang={lang}/>)}
          {route.page === 'missing' && <main className="pw-page"><h1 data-private-heading tabIndex={-1}>{m.missing}</h1><p><a href="#/teia">← {m.returnWeb}</a></p></main>}
        </Suspense>
      </ViewBoundary>
      {!isWeb && <footer className="pw-source">{stamp ? <>{m.sourceAt} <time dateTime={stamp.iso} title={stamp.iso}>{stamp.label}</time></> : m.sourceUnknown}</footer>}
    </div>
  </div>;
}
