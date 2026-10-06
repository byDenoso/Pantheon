import {lazy, Suspense, useEffect, useMemo, useRef, useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import {buildLab} from '../features/lab/model.ts';
import {normDomain} from '../features/lab/domains.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import type {TowerNode} from '../tower-web/model.ts';
import {WORKSPACE_COPY} from './copy.ts';
import {researchHref, testHref, type WorkspaceRoute} from './model.ts';
import {DomainView, OperationView, ResearchView, TestDetail} from './Views.tsx';
import './workspace.css';
const TowerCosmos = lazy(() => import('../tower-web/TowerCosmos.tsx'));
const TowerWeb = lazy(() => import('../tower-web/TowerWeb.tsx'));
const nodeHref = (node: TowerNode) => node.kind === 'test' ? testHref(node.id.replace(/^test:/, '')) : node.domain ? researchHref(node.domain) : '#/teia/dominios';

/** Presentation only, behind the existing authenticated Host. No fetch, credentials or persistence of source data. */
export default function PrivateWorkspace({state, generatedAt, route, refresh}: {state: SystemState; generatedAt: string; route: WorkspaceRoute; refresh?: () => Promise<void>}) {
  const lang = useDocumentLang(), m = WORKSPACE_COPY[lang];
  const lab = useMemo(() => buildLab(state), [state]);
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
  useEffect(() => { if (route.page !== 'web' && route.page !== 'organogram') document.querySelector<HTMLElement>('[data-private-heading]')?.focus({preventScroll: true}); }, [pageKey]);
  const requestRefresh = async () => {
    if (!refresh || flight.current) return;
    flight.current = true; setRefreshing(true); setNotice('');
    try { await refresh(); if (mounted.current) setNotice(m.refreshed); } catch { if (mounted.current) setNotice(m.refreshError); }
    finally { flight.current = false; if (mounted.current) setRefreshing(false); }
  };
  const active = route.page === 'organogram' ? 'web' : route.page === 'test' ? 'research' : route.page;
  const availability = (state as unknown as {availability?: Record<string, {state?: string}>}).availability;
  const coverage = availability?.[route.page === 'operations' ? 'work' : 'tests']?.state;
  const coverageNote = coverage === 'UNAVAILABLE' ? m.collectionUnavailable : coverage === 'PARTIAL' ? m.partial : null;
  const isWeb = route.page === 'web' || route.page === 'organogram';
  return <div className="pw" data-theme={theme} data-view={route.page}>
    <header className="pw-header"><a className="pw-brand" href="#/teia">NEXO<small>{m.private}</small></a>
      <nav aria-label={m.private}>{([['web','#/teia',m.web],['domains','#/teia/dominios',m.domains],['research','#/teia/testes',m.tests],['operations','#/teia/operacao',m.operations]] as const).map(([key, href, label]) => <a key={key} href={href} aria-current={active === key ? 'page' : undefined}>{label}</a>)}</nav>
      <a className="pw-legacy" href="#/agora">{m.legacy}</a>
      {!isWeb && refresh && <button type="button" className="pw-button" disabled={refreshing} onClick={() => void requestRefresh()}>{refreshing ? m.refreshing : m.reload}</button>}
    </header>
    <div className={isWeb ? 'pw-content pw-web-content' : 'pw-content'}>
      {!isWeb && coverageNote && <p className="pw-coverage" role="status">{coverageNote}</p>}
      <Suspense fallback={<main className="pw-page" role="status">{m.loading}</main>}>
        {route.page === 'web' && <TowerCosmos tests={tests} campaignLabel={campaignLabel} normDomain={normDomain} theme={theme} generatedAt={generatedAt} refresh={refresh} backHref="#/teia/dominios" nodeHref={nodeHref} emptyMessage={coverageNote ?? undefined}/>}
        {route.page === 'organogram' && <TowerWeb tests={tests} campaignLabel={campaignLabel} normDomain={normDomain} theme={theme} backHref="#/teia"/>}
        {route.page === 'domains' && <DomainView tests={tests} state={state} lang={lang}/>}
        {route.page === 'research' && <ResearchView key={`${route.domain}:${route.filter}`} tests={tests} state={state} domain={route.domain} filter={route.filter} lang={lang}/>}
        {route.page === 'test' && (lab.tests.has(route.id) ? <TestDetail key={route.id} test={lab.tests.get(route.id)!} state={state} lang={lang}/> : <main className="pw-page"><h1 data-private-heading tabIndex={-1}>{m.noTest}</h1><a href="#/teia/testes">{m.back}</a></main>)}
        {route.page === 'operations' && <OperationView state={state} lang={lang}/>}
        {route.page === 'missing' && <main className="pw-page"><h1 data-private-heading tabIndex={-1}>{m.missing}</h1><a href="#/teia">{m.web}</a></main>}
      </Suspense>
      {!isWeb && <footer className="pw-source">{m.sourceAt} <time dateTime={generatedAt}>{generatedAt}</time>{notice && <p role="status">{notice}</p>}</footer>}
    </div>
  </div>;
}
