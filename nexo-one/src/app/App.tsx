import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRecord, InboxItem } from '../contracts/system.ts';
import { useWorld } from './useWorld.ts';
import { useNexoStore } from '../data/NexoStore.tsx';
import { useSession } from './useSession.ts';
import { useIsMobile } from './useMediaQuery.ts';
import { SCENARIOS } from '../data/fixtures/scenarios.ts';
import {
  MOBILE_PRIMARY, NAV_GROUPS, VIEW_TITLES, entryFor, hashForView, isSystemView, viewFromHash, type ViewId,
  isSystemRoute,
} from './navigation.ts';
import { parseCommand } from './command.ts';
import { EMPTY_FILTERS, type GraphFilters } from '../viewmodels/graph.ts';
import { capabilityById, globalSummary, runsForAction } from '../viewmodels/system.ts';
import { label, toneOf } from '../viewmodels/tokens.ts';
import { ProvenanceProvider } from '../components/provenance.tsx';
import { LoadingState, Surface } from '../components/states.tsx';
import { StatusBadge } from '../components/primitives.tsx';
import { ActionCard, ExecutionTrace, HumanInboxItem } from '../components/composites.tsx';
import { Modal } from '../shell/Modal.tsx';
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
const LearningView = lazy(() => import('../features/system/Atlas.tsx').then(module => ({ default: module.LearningView })));
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
  const [theme, setTheme] = useState(() => stored('nexo-theme', 'dark'));
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
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
  const {system} = useNexoStore();
  const world = useWorld();
  const refreshWorld = world.refresh;
  const session = useSession(useCallback(() => refreshWorld(true), [refreshWorld]));

  useEffect(() => { document.documentElement.dataset.theme = theme; persist('nexo-theme', theme); }, [theme]);
  useEffect(() => { persist('nexo-view', view); }, [view]);
  useEffect(() => {
    if (!viewFromHash(window.location.hash)) window.history.replaceState(null, '', hashForView(view));
  }, []);
  useEffect(() => {
    const restore = () => {
      const isSystem = isSystemRoute(window.location.hash);
      setSystemRoute(isSystem);
      const next = viewFromHash(window.location.hash);
      if (next) { setView(next); setNotice(''); setMoreOpen(false); }
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
    setMoreOpen(false);
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
    setMoreOpen(false);
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

  const summary = system.state ? globalSummary(system.state) : null;
  const entry = entryFor(view);
  const titles = VIEW_TITLES[view];
  const scenario = useMemo(() => SCENARIOS.find(s => s.id === system.scenarioId) ?? SCENARIOS[0], [system.scenarioId]);

  if (systemRoute) return <Suspense fallback={<LoadingState label="Abrindo Sistema…" />}><EmbeddedMcp /></Suspense>;

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
        return <EmbeddedAtlas3D system={system} />;
      case 'LEARNING': return <LearningView state={state} onNavigate={go} />;
      default: return null;
    }
  };

  const openSession = () => {
    // Avatar is a local account/session control. Never replace the current
    // cockpit just because a private runtime lives on another origin.
    setLoginOpen(true);
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
      <div className={`cockpit${isMobile ? ' mobile' : ''}`} data-view={view} data-access={session.session.authenticated?'PRIVATE':'PUBLIC'}>
        <a className="skip-link" href="#workspace">Ir ao conteúdo</a>

        <header className="topbar">
          <a href="#overview" className="brand" onClick={event => { event.preventDefault(); go('OVERVIEW'); }}>
            <span className="brand-mark">N</span>
            <strong>NEXO <span>ONE</span></strong>
            <span className="brand-descriptor">PERSONAL COMMAND DECK</span>
          </a>
          <div className="header-tools">
            <a className="product-switch" href="#/sistema" onClick={event => { event.preventDefault(); goSystem(); }} title="Abrir a topologia MCP">
              Sistema <span>↗</span>
            </a>
            <span className="header-date">
              {new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}
            </span>
            {summary && (
              <button className={`health-button tone-${toneOf(summary.state)}`} onClick={() => go('SOURCES')}>
                <i aria-hidden="true" className={`glyph glyph-${toneOf(summary.state)}`} />
                <span>{label(summary.state)}</span>
              </button>
            )}
            {session.session.authenticated && <span className="private-session-badge" role="status">PRIVATE</span>}
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
              {theme === 'dark' ? '☼' : '☾'}
            </button>
            <button className={`avatar${session.session.authenticated?' private':''}`} onClick={openSession}
              aria-label="Abrir conta e sessão">D</button>
          </div>
        </header>

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

        <div className="command-wrap">
          <form className="command-bar" onSubmit={submitCommand}>
            <span aria-hidden="true">⌕</span>
            <input ref={commandRef} value={command} onChange={event => setCommand(event.target.value)}
              placeholder={isMobile ? "Buscar ou ir para…" : "Ir para uma visão, filtrar o Atlas ou consultar o registro"} aria-label="Comando global" />
            <kbd>Ctrl K</kbd>
            <button className="command-submit" aria-label="Executar comando">↵</button>
          </form>
        </div>

        <div className="cockpit-body">
          {!isMobile && (
            <nav className="nav-rail" aria-label="Navegação principal">
              {NAV_GROUPS.map(group => (
                <div key={group.id} className="nav-group">
                  <span className="eyebrow">{group.label}</span>
                  {group.entries.map(item => (
                    <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`}
                      onClick={() => go(item.id)} aria-current={view === item.id ? 'page' : undefined} title={item.hint}>
                      <i aria-hidden="true">{item.glyph}</i>
                      <span>{item.label}</span>
                      {item.id === 'INBOX' && summary && summary.needsHuman > 0 && <b>{summary.needsHuman}</b>}
                      {item.id === 'TRUTHGRAPH' && summary && summary.conflicts.length > 0 && (
                        <b className="alarm">{summary.conflicts.length}</b>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          )}

          <main id="workspace" tabIndex={-1} className="workspace">
            <div className="workspace-heading">
              <div>
                <div className="eyebrow">
                  <span className="accent-text">{entry.label}</span>
                  <span className="breadcrumb"> / {isSystemView(view) ? 'SISTEMA' : 'PESSOAL'}</span>
                </div>
                <h1>{titles.title}</h1>
                <p>{titles.lead}</p>
              </div>
              {isSystemView(view) && (
                <button
                  className={`sync-button sync-${system.syncStatus.toLowerCase()}`}
                  onClick={system.sync}
                  disabled={system.syncing || (!system.state && system.load === 'LOADING')}
                  aria-label={system.syncing ? 'Sincronizando Tower e publicação do sistema' : 'Sincronizar Tower e publicação do sistema'}
                >
                  <span aria-hidden="true" className={system.syncing ? 'sync-glyph spinning' : 'sync-glyph'}>↻</span>
                  <span className="sync-label">
                    <span>{system.syncing ? 'Sincronizando' : 'Sincronizar'}</span>
                    {system.syncMessage && <small role="status" aria-live="polite">{system.syncMessage}</small>}
                  </span>
                </button>
              )}
            </div>

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

        {isMobile && (
          <nav className="bottom-nav" aria-label="Navegação">
            {MOBILE_PRIMARY.map(id => {
              const item = entryFor(id);
              return (
                <button key={id} className={view === id ? 'active' : ''} onClick={() => go(id)}
                  aria-current={view === id ? 'page' : undefined}>
                  <i aria-hidden="true">{item.glyph}</i>
                  <span>{item.label}</span>
                  {id === 'INBOX' && summary && summary.needsHuman > 0 && <b>{summary.needsHuman}</b>}
                </button>
              );
            })}
            <button className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
              <i aria-hidden="true">⋯</i><span>Mais</span>
            </button>
          </nav>
        )}

        {moreOpen && (
          <Modal title="TODAS AS VISÕES" className="nav-sheet" onClose={() => setMoreOpen(false)}>
            <div className="drawer-body">
              {NAV_GROUPS.map(group => (
                <div key={group.id} className="sheet-group">
                  <span className="eyebrow">{group.label}</span>
                  {group.entries.map(item => (
                    <button key={item.id} className={`sheet-item${view === item.id ? ' active' : ''}`}
                      onClick={() => go(item.id)}>
                      <i aria-hidden="true">{item.glyph}</i>
                      <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="sheet-group product-group">
                <span className="eyebrow">ESTRUTURA</span>
                <a className="sheet-item product-sheet-link" href="#/sistema" onClick={event => { event.preventDefault(); goSystem(); }}>
                  <i aria-hidden="true">⌬</i>
                  <span><strong>MCP Atlas</strong><small>Tools, capabilities, runtimes e roles no grafo 3D</small></span>
                </a>
              </div>
            </div>
          </Modal>
        )}

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
