import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRecord, InboxItem } from '../contracts/system.ts';
import { useWorld } from './useWorld.ts';
import { useSystem } from '../data/useSystem.ts';
import { useSession } from './useSession.ts';
import { useIsMobile } from './useMediaQuery.ts';
import { SCENARIOS } from '../data/fixtures/scenarios.ts';
import {
  MOBILE_PRIMARY, NAV_GROUPS, VIEW_TITLES, entryFor, hashForView, isSystemView, viewFromHash, type ViewId,
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

export default function App() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewId>(() => {
    const linked = typeof window !== 'undefined' ? viewFromHash(window.location.hash) : null;
    if (linked) return linked;
    const saved = stored('nexo-view', 'OVERVIEW') as ViewId;
    return ALL_VIEWS.includes(saved) ? saved : 'OVERVIEW';
  });
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
  const system = useSystem();
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
    setNotice('');
    setMoreOpen(false);
    const hash = hashForView(next);
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
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
      case 'LEARNING': return <LearningView state={state} onNavigate={go} />;
      default: return null;
    }
  };

  const openSession = () => {
    if (session.session.authenticated) { void session.logout(); return; }
    if (AUTH_BRIDGE_URL) { setLoginOpen(true); return; }
    if (PRIVATE_COCKPIT_URL) {
      try {
        const target = new URL(PRIVATE_COCKPIT_URL, window.location.href);
        if (target.origin !== window.location.origin) {
          target.hash = window.location.hash || hashForView(view);
          window.location.assign(target.toString());
          return;
        }
      } catch { /* URL inválida cai no modal local */ }
    }
    setLoginOpen(true);
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
            <button className="avatar-btn" onClick={openSession} aria-label={session.session.authenticated?'Encerrar sessão privada':'Abrir acesso privado'}>
              {session.session.authenticated?'PR':'ME'}
            </button>
          </div>
        </header>

        <div className="shell">
          <nav className="sidebar" aria-label="Navegação principal">
            {NAV_GROUPS.map(group => (
              <section key={group.label} className="nav-group">
                <span className="nav-group-label">{group.label}</span>
                {group.entries.map(item => (
                  <button key={item.id} className={`nav-item${view === item.id ? ' active' : ''}`} onClick={() => go(item.id)}>
                    <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
                  </button>
                ))}
              </section>
            ))}
          </nav>

          <main id="workspace" className="workspace">
            <form className="command-bar" onSubmit={submitCommand} role="search">
              <span className="command-prefix">⌘</span>
              <input ref={commandRef} value={command} onChange={event => setCommand(event.target.value)}
                placeholder="Navegar, buscar ou inspecionar…" aria-label="Comando NEXO" />
              <kbd>⌘K</kbd>
            </form>

            {notice && <div className="notice" role="status">{notice}</div>}

            <header className="view-header">
              <div>
                <span className="eyebrow">{entry?.group || 'SYSTEM'}</span>
                <h1>{titles.title}</h1>
                <p>{titles.subtitle}</p>
              </div>
              <div className="view-meta">
                <span>{system.sourceLabel}</span>
                <span>{session.session.authenticated?'PRIVATE':'PUBLIC'}</span>
              </div>
            </header>

            {isSystemView(view) ? systemContent() : (
              <PersonalCockpit world={world} query={personalQuery} setQuery={setPersonalQuery}
                context={personalContext} setContext={setPersonalContext} />
            )}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Navegação móvel">
          {MOBILE_PRIMARY.map(item => (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => go(item.id)}>
              <span>{item.icon}</span><small>{item.label}</small>
            </button>
          ))}
          <button className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen(!moreOpen)}><span>•••</span><small>Mais</small></button>
        </nav>

        {moreOpen && <div className="mobile-more">
          {NAV_GROUPS.flatMap(group => group.entries).filter(item => !MOBILE_PRIMARY.some(primary => primary.id === item.id)).map(item => (
            <button key={item.id} onClick={() => go(item.id)}>{item.icon} {item.label}</button>
          ))}
        </div>}

        <Modal open={loginOpen} title="Acesso privado" onClose={() => { setLoginOpen(false); setPin(''); session.setError(''); }}>
          <form onSubmit={async event => { event.preventDefault(); const submitted=pin;setPin(''); if(await session.login(submitted))setLoginOpen(false); }}>
            <label>PIN
              <input type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin}
                onChange={event=>setPin(event.target.value.replace(/\D/g,''))} autoFocus />
            </label>
            {session.error && <p className="form-error" role="alert">{session.error}</p>}
            {session.runtimeAvailable===false && !session.error && <p className="form-error" role="alert">Runtime privado indisponível.</p>}
            <button type="submit" disabled={session.pending||pin.length<4}>{session.pending?'Validando…':'Entrar'}</button>
          </form>
        </Modal>

        {openAction && <Modal open title="Ação" onClose={() => setOpenAction(null)}><ActionCard action={openAction} onOpen={() => {}} /></Modal>}
        {openInbox && <Modal open title="Intervenção humana" onClose={() => setOpenInbox(null)}><HumanInboxItem item={openInbox} onOpen={() => {}} /></Modal>}
        {selectedRun && system.state && <Modal open title="Execução" onClose={() => setSelectedRun(null)}>
          {runsForAction(system.state, selectedRun).map(run => <ExecutionTrace key={run.run_id} run={run} />)}
        </Modal>}

        <footer className="statusbar">
          <span>{scenario.label}</span><span>{system.sourceLabel}</span><span>{session.session.authenticated?'PRIVATE':'PUBLIC READ-ONLY'}</span>
        </footer>
      </div>
    </ProvenanceProvider>
  );
}
