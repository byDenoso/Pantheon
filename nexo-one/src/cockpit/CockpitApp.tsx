import {humanizeResult, humanTitle} from '../private-workspace/humanize.ts';
import {agentName} from '../private-workspace/liveEvents.ts';
import CockpitLive from './CockpitLive.tsx';
import CockpitTeam from './CockpitTeam.tsx';
import CockpitArchitecture from './CockpitArchitecture.tsx';
import './experience.css';
import MotionToggle from '../atlas/ui/MotionToggle.tsx';
import {tone} from './team.ts';
import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {HttpError, loadCockpit, loadPublicSelection, login, logout, saveSelection, session, type Bi, type CampaignPublic, type Cockpit, type Row, type SaveError, type Selection, type ShadowTab, type TowerPublic} from './api.ts';

import {CandidateControls, Pager} from './WorkspaceTools.tsx';
import {canRefresh, filterCandidates, newestFirst, pageRows, publicationState, reconcileDraft, createReadGate, type SelectionFilter} from './workspace.ts';

type Theme = 'light' | 'dark' | 'system';
type Draft = {catalog: string[]; tower: Record<string, TowerPublic>; campaigns: Record<string, {state: 'ongoing' | 'completed'; public: CampaignPublic}>};
const PUBLIC_SITE = 'https://nexoresearch.org/';
const SECTION_LINKS = [['agora', 'Agora'], ['aovivo', 'Ao vivo'], ['equipe', 'Automações'], ['filas', 'Filas e achados'], ['frentes', 'Frentes'], ['resultados', 'Resultados'], ['publico', 'Público']];
const empty = (): Bi => ({'pt-BR': '', en: ''});
const clean = (b: Bi | null | undefined): Bi => ({'pt-BR': b?.['pt-BR'] ?? '', en: b?.en && b.en !== b['pt-BR'] ? b.en : ''});
const when = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'}) : iso;
};
const FIELD: Record<string, string> = {EMPTY: 'Obrigatório.', TOO_LONG: 'Texto longo demais.', RESTRICTED_FAMILY: 'Contém um termo restrito (PEER, Olympus, agentes internos, mural).', INTERNAL_REFERENCE: 'Contém link, e-mail, ID interno ou credencial.', SOURCE_ROW_NOT_FOUND: 'Linha não localizada nesta leitura; pode estar fora do recorte. Atualize e revise antes de publicar.', SOURCE_UNAVAILABLE: 'Fonte SHADOW indisponível agora; itens novos precisam dela.', NOT_IN_CATALOG: 'Não está no catálogo publicado.', CLOSURE_REQUIRED: 'Uma frente concluída precisa de um resumo de encerramento.', INVALID: 'Item inválido.'};

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => { try { const t = localStorage.getItem('nexo.cockpit.theme'); return t === 'light' || t === 'dark' || t === 'system' ? t : 'dark'; } catch { return 'dark'; } });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('nexo.cockpit.theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme];
}

function Header({theme, setTheme, onLogout, active}: {theme: Theme; setTheme: (t: Theme) => void; onLogout?: () => void; active?: string}) {
  const links = SECTION_LINKS;
  return <header className="ck-header">
    <a className="ck-brand" href="#agora"><strong>NEXO</strong><small>Cosmologia computacional</small><span className="ck-tag">Cockpit</span></a>
    {onLogout && <nav className="ck-nav" aria-label="Seções do cockpit">{links.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id}>{label}</a>)}</nav>}
    <div className="ck-tools">
      <MotionToggle/>
      <div className="ck-seg" role="group" aria-label="Tema">{([['light', 'Claro'], ['dark', 'Escuro'], ['system', 'Auto']] as [Theme, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{label}</button>)}</div>
      <a className="ck-btn quiet" href={PUBLIC_SITE} target="_blank" rel="noreferrer" aria-label="Abrir o site público">Público ↗</a>
      {onLogout && <button type="button" className="ck-btn quiet" onClick={onLogout}>Sair</button>}
    </div>
  </header>;
}
function SubNav({active}: {active: string}) {
  const links = SECTION_LINKS;
  return <nav className="ck-subnav" aria-label="Seções (celular)">{links.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id}>{label}</a>)}</nav>;
}

function Login({onDone}: {onDone: () => void}) {
  const [pin, setPin] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = pin; setPin(''); setBusy(true); setError('');
    try { await login(value); onDone(); }
    catch (e) { const code = e instanceof HttpError ? e.code : ''; setError(code === 'RATE_LIMITED' ? 'Muitas tentativas. Aguarde 15 minutos.' : code === 'AUTH_NOT_CONFIGURED' ? 'O acesso privado não está configurado neste servidor.' : code === 'AUTH_REQUIRED' ? 'Código incorreto.' : 'Não foi possível entrar agora.'); }
    finally { setBusy(false); }
  };
  return <main className="ck-login">
    <p className="ck-eyebrow">Área privada</p>
    <h1>Cockpit do NEXO.</h1>
    <p style={{color: 'var(--fg-2)'}}>Estado da equipe, frentes, resultados e o que aparece no site público.</p>
    <form onSubmit={submit} autoComplete="off">
      <label htmlFor="ck-pin">Código de acesso</label>
      <input id="ck-pin" type="password" minLength={8} maxLength={128} autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value)} required disabled={busy}/>
      <button className="ck-btn primary" type="submit" disabled={busy || pin.length < 8}>{busy ? 'Entrando…' : 'Entrar'}</button>
      {error && <p role="alert" style={{color: 'var(--bad)', margin: 0}}>{error}</p>}
    </form>
  </main>;
}

function CockpitLoading() {
  return <main className="ck-main ck-loading">
    <p className="ck-loading-status" role="status">Carregando dados do cockpit…</p>
    <div aria-hidden="true">
      <div className="ck-loading-hero">
        <span className="ck-skeleton-line title"/>
        <span className="ck-skeleton-line text"/>
      </div>
      <div className="ck-kpis">
        {Array.from({length: 5}, (_, index) => <div key={index} className="ck-kpi">
          <span className="ck-skeleton-line label"/>
          <span className="ck-skeleton-line value"/>
        </div>)}
      </div>
      <div className="ck-overview">
        {[0, 1].map(index => <div key={index} className="ck-panel ck-skeleton-panel">
          <span className="ck-skeleton-line label"/>
          <span className="ck-skeleton-line title"/>
          <span className="ck-skeleton-line text"/>
        </div>)}
      </div>
    </div>
  </main>;
}

