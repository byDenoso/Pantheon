import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRecord, InboxItem } from '../contracts/system.ts';
import { useWorld } from './useWorld.ts';
import { useNexoStore } from '../data/NexoStore.tsx';
import { useSession } from './useSession.ts';
import { useIsMobile } from './useMediaQuery.ts';
import { SCENARIOS } from '../data/fixtures/scenarios.ts';
import {
  NAV_GROUPS, VIEW_TITLES, entryFor, hashForView, isSystemView, viewFromHash, type ViewId,
  isSystemRoute,
} from './navigation.ts';
import { parseCommand } from './command.ts';
import { EMPTY_FILTERS, type GraphFilters } from '../viewmodels/graph.ts';
import { capabilityById, runsForAction } from '../viewmodels/system.ts';
import { label, toneOf } from '../viewmodels/tokens.ts';
import { ProvenanceProvider } from '../components/provenance.tsx';
import { LoadingState, Surface } from '../components/states.tsx';
import { StatusBadge } from '../components/primitives.tsx';
import { ActionCard, ExecutionTrace, HumanInboxItem } from '../components/composites.tsx';
import { Modal } from '../shell/Modal.tsx';
import { InstrumentHeader, type ProductProvenance } from '../shell/InstrumentHeader.tsx';
import { Overview } from '../features/system/Overview.tsx';
import { ActionsView, ExecutionView, InboxView } from '../features/system/Operations.tsx';
import { CapabilitiesView, IntegrityView, SourcesView, TruthGraphView } from '../features/system/Integrity.tsx';
import { PersonalCockpit } from '../features/PersonalCockpit.tsx';

const stored = (key: string, fallback: string): string => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const persist = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* armazenamento indisponível: preferência não persiste */ }
};

const ALL_VIEWS = NAV_GROUPS.flatMap(group => group.entries.map(entry => entry.id));
const PRIVATE_COCKPIT_URL = String(import.meta.env.VITE_PRIVATE_COCKPIT_URL || '').trim().replace(/\/+$/, '');
const AUTH_BRIDGE_URL = String(import.meta.env.VITE_NEXO_AUTH_BRIDGE_URL || '').trim();
const PUBLIC_NEXO_BASE = String(import.meta.env.VITE_PUBLIC_NEXO_BASE || 'https://bydenoso.github.io/Pantheon/').trim().replace(/\/?$/, '/');
const publicNexoUrl = (path = '') => new URL(path, PUBLIC_NEXO_BASE).toString();
const ScienceWorkspace = lazy(() => import('../features/ScienceWorkspace.tsx'));
const EmbeddedAtlas3D = lazy(() => import('../atlas3d/EmbeddedAtlas3D.tsx'));
const EmbeddedMcp = lazy(() => import('../mcp/EmbeddedMcp.tsx'));

