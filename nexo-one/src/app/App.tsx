import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRecord, InboxItem } from '../contracts/system.ts';
import { useWorld } from './useWorld.ts';
import { useSystem } from '../data/useSystem.ts';
import { useSession } from './useSession.ts';
import { useIsMobile } from './useMediaQuery.ts';
import { SCENARIOS } from '../data/fixtures/scenarios.ts';
import {
  MOBILE_PRIMARY, NAV_GROUPS, VIEW_TITLES, entryFor, isSystemView, type ViewId,
} from './navigation.ts';
import { parseCommand } from './command.ts';
import { EMPTY_FILTERS, type GraphFilters } from '../viewmodels/graph.ts';
import { capabilityById, globalSummary, runsForAction } from '../viewmodels/system.ts';
import { label, toneOf } from '../viewmodels/tokens.ts';
import { ProvenanceProvider } from '../components/provenance.tsx';
import { Surface } from '../components/states.tsx';
import { StatusBadge } from '../components/primitives.tsx';
import { ActionCard, ExecutionTrace, HumanInboxItem } from '../components/composites.tsx';
import { Modal } from '../shell/Modal.tsx';
import { Overview } from '../features/system/Overview.tsx';
import { ActionsView, ExecutionView, InboxView } from '../features/system/Operations.tsx';
import { CapabilitiesView, IntegrityView, SourcesView, TruthGraphView } from '../features/system/Integrity.tsx';
import { AtlasView, LearningView } from '../features/system/Atlas.tsx';
import { ActionBrokerPanel } from '../features/system/ActionBrokerPanel.tsx';
import { PersonalCockpit } from '../features/PersonalCockpit.tsx';

const stored = (key: string, fallback: string): string => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const persist = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* armazenamento indisponível: preferência não persiste */ }
};

const ALL_VIEWS = NAV_GROUPS.flatMap(group => group.entries.map(entry => entry.id));

export default function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewId>(() => {
    const saved = stored('nexo-view', 'OVERVIEW') as ViewId;
    return ALL_VIEWS.includes(saved) ? saved : 'OVERVIEW';
  });
  const [theme, setTheme] = useState(() => stored('nexo-theme', 'dark'));
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');

  const [filters, setFilters] = useState<GraphFilters>({ ...EMPTY_FILTERS });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<ActionRecord | null>(null);
  const [openInbox, setOpenInbox] = useState<InboxItem | null>(null);
  const [personalQuery, setPersonalQuery] = useState('');
  const [personalContext, setPersonalContext] = useState('NEXO');

  const commandRef = useRef<HTMLInputElement>(null);
  const system = useSystem();
  const world = useWorld();
  const refreshWorld = world.refresh;
  const session = useSession(useCallback(() => refreshWorld(true), [refreshWorld]));

  useEffect(() => { document.documentElement.dataset.theme = theme; persist('nexo-theme', theme); }, [theme]);
  useEffect(() => { persist('nexo-view', view); }, [view]);
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

  const go = useCallback((next: ViewId) => { setView(next); setNotice(''); setMoreOpen(false); }, []);

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
        return <AtlasView state={state} filters={filters} setFilters={setFilters}
          selectedId={selectedNode} onSelect={setSelectedNode} />;
      case 'LEARNING': return <LearningView state={state} />;
      default: return null;
    }
  };

  return (
    <ProvenanceProvider>
      <div className={`cockpit${isMobile ? ' mobile' : ''}`} data-view={view}>
        <a className="skip-link" href="#workspace">Ir ao conteúdo</a>

        <header className="topbar">
          <a href="#overview" className="brand" onClick={event => { event.preventDefault(); go('OVERVIEW'); }}>
            <span className="brand-mark">N</span>
            <strong>NEXO <span>ONE</span></strong>
            <span className="brand-descriptor">PERSONAL COMMAND DECK</span>
          </a>
          <div className="header-tools">
            <span className="header-date">
              {new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}
            </span>
            {summary && (
              <button className={`health-button tone-${toneOf(summary.state)}`} onClick={() => go('SOURCES')}>
                <i aria-hidden="true" className={`glyph glyph-${toneOf(summary.state)}`} />
                <span>{label(summary.state)}</span>
              </button>
            )}
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
              {theme === 'dark' ? '☼' : '☾'}
            </button>
            <button className="avatar" onClick={() => (session.session.authenticated ? void session.logout() : setLoginOpen(true))}
              aria-label={session.session.authenticated ? 'Sair da sessão' : 'Entrar na sessão'}>D</button>
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
              placeholder="Ir para uma visão, filtrar o Atlas ou consultar o registro" aria-label="Comando global" />
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
                <button className="sync-button" onClick={system.reload} disabled={system.load === 'LOADING'}>
                  <span>↻</span><span>{system.load === 'LOADING' ? 'Compilando' : 'Recompilar'}</span>
                </button>
              )}
            </div>

            {notice && (
              <div role="status" className="notice-box">
                {notice}<button className="text-button" onClick={() => setNotice('')}>Fechar</button>
              </div>
            )}

            {isSystemView(view)
              ? <Surface load={system.load} error={system.error} onRetry={system.reload}>{systemContent()}</Surface>
              : <PersonalCockpit view={view} world={world.world} loading={world.loading} error={world.error}
                  refresh={world.refresh} authenticated={session.session.authenticated}
                  query={personalQuery} setQuery={setPersonalQuery}
                  context={personalContext} setContext={setPersonalContext} />}
          </main>
        </div>

        <footer className="world-footer">
          <span className="footer-scenario">
            {system.sourceKind === 'fixture' ? 'FIXTURE' : 'REMOTO'} · {scenario.label}
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
            </div>
          </Modal>
        )}

        {openAction && system.state && (
          <Modal title="AÇÃO / EXECUÇÃO" className="focus-drawer" onClose={() => setOpenAction(null)}>
            <div className="drawer-body">
              <ActionCard action={openAction} capability={capabilityById(system.state, openAction.capability_id)} />
              <ActionBrokerPanel action={openAction}
                capability={capabilityById(system.state, openAction.capability_id)}
                authenticated={session.session.authenticated} onChanged={system.reload} />
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
                <button className="text-button" onClick={() => {
                  const action = system.state?.actions.find(item => item.action_id === openInbox.action_id) || null;
                  setOpenInbox(null);
                  if (action) setOpenAction(action); else go('ACTIONS');
                }}>
                  Abrir ação relacionada ↗
                </button>
              )}
            </div>
          </Modal>
        )}

        {loginOpen && (
          <Modal title="ACESSO PRIVADO" onClose={() => { setLoginOpen(false); setPassword(''); session.setError(''); }}>
            <div className="drawer-body">
              <h2>Entre no seu cockpit.</h2>
              {session.session.configured
                ? <form className="login-form" onSubmit={async event => {
                    event.preventDefault();
                    if (await session.login(password)) { setPassword(''); setLoginOpen(false); }
                  }}>
                    <label>Senha do NEXO ONE
                      <input type="password" autoComplete="current-password" value={password} required maxLength={256}
                        onChange={event => setPassword(event.target.value)} />
                    </label>
                    {session.error && <p role="alert">{session.error}</p>}
                    <button className="primary-button" disabled={session.pending}>
                      {session.pending ? 'Entrando…' : 'Entrar →'}
                    </button>
                  </form>
                : <p>
                    A autenticação privada ainda precisa ser configurada no servidor. O plano SISTEMA continua
                    disponível com fixtures; o plano PESSOAL exibe apenas fontes públicas.
                  </p>}
            </div>
          </Modal>
        )}
      </div>
    </ProvenanceProvider>
  );
}