function draftFrom(selection: Selection | null, data: Cockpit): Draft {
  if (!selection) return {catalog: data.catalog.available ? data.catalog.rows.map(r => r.key) : [], tower: {}, campaigns: {}};
  return {
    catalog: [...selection.catalog],
    tower: Object.fromEntries(selection.tower.map(t => [t.id, {question: clean(t.public.question), answers: clean(t.public.answers), method: clean(t.public.method), result: clean(t.public.result)}])),
    campaigns: Object.fromEntries(selection.campaigns.map(c => [c.id, {state: c.state, public: {question: clean(c.public.question), why: clean(c.public.why), currentStage: clean(c.public.currentStage), nextStep: clean(c.public.nextStep), closure: clean(c.public.closure)}}])),
  };
}
const normalized = (d: Draft) => JSON.stringify({catalog: [...d.catalog].sort(), tower: Object.keys(d.tower).sort().map(k => [k, d.tower[k]]), campaigns: Object.keys(d.campaigns).sort().map(k => [k, d.campaigns[k]])});

function BiField({label, value, onChange, showEn, error, rows = 2, max = 1500}: {label: string; value: Bi; onChange: (v: Bi) => void; showEn: boolean; error?: string; rows?: number; max?: number}) {
  const id = useRef(`f-${Math.random().toString(36).slice(2, 9)}`).current;
  return <div className="ck-field" data-error={error ? '' : undefined}>
    <label htmlFor={id}><span>{label}</span>{error && <span className="ck-err">{FIELD[error] ?? error}</span>}</label>
    <textarea id={id} rows={rows} maxLength={max} value={value['pt-BR']} onChange={e => onChange({...value, 'pt-BR': e.target.value})}/>
    {showEn && <textarea aria-label={`${label} (inglês)`} rows={rows} maxLength={max} placeholder="Inglês (vazio = usa o português)" value={value.en} onChange={e => onChange({...value, en: e.target.value})} style={{marginTop: 6}}/>}
  </div>;
}
function SourcePanel({row, keys}: {row: Row; keys: [string, string][]}) {
  return <aside className="ck-source"><p className="ck-eyebrow" style={{margin: 0}}>Linha da fonte (privada)</p><dl>{keys.filter(([k]) => row[k]).map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{row[k]}</dd></div>)}</dl></aside>;
}
function Switch({checked, onChange, label}: {checked: boolean; onChange: (v: boolean) => void; label: string}) {
  return <label className="ck-switch"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><span className="track" aria-hidden="true"/><span>{label}</span></label>;
}
function Section({id, n, title, lead, children, aside}: {id: string; n: string; title: string; lead?: ReactNode; children: ReactNode; aside?: ReactNode}) {
  return <section className="ck-section" id={id} aria-labelledby={`${id}-h`}>
    <p className="ck-eyebrow">{n} / {id === 'publico' ? 'público' : id === 'equipe' ? 'automações' : id}</p>
    <div className="ck-section-head"><h2 id={`${id}-h`}>{title}</h2>{lead && <p>{lead}</p>}{aside}</div>
    {children}
  </section>;
}