export default function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewId>(() => {
    const linked = typeof window !== 'undefined' ? viewFromHash(window.location.hash) : null;
    if (linked) return linked;
    const saved = stored('nexo-view', 'OVERVIEW') as ViewId;
    return ALL_VIEWS.includes(saved) ? saved : 'OVERVIEW';
  });
  const [systemRoute, setSystemRoute] = useState(() => typeof window !== 'undefined' && isSystemRoute(window.location.hash));
  const [theme, setTheme] = useState(() => {
    const systemQuery = typeof window !== 'undefined' ? window.location.hash.match(/^#\/?sistema\?(.+)$/i)?.[1] : undefined;
    const routeTheme = systemQuery ? new URLSearchParams(systemQuery).get('theme') : null;
    return routeTheme === 'light' || routeTheme === 'dark' ? routeTheme : stored('nexo-theme', 'dark');
  });
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [pin, setPin] = useState('');

  const [filters, setFilters] = useState<GraphFilters>({ ...EMPTY_FILTERS });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<ActionRecord | null>(null);
  const [openInbox, setOpenInbox] = useState<InboxItem | null>(null);
  const [personalQuery, setPersonalQuery] = useState('');
  const [personalContext, setPersonalContext] = useState('NEXO');

  const commandRef = useRef<HTMLInputElement>(null);
  const {system,loadPublishedContext} = useNexoStore();
  const [productProvenance,setProductProvenance]=useState<ProductProvenance>({
    authority:null,storage:null,snapshot:null,stateFingerprint:null,projectionFingerprint:null,commit:null,
  });
  const world = useWorld();
  const refreshWorld = world.refresh;
  const session = useSession(useCallback(() => refreshWorld(true), [refreshWorld]));

  useEffect(() => { document.documentElement.dataset.theme = theme; persist('nexo-theme', theme); }, [theme]);
  useEffect(() => { persist('nexo-view', view); }, [view]);
  useEffect(()=>{
    const ctrl=new AbortController();
    void loadPublishedContext(false,ctrl.signal).then(({towerManifest,buildMeta})=>{
      const manifest=towerManifest||{};
      setProductProvenance({
        authority:String(manifest.authority||'')||null,
        storage:String(manifest.source_storage||'')||null,
        snapshot:String(manifest.source_snapshot_id||'')||null,
        stateFingerprint:String(manifest.source_state_fingerprint||'')||null,
        projectionFingerprint:String(manifest.projection_fingerprint||buildMeta?.projection_fingerprint||'')||null,
        commit:String(manifest.tower_commit||buildMeta?.tower_commit||'')||null,
      });
    }).catch(()=>{});
    return()=>ctrl.abort();
  },[loadPublishedContext]);
  useEffect(() => {
    if (!viewFromHash(window.location.hash)) window.history.replaceState(null, '', hashForView(view));
  }, []);
  useEffect(() => {
    const restore = () => {
      const isSystem = isSystemRoute(window.location.hash);
      setSystemRoute(isSystem);
      const next = viewFromHash(window.location.hash);
      if (next) { setView(next); setNotice(''); }
    };
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('hashchange', restore);
      window.removeEventListener('popstate', restore);
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        commandRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((next: ViewId) => {
    setView(next);
    setSystemRoute(false);
    setNotice('');
    const hash = hashForView(next);
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    // Cada superfície começa no próprio cabeçalho. Sem este reset, trocar de uma
    // tela longa para outra preserva o scroll anterior e pode esconder título,
    // filtros e estado inicial da nova seção.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const goSystem = useCallback(() => {
    setSystemRoute(true);
    setNotice('');
    if (window.location.hash !== '#/sistema') window.history.pushState(null, '', '#/sistema');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const submitCommand = (event: React.FormEvent) => {
    event.preventDefault();
    if (!command.trim()) return;
    const result = parseCommand(command);
    go(result.view);
    if (result.kind === 'FIND' && result.query) {
      const query = result.query;
      setFilters(current => ({ ...current, search: query }));
    }
    if (result.message) setNotice(result.message);
    setCommand('');
  };

  const entry = entryFor(view);
  const titles = VIEW_TITLES[view];
  const scenario = useMemo(() => SCENARIOS.find(s => s.id === system.scenarioId) ?? SCENARIOS[0], [system.scenarioId]);

  const currentMode = systemRoute ? 'sistema' : view === 'ATLAS' ? 'mapa' : view === 'LEARNING' ? 'ciencia' : ['NOW','LOOPS','DAY','CONTEXT','RECALL'].includes(view) ? 'pessoal' : ['ACTIONS','EXECUTION','INBOX'].includes(view) ? 'operacao' : ['TRUTHGRAPH','CAPABILITIES','SOURCES','INTEGRITY'].includes(view) ? 'prova' : 'inicio';
  const navigateMode = (mode:'inicio'|'ciencia'|'operacao'|'prova'|'mapa'|'pessoal'|'sistema') => {
    if(mode==='inicio'){go('OVERVIEW');return;}
    if(mode==='ciencia'){go('LEARNING');return;}
    if(mode==='operacao'){go('ACTIONS');return;}
    if(mode==='prova'){go('TRUTHGRAPH');return;}
    if(mode==='mapa'){go('ATLAS');return;}
    if(mode==='pessoal'){go('NOW');return;}
    if(mode==='sistema'){goSystem();return;}
  };
  const header = <InstrumentHeader mode={currentMode} view={view} theme={theme} syncStatus={system.syncing?'SYNCING':system.syncStatus}
    readAt={system.lastSuccessfulReadAt} provenance={{...productProvenance,projectionFingerprint:productProvenance.projectionFingerprint||system.state?.bus.fingerprint||null}} command={command} commandRef={commandRef}
    onCommandChange={setCommand} onCommandSubmit={submitCommand} onThemeToggle={()=>setTheme(theme==='dark'?'light':'dark')}
    onSync={system.sync} onNavigate={navigateMode} onAccountClick={()=>setLoginOpen(true)} privateSession={session.session.authenticated}/>;
  if (systemRoute) return <ProvenanceProvider><div className={`cockpit unified-shell system-route${isMobile?' mobile':''}`} data-view="SYSTEM" data-access={session.session.authenticated?'PRIVATE':'PUBLIC'}>
    <a className="skip-link" href="#workspace">Ir ao conteúdo</a>{header}<div className="cockpit-body">
      <main id="workspace" tabIndex={-1} className="workspace system-workspace"><Suspense fallback={<LoadingState label="Abrindo Sistema…" />}><EmbeddedMcp theme={theme} onThemeToggle={()=>setTheme(theme==='dark'?'light':'dark')}/></Suspense></main>
    </div></div></ProvenanceProvider>;

  const systemContent = () => {
    const state = system.state;
    if (!state) return null;
    switch (view) {
      case 'OVERVIEW':
        return <Overview state={state} onOpenAction={setOpenAction} onOpenInbox={setOpenInbox} onNavigate={go} />;
      case 'INBOX': return <InboxView state={state} onOpenInbox={setOpenInbox} />;
      case 'ACTIONS': return <ActionsView state={state} onOpenAction={setOpenAction} />;
      case 'EXECUTION': return <ExecutionView state={state} selectedRunId={selectedRun} onSelectRun={setSelectedRun} />;
      case 'TRUTHGRAPH': return <TruthGraphView state={state} />;
      case 'CAPABILITIES': return <CapabilitiesView state={state} />;
      case 'SOURCES': return <SourcesView state={state} />;
      case 'INTEGRITY': return <IntegrityView state={state} />;
      case 'ATLAS':
        return <EmbeddedAtlas3D system={system} theme={theme as 'dark'|'light'} />;
      case 'LEARNING': return <ScienceWorkspace state={state} />;
      default: return null;
    }
  };

  const openPrivateCockpit = () => {
    if (!PRIVATE_COCKPIT_URL) return;
    try {
      const target = new URL(PRIVATE_COCKPIT_URL, window.location.href);
      target.hash = window.location.hash || hashForView(view);
      window.open(target.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      setNotice('URL do cockpit privado inválida.');
    }
  };

  return (
    <ProvenanceProvider>
      <div className={`cockpit unified-shell${isMobile ? ' mobile' : ''}`} data-view={view} data-access={session.session.authenticated?'PRIVATE':'PUBLIC'}>
        <a className="skip-link" href="#workspace">Ir ao conteúdo</a>

        {header}

        {system.sourceKind === 'fixture' && (
          <div className="fixture-strip" role="status">
            <span className="fixture-tag">FIXTURES</span>
            <label>
              Cenário
              <select value={system.scenarioId} aria-label="Cenário de fixture"
                onChange={event => { system.setScenarioId(event.target.value); setSelectedRun(null); }}>
                {SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <span className="fixture-note">{scenario.description}</span>
          </div>
        )}



        <div className="cockpit-body">

          <main id="workspace" tabIndex={-1} className="workspace">
            <div className="workspace-heading">
              <div>
                <h1>{titles.title}</h1>
                <p>{titles.lead}</p>
              </div>
            </div>

            {currentMode!=='ciencia'&&<nav className="section-tabs" aria-label={`Seções de ${currentMode}`}>
              {(currentMode==='inicio' ? [['OVERVIEW','Visão geral']] : currentMode==='operacao' ? [['ACTIONS','Fila'],['INBOX','Gates'],['EXECUTION','Execução']] : currentMode==='prova' ? [['CAPABILITIES','Capabilities'],['INTEGRITY','Integridade'],['SOURCES','Fontes'],['TRUTHGRAPH','Autoridade']] : [['NOW','Agora'],['LOOPS','Loops'],['DAY','Agenda'],['CONTEXT','Contextos'],['RECALL','Busca']])
                .map(([id,label])=><button type="button" key={id} className={view===id?'active':''} aria-current={view===id?'page':undefined} onClick={()=>go(id as ViewId)}>{label}</button>)}
            </nav>}

            {notice && (
              <div role="status" className="notice-box">
                {notice}<button className="text-button" onClick={() => setNotice('')}>Fechar</button>
              </div>
            )}

            {isSystemView(view) && system.state && system.syncStatus === 'FAILED' && (
              <div className="sync-warning" role="status">
                <strong>Último snapshot preservado.</strong>
                <span>{system.error}</span>
              </div>
            )}

            {isSystemView(view)
              ? <Surface load={system.load} error={system.error} onRetry={system.reload}>
                  <Suspense fallback={<LoadingState label="Carregando módulo…" />}>{systemContent()}</Suspense>
                </Surface>
              : <PersonalCockpit view={view} world={world.world} loading={world.loading} error={world.error}
                  refresh={world.refresh} authenticated={session.session.authenticated}
                  query={personalQuery} setQuery={setPersonalQuery}
                  context={personalContext} setContext={setPersonalContext} />}
          </main>
        </div>

        <footer className="world-footer">
          <span className="footer-scenario">
            {system.sourceKind === 'fixture'
              ? `FIXTURE · ${scenario.label}`
              : `REMOTO · ${system.state?.scenario_label || system.sourceLabel}`}
          </span>
          {system.state && <StatusBadge state={system.state.global_state} compact />}
          <code className="fingerprint">{system.state?.bus.fingerprint ?? 'AGUARDANDO ESTADO'}</code>
        </footer>

        {openAction && system.state && (
          <Modal title="AÇÃO / EXECUÇÃO" className="focus-drawer" onClose={() => setOpenAction(null)}>
            <div className="drawer-body">
              <ActionCard action={openAction} capability={capabilityById(system.state, openAction.capability_id)} />
              {runsForAction(system.state, openAction.action_id).map(run => (
                <div key={run.run_id} className="drawer-run">
                  <div className="section-head secondary">
                    <h2>{run.run_id}</h2>
                    <StatusBadge state={run.status} />
                  </div>
                  <ExecutionTrace run={run} />
                </div>
              ))}
              <button className="text-button" onClick={() => {
                const first = runsForAction(system.state!, openAction.action_id)[0];
                setSelectedRun(first ? first.run_id : null);
                setOpenAction(null);
                go('EXECUTION');
              }}>Abrir no Execution trace ↗</button>
            </div>
          </Modal>
        )}

        {openInbox && (
          <Modal title="INTERVENÇÃO HUMANA" className="focus-drawer" onClose={() => setOpenInbox(null)}>
            <div className="drawer-body">
              <HumanInboxItem item={openInbox} />
              {openInbox.action_id && (
                <button className="text-button" onClick={() => { setOpenInbox(null); go('ACTIONS'); }}>
                  Ver a ação relacionada ↗
                </button>
              )}
            </div>
          </Modal>
        )}

        {loginOpen && (
          <Modal title="ACESSO PRIVADO" onClose={() => { setLoginOpen(false); setPin(''); session.setError(''); }}>
            <div className="drawer-body">
              <h2>{session.session.authenticated ? 'Sessão privada ativa.' : 'Acesso privado.'}</h2>
              <p className="session-runtime">Runtime: <strong>{session.runtime === 'VERCEL_NATIVE' ? 'Vercel native' : session.runtime === 'APPS_SCRIPT_BRIDGE' ? 'Apps Script bridge' : 'indisponível'}</strong></p>
              {session.session.authenticated
                ? <div className="login-form">
                    <p>Você está autenticado neste runtime. Fechar este painel não altera a sessão.</p>
                    <button className="primary-button" type="button" disabled={session.pending}
                      onClick={async () => { await session.logout(); setLoginOpen(false); }}>
                      {session.pending ? 'Saindo…' : 'Sair da sessão'}
                    </button>
                  </div>
                : session.runtimeAvailable===false
                  ? <div className="login-form">
                      <p role="alert">Runtime privado indisponível neste host. O cockpit atual continua aberto em modo público.</p>
                      {PRIVATE_COCKPIT_URL && (
                        <button className="primary-button" type="button" onClick={openPrivateCockpit}>
                          Abrir cockpit privado em nova aba ↗
                        </button>
                      )}
                    </div>
                  : session.session.configured
                    ? <form className="login-form" onSubmit={async event => {
                        event.preventDefault();
                        const submitted=pin;setPin('');
                        if (await session.login(submitted)) setLoginOpen(false);
                      }}>
                        <label>PIN
                          <input type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} required maxLength={12}
                            onChange={event => setPin(event.target.value.replace(/\D/g,''))} />
                        </label>
                        {session.error && <p role="alert">{session.error}</p>}
                        <button className="primary-button" disabled={session.pending}>
                          {session.pending ? 'Entrando…' : 'Entrar →'}
                        </button>
                      </form>
                    : <div className="login-form">
                        <p>A autenticação privada não está configurada neste host. O cockpit atual permanece aberto e não muda de domínio.</p>
                        {PRIVATE_COCKPIT_URL && (
                          <button className="primary-button" type="button" onClick={openPrivateCockpit}>
                            Abrir cockpit privado em nova aba ↗
                          </button>
                        )}
                        <button className="text-button private-fallback" type="button"
                          onClick={() => setLoginOpen(false)}>Continuar aqui</button>
                      </div>}
            </div>
          </Modal>
        )}
      </div>
    </ProvenanceProvider>
  );
}