function Workspace({data, reload, onLogout, theme, setTheme, refreshing, refreshError, onAccessFailure}: {onAccessFailure: (status: number) => void; refreshing: boolean; refreshError: string; data: Cockpit; reload: () => Promise<void>; onLogout: () => void; theme: Theme; setTheme: (t: Theme) => void}) {
  const alive = useRef(true);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const selection = data.selection.available ? data.selection.value : null;
  const base = useMemo(() => draftFrom(selection, data), [data]);
  const [draft, setDraft] = useState<Draft>(base);
  const previousBase = useRef(base);
  useEffect(() => {
    const previous = previousBase.current;
    setDraft(current => reconcileDraft(current, previous, base, normalized));
    previousBase.current = base;
  }, [base]);
  const [open, setOpen] = useState<string | null>(null), [showEn, setShowEn] = useState(false);
  const [tab, setTab] = useState<'catalog' | 'tower' | 'campaigns' | 'audit'>('catalog'), [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false), [status, setStatus] = useState<{tone?: string; text: string} | null>(null), [errors, setErrors] = useState<SaveError[]>([]);
  const [active, setActive] = useState('agora');
  const [automatic, setAutomatic] = useState(false);
  const [publicVersion, setPublicVersion] = useState<number | null>(null), [checkingPublic, setCheckingPublic] = useState(false), [publicCheckError, setPublicCheckError] = useState('');
  const checkPublic = useCallback(async () => {
    setCheckingPublic(true); setPublicCheckError('');
    try {
      const published = await loadPublicSelection();
      if (published.contract !== 'ATLAS_PUBLIC_SELECTION_V1' || !['LIVE', 'UNSET'].includes(published.mode) || published.mode === 'LIVE' && (!Number.isSafeInteger(published.version) || published.version! < 1)) throw new Error('CONTRACT');
      setPublicVersion(published.mode === 'LIVE' ? published.version! : 0);
    } catch { setPublicVersion(null); setPublicCheckError('Não foi possível conferir a API pública agora.'); }
    finally { setCheckingPublic(false); }
  }, []);
  useEffect(() => { void checkPublic(); }, [checkPublic, selection?.version]);
  const [frontQuery, setFrontQuery] = useState(''), [resultQuery, setResultQuery] = useState('');
  const [frontFilter, setFrontFilter] = useState<SelectionFilter>('all'), [resultFilter, setResultFilter] = useState<SelectionFilter>('all');
  const [frontState, setFrontState] = useState('');
  const [frontPage, setFrontPage] = useState(1), [resultPage, setResultPage] = useState(1), [catalogPage, setCatalogPage] = useState(1);
  useEffect(() => setFrontPage(1), [frontQuery, frontFilter, frontState]);
  useEffect(() => setResultPage(1), [resultQuery, resultFilter]);
  useEffect(() => setCatalogPage(1), [query]);
  useEffect(() => {
    const ids = SECTION_LINKS.map(([id]) => id);
    const io = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); }, {rootMargin: '-30% 0px -60% 0px'});
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  const shadow = data.shadow.available ? data.shadow : null;
  const shadowReason = data.shadow.available ? '' : data.shadow.reason;
  const shadowRateLimited = shadowReason === 'SHADOW_CONNECT_RATE_LIMITED';
  const readable=(tab:ShadowTab)=>shadow?.availability?.[tab]==='available';
  const unreadTabs=(['roadmap','mural','resumo','resultados','equipe'] as ShadowTab[]).filter(tab=>!readable(tab));
  const towerCands = data.candidates.tower, campCands = data.candidates.campaigns;
  const catalogRows = data.catalog.available ? data.catalog.rows : [];
  const dirty = normalized(draft) !== normalized(base);
  const unset = data.selection.available && !selection;
  const draftVersion = useRef(selection?.version ?? 0);
  useEffect(() => { if (!dirty) draftVersion.current = selection?.version ?? 0; }, [dirty, selection?.version]);
  const versionConflict = dirty && draftVersion.current !== (selection?.version ?? 0);
  useEffect(() => {
    if (shadowRateLimited) return;
    const timer = window.setInterval(() => {
      if (canRefresh({automatic, dirty, saving, loading: refreshing, visible: document.visibilityState === 'visible'})) void reload();
    }, 5 * 60000);
    return () => window.clearInterval(timer);
  }, [automatic, dirty, saving, refreshing, reload, shadowRateLimited]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const drift = new Map(data.drift.map(d => [d.id, d.status]));
  const errFor = (kind: string, id: string, field?: string) => errors.find(e => e.kind === kind && e.id === id && (field === undefined || e.field === field))?.code;

  const toggleTower = (id: string, on: boolean) => {
    const c = towerCands.find(x => x.id === id);
    setDraft(d => {
      const tower = {...d.tower};
      if (on && c) tower[id] = {question: clean(c.draft.question), answers: clean(c.draft.answers), method: clean(c.draft.method), result: clean(c.draft.result)};
      else if (!on) delete tower[id];
      return {...d, tower};
    });
    if (on) setOpen(`t:${id}`);
  };
  const toggleCampaign = (id: string, on: boolean) => {
    const c = campCands.find(x => x.id === id);
    setDraft(d => {
      const campaigns = {...d.campaigns};
      if (on) campaigns[id] = {state: 'ongoing', public: {question: clean(c?.draft.question), why: empty(), currentStage: clean(c?.draft.currentStage), nextStep: clean(c?.draft.nextStep), closure: empty()}};
      else delete campaigns[id];
      return {...d, campaigns};
    });
    if (on) setOpen(`c:${id}`);
  };
  const setTower = (id: string, field: keyof TowerPublic, value: Bi) => setDraft(d => ({...d, tower: {...d.tower, [id]: {...d.tower[id], [field]: value}}}));
  const setCampaign = (id: string, patch: Partial<CampaignPublic>, state?: 'ongoing' | 'completed') => setDraft(d => ({...d, campaigns: {...d.campaigns, [id]: {state: state ?? d.campaigns[id].state, public: {...d.campaigns[id].public, ...patch}}}}));
  const toggleCatalog = (key: string, on: boolean) => setDraft(d => ({...d, catalog: on ? [...d.catalog, key] : d.catalog.filter(k => k !== key)}));

  const publish = async () => {
    setSaving(true); setStatus(null); setErrors([]);
    const nonEmpty = (b: Bi) => (b['pt-BR'].trim() || b.en.trim() ? b : null);
    try {
      const result = await saveSelection({
        expectedVersion: draftVersion.current, catalog: draft.catalog,
        tower: Object.entries(draft.tower).map(([id, p]) => ({id, public: p})),
        campaigns: Object.entries(draft.campaigns).map(([id, c]) => ({id, state: c.state, public: {question: c.public.question, why: nonEmpty(c.public.why ?? empty()), currentStage: nonEmpty(c.public.currentStage ?? empty()), nextStep: nonEmpty(c.public.nextStep ?? empty()), closure: nonEmpty(c.public.closure ?? empty())}})),
      });
      if (!alive.current) return;
      draftVersion.current = result.version;
      setStatus({tone: 'ok', text: `Seleção v${result.version} salva. O site público consulta as atualizações automaticamente.`});
      await reload();
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof HttpError && e.code === 'SELECTION_INVALID') { setErrors((e.detail.errors as SaveError[]) ?? []); setStatus({tone: 'bad', text: 'Nada foi publicado. Corrija os campos marcados.'}); const first = (e.detail.errors as SaveError[])?.[0]; if (first) {setOpen(`${first.kind === 'tower' ? 't' : 'c'}:${first.id}`); setTab(first.kind === 'campaigns' ? 'campaigns' : 'tower'); document.getElementById('publico')?.scrollIntoView();} }
      else if (e instanceof HttpError && e.code === 'VERSION_CONFLICT') setStatus({tone: 'bad', text: 'Outra sessão publicou antes. Recarregue para ver a versão atual; suas alterações ainda estão aqui.'});
      else if (e instanceof HttpError && [401, 503].includes(e.status)) onAccessFailure(e.status);
      else setStatus({tone: 'bad', text: 'Não foi possível publicar agora. Nada mudou no site público.'});
    } finally { setSaving(false); }
  };

  const equipe = shadow?.equipe ?? [];
  const publishedCount = !data.selection.available ? null : selection ? selection.catalog.length+selection.tower.length : data.catalog.available ? catalogRows.length : null;
  const approvedResults = new Set(selection?.tower.map(r => r.id) ?? []), approvedFronts = new Set(selection?.campaigns.map(r => r.id) ?? []);
  const changed = new Set(data.drift.map(r => r.id));
  const frontsView = pageRows(filterCandidates(newestFirst(campCands, 'atualizado'), frontQuery, frontFilter, new Set(Object.keys(draft.campaigns)), changed, frontState), frontPage);
  const resultsView = pageRows(filterCandidates(newestFirst(towerCands, 'data'), resultQuery, resultFilter, new Set(Object.keys(draft.tower)), changed), resultPage);
  const frontStates = [...new Set(campCands.map(r => r.source.status).filter(Boolean))].sort();
  const q = query.trim().toLocaleLowerCase('pt-BR');
  const catalogView = catalogRows.filter(r => !q || r.question['pt-BR'].toLocaleLowerCase('pt-BR').includes(q));
  const catalogPaged = pageRows(catalogView, catalogPage, 12);

  const towerEditor = (id: string, source?: Row) => {
    const p = draft.tower[id]; if (!p) return null;
    return <div className="ck-editor">
      <div className="ck-fields">
        <BiField label="Pergunta pública" value={p.question} onChange={v => setTower(id, 'question', v)} showEn={showEn} error={errFor('tower', id, 'question')} rows={2} max={1500}/>
        <BiField label="O que responde e limites" value={p.answers} onChange={v => setTower(id, 'answers', v)} showEn={showEn} error={errFor('tower', id, 'answers')}/>
        <BiField label="Método" value={p.method} onChange={v => setTower(id, 'method', v)} showEn={showEn} error={errFor('tower', id, 'method')}/>
        <BiField label="Resultado" value={p.result} onChange={v => setTower(id, 'result', v)} showEn={showEn} error={errFor('tower', id, 'result')} rows={3}/>
        {errFor('tower', id) && !['question', 'answers', 'method', 'result'].some(f => errFor('tower', id, f)) && <p className="ck-note" data-tone="bad">{FIELD[errFor('tower', id)!]}</p>}
      </div>
      {source ? <SourcePanel row={source} keys={[['data', 'Data'], ['titulo', 'Título'], ['resultado', 'Resultado'], ['numeros', 'Números'], ['limites', 'Limites']]}/> : <aside className="ck-source">Esta linha não está na leitura atual da SHADOW. O texto aprovado continua publicado até você desligar.</aside>}
    </div>;
  };
  const campaignEditor = (id: string, source?: Row) => {
    const c = draft.campaigns[id]; if (!c) return null;
    return <div className="ck-editor">
      <div className="ck-fields">
        <BiField label="Pergunta ou título público" value={c.public.question} onChange={v => setCampaign(id, {question: v})} showEn={showEn} error={errFor('campaigns', id, 'question')} rows={1} max={300}/>
        <BiField label="Por que importa (opcional)" value={c.public.why ?? empty()} onChange={v => setCampaign(id, {why: v})} showEn={showEn} error={errFor('campaigns', id, 'why')}/>
        <BiField label="Etapa atual (opcional)" value={c.public.currentStage ?? empty()} onChange={v => setCampaign(id, {currentStage: v})} showEn={showEn} error={errFor('campaigns', id, 'currentStage')} rows={1} max={300}/>
        <BiField label="Próximo passo (opcional)" value={c.public.nextStep ?? empty()} onChange={v => setCampaign(id, {nextStep: v})} showEn={showEn} error={errFor('campaigns', id, 'nextStep')}/>
        <div className="ck-seg" role="group" aria-label="Situação pública">{(['ongoing', 'completed'] as const).map(s => <button key={s} type="button" aria-pressed={c.state === s} onClick={() => setCampaign(id, {}, s)}>{s === 'ongoing' ? 'Em andamento' : 'Concluída'}</button>)}</div>
        {c.state === 'completed' && <BiField label="Resumo do encerramento" value={c.public.closure ?? empty()} onChange={v => setCampaign(id, {closure: v})} showEn={showEn} error={errFor('campaigns', id, 'closure') ?? (errFor('campaigns', id) === 'CLOSURE_REQUIRED' ? 'CLOSURE_REQUIRED' : undefined)}/>}
      </div>
      {source ? <SourcePanel row={source} keys={[['titulo', 'Título'], ['status', 'Status'], ['prio', 'Prioridade'], ['proximo_teste', 'Próximo teste'], ['nota', 'Nota'], ['atualizado', 'Atualizado']]}/> : <aside className="ck-source">Esta frente não está na leitura atual da SHADOW.</aside>}
    </div>;
  };
  const changes = (() => {
    const cat = draft.catalog.filter(k => !base.catalog.includes(k)).length + base.catalog.filter(k => !draft.catalog.includes(k)).length;
    const tw = Object.keys({...draft.tower, ...base.tower}).filter(k => JSON.stringify(draft.tower[k]) !== JSON.stringify(base.tower[k])).length;
    const cp = Object.keys({...draft.campaigns, ...base.campaigns}).filter(k => JSON.stringify(draft.campaigns[k]) !== JSON.stringify(base.campaigns[k])).length;
    return cat + tw + cp;
  })();

  return <div className="ck-app">
    <a className="visually-hidden" href="#agora">Ir para o conteúdo</a>
    <Header theme={theme} setTheme={setTheme} onLogout={onLogout} active={active}/>
    <SubNav active={active}/>
    <main className="ck-main ck-dashboard">
      <div className="ck-hero" id="agora" style={{scrollMarginTop: 84}}>
        <div><p className="ck-eyebrow">Cockpit privado</p><h1>Estado da pesquisa, <em>agora.</em></h1><p>Equipe, frentes e resultados lidos da Tower SHADOW, e o controle do que aparece em nexoresearch.org.</p></div>
        <div className="ck-stamp">
          <span className="ck-state" data-tone={shadow ? (unreadTabs.length || shadow.cache?.stale ? 'warn' : 'ok') : 'bad'}>{shadow ? (shadow.cache?.stale ? 'SHADOW: última leitura válida' : unreadTabs.length ? 'SHADOW: leitura parcial' : 'SHADOW consultada') : 'SHADOW indisponível'}</span><br/>Consulta iniciada: {when(data.generatedAt)}<br/>Modificação da fonte: {shadow ? when(shadow.modifiedAt) : 'indisponível'}<br/>
          {shadow?.cache && <>Linhas lidas da Tower em: {when(shadow.cache.fetchedAt)}<br/></>}
          <button type="button" className="ck-btn ck-refresh-button" disabled={refreshing || dirty || saving} data-reading={refreshing || undefined} onClick={() => void reload()}>{refreshing ? 'Atualizando…' : 'Atualizar leitura'}</button>
          <span role="status" className="visually-hidden">{refreshing ? 'Atualizando leitura…' : ''}</span>
        </div>
      </div>
      <div className="ck-livebar"><label><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)}/> Atualizar a cada 5 minutos</label><span>{dirty ? 'Atualização pausada durante a edição. Publique ou descarte o rascunho para continuar.' : shadowRateLimited ? 'Atualização automática pausada pelo limite da conexão.' : automatic ? 'Atualizações enquanto esta página estiver visível.' : 'Atualização manual.'}</span></div>
      {refreshError && <p className="ck-note" data-tone="warn" role="alert">A última atualização falhou. Os dados abaixo são da leitura de {when(data.generatedAt)}. Tente atualizar novamente.</p>}
      {!shadow && <p className="ck-note" data-tone="warn" style={{marginTop: 18}}><strong>{shadowRateLimited ? 'A conexão com o Google atingiu o limite de solicitações.' : 'Fonte SHADOW indisponível nesta leitura.'}</strong> {shadowRateLimited ? 'A atualização automática está pausada. Use Atualizar leitura quando a conexão voltar.' : `Código da falha ${shadowReason}.`} A seleção já aprovada permanece preservada.</p>}
      {shadow && <div className="ck-note"><p role="status"><strong>Fonte SHADOW · recorte limitado.</strong> {unreadTabs.length ? `Abas indisponíveis ou sem cobertura informada: ${unreadTabs.join(', ')}.` : 'As abas listadas responderam nesta consulta.'}</p><details><summary>Cobertura e proveniência</summary><p>A data de modificação é informada pela fonte e não comprova leitura atômica. A consulta usa até 100 linhas recentes de resultados, filtradas na projeção; até 60 seguem para a atividade. A ausência de um registro pode indicar limite da janela ou filtragem, não exclusão.</p><p>A comparação das aprovações usa uma projeção limitada: método e referências não integram seu hash atual, e alguns campos podem ser reduzidos. Ausência de alerta não comprova que a fonte inteira permaneceu igual.</p><p>O snapshot JSON da outra área privada é uma leitura distinta. Esta tela não compara sua revisão com a SHADOW.</p></details></div>}
      <dl className="ck-kpis">
        <div className="ck-kpi"><dt>Resultados no recorte</dt><dd>{readable('resultados') ? towerCands.length : '—'}</dd></div>
        <div className="ck-kpi"><dt>Frentes no recorte</dt><dd>{readable('roadmap') ? campCands.length : '—'}</dd></div>
        <div className="ck-kpi"><dt>Automações no recorte</dt><dd>{readable('equipe') ? equipe.length : '—'}</dd></div>
        <div className="ck-kpi"><dt>Análises no público</dt><dd>{publishedCount ?? '—'}<small>{unset ? ' estático' : ''}</small></dd></div>
        <div className="ck-kpi" data-tone={data.drift.length ? 'warn' : undefined}><dt>Diferenças detectadas no recorte</dt><dd>{data.selection.available && readable('resultados') && readable('roadmap') ? data.drift.length : '—'}</dd></div>
      </dl>
      <div className="ck-overview">
        <article className="ck-panel ck-publication-summary"><p className="ck-eyebrow">Publicação no site</p><h2>{!data.selection.available ? 'Seleção indisponível' : selection ? `Versão ${selection.version} na seleção` : 'Seleção ainda não ativada'}</h2><p>{!data.selection.available ? 'Não foi possível ler a seleção privada.' : selection ? `Registrada em ${when(selection.updatedAt)}.` : 'A seleção do Cockpit ainda não foi ativada.'}</p><dl><div><dt>Catálogo</dt><dd>{!data.selection.available ? '—' : selection?.catalog.length ?? (data.catalog.available ? catalogRows.length : '—')}</dd></div><div><dt>Resultados SHADOW</dt><dd>{data.selection.available ? selection?.tower.length ?? 0 : '—'}</dd></div><div><dt>Frentes</dt><dd>{data.selection.available ? selection?.campaigns.length ?? 0 : '—'}</dd></div></dl><p className="ck-public-check" role="status">{checkingPublic ? 'Conferindo a API pública…' : !data.selection.available ? 'A seleção privada está indisponível para comparação.' : publicCheckError || (publicVersion === (selection?.version ?? 0) ? `API pública confirmou ${publicVersion ? `a versão ${publicVersion}` : 'o catálogo estático'}.` : publicVersion === null ? 'Aguardando conferência pública.' : `A API pública ainda retorna ${publicVersion ? `a versão ${publicVersion}` : 'o catálogo estático'}. Consulte novamente após a atualização.`)}</p><button type="button" className="ck-btn quiet" disabled={checkingPublic} onClick={() => void checkPublic()}>Conferir publicação</button><p>Novos dados da SHADOW ficam no privado até a revisão do texto e a publicação da seleção.</p><a className="ck-btn" href="#resultados">Revisar resultados</a> <a className="ck-btn quiet" href="#publico">Gerenciar publicação</a></article>
        <article className="ck-panel ck-activity"><p className="ck-eyebrow">Registro da SHADOW</p><h2>Últimos movimentos</h2><p className="ck-muted">Registros da aba RESUMO; as datas de cada evento são preservadas.</p>{!readable('resumo') ? <p>Leitura da aba RESUMO indisponível ou sem cobertura informada.</p> : shadow?.resumo.length ? <div className="ck-activity-list">{[...shadow.resumo].sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora))).slice(0, 4).map((r, i) => <details key={i}><summary><span className="ck-meta">{r.data_hora} · {r.nivel || 'Registro'}</span><span className="ck-line-clamp">{r.o_que_mudou}</span></summary><p>{r.o_que_mudou}</p>{r.impacto && <p><strong>Impacto:</strong> {r.impacto}</p>}</details>)}</div> : <p>Nenhum registro de resumo disponível neste recorte.</p>}</article>
      </div>

      <Section id="aovivo" n="01" title="Atividade recente" lead="Registros disponíveis no Mural, Resultados e Resumo da última consulta. Um registro recente não comprova execução atual.">
        {shadow ? <CockpitLive mural={shadow.mural} resultados={shadow.resultados} resumo={shadow.resumo} equipe={equipe} activityComplete={readable('mural')&&readable('resultados')&&readable('resumo')}/> : <p className="ck-note" data-tone="warn">Sem leitura da SHADOW.</p>}
      </Section>

      <Section id="equipe" n="02" title="Automações" lead="Cada automação declarada na aba EQUIPE: cadência, próxima execução e o que ela de fato registrou no Mural e em Resultados nas últimas 24 horas.">
        {shadow && readable('equipe') ? <CockpitTeam equipe={equipe} mural={shadow.mural} resultados={shadow.resultados} resumo={shadow.resumo} activityComplete={readable('mural')&&readable('resultados')&&readable('resumo')}/> : <p className="ck-note" data-tone="warn">Aba EQUIPE indisponível ou sem cobertura informada nesta leitura.</p>}
      </Section>

      <Section id="filas" n="03" title="Filas, achados e manuscritos" lead="Filas do Mural da nova arquitetura, placar de achados (G3, G4, G5), cartões para decisão e o estado dos manuscritos.">
        {shadow ? <CockpitArchitecture architecture={data.architecture}/> : <p className="ck-note" data-tone="warn">Sem leitura da SHADOW.</p>}
      </Section>

      <Section id="frentes" n="04" title="Frentes e campanhas" lead="Ligue uma frente para mostrá-la no público. Só o texto que você escrever aqui é publicado; o ID e as notas internas ficam no privado.">
        <CandidateControls label="frentes" query={frontQuery} setQuery={setFrontQuery} filter={frontFilter} setFilter={setFrontFilter} states={frontStates} state={frontState} setState={setFrontState}/>
        <div className="ck-panel ck-list">{frontsView.rows.map(c => {
          const on = Boolean(draft.campaigns[c.id]), isOpen = open === `c:${c.id}`;
          return <div className="ck-item" key={c.id}>
            <div className="ck-item-row"><span className="ck-state" data-tone={on ? 'live' : tone(c.source.status)} title={publicationState(on, approvedFronts.has(c.id))}>{publicationState(on, approvedFronts.has(c.id))}</span>
              <div><h3>{humanTitle(c.source.titulo || '', humanTitle(c.source.item || '', 'Frente sem título em linguagem corrente'))}</h3><div className="ck-meta"><span>{c.source.status || 'sem status'}</span>{c.source.prio && <span>prioridade {c.source.prio}</span>}{c.source.atualizado && <span>{c.source.atualizado}</span>}{drift.get(c.id) && <span style={{color: 'var(--warn)'}}>fonte alterada desde a aprovação</span>}</div>{c.source.proximo_teste && <p>Próximo: {c.source.proximo_teste}</p>}
                {on && <button type="button" className="ck-btn quiet" style={{marginTop: 8}} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `c:${c.id}`)}>{isOpen ? 'Fechar texto público' : 'Editar texto público'}</button>}</div>
              <Switch checked={on} onChange={v => toggleCampaign(c.id, v)} label="Selecionar para publicar"/></div>
            {on && isOpen && campaignEditor(c.id, c.source)}
          </div>;
        })}{!frontsView.total && <p style={{padding: 16, margin: 0, color: 'var(--fg-2)'}}>{readable('roadmap') ? 'Nenhuma frente disponível corresponde aos filtros deste recorte.' : 'Aba ROADMAP indisponível ou sem cobertura informada.'}</p>}</div>
        <Pager {...frontsView} setPage={setFrontPage} label="frentes"/>
      </Section>

      <Section id="resultados" n="05" title="Resultados recentes" lead="As últimas linhas de RESULTADOS. Ao ligar uma, o rascunho vem da própria linha; complete o método e revise antes de publicar.">
        <CandidateControls label="resultados" query={resultQuery} setQuery={setResultQuery} filter={resultFilter} setFilter={setResultFilter}/>
        <div className="ck-panel ck-list">{resultsView.rows.map(c => {
          const on = Boolean(draft.tower[c.id]), isOpen = open === `t:${c.id}`;
          return <div className="ck-item" key={c.id}>
            <div className="ck-item-row"><span className="ck-state" data-tone={on ? 'live' : undefined}>{publicationState(on, approvedResults.has(c.id))}</span>
              <div>{(() => { const h = humanizeResult(c.source, agentName(c.source.task || '')); return <><h3>{h.title}</h3><p className="ck-line-clamp">{h.body}</p>{h.metrics.length > 0 && <p className="ck-meta">{h.metrics.join(' · ')}</p>}</>; })()}<details className="ck-result-details"><summary>Ler resultado e limites</summary><SourcePanel row={c.source} keys={[['resultado', 'Resultado'], ['numeros', 'Números'], ['limites', 'Limites']]}/></details><div className="ck-meta"><span>{c.source.data}</span>{c.source.numeros && <span>{c.source.numeros}</span>}{drift.get(c.id) && <span style={{color: 'var(--warn)'}}>fonte alterada desde a aprovação</span>}</div>
                {on && <button type="button" className="ck-btn quiet" style={{marginTop: 8}} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `t:${c.id}`)}>{isOpen ? 'Fechar texto público' : 'Editar texto público'}</button>}</div>
              <Switch checked={on} onChange={v => toggleTower(c.id, v)} label="Selecionar para publicar"/></div>
            {on && isOpen && towerEditor(c.id, c.source)}
          </div>;
        })}{!resultsView.total && <p style={{padding: 16, margin: 0, color: 'var(--fg-2)'}}>{readable('resultados') ? 'Nenhum resultado disponível corresponde aos filtros deste recorte.' : 'Aba RESULTADOS indisponível ou sem cobertura informada.'}</p>}</div>
        <Pager {...resultsView} setPage={setResultPage} label="resultados"/>
      </Section>

      <Section id="publico" n="06" title="O que o público vê" lead="A seleção vale para nexoresearch.org assim que você publica. Itens não marcados somem do site; nada é apagado da Tower.">
        {versionConflict && <p className="ck-note" data-tone="warn" role="alert">Outra sessão publicou uma versão nova. Seu rascunho foi preservado; revise as diferenças antes de recomeçar a edição pela seleção atual. A publicação está pausada para evitar sobrescrever essas mudanças.</p>}
        {unset && data.catalog.available && <p className="ck-note" style={{marginBottom: 14}}><strong>O catálogo estático disponível nesta leitura tem {catalogRows.length} itens.</strong> Ao publicar pela primeira vez, o site passa a seguir só o que estiver marcado aqui. O rascunho já começa com todo o catálogo marcado.</p>}
        {data.drift.length > 0 && <p className="ck-note" data-tone="warn" style={{marginBottom: 14}}><strong>{data.drift.length} {data.drift.length === 1 ? 'item apresenta diferença ou não foi localizado' : 'itens apresentam diferença ou não foram localizados'} neste recorte.</strong> Uma ausência pode ocorrer pelo limite da janela ou pelos filtros. O texto aprovado continua no ar até uma decisão do responsável.</p>}
        {!data.catalog.available && <p className="ck-note" data-tone="warn" style={{marginBottom: 14}}>Catálogo publicado indisponível ({data.catalog.reason}). As marcações atuais do catálogo são mantidas.</p>}
        <div className="ck-tabs" role="group" aria-label="Partes da seleção">
          {([['catalog', 'Catálogo revisado', `${draft.catalog.length}/${data.catalog.available ? catalogRows.length : '—'}`], ['tower', 'Resultados escolhidos', Object.keys(draft.tower).length], ['campaigns', 'Frentes escolhidas', Object.keys(draft.campaigns).length], ['audit', 'Histórico', data.audit.length]] as const).map(([id, label, n]) => <button key={id} type="button" aria-pressed={tab === id} aria-controls="ck-publication-content" onClick={() => setTab(id)}>{label}<span className="n">{n}</span></button>)}
          <button type="button" aria-pressed={showEn} onClick={() => setShowEn(v => !v)} style={{marginLeft: 'auto'}}>Textos em inglês</button>
        </div>
        <div className="ck-tab-content" id="ck-publication-content" key={tab}>
        {tab === 'catalog' && <div className="ck-panel">
          <div className="ck-toolbar"><input className="ck-search" type="search" placeholder="Buscar pergunta" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar no catálogo"/>
            <button type="button" className="ck-btn" onClick={() => setDraft(d => ({...d, catalog: [...new Set([...d.catalog, ...catalogView.map(r => r.key)])]}))}>Marcar {q ? 'filtrados' : 'todos'}</button>
            <button type="button" className="ck-btn" onClick={() => setDraft(d => ({...d, catalog: d.catalog.filter(k => !catalogView.some(r => r.key === k))}))}>Desmarcar {q ? 'filtrados' : 'todos'}</button></div>
          <div className="ck-list">{catalogPaged.rows.map(r => <label className="ck-item ck-item-row" key={r.key} style={{cursor: 'pointer'}}><input className="ck-check" type="checkbox" checked={draft.catalog.includes(r.key)} onChange={e => toggleCatalog(r.key, e.target.checked)}/><div><h3 style={{fontWeight: 500}}>{r.question['pt-BR']}</h3><div className="ck-meta"><span>publicado {when(r.published_at)}</span></div></div></label>)}</div>
        </div>}
        {tab === 'catalog' && <Pager {...catalogPaged} setPage={setCatalogPage} label="catálogo"/>}
        {tab === 'tower' && <div className="ck-panel ck-list">{Object.keys(draft.tower).map(id => { const src = towerCands.find(c => c.id === id); const isOpen = open === `t:${id}`; return <div className="ck-item" key={id}><div className="ck-item-row"><span className="ck-state" data-tone={drift.get(id) ? 'warn' : 'live'}>{drift.get(id) === 'MISSING' ? 'não localizado no recorte' : drift.get(id) ? 'alterado' : publicationState(true, approvedResults.has(id))}</span><div><h3>{draft.tower[id].question['pt-BR'] || (src ? humanizeResult(src.source).title : '') || 'Resultado sem título em linguagem corrente'}</h3><button type="button" className="ck-btn quiet" style={{marginTop: 8}} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `t:${id}`)}>{isOpen ? 'Fechar' : 'Editar'}</button></div><Switch checked onChange={() => toggleTower(id, false)} label="Selecionar para publicar"/></div>{isOpen && towerEditor(id, src?.source)}</div>; })}{!Object.keys(draft.tower).length && <p style={{padding: 16, margin: 0, color: 'var(--fg-2)'}}>Nenhum resultado da Tower escolhido. Ligue um em “Resultados recentes”.</p>}</div>}
        {tab === 'campaigns' && <div className="ck-panel ck-list">{Object.keys(draft.campaigns).map(id => { const src = campCands.find(c => c.id === id); const isOpen = open === `c:${id}`; return <div className="ck-item" key={id}><div className="ck-item-row"><span className="ck-state" data-tone={drift.get(id) ? 'warn' : 'live'}>{publicationState(true, approvedFronts.has(id))} · {draft.campaigns[id].state === 'completed' ? 'concluída' : 'andamento'}</span><div><h3>{draft.campaigns[id].public.question['pt-BR'] || humanTitle(src?.source.titulo || '', 'Frente sem título em linguagem corrente')}</h3><button type="button" className="ck-btn quiet" style={{marginTop: 8}} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `c:${id}`)}>{isOpen ? 'Fechar' : 'Editar'}</button></div><Switch checked onChange={() => toggleCampaign(id, false)} label="Selecionar para publicar"/></div>{isOpen && campaignEditor(id, src?.source)}</div>; })}{!Object.keys(draft.campaigns).length && <p style={{padding: 16, margin: 0, color: 'var(--fg-2)'}}>Nenhuma frente escolhida. Ligue uma em “Frentes e campanhas”.</p>}</div>}
        {tab === 'audit' && <div className="ck-panel ck-scroll"><table className="ck-table"><thead><tr><th>Quando</th><th>Versão</th><th>Catálogo</th><th>Resultados</th><th>Frentes</th></tr></thead><tbody>{data.audit.map(a => <tr key={a.version}><td className="mono">{when(a.at)}</td><td className="mono">v{a.version}</td><td className="mono">{a.catalog.count} (+{a.catalog.added} −{a.catalog.removed})</td><td className="mono">{a.tower.count} (+{a.tower.added} −{a.tower.removed})</td><td className="mono">{a.campaigns.count} (+{a.campaigns.added} −{a.campaigns.removed})</td></tr>)}{!data.audit.length && <tr><td colSpan={5}>Nenhuma publicação ainda.</td></tr>}</tbody></table></div>}
        </div>
      </Section>
    </main>
    <div className="ck-savebar" role="region" aria-label="Publicação">
      <div className="ck-savebar-inner">
        <div aria-live="polite">{status ? <span style={{color: status.tone === 'bad' ? 'var(--bad)' : 'var(--ok)'}}>{status.text}</span> : dirty || unset ? <><strong>{unset && !dirty ? 'Seleção ainda não ativada' : `${changes} ${changes === 1 ? 'alteração não publicada' : 'alterações não publicadas'}`}</strong> <span className="mono">· público: {draft.catalog.length} do catálogo, {Object.keys(draft.tower).length} da Tower, {Object.keys(draft.campaigns).length} frentes</span></> : <span className="mono">Seleção salva · versão {selection?.version ?? '—'} · {when(selection?.updatedAt)}</span>}</div>
        <div style={{display: 'flex', gap: 8}}>
          <button type="button" className="ck-btn" disabled={!dirty || saving} onClick={() => { setDraft(base); setErrors([]); setStatus(null); }}>Descartar</button>
          <button type="button" className="ck-btn primary" disabled={(!dirty && !unset) || saving || refreshing || versionConflict || !data.selection.available || (unset && !data.catalog.available)} onClick={() => void publish()}>{saving ? 'Publicando…' : unset && !dirty ? 'Ativar seleção' : 'Publicar agora'}</button>
        </div>
      </div>
    </div>
  </div>;
}

export default function CockpitApp() {
  const [theme, setTheme] = useTheme();
  const [phase, setPhase] = useState<'checking' | 'leaving' | 'login' | 'ready' | 'error'>('checking');
  const [data, setData] = useState<Cockpit | null>(null), [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const readGate = useRef(createReadGate());
  const leaving = useRef(false);
  const load = useCallback(async () => {
    if (leaving.current) return;
    const ticket = readGate.current.start(); if (!ticket) return;
    setRefreshing(true);
    try {
      const next = await loadCockpit(ticket.controller.signal);
      if (!readGate.current.valid(ticket)) return;
      setData(next); setError(''); setPhase('ready');
    } catch (e) {
      if (!readGate.current.valid(ticket)) return;
      if (e instanceof HttpError && e.status === 401) { setData(null); setPhase('login'); }
      else {setError(e instanceof HttpError ? e.code : 'ERRO'); if (e instanceof HttpError && e.status === 503) {setData(null); setPhase('error');} else setPhase(p => p === 'ready' ? 'ready' : 'error');}
    } finally {if (readGate.current.finish(ticket)) setRefreshing(false);}
  }, []);
  const onAccessFailure = useCallback((status: number) => {
    if (leaving.current) return;
    readGate.current.invalidate(); setRefreshing(false); setData(null);
    if (status === 401) setPhase('login'); else {setError('COCKPIT_UNAVAILABLE'); setPhase('error');}
  }, []);
  useEffect(() => {
    let alive = true; const stamp = readGate.current.stamp();
    session().then(s => {if (alive && stamp === readGate.current.stamp()) {if (s.authenticated) void load(); else setPhase('login');}}, () => {if (alive) setPhase('login');});
    return () => {alive = false;};
  }, [load]);
  useEffect(() => {
    const hide = () => {readGate.current.invalidate(); setData(null); setRefreshing(false);};
    const show = (event: PageTransitionEvent) => {if (event.persisted && !leaving.current) {setPhase('checking'); void load();}};
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => {window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); readGate.current.invalidate();};
  }, [load]);
  const out = async () => {
    leaving.current = true; readGate.current.invalidate(); setData(null); setRefreshing(false); setPhase('leaving');
    try {await logout(); setPhase('login');} catch {setError('LOGOUT_UNAVAILABLE'); setPhase('error');}
    finally {readGate.current.invalidate(); leaving.current = false;}
  };
  if (phase === 'ready' && data) return <Workspace data={data} onAccessFailure={onAccessFailure} refreshing={refreshing} refreshError={error} reload={load} onLogout={() => void out()} theme={theme} setTheme={setTheme}/>;
  return <div className="ck-app"><Header theme={theme} setTheme={setTheme}/>
    {refreshing && phase !== 'leaving' ? <CockpitLoading/> : <>
      {(phase === 'checking' || phase === 'leaving') && <main className="ck-login"><p role="status">{phase === 'leaving' ? 'Encerrando a sessão…' : 'Verificando a sessão…'}</p></main>}
      {phase === 'login' && <Login onDone={() => void load()}/>}
      {phase === 'error' && <main className="ck-login"><h1>Cockpit indisponível.</h1><p>Não foi possível ler o cockpit agora ({error}).</p><button type="button" className="ck-btn primary" onClick={() => void load()}>Tentar de novo</button></main>}
    </>}
  </div>;
}
