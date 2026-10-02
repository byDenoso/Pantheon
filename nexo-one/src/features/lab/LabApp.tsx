import { usePublishedClock } from '../../hooks/usePublishedClock.ts';
import { isPublishedFresh, publishedAgeMs } from '../../viewmodels/published-time.ts';
import { IncidentResponsibility } from '../../components/IncidentResponsibility.tsx';
import { incidentView, guardianAuditTime } from '../../viewmodels/incidents.ts';
// NEXO Observatório: páginas em HUD sobre a teia cósmica.
// Rotas: #/agora #/ciclo #/roadmaps #/roadmap/<id> #/evidencia[?v=] #/e/<id> #/saude
import { activityRange, activityWindow, observedActivity } from './activity-presentation.ts';
import { browserNarrationDeck } from './narration-deck.ts';
import { narrationEvidence } from './narration-evidence.ts';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SystemState } from '../../contracts/system.ts';
import {
  ago, buildLab, guardianArea, humanId, readBaseline, VERDICT_GLYPH, VERDICT_ORDER, VERDICT_PT,
  type Lab, type TestEntity, type Verdict,
} from './model.ts';
import type { ScenePage, SceneEvents } from './ObservatoryScene.tsx';
import { normDomain } from './domains.ts';
import './lab.css';
import '../../styles/atlas-cinematic.css';
import { currentVerdictText, matchesSearch, boardMeta, boardConversation, boardThreads, readinessLabel, hasPublishedValue, roadmapTrail, latestBoardRecord } from './presentation.ts';
import { BoardMessage } from './BoardMessage.tsx';
import { selectScienceFocus, scientificStatRows } from './science-presentation.ts';
import { autonomyPresentation, publishedQueueGap } from './autonomy-presentation.ts';
import { DependencyFlow } from './DependencyFlow.tsx';
import { LiveNowPanel } from './LiveNowPanel.tsx';
import { captureReading, publishedChanges, latestDelivery, eventLabel, focusEntities, type PublishedChange } from './live-state.ts';
import { UniversePage, UniverseFrontierPage } from './UniversePage.tsx';

const ObservatoryScene = lazy(() => import('./ObservatoryScene.tsx').then(m => ({ default: m.ObservatoryScene })));

import { labHref, replaceEvidenceSearch, type LabRoute } from './routes.ts';
export { labHref, parseLabRoute, LAB_PAGES, type LabRoute } from './routes.ts';

// ---------- peças base ----------
export function VerdictChip({ v, small }: { v: Verdict; small?: boolean }) {
  return <span className={`vchip v-${v.toLowerCase()}${small ? ' small' : ''}`}><i aria-hidden="true">{VERDICT_GLYPH[v]}</i>{VERDICT_PT[v]}</span>;
}
let nameOf: (id: string) => string = humanId;
const E = ({ id, children }: { id: string; children?: ReactNode }) => <a className="elink" href={labHref('entidade', id)}>{children ?? nameOf(id)}</a>;
function Stat({ n, label, delta, tone, lowerIsBetter }: { n: number | string; label: string; delta?: number | null; tone?: string; lowerIsBetter?: boolean }) {
  return <div className={`stat${tone ? ` tone-${tone}` : ''}`}>
    <strong>{typeof n === 'number' ? <CountUp to={n} /> : n}</strong><span>{label}</span>
    {delta ? <em className={(delta > 0) !== Boolean(lowerIsBetter) ? 'good' : 'bad'}>{delta > 0 ? '+' : ''}{delta}</em> : null}
  </div>;
}
function Section({ title, kicker, children, id }: { title: string; kicker?: string; children: ReactNode; id?: string }) {
  return <section className="hud-section" aria-labelledby={id}>
    {kicker && <p className="hud-kicker">{kicker}</p>}
    <h2 id={id}>{title}</h2>
    {children}
  </section>;
}
const Missing = ({ what }: { what: string }) => <p className="hud-missing">Aguardando dado da projeção: <code>{what}</code></p>;
// Texto legível: desembrulha envelopes {value, unavailable_reason, source_ref}, some com nulos, vira "chave: valor".
const unwrap = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object) && 'source_ref' in (v as object)) ? (v as { value: unknown }).value : v;
const fmt = (v: unknown): string => typeof v === 'number' ? (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(Math.round(v * 1e4) / 1e4)) : String(v);
const text = (raw: unknown): string | null => {
  const v = unwrap(raw);
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'object') return fmt(v);
  if (Array.isArray(v)) { const parts = v.map(text).filter(Boolean); return parts.length ? parts.join(' · ') : null; }
  const lines = Object.entries(v as Record<string, unknown>).filter(([k]) => !/^(source_ref|fingerprint|unavailable_reason)$/.test(k))
    .map(([k, x]) => { const t = text(x); return t ? `${k.replace(/_/g, ' ')}: ${t}` : null; }).filter(Boolean);
  return lines.length ? lines.join('\n') : null;
};

function Bar({ parts, total }: { parts: Array<[Verdict, number]>; total: number }) {
  return <span className="vbar" role="img" aria-label={parts.map(([v, n]) => `${n} ${VERDICT_PT[v]}`).join(', ')}>
    {parts.filter(([, n]) => n > 0).map(([v, n]) => <b key={v} className={`v-${v.toLowerCase()}`} style={{ flexGrow: n, flexBasis: 0 }} title={`${n} ${VERDICT_PT[v]}`} />)}
    {total > 0 ? null : <b className="v-ready" style={{ flexGrow: 1 }} />}
  </span>;
}

// ---------- app ----------
export default function LabApp({ state, route, theme }: { state: SystemState; route: LabRoute; theme: 'dark' | 'light' }) {
  const publishedNow = usePublishedClock();
  const sourceCurrent = isPublishedFresh(state.generated_at, undefined, publishedNow);
  const lab = useMemo(() => buildLab(state), [state]);
  nameOf = (id: string) => lab.tests.get(id)?.name ?? lab.hypotheses.get(id)?.statement ?? lab.roadmaps.get(id)?.title ?? humanId(id);
  const tests = useMemo(() => [...lab.tests.values()].filter(t => !t.contestOf), [lab]);
  const previousReading = useRef(captureReading(lab));
  const [changes, setChanges] = useState<PublishedChange[]>([]);
  const [changedAt, setChangedAt] = useState<string | null>(null);
  useEffect(() => {
    const next = publishedChanges(previousReading.current, lab);
    previousReading.current = captureReading(lab, previousReading.current);
    if (next.length) { setChanges(next); setChangedAt(lab.generatedAt); }
  }, [lab]);
  const [focus, setFocus] = useState<string[]>([]);
  const [explore, setExplore] = useState(false);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const [sceneAvailable, setSceneAvailable] = useState<boolean | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, { page: number; hud: number }>());
  const routeKey = `${route.page}:${route.id ?? ''}:${route.q ?? ''}:${route.search ?? ''}`;
  useLayoutEffect(() => {
    const hud = hudRef.current;
    const saved = scrollPositions.current.get(routeKey);
    if (!route.preserveScroll) {
      window.scrollTo({ top: saved?.page ?? 0, behavior: 'instant' });
      if (hud) hud.scrollTop = saved?.hud ?? 0;
    }
    const save = () => scrollPositions.current.set(routeKey, { page: window.scrollY, hud: hud?.scrollTop ?? 0 });
    if (route.preserveScroll) save();
    window.addEventListener('scroll', save, { passive: true });
    hud?.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); hud?.removeEventListener('scroll', save); };
  }, [routeKey]);
  // "Só a página": sem a teia atrás (mais leve no celular e mais legível); lembrado neste aparelho.
  const [flat, setFlat] = useState(() => { try { return localStorage.getItem('nexo.flat') === '1'; } catch { return false; } });
  const toggleFlat = () => setFlat(x => { const n = !x; try { localStorage.setItem('nexo.flat', n ? '1' : '0'); } catch { /* sem armazenamento */ } if (n) setExplore(false); return n; });
  useEffect(() => { setExplore(false); toolsRef.current?.removeAttribute('open'); }, [route.page, route.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setExplore(false);
      const tools = toolsRef.current;
      if (tools?.querySelector('.obs-tools-panel')?.contains(document.activeElement)) {
        tools.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
      }
      tools?.removeAttribute('open');
    };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  const thoughtKey = JSON.stringify((state.evolution?.thoughts ?? []).filter(thought => sourceCurrent && isPublishedFresh(thought.at, 2 * 3600e3, publishedNow)).slice(-2).map(thought => thought.id));
  const events = useMemo<SceneEvents>(() => sceneEvents(state, lab, sourceCurrent, JSON.parse(thoughtKey) as string[]), [state, lab, sourceCurrent, thoughtKey]);
  const [searching, setSearching] = useState(false);
  const [legend, setLegend] = useState(() => { try { return !localStorage.getItem('nexo.legend.seen'); } catch { return false; } });
  const closeLegend = () => { setLegend(false); try { localStorage.setItem('nexo.legend.seen', '1'); } catch { /* sem armazenamento */ } };
  const [sound, setSound] = useState(false);
  useAmbience(sound, events.grbs[0]?.href ?? null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(s => !s); }
      else if (e.key === 'Escape') setSearching(false);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  // Estrelas "acordadas": entidades com evento nas últimas 2 h pulsam mais forte na teia.
  const hot = useMemo(() => [...new Set((sourceCurrent ? activityWindow(lab.activity, 2, publishedNow).recent : []).filter(e => e.entity_id)
    .map(e => starOf(lab, e.entity_id!)).filter(Boolean) as string[])], [lab, sourceCurrent, publishedNow]);
  // Replay: a câmera percorre as últimas 24 h de eventos reais, na ordem em que aconteceram.
  const [replay, setReplay] = useState<number | null>(null);
  const reel = useMemo(() => activityWindow(lab.activity, 24).recent, [lab]);
  useEffect(() => {
    if (replay === null) return;
    if (replay >= reel.length) { setReplay(null); setFocus([]); return; }
    const e = reel[replay]!;
    const star = e.entity_id ? starOf(lab, e.entity_id) : null;
    setFocus(star ? [star] : []);
    const t = window.setTimeout(() => setReplay(r => (r === null ? null : r + 1)), star ? 2600 : 1200);
    return () => window.clearTimeout(t);
  }, [replay, reel, lab]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setReplay(null); setFocus([]); } };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  useEffect(() => {
    if (route.page === 'entidade' && route.id) setFocus(focusEntities(lab, route.id));
    else if (route.page === 'roadmap' && route.id) setFocus(lab.roadmaps.get(route.id)?.tests ?? []);
    else if (route.page === 'evidencia' && route.q) setFocus(tests.filter(t => t.verdict === route.q).map(t => t.id));
    else setFocus([]);
  }, [route.page, route.id, route.q, lab, tests]);

  const page = (() => {
    switch (route.page) {
      case 'universo': return route.id ? <UniverseFrontierPage cosmology={state.cosmology_state} lab={lab} id={route.id} /> : <UniversePage cosmology={state.cosmology_state} />;
      case 'ciclo': return <Cycle lab={lab} state={state} />;
      case 'roadmaps': return <Roadmaps lab={lab} />;
      case 'roadmap': return <RoadmapPage lab={lab} id={route.id!} />;
      case 'evidencia': return <Evidence lab={lab} state={state} filter={route.q as Verdict | undefined} search={route.search} />;
      case 'entidade': return <EntityPage lab={lab} state={state} id={route.id!} />;
      case 'saude': return <Health state={state} lab={lab} />;
      default: return <Now lab={lab} state={state} onReplay={() => { setExplore(false); setReplay(0); }} replayCount={reel.length} />;
    }
  })();

  const cur = replay !== null ? reel[replay] : null;
  return <div className={`observatory${sceneAvailable !== false && (explore || replay !== null) ? ' exploring' : ''}${flat ? ' flat' : ''}${sceneAvailable === false ? ' scene-unavailable' : ''}`} data-page={route.page}>
    <Intro />
    {cur && <div className="replay-caption" role="status" aria-live="polite">
      <span className="replay-clock">{new Date(cur.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <p><small className="feed-kind">Evento narrado · interface</small><b>{ROLE_PT[cur.role.toUpperCase()] ?? cur.role}</b> {narrate(cur, lab, state)}</p>
      <span className="replay-bar"><i style={{ width: `${((replay! + 1) / reel.length) * 100}%` }} /></span>
      <button type="button" onClick={() => { setReplay(null); setFocus([]); }}>✕ parar</button>
    </div>}

    <div className="obs-tools obs-tools-compact">
      {!flat && sceneAvailable === true && <button type="button" className="explore-toggle" aria-label={explore ? 'Voltar ao painel' : 'Explorar a teia'} aria-pressed={explore} onClick={() => setExplore(x => !x)}>
      {explore ? <><i aria-hidden="true">✕</i><span className="bt">Voltar ao painel</span></> : <><i aria-hidden="true">⤢</i><span className="bt">Explorar a teia</span></>}</button>}
      <button type="button" onClick={() => setSearching(true)} title="Procurar (Ctrl K)" aria-label="Procurar"><Icon n="target" /><span className="bt">Procurar</span></button>
      <details ref={toolsRef} className="obs-tools-more">
        <summary aria-label="Controles da visualização"><Icon n="gear" /><span className="bt">Controles</span></summary>
        <div className="obs-tools-panel">
          {sceneAvailable !== false && <button type="button" aria-pressed={flat} onClick={toggleFlat} title={flat ? 'Mostrar a teia atrás do painel' : 'Mostrar só a página, sem a teia'} aria-label={flat ? 'Mostrar a teia' : 'Mostrar só a página'}>
        <Icon n="page" /><span className="bt">{flat ? 'Com a teia' : 'Só a página'}</span></button>}
          {!flat && sceneAvailable === true && <button type="button" onClick={() => window.dispatchEvent(new Event('nexo:replay-formation'))} title="Volta a teia ao quase-uniforme e mostra, em ~3 minutos, os nós aglomerando e os vazios se expandindo" aria-label="Rever a formação da teia">
        <Icon n="replay" /><span className="bt">Rever formação</span></button>}
          {!flat && sceneAvailable === true && <QualityButton />}
          <button type="button" aria-pressed={sound} onClick={() => setSound(x => !x)} title="Som ambiente" aria-label="Som ambiente"><Icon n={sound ? 'sound' : 'mute'} /><span className="bt">{sound ? 'Som ligado' : 'Som'}</span></button>
          {explore && <p className="obs-tools-guide" role="status">Arraste: girar · pinça ou roda: zoom · Shift ou 2 dedos: mover · duplo clique: centro · Esc: sair</p>}
        </div>
      </details>
    </div>
    {searching && <Search lab={lab} state={state} onClose={() => setSearching(false)} />}
    {!flat && <Suspense fallback={<div className="obs-scene obs-scene--loading" />}>
      <ObservatoryScene explore={explore || replay !== null} hot={hot} tests={tests} sourceCurrent={sourceCurrent} events={events} page={route.page} focusIds={focus} theme={theme}
        onAvailability={setSceneAvailable} onPick={id => { window.location.hash = labHref('entidade', id); }} />
    </Suspense>}
    <div ref={hudRef} className="hud" inert={sceneAvailable !== false && (explore || replay !== null)} key={`${route.page}:${route.id ?? ''}`} >{changes.length > 0 && <aside className="published-changes" aria-label="Mudanças recebidas nesta visita"><p role="status">{changes.length} mudanças recebidas · fonte {ago(changedAt)}</p><details><summary>Ver o que mudou sem sair da página</summary><ul>{changes.slice(0, 12).map(change => <li key={change.id}><E id={change.id}>{change.name}</E><span>{change.kind === 'review' ? `${VERDICT_PT[change.before as Verdict] ?? change.before} → ${VERDICT_PT[change.after as Verdict] ?? change.after}` : change.kind === 'added' ? 'Teste passou a constar nesta leitura' : change.before ? `${change.before} → ${change.after}` : change.after}</span></li>)}</ul>{changes.length > 12 && <p>Mostrando 12 de {changes.length}. Consulte a Evidência para o estado completo.</p>}</details><button type="button" onClick={() => setChanges([])}>Dispensar aviso</button></aside>}{sceneAvailable === false && !flat && <p className="scene-fallback-note">Visualização leve · a teia 3D requer WebGL. Todas as páginas e evidências continuam disponíveis.</p>}{page}<Acoustic /></div>
    <Telemetry lab={lab} state={state} />
  </div>;
}

// ---------- Ciência x autoengenharia ----------
const isScience = (t: TestEntity) => normDomain(t.domain) === 'SCIENCE' && !/^(META-|T-LEARN|HYP-GW-SCHEDULED)/.test(t.id);
const isSelf = (t: TestEntity) => !isScience(t) && normDomain(t.domain) !== 'OLYMPUS';
const isReady = (t: TestEntity) => (t.status ?? '').toUpperCase() === 'READY';
function tally(list: TestEntity[]) {
  const by = (r: string) => list.filter(t => t.review === r).length;
  return { confirmed: by('CONFIRMED'), refuted: by('REFUTED'), review: by('PENDING_REVIEW') + by('CONTESTED') + by('REFEREE1_PASSED'),
    blocked: list.filter(t => t.verdict === 'BLOCKED').length, ready: list.filter(isReady).length, total: list.length };
}
// ---------- Agora ----------
function Now({ lab, state, onReplay, replayCount }: { lab: Lab; state: SystemState; onReplay: () => void; replayCount: number }) {
  const [boardVisit, setBoardVisit] = useState(0);
  const ev = state.evolution;
  const g = state.guardian;
  const stale = !isPublishedFresh(state.generated_at);
  const current = { ...lab.counts, confirmed: lab.reviews.CONFIRMED ?? 0, refuted: lab.reviews.REFUTED ?? 0 } as Record<string, number>;
  const [base] = useState(() => readBaseline(current));
  const d = (k: string) => (base ? (current[k] ?? 0) - (base.counts[k] ?? 0) : null);
  const gate = (ev?.gate.charters_waiting.length ?? 0) + (ev?.gate.canaries_waiting.length ?? 0);
  const thought = ev?.thoughts?.at(-1);
  const review = (lab.reviews.PENDING_REVIEW ?? 0) + (lab.reviews.CONTESTED ?? 0) + (lab.reviews.REFEREE1_PASSED ?? 0);
  const resolved = (lab.reviews.CONFIRMED ?? 0) + (lab.reviews.REFUTED ?? 0);
  const blocked = [...lab.tests.values()].filter(t => t.verdict === 'BLOCKED');
  const closedBlocked = blocked.filter(t => t.roadmapId && lab.roadmaps.get(t.roadmapId)?.state === 'CLOSED').length;
  const discovery = [...lab.tests.values()].find(t => t.verdict === 'CONFIRMED') ?? [...lab.tests.values()].find(t => t.meaning && t.verdict === 'PROVISIONAL');
  const activeRoadmaps = new Set([...lab.roadmaps.values()].filter(r => ['ACTIVE', 'CHARTERED'].includes(r.state)).map(r => r.id));
  const next = [...lab.tests.values()].filter(t => isReady(t) && t.question && t.roadmapId && activeRoadmaps.has(t.roadmapId)).slice(0, 3);
  const checkpoints = [...lab.tests.values()].filter(t => t.verdict === 'CHECKPOINTED');
  // Gravidade real: vermelho só quando algo trava o ciclo; o resto é atenção.
  const CRITICAL = ['writer', 'tower_integrity', 'relay', 'inbox', 'batteries', 'executor'];
  const blocking = (g?.failing_areas ?? []).filter(a => CRITICAL.includes(a));
  const health = !g ? 'unknown' : g.status === 'GREEN' ? 'ok' : blocking.length ? 'crit' : 'warn';

  const all = [...lab.tests.values()].filter(t => !t.contestOf);
  const sci = all.filter(isScience), self = all.filter(isSelf);
  const S = tally(sci), E2 = tally(self);
  const focus = selectScienceFocus(sci);
  const boardRecords = ev?.board ?? [];
  const boardPost = latestBoardRecord(boardThreads(boardRecords).filter(post => boardConversation(post, boardRecords).awaiting));
  const scientificIntro = focus
    ? <p className="thesis">Resultado científico em destaque: <E id={focus.test.id}>{focus.test.name}</E>. <span>{currentVerdictText(focus.test)}</span></p>
    : <p className="thesis">Ainda sem resultado científico disponível para destaque; {S.ready} testes marcados READY na leitura científica.</p>;
  const warnings = g?.failing_areas.length ?? 0;
  void d; void review; void resolved; void discovery;
  return <>
    <header className="hud-hero">
      <p className={`hud-status s-${stale ? 'warn' : health}`}>
        <i aria-hidden="true" />
        {{ ok: 'Operando', warn: 'Operando com atenção', crit: 'Com falhas: o ciclo está travado', unknown: 'Saúde desconhecida' }[health]}
        <span> · dados {ago(state.generated_at)}{stale ? ' — frescor não validado' : ''}</span>
        {warnings > 0 && <a className="ops-link" href="#/saude">{warnings} {warnings === 1 ? 'aviso' : 'avisos'} de operação →</a>}
      </p>
      <span className="sig-prompt" aria-hidden="true"><b>nexo@atlas</b>:<i>~</i>$ observe --agora</span>
      <h1>O NEXO <em>agora</em></h1>
      {!boardPost && scientificIntro}
    </header>

    <BoardFocus state={state} lab={lab} post={boardPost} onOpenBoard={() => setBoardVisit(value => value + 1)} />
    {boardPost && <div className="hud-science-intro">{scientificIntro}</div>}
    <LiveNowPanel lab={lab} />
    <GatePanel state={state} />
    {gate > 0 && !state.inbox?.some(i => i.kind === 'APROVAR') && <a className="hud-gate" href="#/ciclo">
      <strong>{gate}</strong><span>{gate === 1 ? 'decisão espera por você' : 'decisões esperam por você'}</span><em>abrir o portão →</em>
    </a>}

    <div className="hud-pair now-priorities">
      <Section title="Bloqueios publicados" kicker={blocked.length ? `${blocked.length} testes parados` : 'Nenhum bloqueio de TEST publicado'} id="now-problem">
        {blocked.length
          ? <><p className="hud-big">{blocked[0]!.blocker ?? 'Motivo do bloqueio não publicado.'}</p><E id={blocked[0]!.id}>{blocked[0]!.name} →</E>
            {closedBlocked > 0 && <p className="hud-note">Inclui {closedBlocked} testes vinculados a roadmaps encerrados.</p>}</>
          : <p className="hud-muted">Nenhum teste em BLOCKED nesta leitura.</p>}
      </Section>
      <Section title="Próximo movimento" kicker="Roadmaps ativos · candidatos READY" id="now-next">
        {next.length ? <ol className="hud-list">{next.map(t => <li key={t.id}><div><E id={t.id}>{t.name}</E><small className="readiness-note">{readinessLabel(t)}</small></div></li>)}</ol>
          : <><p className="hud-muted">{lab.counts.READY ? 'Nenhum candidato READY com pergunta publicada e vínculo a um roadmap ativo.' : 'Nenhum teste pronto nesta leitura.'}</p>
            {blocked.length ? <p>Conferir requisitos dos {blocked.length} bloqueios publicados. <a href="#/evidencia?v=BLOCKED">Consultar bloqueios →</a></p>
              : checkpoints.length ? <p>Há {checkpoints.length} execuções salvas; conferir os requisitos de retomada. <a href="#/evidencia?v=CHECKPOINTED">Consultar checkpoints →</a></p>
              : review ? <p>Há {review} resultados em revisão. <a href="#/evidencia?v=REVIEW">Consultar revisão →</a></p>
              : <p className="hud-note">A próxima ação científica do roadmap ativo não foi declarada na projeção. Novas frentes dependem de carta aprovada.</p>}</>}
      </Section>
    </div>

    {base && <AwaySummary lab={lab} since={base.at} />}

    <Section title="Ciência" kicker={`${S.total} testes principais de cosmologia e física`} id="now-sci">
      <div className="stats">
        <Stat n={S.confirmed} label="confirmados" tone="ok" />
        <Stat n={S.refuted} label="refutados" tone="crit" />
        <Stat n={S.review} label="em revisão" tone="warn" />
        <Stat n={S.ready} label="na fila" tone="mute" />
      </div>
      <p className="hud-note self-line">Autoengenharia (o NEXO estudando a si mesmo): <b>{E2.confirmed}</b> confirmados · <b>{E2.refuted}</b> refutados · <b>{E2.review}</b> em revisão.</p>
    </Section>

    {focus && <ResultCard t={focus.test} selectionReason={focus.reason} />}

    <Frontiers state={state} />

    {thought && <Section title={!isPublishedFresh(thought.at, 6 * 3600e3) ? 'Último pensamento registrado' : 'O que o NEXO está pensando'} kicker={`Pítia · ${ago(thought.at)}${!isPublishedFresh(thought.at, 6 * 3600e3) ? ' · idade deste pensamento' : ''}`} id="now-thought">
      <blockquote className="hud-thought">{thought.text}</blockquote>
      {thought.refs.some(r => lab.tests.has(r) || lab.hypotheses.has(r)) &&
        <p className="hud-refs">{thought.refs.filter(r => lab.tests.has(r) || lab.hypotheses.has(r)).slice(0, 3).map(r => <E key={r} id={r} />)}</p>}
    </Section>}

    <Monologue lab={lab} state={state} onReplay={onReplay} replayCount={replayCount} />
    <Board state={state} lab={lab} visit={boardVisit} />
    <Autonomy state={state} lab={lab} />
    <Families state={state} />
    <Calibration lab={lab} />


  </>;
}

// ---------- Portão: decidir daqui. O site é só leitura; a decisão vira uma frase pronta para o GPT gravar. ----------
function GatePanel({ state }: { state: SystemState }) {
  const items = (state.inbox ?? []).filter(i => i.kind === 'APROVAR');
  const [copied, setCopied] = useState<string | null>(null);
  if (!items.length) return null;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); } catch { window.prompt('Copie e cole no GPT:', text); }
  };
  return <section className="gate-panel" aria-label="Decisões que esperam por você">
    <h2><Icon n="hand" /> {items.length === 1 ? 'Uma decisão espera por você' : `${items.length} decisões esperam por você`}</h2>
    {items.map(i => {
      const say = /"([^"]+)"/.exec(i.question ?? '')?.[1] ?? null;
      const no = say ? say.replace(/^aprovo/i, 'recuso') : null;
      return <article key={i.id} className="gate-item">
        <p className="gate-title">{(i.title ?? '').replace(/^Carta de roadmap:\s*/i, 'Abrir a investigação: ')}</p>
        {i.why && <p className="gate-why">{i.why}</p>}
        {say && no && <div className="gate-actions">
          <button type="button" className="gate-yes" onClick={() => copy(say)}><Icon n="check" /> Aprovar</button>
          <button type="button" className="gate-no" onClick={() => copy(no)}><Icon n="cross" /> Recusar</button>
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">abrir o GPT →</a>
        </div>}
        {copied && (copied === say || copied === no) && <p className="gate-copied" role="status">Copiado. Cole no GPT: “{copied}”.</p>}
      </article>;
    })}
  </section>;
}

// ---------- "Enquanto você esteve fora" ----------
function AwaySummary({ lab, since }: { lab: Lab; since: string }) {
  const evs = observedActivity(lab.activity).filter(e => e.at > since);
  if (!evs.length) return null;
  // Soma a contagem dos itens agrupados; "resultado" é só resultado novo de teste (falha de execução não conta).
  const n = (re: RegExp) => evs.filter(e => re.test(e.event_type)).reduce((k, e) => k + Number((e as { count?: number }).count ?? 1), 0);
  const results = n(/^TEST_RESULT_RECORDED$/), created = n(/CREATED|PROPOSED|ENQUEUED/), verdicts = n(/VERDICT|REVIEW|CONFIRMED|REFUTED/), thoughts = n(/THOUGHT_RECORDED/);
  const parts = [
    results && `${results} ${results === 1 ? 'evento de resultado recebido' : 'eventos de resultado recebidos'}`,
    created && `${created} ${created === 1 ? 'evento de criação recebido' : 'eventos de criação recebidos'}`,
    verdicts && `${verdicts} ${verdicts === 1 ? 'evento de revisão recebido' : 'eventos de revisão recebidos'}`,
    thoughts && `${thoughts} ${thoughts === 1 ? 'evento de pensamento recebido' : 'eventos de pensamento recebidos'}`,
  ].filter(Boolean) as string[];
  return <p className="away">
    <b>{say('AWAY_OPEN', since) ?? 'Enquanto você esteve fora'}</b> ({ago(since)}): {parts.length ? parts.join(', ') : `${evs.length} eventos recebidos`}. Recorte de cobertura parcial; estas contagens não atestam o total do período desde a visita anterior.
  </p>;
}

// ---------- Busca (Ctrl/⌘ K) ----------
function Search({ lab, state, onClose }: { lab: Lab; state: SystemState; onClose: () => void }) {
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => () => { if (previousFocus.current?.isConnected) previousFocus.current.focus(); }, []);
  const [q, setQ] = useState('');
  const all = useMemo(() => [
    ...(state.cosmology_state?.frontiers ?? []).map(f => ({ id: f.id, label: f.title, sub: f.summary, kind: 'frente cosmológica', href: labHref('universo', f.id) })),
    ...[...lab.tests.values()].map(t => ({ id: t.id, label: t.name, sub: t.question ?? '', kind: 'teste', href: labHref('entidade', t.id) })),
    ...[...lab.hypotheses.values()].map(h => ({ id: h.id, label: h.statement ?? humanId(h.id), sub: '', kind: 'hipótese', href: labHref('entidade', h.id) })),
    ...[...lab.roadmaps.values()].map(r => ({ id: r.id, label: r.title ?? humanId(r.id), sub: '', kind: 'investigação', href: labHref('roadmap', r.id) })),
  ], [lab, state.cosmology_state]);
  const hits = q.trim().length < 2 ? [] : all.filter(x => matchesSearch(q, x.id, x.label, x.sub)).slice(0, 12);
  return <div className="search-veil" role="dialog" aria-modal="true" aria-label="Procurar" onClick={onClose}>
    <div className="search-box" onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input, a[href]'));
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <button type="button" className="search-close" onClick={onClose}>Fechar busca</button>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar teste, hipótese ou investigação…"
        onKeyDown={e => { if (e.key === 'Enter' && hits[0]) { window.location.hash = hits[0].href; onClose(); } }} />
      <ul>{hits.map(h => <li key={h.kind + h.id}><a href={h.href} onClick={onClose}><em>{h.kind}</em>{h.label}</a></li>)}</ul>
      {q.trim().length >= 2 && !hits.length && <p className="hud-muted">Nenhum resultado nesta projeção. Tente o nome da frente, parte da pergunta ou o ID.</p>}
    </div>
  </div>;
}

// ---------- Primeira visita: o que é cada fenômeno ----------
function Legend({ onClose }: { onClose: () => void }) {
  return <aside className="legend" role="note">
    <p><b>Como ler o céu</b></p>
    <ul>
      <li><i className="lg lg-star" />cada estrela é um teste; a cor é o veredito</li>
      <li><i className="lg lg-qso" />quasar: uma decisão espera por você</li>
      <li><i className="lg lg-agn" />jato: testes marcados RUNNING na leitura</li>
      <li><i className="lg lg-grb" />clarão: pensamento publicado no recorte recente</li>
      <li><i className="lg lg-cloud" />nuvem: candidatos marcados READY na leitura</li>
    </ul>
    <button type="button" onClick={onClose}>Entendi</button>
  </aside>;
}

// ---------- Som opcional: zumbido baixo + sinal quando nasce um pensamento ----------
function useAmbience(on: boolean, pulse: string | null) {
  const ctx = useRef<AudioContext | null>(null);
  const hum = useRef<GainNode | null>(null);
  useEffect(() => {
    if (!on) { hum.current?.gain.setTargetAtTime(0, ctx.current!.currentTime, 0.4); return; }
    const c = ctx.current ?? (ctx.current = new AudioContext());
    void c.resume();
    if (!hum.current) {
      const g = c.createGain(); g.gain.value = 0; g.connect(c.destination);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; f.connect(g);
      for (const hz of [55, 82.4, 110.3]) { const o = c.createOscillator(); o.frequency.value = hz; o.connect(f); o.start(); }
      hum.current = g;
    }
    hum.current.gain.setTargetAtTime(0.035, c.currentTime, 1.2);
  }, [on]);
  useEffect(() => {
    const c = ctx.current;
    if (!on || !pulse || !c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, c.currentTime); o.frequency.exponentialRampToValueAtTime(1320, c.currentTime + 0.25);
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.6);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 1.7);
  }, [on, pulse]);
}

// ---------- Ciclo ----------
const STAGES: Array<{ key: string; label: string; who: string; get: (lab: Lab, s: SystemState) => number }> = [
  { key: 'thought', label: 'Pensamento', who: 'Cientista · Pítia', get: (_l, s) => s.evolution?.thoughts?.length ?? 0 },
  { key: 'hyp', label: 'Hipóteses', who: 'Cientista · Learner', get: l => l.hypotheses.size },
  { key: 'ready', label: 'Na fila', who: 'Operador', get: l => l.counts.READY },
  { key: 'result', label: 'Resultado', who: 'Runner público', get: l => l.counts.PROVISIONAL },
  { key: 'review', label: 'Contestação', who: 'Crítico · Refutador', get: l => (l.reviews.PENDING_REVIEW ?? 0) + (l.reviews.CONTESTED ?? 0) },
  { key: 'ref1', label: 'Referee 1', who: 'Crítico · Refutador', get: l => l.reviews.REFEREE1_PASSED ?? 0 },
  { key: 'final', label: 'Veredito', who: 'Tower', get: l => (l.reviews.CONFIRMED ?? 0) + (l.reviews.REFUTED ?? 0) },
  { key: 'gen', label: 'Nova geração', who: 'Genoma', get: (_l, s) => s.evolution?.genome.generation ?? 0 },
];

function Cycle({ lab, state }: { lab: Lab; state: SystemState }) {
  const ev = state.evolution;
  const values = STAGES.map(s => s.get(lab, state));
  const max = Math.max(1, ...values);
  const chains = [...lab.tests.values()].filter(t => t.contests.length).sort((a, b) => b.contests.length - a.contests.length).slice(0, 8);
  return <>
    <header className="hud-hero">
      <p className="hud-kicker">Geração {ev?.genome.generation ?? 0} · {ev?.decoys.planted ?? 0} iscas em campo</p>
      <h1>O ciclo fechado</h1>
      <p className="hud-lead">Onde o trabalho está acumulando: a altura mostra quantos itens estão em cada etapa.</p>
      <p className="hud-note">A atividade é registrada por papel. Operadores A/B/C compartilham EXECUTOR; Guardião e Revisor de PR compartilham GUARDIAO. Os sinais abaixo não comprovam uma execução individual de cada automação.</p>
    </header>

    <Crew lab={lab} state={state} />

    <div className="cycle" role="list" aria-label="Etapas do ciclo">
      {STAGES.map((s, i) => <div className="cycle-stage" role="listitem" key={s.key} style={{ ['--h' as string]: `${Math.max(6, (values[i]! / max) * 100)}%` }}>
        <span className="cycle-col"><b /></span>
        <strong>{values[i]}</strong><span>{s.label}</span><em>{s.who}</em>
      </div>)}
    </div>

    {((ev?.gate.charters_waiting.length ?? 0) + (ev?.gate.canaries_waiting.length ?? 0)) > 0 && <Section title="Portão do Dener" kicker="Só você abre" id="cy-gate">
      {ev!.gate.charters_waiting.map(c => <div key={c.roadmap_id} className="hud-card attention">
        <p className="hud-kicker">{c.renewable ? 'Campanha permanente' : 'Carta de roadmap'}</p>
        <p className="hud-big">{c.question ?? humanId(c.roadmap_id)}</p>
        {c.objectives?.length ? <ul>{c.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null}
      </div>)}
      {ev!.gate.canaries_waiting.map(c => <div key={c.gene} className="hud-card attention">
        <p className="hud-kicker">Canonizar mutação</p><p className="hud-big">{c.gene}</p><code>{JSON.stringify(c.canary)}</code>
      </div>)}
    </Section>}

    <Section title="Linhagens sob ataque" kicker="Resultado → contestações" id="cy-chains">
      {chains.length ? <ul className="chains">{chains.map(t => {
        const cs = t.contests.map(c => lab.tests.get(c)!);
        const survived = cs.filter(c => c.verdict === 'CONFIRMED' || c.verdict === 'PROVISIONAL').length;
        return <li key={t.id} className={`chain v-edge-${t.verdict.toLowerCase()}`}>
          <a className="chain-q" href={labHref('entidade', t.id)}>{t.question ?? humanId(t.id)}</a>
          <div className="chain-row">
            <span className={`chain-node v-${t.verdict.toLowerCase()}`} title={VERDICT_PT[t.verdict]}>
              <i aria-hidden="true">{VERDICT_GLYPH[t.verdict]}</i>{VERDICT_PT[t.verdict]}</span>
            <span className="chain-wire" aria-hidden="true" />
            {cs.map(c => <a key={c.id} href={labHref('entidade', c.id)} className={`chain-dot v-${c.verdict.toLowerCase()}`}
              title={`Contestação: ${VERDICT_PT[c.verdict]}`} aria-label={`Contestação: ${VERDICT_PT[c.verdict]}`}>{VERDICT_GLYPH[c.verdict]}</a>)}
            <span className="chain-sum">{cs.length} {cs.length === 1 ? 'contestação' : 'contestações'}{survived ? ` · ${survived} com resultado` : ''}</span>
          </div>
        </li>;
      })}</ul> : <p className="hud-muted">Nenhum resultado foi contestado ainda.</p>}
    </Section>

    <Section title="Quem fez o quê" kicker="Últimas 48 h · cada ponto é um evento" id="cy-lanes">
      {lab.activity.length ? <Swimlanes events={lab.activity} /> : <>
        <ol className="stream">{[...(ev?.thoughts ?? [])].reverse().slice(0, 8).map(t => <li key={t.id}><time>{ago(t.at)}</time><b>Pítia</b><span>{t.text}</span></li>)}</ol>
        <Missing what="read_model.activity (TCC#96)" /></>}
    </Section>
  </>;
}

// ---------- Roadmaps ----------
function roadmapParts(lab: Lab, ids: string[]): Array<[Verdict, number]> {
  const c = Object.fromEntries(VERDICT_ORDER.map(v => [v, 0])) as Record<Verdict, number>;
  ids.forEach(id => { c[lab.tests.get(id)!.verdict] += 1; });
  return VERDICT_ORDER.map(v => [v, c[v]]);
}
function Roadmaps({ lab }: { lab: Lab }) {
  const list = [...lab.roadmaps.values()];
  return <>
    <header className="hud-hero"><p className="hud-kicker">{list.length} frentes de pesquisa</p><h1>Roadmaps</h1>
      <p className="hud-lead">Cada roadmap é uma pergunta com critério de parada: ele termina ao atingir a meta, ao acumular refutações ou ao esgotar o orçamento.</p></header>
    <ul className="rm-list">{list.map(r => <li key={r.id}><a href={labHref('roadmap', r.id)} className="rm-row">
      <span className="rm-title">{r.title}{r.renewable && <em> · permanente</em>}</span>
      <span className="rm-q">{r.question}</span>
      <Bar parts={roadmapParts(lab, r.tests)} total={r.tests.length} />
      <span className="rm-meta"><b>{r.confirmed}</b>/{r.target ?? '?'} confirmados · {r.tests.length} vinculados · orçamento {r.used ?? '—'}/{r.maxTests ?? '?'}{r.stop ? ` · parado: ${r.stop}` : ''}</span>
    </a></li>)}</ul>
  </>;
}

function RoadmapPage({ lab, id }: { lab: Lab; id: string }) {
  const r = lab.roadmaps.get(id);
  if (!r) return <NotFound id={id} />;
  const tests = r.tests.map(t => lab.tests.get(t)!).filter(t => !t.contestOf);
  const hyps = new Map<string, TestEntity[]>();
  tests.forEach(t => { const k = t.hypothesisId ?? '—'; (hyps.get(k) ?? hyps.set(k, []).get(k)!).push(t); });
  const pct = (n: number, d: number | null) => (d ? Math.min(100, Math.round(100 * n / d)) : 0);
  const confirmed = tests.filter(t => t.verdict === 'CONFIRMED');
  const frontierDeclared = r.frontierIdsPublished ?? Boolean(r.frontierIds?.length);
  const frontierTests = frontierDeclared ? (r.frontierIds ?? []).map(id => lab.tests.get(id)!).filter(Boolean) : tests.filter(isReady);
  const nextUp = frontierTests.slice(0, 6);
  const unresolved = (r.frontierIds?.length ?? 0) - (r.frontierIds?.length ? frontierTests.length : 0);
  const blocked = tests.filter(t => t.verdict === 'BLOCKED');
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/roadmaps">Roadmaps</a> · {r.state === 'ACTIVE' ? 'ativo' : r.state.toLowerCase()}{r.renewable ? ' · campanha permanente' : ''}</p>
      <h1>{r.title}</h1>
      {r.question && <p className="hud-lead">{r.question}</p>}
      {r.objectives?.length ? <ul className="crit objectives">{r.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null}
    </header>
    <Trail tests={tests} frontier={frontierDeclared ? r.frontierIds ?? [] : null} target={r.target} />
    <div className="stop-rules">
      <div><span>Meta</span><strong>{r.confirmed}/{r.target ?? '?'}</strong><i style={{ width: `${pct(r.confirmed, r.target)}%` }} className="ok" /><em>confirmações para encerrar com sucesso</em></div>
      <div><span>Refutações seguidas</span><strong>{r.refutedStreak}/{r.killStreak ?? '?'}</strong><i style={{ width: `${pct(r.refutedStreak, r.killStreak)}%` }} className="crit" /><em>encerra por refutação</em></div>
      <div><span>Orçamento</span><strong>{r.used ?? '—'}/{r.maxTests ?? '?'}</strong><i style={{ width: `${pct(r.used ?? 0, r.maxTests)}%` }} className="warn" /><em>uso declarado pela Tower{r.maxDays ? ` · ${r.maxDays} dias` : ''}</em></div>
    </div>
    <p className="hud-note count-source">Contagem desta página: {tests.length} testes principais + {r.tests.length - tests.length} contestações vinculadas. Orçamento: evolution.roadmaps.tests_used; vínculos: {r.testsSource}. São medidas distintas.{r.used === null && ' Uso do orçamento não publicado.'}</p>
    <Section title="Árvore de hipóteses" kicker={`${hyps.size} hipóteses · ${tests.length} testes principais`} id="rm-tree">
      {tests.length === 0 ? <Missing what="tests[].roadmap_id (roadmap sem campanha ligada)" /> :
        <div className="tree">{[...hyps].map(([h, ts]) => <details key={h} open={hyps.size < 6}>
          <summary><span>{h === '—' ? 'Sem hipótese declarada' : (lab.hypotheses.get(h)?.statement ?? humanId(h))}</span><Bar parts={roadmapParts(lab, ts.map(t => t.id))} total={ts.length} /></summary>
          <ul>{ts.map(t => <li key={t.id}><VerdictChip v={t.verdict} small /><E id={t.id}>{t.name}</E></li>)}</ul>
        </details>)}</div>}
    </Section>
    <div className="hud-pair">
      <Section title="Evidência acumulada" kicker={`${confirmed.length} confirmados`} id="rm-ev">
        {confirmed.length ? <ul className="hud-list">{confirmed.map(t => <li key={t.id}><E id={t.id}>{humanize(t.meaning ?? t.question ?? '')}</E></li>)}</ul> : <p className="hud-muted">Nada confirmado ainda.</p>}
      </Section>
      <Section title="Próximos testes" kicker={`${r.frontier === null ? 'Fronteira não publicada' : `${r.frontier} na fronteira declarada`} · ${nextUp.length} de ${frontierTests.length} vínculos exibidos`} id="rm-next">
        {nextUp.length ? <ul className="hud-list">{nextUp.map(t => <li key={t.id}><E id={t.id}>{t.name}</E></li>)}</ul> : <p className="hud-muted">Nenhum vínculo de fronteira disponível nesta leitura.</p>}
        {frontierTests.length > 6 && <details><summary>Ver os {frontierTests.length - 6} restantes</summary><ul className="hud-list">{frontierTests.slice(6).map(t => <li key={t.id}><E id={t.id} /></li>)}</ul></details>}
        {unresolved > 0 && <p className="hud-note">{unresolved} referências da fronteira ainda não estão disponíveis nesta projeção.</p>}
        <p className="hud-note">Fronteira: {r.frontierSource ?? 'fonte não publicada'}. Vínculos: frontier_test_ids; quando ausentes, candidatos READY. READY não comprova elegibilidade de execução.</p>
        {blocked.length > 0 && <p className="hud-note">{blocked.length} bloqueados: <E id={blocked[0]!.id}>{blocked[0]!.blocker ?? 'ver motivo'}</E></p>}
      </Section>
    </div>
  </>;
}

// ---------- Evidência ----------
function Evidence({ lab, state, filter, search }: { lab: Lab; state: SystemState; filter?: Verdict; search?: string }) {
  const [q, setQ] = useState(search ?? '');
  useEffect(() => setQ(search ?? ''), [search]);
  const updateQuery = (value: string) => {
    setQ(value);
    replaceEvidenceSearch(value, filter);
  };
  const related = q.trim() ? (state.cosmology_state?.frontiers ?? []).filter(f => matchesSearch(q, f.title, f.summary)) : [];
  const all = [...lab.tests.values()];
  const list = all.filter(t => (!filter || t.verdict === filter) && matchesSearch(q, t.id, t.name, t.question, t.meaning, t.topic, t.subdomain));
  return <>
    <header className="hud-hero"><p className="hud-kicker">{all.length} testes e contestações publicados</p><h1>Evidência</h1>
      <p className="hud-lead">Todo teste, do pré-registro ao veredito. Filtre pelo estado; clique para ver o que foi prometido antes e o que aconteceu.</p></header>
    <nav className="filters" aria-label="Filtrar por veredito">
      <a href={`#/evidencia${q ? '?q=' + encodeURIComponent(q) : ''}`} aria-current={!filter ? 'page' : undefined}>Todos <b>{all.length}</b></a>
      {VERDICT_ORDER.map(v => <a key={v} href={`#/evidencia?v=${v}${q ? '&q=' + encodeURIComponent(q) : ''}`} aria-current={filter === v ? 'page' : undefined} className={`v-${v.toLowerCase()}`}>
        <i aria-hidden="true">{VERDICT_GLYPH[v]}</i>{VERDICT_PT[v]} <b>{all.filter(t => t.verdict === v).length}</b></a>)}
    </nav>
    <input className="hud-search" type="search" placeholder="Buscar por nome, pergunta ou resultado…" value={q} onChange={e => updateQuery(e.target.value)} aria-label="Buscar testes" />
    {q && <p role="status">{list.length} testes encontrados para “{q}”{related.length ? ` · ${related.length} frentes relacionadas` : ''}.</p>}
    {related.length > 0 && <nav className="search-related" aria-label="Frentes relacionadas">{related.map(f => <a key={f.id} href={labHref('universo', f.id)}>{f.title} →</a>)}</nav>}
    {filter === 'READY' && <p className="hud-note">Esta fila inclui testes principais e contestações. READY é o estado registrado. A elegibilidade só é exibida quando a verificação individual foi publicada; isso não garante despacho.</p>}
    {q && !list.length && !related.length && <p className="hud-muted">Nenhum resultado nesta projeção. A consulta foi preservada; tente parte do nome ou o ID.</p>}
    {VERDICT_ORDER.filter(v => list.some(t => t.verdict === v)).map(v => {
      const group = list.filter(t => t.verdict === v);
      return <section key={v} className={`ev-group v-${v.toLowerCase()}`} aria-label={VERDICT_PT[v]}>
        <h2><VerdictChip v={v} small /> <span>{group.length}</span></h2>
        <ul className="ev-cards">{group.slice(0, filter || q ? 200 : 24).map(t => <li key={t.id}>
          <a className="ev-card" href={labHref('entidade', t.id)}>
            <strong>{t.name}</strong>
            {t.question && t.question !== t.name && <span className="ev-q">{t.question}</span>}
            {t.meaning && <span className="ev-m">{t.verdict === 'REFUTED' && 'Resultado bruto, depois refutado: '}{humanize(t.meaning)}</span>}
            <span className="ev-meta"><em>{normDomain(t.domain)}</em>{isReady(t) && <em>{readinessLabel(t)}</em>}{t.contests.length > 0 && <em>{t.contests.length} {t.contests.length === 1 ? 'ataque' : 'ataques'}</em>}</span>
          </a></li>)}</ul>
        {!filter && !q && group.length > 24 && <a className="ev-more" href={`#/evidencia?v=${v}${q ? '&q=' + encodeURIComponent(q) : ''}`}>ver os {group.length} →</a>}
      </section>;
    })}
    {filter && list.length > 200 && <p className="hud-muted">Mostrando 200 de {list.length}. Use a busca.</p>}
  </>;
}

// ---------- Entidade (teste ou hipótese) ----------
function Field({ label, value, sealed }: { label: string; value: unknown; sealed?: boolean }) {
  const t = text(value);
  return <div className={`field${sealed ? ' sealed' : ''}${t ? '' : ' empty'}`}><dt>{label}</dt><dd>{t ?? 'não publicado'}</dd></div>;
}
const List = ({ items, empty }: { items: string[]; empty?: string }) =>
  items.length ? <ul className="crit">{items.map(i => <li key={i}>{i}</li>)}</ul> : <span className="hud-muted">{empty ?? 'não publicado'}</span>;
const REVIEW_PT: Record<string, string> = { CONTEST: 'Contestação', VERDICT_REVIEW: 'Revisão do veredito' };
const OUTCOME_PT: Record<string, string> = { PENDING: 'pendente', SURVIVED: 'sobreviveu', PASSED: 'passou', REFUTED: 'derrubou', FAILED: 'falhou', CONFIRMED: 'confirmou' };

function EntityPage({ lab, state, id }: { lab: Lab; state: SystemState; id: string }) {
  const t = lab.tests.get(id) ?? lab.historicalTests?.get(id);
  const h = lab.hypotheses.get(id);
  if (!t && h) return <HypothesisView lab={lab} id={id} />;
  if (!t && lab.campaigns.has(id)) {
    const campaign = lab.campaigns.get(id)!;
    return <><header className="hud-hero"><p className="hud-kicker">Campanha atual · <a href="#/universo">Universo</a></p><h1>{campaign.title ?? campaign.questionPlain ?? 'Campanha científica'}</h1><p className="hud-lead">{campaign.questionPlain ?? campaign.question}</p></header><Section title="O que estamos tentando descobrir"><p>{campaign.why ?? 'Objetivo não publicado.'}</p></Section><Section title="Testes da campanha"><ul className="hud-list">{campaign.tests.map(tid => <li key={tid}><E id={tid}/></li>)}</ul></Section></>;
  }
  if (!t) {
    if (lab.roadmaps.has(id)) { window.location.hash = labHref('roadmap', id); return null; }
    return <NotFound id={id} />;
  }
  const parent = t.contestOf ? lab.tests.get(t.contestOf) : null;
  const hyp = t.hypothesisId ? lab.hypotheses.get(t.hypothesisId) : null;
  const pred = (t.prereg.prediction ?? {}) as { expected_effect?: string; p_promoted?: number };
  const contests = [...new Set([...t.contests, ...t.reviews.map(r => r.contest_test_id ?? r.ref).filter(Boolean) as string[]])];
  const lim = Array.isArray(t.limitations) ? (t.limitations as string[]) : t.limitations ? [String(t.limitations)] : [];
  const story = testStory(t, lab);
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/evidencia">Evidência</a>
        {t.roadmapId && <> · <a href={labHref('roadmap', t.roadmapId)}>{lab.roadmaps.get(t.roadmapId)?.title ?? humanId(t.roadmapId)}</a></>}</p>
      <h1 className="h1-entity">{t.historical ? t.name : t.question ?? humanId(t.id)}</h1>
      <p className="hud-lead">{t.verdict === 'PROVISIONAL' && !t.verdictRaw && !t.meaning && !hasPublishedValue(t.result) ? <span className="hud-muted">Resultado não publicado</span> : <VerdictChip v={t.verdict} />}{t.createdAt && <span className="hud-muted"> · começou {ago(t.createdAt)}</span>}</p>
    </header>

    <Section title="A história deste teste" id="en-story">
      <ol className="story">{story.map((b, i) => <li key={i} className={`beat beat-${b.tone}`}>
        <i aria-hidden="true"><Icon n={b.icon} /></i><p>{b.text}{b.link && <> <E id={b.link.id}>{b.link.label}</E></>}</p>
      </li>)}</ol>
    </Section>

    {t.historical && <Section title="Origem histórica"><p>Resultado auditado da Tower antiga; não reativa filas ou campanhas.</p>{t.sourceUrl && <p><a href={t.sourceUrl} target="_blank" rel="noreferrer">Abrir artefato original ↗</a></p>}<details><summary>Proveniência para auditoria</summary><pre className="universe-provenance">{JSON.stringify(t.provenance, null, 2)}</pre></details></Section>}
    <Section title="Veredito atual" id="en-mean">
      <p className="hud-big">{currentVerdictText(t)}</p>
      {t.readiness?.reasons?.length ? <p className="hud-note">Prontidão: {t.readiness.reasons.join(' · ')}</p> : null}
      <p className="hud-note">{t.review ? `Fonte: estado de revisão publicado (${t.review}).` : t.status ? `Fonte: estado operacional publicado (${t.status}); revisão não publicada.` : 'Estado de revisão e estado operacional não publicados.'}</p>
      {contests.filter(c => lab.tests.has(c)).length > 0 && <p className="hud-refs">{contests.filter(c => lab.tests.has(c)).map(c => <E key={c} id={c}>Ver contestação →</E>)}</p>}
    </Section>
    {(t.meaning || Boolean(t.claimBoundary)) && <Section title="Resultado bruto da execução" id="en-raw">
      {t.verdictRaw && <p className="hud-kicker">Registro original: {t.verdictRaw}</p>}
      {t.meaning && <p>{humanize(t.meaning)}</p>}
      <p className="hud-note">Interpretação registrada na execução, preservada mesmo quando a revisão muda o veredito.</p>
      {Boolean(t.claimBoundary) && <p className="boundary"><b>Limite da conclusão:</b> {text(t.claimBoundary)}</p>}
    </Section>}

    <DependencyFlow test={t} lab={lab} state={state} />
    <details className="tech">
      <summary>Detalhes técnicos</summary>
      <div className="versus" role="group" aria-label="Prometido antes versus observado depois">
        <section className="versus-col sealed" aria-labelledby="vs-pre">
          <h2 id="vs-pre"><i aria-hidden="true">◆</i> Prometido antes</h2>
          <dl>
            <dt>Previsão</dt><dd>{pred.expected_effect ?? text(t.prereg.prediction) ?? <span className="hud-muted">não publicado</span>}
              {typeof pred.p_promoted === 'number' && <em className="prob"> · chance estimada de passar: {Math.round(pred.p_promoted * 100)}%</em>}</dd>
            <dt>Hipótese nula</dt><dd>{text(t.prereg.null_model) ?? <span className="hud-muted">não publicado</span>}</dd>
            <dt>Rival</dt><dd>{text(t.prereg.rival) ?? <span className="hud-muted">não publicado</span>}</dd>
            <dt>Passa se</dt><dd><List items={t.prereg.success} /></dd>
            <dt>Morre se</dt><dd><List items={t.prereg.kill} /></dd>
            {Boolean(t.prereg.metric || t.prereg.threshold) && <><dt>Métrica / limiar</dt><dd>{[text(t.prereg.metric), text(t.prereg.threshold)].filter(Boolean).join(' · ')}</dd></>}
          </dl>
          <p className="seal">{t.prereg.hash ? <>Selo <code>{String(t.prereg.hash).slice(0, 23)}…</code></> : 'Sem selo publicado'}
            {Boolean(t.prereg.at) && <> · congelado {ago(String(t.prereg.at))}</>}</p>
        </section>
        <section className="versus-col" aria-labelledby="vs-obs">
          <h2 id="vs-obs"><i aria-hidden="true">●</i> Observado depois</h2>
          <dl>
            <dt>Resultado</dt><dd>{text(t.result) ?? t.summary ?? <span className="hud-muted">não publicado</span>}</dd>
            <dt>Estatística</dt><dd>{text(t.statistics) ?? <span className="hud-muted">não publicado</span>}</dd>
            <dt>Método</dt><dd>{t.method ?? <span className="hud-muted">não publicado</span>}</dd>
            <dt>Dados</dt><dd>{text(t.datasets) ?? <span className="hud-muted">não publicado</span>}</dd>
          </dl>
        </section>
      </div>
      {t.reviews.length > 0 && <ol className="timeline">{t.reviews.map((r, i) => {
        const ref = r.contest_test_id ?? r.ref;
        return <li key={i} className={`o-${(r.outcome ?? 'pending').toLowerCase()}`}>
          <time>{r.at ? ago(r.at) : '—'}</time>
          <div><b>{REVIEW_PT[r.kind] ?? r.kind}</b>{r.axis && <span className="axis">eixo: {r.axis}</span>}
            <span className="outcome">{OUTCOME_PT[(r.outcome ?? 'PENDING').toUpperCase()] ?? r.outcome}</span>
            {ref && <> · <E id={ref}>ver contestação</E></>}</div>
        </li>;
      })}</ol>}
      {lim.length > 0 && <><h3>Limitações</h3><ul className="crit">{lim.map(l => <li key={l}>{l}</li>)}</ul></>}
      <p className="hud-meta">
        <code>{t.id}</code>{t.verdictRaw && <> · veredito bruto {t.verdictRaw}</>}
        {t.execution?.battery_id && <> · bateria <code>{t.execution.battery_id}</code></>}
        {t.createdSource === 'EVENT_FIRST_OBSERVED' && <> · data deduzida do histórico</>}
        {t.parents.length > 0 && <> · pais: {t.parents.map(x => <E key={x} id={x} />)}</>}
        {t.children.length > 0 && <> · filhos: {t.children.map(x => <E key={x} id={x} />)}</>}
      </p>
      {contests.length > 0 && t.reviews.length === 0 && <ul className="hud-list">{contests.map(c => <li key={c}>
        {lab.tests.get(c) && <VerdictChip v={lab.tests.get(c)!.verdict} small />}<E id={c}>{lab.tests.get(c)?.name ?? humanId(c)}</E></li>)}</ul>}
    </details>
  </>;
}

function HypothesisView({ lab, id }: { lab: Lab; id: string }) {
  const h = lab.hypotheses.get(id)!;
  const ts = h.tests.map(t => lab.tests.get(t)!).filter(t => !t.contestOf);
  return <>
    <header className="hud-hero"><p className="hud-kicker"><a href="#/evidencia">Evidência</a> · hipótese</p>
      <h1>{h.statement ?? humanId(h.id)}</h1>
      <p className="hud-lead">{h.verdict ? <VerdictChip v={h.verdict} /> : 'Sem testes'}</p><code className="hud-id">{h.id}</code></header>
    <Section title="Formulação" id="hy-f"><dl className="fields">
      <Field label="Modelo" value={h.model} /><Field label="Linha de base" value={h.baseline} /><Field label="Como refutar" value={h.falsification} sealed /><Field label="Origem" value={h.origin} />
    </dl></Section>
    <Section title="Relações desta hipótese" id="hy-rel"><p>{ts.length} testes vinculados · {ts.reduce((n, test) => n + test.contests.length, 0)} contestações registradas. A seleção destaca os testes vinculados na teia quando o 3D está disponível.</p><ul className="hud-list">{ts.filter(test => test.contests.length).map(test => <li key={test.id}><div><E id={test.id} /><p className="hud-refs">{test.contests.map(cid => <E key={cid} id={cid}>Ver ataque →</E>)}</p></div></li>)}</ul></Section>
    <Section title="Testes" kicker={`${ts.length}`} id="hy-t">
      <Bar parts={roadmapParts(lab, ts.map(t => t.id))} total={ts.length} />
      <ul className="hud-list">{ts.map(t => <li key={t.id}><VerdictChip v={t.verdict} small /><E id={t.id}>{t.question ?? humanId(t.id)}</E></li>)}</ul>
    </Section>
  </>;
}

const NotFound = ({ id }: { id: string }) => <header className="hud-hero"><h1>Não encontrado</h1><p className="hud-lead"><code>{id}</code> não está na projeção pública (pode ser privado ou ainda não aplicado).</p></header>;

// ---------- Saúde ----------
function Health({ state, lab }: { state: SystemState; lab: Lab }) {
  const g = state.guardian;
  const reportAt = g?.report_checked_at;
  const liveAreas = new Set(g?.live_areas ?? []);
  const reportAreas = (g?.failing_areas ?? []).filter(area => !liveAreas.has(area));
  const liveFailures = (g?.failing_areas ?? []).filter(area => liveAreas.has(area));
  const ev = state.evolution as (SystemState['evolution'] & { batteries?: Record<string, number> }) | undefined;
  const providersDown = state.providers.filter(p => p.state === 'MISSING_PROVIDER' || p.state === 'BLOCKED');
  return <>
    <header className="hud-hero"><p className="hud-kicker">Guardião · publicação {ago(state.generated_at)}</p><h1>Saúde</h1>
      <p className="hud-lead">A infraestrutura só aparece aqui. Se algo abaixo estiver vermelho, os números das outras páginas podem estar atrasados.</p></header>
    <div className="health-grid">
      <div className={`health-cell s-${!g ? 'unknown' : g.status === 'GREEN' ? 'ok' : g.status === 'YELLOW' ? 'warn' : 'crit'}`}>
        <span>Guardião</span><strong>{g ? `${g.checks_total - g.checks_failing}/${g.checks_total}` : '—'}</strong><em>verificações passando</em></div>
      <div className={`health-cell s-${!isPublishedFresh(state.generated_at) ? 'warn' : 'ok'}`}>
        <span>Projeção pública</span><strong>{ago(state.generated_at)}</strong><em>última atualização do site</em></div>
      <div className="health-cell"><span>Baterias</span><strong>{ev?.batteries ? `${ev.batteries.DISPATCHED ?? 0} rodando` : '—'}</strong><em>{ev?.batteries ? `${ev.batteries.DONE ?? 0} concluídas · ${ev.batteries.QUEUED ?? 0} na fila` : ''}</em></div>
      <div className={`health-cell s-${providersDown.length ? 'warn' : 'ok'}`}><span>Provedores</span><strong>{state.providers.length - providersDown.length}/{state.providers.length}</strong><em>disponíveis</em></div>
    </div>
    {(ev?.watchdog?.quiet?.length ?? 0) > 0 && <QuietLoops lab={lab} quiet={ev!.watchdog!.quiet!} at={ev!.watchdog!.checked_at ?? state.generated_at} />}
    {g && reportAreas.length > 0 && <Section title="Achados da última auditoria" kicker={guardianAuditTime(reportAt)} id="he-fail">
      <p className="hud-muted">Relatório do Guardião nesse horário. A sincronização atual exige uma nova leitura; este histórico não confirma divergência atual.</p>
      <ul className="hud-list">{reportAreas.map(a => <li key={a}>{guardianArea(a).replace(/^./, c => c.toUpperCase())}</li>)}</ul>
      <p className="hud-note">Fonte: auditoria do Guardião, {ago(reportAt)}. A projeção publica os avisos por área; impacto detalhado, responsável e próxima ação por aviso não foram publicados.</p>
      {!!ev?.incidents?.length && <p><a href="#he-inc" onClick={e => { e.preventDefault(); document.getElementById('he-inc')?.scrollIntoView({ block: 'start' }); }}>Consultar incidentes com responsável e evidências abaixo ↓</a></p>}
    </Section>}
    {g && liveFailures.length > 0 && <Section title="Avisos derivados da publicação" kicker={guardianAuditTime(g.live_checked_at)} id="he-live">
      <ul className="hud-list">{liveFailures.map(a => <li key={a}>{a === 'automations' ? 'Algum papel sem evento recente no recorte publicado' : guardianArea(a).replace(/^./, c => c.toUpperCase())}</li>)}</ul>
      <p className="hud-note">Checagens derivadas do recorte publicado. Ausência de evento no recorte não comprova tarefa pausada.</p>
    </Section>}
    {(ev?.incidents?.length ?? 0) > 0 && <Section title="Incidentes" kicker={`${ev!.incidents!.length} registros`} id="he-inc">
      <ul className="incidents">{ev!.incidents!.map(i => {
        const st = incidentView(i);
        const links = [...i.public_ids.tests, ...i.public_ids.hypotheses];
        return <li key={i.incident_id} className={`incident s-${st.tone}`}>
          <p className="incident-head"><span className="incident-state">{st.label}</span>
            <span className="hud-muted">visto {i.evidence_count} {i.evidence_count === 1 ? 'vez' : 'vezes'}</span></p>
          <p className="incident-text">{humanize((i.summary_plain ?? i.summary_pt ?? 'Problema registrado sem descrição pública.').replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}Z/g, (_m: string, y: string, mo: string, d: string, h: string, mi: string) => `${d}/${mo} às ${h}:${mi} UTC`).replace(/Falta duas/g, 'Faltam duas'))}</p>
          <IncidentResponsibility incident={i} />
          {links.length > 0 && <p className="incident-links">{links.slice(0, 4).map(l => <E key={l} id={l} />)}</p>}
        </li>;
      })}</ul>
    </Section>}
    {lab.missingContract.length > 0 && <Section title="Dados que o site ainda não recebe" kicker="Contrato da projeção" id="he-contract">
      <p className="hud-muted">Estes campos destravam linha do tempo, pré-registro e revisão completos:</p>
      <p>{lab.missingContract.map(m => <code key={m} className="tag">{m}</code>)}</p>
    </Section>}
    <details className="hud-legacy"><summary>Detalhes técnicos</summary>
      <p><a href="#/cockpit/prova?tab=integridade">Integridade</a> · <a href="#/cockpit/prova?tab=capabilities">Recursos</a> · <a href="#/cockpit/prova?tab=fontes">Fontes</a> · <a href="#/cockpit/pipeline">Fila de trabalho</a> · <a href="#/atlas?lente=operacao&view=2d">Mapa operacional</a></p>
      <p className="hud-muted">Assinatura: <code>{state.bus.fingerprint}</code></p>
    </details>
  </>;
}

// ---------- fenômenos da teia ----------
const domainOfId = (id: string, lab: Lab): string => {
  const rm = lab.roadmaps.get(id);
  const first = rm?.tests.map(t => lab.tests.get(t)).find(Boolean);
  if (first) return first.domain;
  const t = lab.tests.get(id);
  if (t) return t.domain;
  return /NEXO|ENGINEER|GPT|SELF|OBSERV|META/i.test(id) ? 'ENGINEERING' : /OLY/i.test(id) ? 'OLYMPUS' : 'SCIENCE';
};
function sceneEvents(state: SystemState, lab: Lab, current: boolean, recentThoughtIds: string[]): SceneEvents {
  const ev = state.evolution;
  const quasars = [
    ...(ev?.gate.charters_waiting ?? []).map(c => ({ domain: domainOfId(c.roadmap_id, lab), label: 'Decisão sua', href: '#/ciclo' })),
    ...(ev?.gate.canaries_waiting ?? []).map(c => ({ domain: 'ENGINEERING', label: 'Decisão sua: nova regra', href: '#/ciclo' })),
  ];
  const perDomain = new Map<string, number>();
  for (const t of lab.tests.values()) {
    if (!current || t.status?.toUpperCase() !== 'RUNNING' || t.contestOf) continue;
    const d = normDomain(t.domain);
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
  }
  const agn = [...perDomain].map(([domain, n]) => ({
    domain, count: n, href: '#/evidencia?v=RUNNING',
    label: `${n} ${n === 1 ? 'teste marcado' : 'testes marcados'} RUNNING`,
  }));
  const grbs = (ev?.thoughts ?? []).filter(t => current && recentThoughtIds.includes(t.id)).slice(-2)
    .map(t => ({ domain: domainOfId(t.refs[0] ?? '', lab), label: 'Pensamento registrado', href: '#/ciclo' }));
  return { quasars, agn, grbs };
}

// ---------- raias do ciclo ----------
const LANES: Array<[string, string]> = [['PITIA', 'Pítia'], ['LEARNER', 'Learner'], ['EXECUTOR', 'Executor'], ['REFUTADOR', 'Refutador'], ['GUARDIAO', 'Guardião'], ['ENGINEER', 'Engenheiro'], ['SENTINEL', 'Sentinela'], ['WRITER_ROBOT', 'Robô escritor'], ['DENER', 'Dener'], ['OTHER', 'Outros papéis']];
const LANE_ALIAS: Record<string, string> = { REFEREE_1: 'REFUTADOR' };
const laneKey = (role: string) => { const key = LANE_ALIAS[role.toUpperCase()] ?? role.toUpperCase(); return LANES.some(([id]) => id === key) ? key : 'OTHER'; };
const EVENT_PT: Record<string, string> = {
  TEST_RESULT_RECORDED: 'registrou resultado', ROADMAP_TEST_FROZEN: 'congelou um teste (pré-registro)',
  RESULT_CONTESTED: 'contestou um resultado', RESULT_REFEREE1_PASSED: 'aprovou no Referee 1', RESULT_REFUTED: 'refutou um resultado',
  RESULT_CONFIRMED: 'confirmou um resultado', INTEGRITY_REPORT_RECORDED: 'auditou o sistema', HYPOTHESIS_UPSERTED: 'propôs/atualizou hipótese',
  NEXO_THOUGHT_NOOP_RECORDED: 'pensou (sem novidade)', NEXO_THOUGHT_RECORDED: 'pensou', TEST_BATTERY_DISPATCHED: 'despachou bateria',
  ROADMAP_CHARTERED: 'aprovou carta', GENOME_MUTATION_PROPOSED: 'propôs mutação',
};
function Swimlanes({ events }: { events: Array<{ event_type: string; role: string; at: string; entity_id?: string }> }) {
  const now = Date.now(), span = 48 * 3600e3;
  const coverage = activityWindow(events, 48, now);
  const recent = coverage.recent;
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, rowH = 34, left = 92, H = LANES.length * rowH + 26;
  const x = (at: string) => left + ((Date.parse(at) - (now - span)) / span) * (W - left - 8);
  const lane = (role: string) => Math.max(0, LANES.findIndex(([k]) => k === laneKey(role)));
  const counts = LANES.map(([k]) => recent.filter(e => laneKey(e.role) === k).length);
  const h = hover !== null ? recent[hover] : null;
  return <div className="lanes">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={LANES.map(([, l], i) => `${l}: ${counts[i]} eventos recebidos no recorte parcial`).join('; ')}>
      {LANES.map(([k, l], i) => <g key={k}>
        <line x1={left} x2={W - 8} y1={i * rowH + rowH / 2} y2={i * rowH + rowH / 2} className="lane-line" />
        <text x={0} y={i * rowH + rowH / 2 + 4} className="lane-label">{l}</text>
        <text x={left - 10} y={i * rowH + rowH / 2 + 4} textAnchor="end" className="lane-count">{counts[i]}</text>
      </g>)}
      {[0, 12, 24, 36, 48].map(hh => <text key={hh} x={left + ((48 - hh) / 48) * (W - left - 8)} y={H - 4} textAnchor="middle" className="lane-tick">{hh ? `-${hh}h` : 'agora'}</text>)}
      {recent.map((e, i) => <circle key={i} cx={x(e.at)} cy={lane(e.role) * rowH + rowH / 2} r={hover === i ? 7 : 4.5}
        className={`lane-dot r-${e.role.toLowerCase()}`} tabIndex={0} role="button" aria-label={`${ROLE_PT[e.role.toUpperCase()] ?? e.role}: ${e.event_type}, ${e.at}`} onKeyDown={key => { if ((key.key === 'Enter' || key.key === ' ') && e.entity_id) { key.preventDefault(); window.location.hash = labHref('entidade', e.entity_id); } }}
        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)}
        onClick={() => { if (e.entity_id) window.location.hash = labHref('entidade', e.entity_id); }} />)}
    </svg>
    <p className="lane-caption" aria-live="polite">{h
      ? <>{LANES[lane(h.role)]![1]} {EVENT_PT[h.event_type] ?? h.event_type.toLowerCase().replace(/_/g, ' ')} · {ago(h.at)}{h.entity_id && <> · <E id={h.entity_id} /></>}</>
      : `${coverage.label}. Passe o dedo ou o mouse num ponto; clique para abrir a entidade.`}</p>
    <p className="hud-note">{activityRange(coverage)}</p>
  </div>;
}

// ---------- "vivo": monólogo, calibração, replay ----------
const ROLE_PT: Record<string, string> = {
  PITIA: 'Pítia', LEARNER: 'Learner', EXECUTOR: 'Executor', REFUTADOR: 'Refutador', REFEREE_1: 'Refutador', GUARDIAO: 'Guardião',
  DENER: 'Dener', CONVERSA: 'Conversa', WRITER_ROBOT: 'Robô escritor', SENTINEL: 'Sentinela', ENGINEER: 'Engenheiro', CLAUDE: 'Claude', CHATGPT_CONVERSATION: 'Conversa',
};
/** Catálogo de papéis. A cadência nominal não atesta execução nem disponibilidade atual. */
const TASKS: Array<{ id: string; name: string; hats: string[]; rhythm: string; does: string }> = [
  { id: 'operador-c', name: 'Operador C', hats: ['EXECUTOR'], rhythm: 'toda hora · :00', does: 'fecha o READY residual após A/B e resolve bindings' },
  { id: 'engenheiro', name: 'Engenheiro', hats: ['ENGINEER'], rhythm: 'toda hora · :05', does: 'escreve e conserta receitas' },
  { id: 'guardiao', name: 'Guardião', hats: ['GUARDIAO'], rhythm: 'toda hora · :07', does: 'audita a saúde, revisa receitas, planta iscas e acompanha o Writer' },
  { id: 'critico', name: 'Crítico', hats: ['REFUTADOR', 'REFEREE_1'], rhythm: 'toda hora · :09', does: 'ataca os resultados positivos' },
  { id: 'cientista', name: 'Cientista', hats: ['LEARNER'], rhythm: 'toda hora · :12', does: 'propõe hipóteses e famílias de testes, transfere métodos entre áreas' },
  { id: 'pitia', name: 'Pítia', hats: ['PITIA'], rhythm: 'toda hora · :15', does: 'pensa, se surpreende, sonha e declara crise' },
  { id: 'operador-a', name: 'Operador A', hats: ['EXECUTOR'], rhythm: 'toda hora · :30', does: 'pega o primeiro segmento READY elegível e manda testes para a bateria' },
  { id: 'operador-b', name: 'Operador B', hats: ['EXECUTOR'], rhythm: 'toda hora · :45', does: 'pega o segmento READY elegível restante e manda testes para a bateria' },
  { id: 'sentinela', name: 'Sentinela', hats: ['SENTINEL'], rhythm: 'todo dia · 06:40', does: 'lê literatura e releases, abrindo contestação, dado ou sinal' },
  { id: 'revisor-pr', name: 'Revisor de PR', hats: ['GUARDIAO'], rhythm: 'evento de PR', does: 'revisa diffs de receita e publica o sinal da revisão' },
];
const taskOf = (role: string) => {
  const matches = TASKS.filter(t => t.hats.includes(role.toUpperCase()));
  return matches.length === 1 ? matches[0] : undefined;
};
const roleLabel = (role: string) => { const t = taskOf(role); const r = ROLE_PT[role.toUpperCase()] ?? role; return t ? (t.name === r ? r : `${t.name} · ${r}`) : r; };
// 120x120 por família; só campos recebidos habilitam caudas. Cursor local preservado entre recargas.
// A escolha de palavras descreve um evento recebido; ela nunca cria uma ação nova.
const narrationDeck = browserNarrationDeck();
const say = (key: string, seed: string, vars: Record<string, string | number> = {}) => narrationDeck.say(key, seed, vars);
const NARRATION_TERMS: Record<string, string> = {
  PROMOTED: 'positivo na execução', REJECTED: 'rejeitado pelo critério', INCONCLUSIVE: 'inconclusivo', CONTESTED: 'contestado',
  PENDING_REVIEW: 'aguardando revisão', REFEREE1_PASSED: 'primeira revisão aprovada', CONFIRMED: 'confirmado na revisão', REFUTED: 'refutado na revisão',
};
/** Estrela que representa a entidade na teia (contestações apontam para o resultado atacado). */
function starOf(lab: Lab, id: string): string | null {
  let t = lab.tests.get(id);
  for (let i = 0; t?.contestOf && i < 8; i += 1) t = lab.tests.get(t.contestOf) ?? undefined;
  return t ? t.id : null;
}
function narrate(e: { event_type: string; entity_id?: string; at?: string }, lab: Lab, state?: SystemState): string {
  // The original thought is used only for an exact published timestamp match.
  if (e.event_type === 'NEXO_THOUGHT_RECORDED' && e.at && state) {
    const t0 = Date.parse(e.at);
    const th = (state.evolution?.thoughts ?? []).find(x => Date.parse(x.at) === t0);
    if (th?.text) return humanize(clip(th.text, 180));
  }
  const t = e.entity_id ? lab.tests.get(e.entity_id) : undefined;
  const post = e.event_type === 'BOARD_POSTED' && state && e.at
    ? state.evolution?.board?.find(p => p.at === e.at && (!e.entity_id || p.id === e.entity_id)) : undefined;
  if (post?.text) return `Texto do mural: “${clip(post.text, 180)}”`;
  const extra = {
    roadmap: t?.roadmapId ? lab.roadmaps.get(t.roadmapId)?.title : undefined,
    by: t && state?.graph.nodes.find(n => n.id === t.id)?.owner_role,
  };
  const fields = Object.fromEntries(Object.entries(narrationEvidence(t, extra)).map(([key, value]) => [key, clip(humanize((key === 'result' || key === 'review') ? NARRATION_TERMS[value] ?? value : value), 85)]));
  const tpl = say(e.event_type, `${e.at ?? ''}${e.entity_id ?? ''}`, fields) ?? `Registrei ${e.event_type.toLowerCase().replace(/_/g, ' ')}: %q`;
  // Hipótese: prefira o nome curto de um teste dela ao enunciado inteiro.
  const viaTest = !t && e.entity_id ? [...lab.tests.values()].find(x => x.hypothesisId === e.entity_id)?.name : undefined;
  const q = t?.name ?? viaTest ?? (e.entity_id ? (lab.hypotheses.get(e.entity_id)?.statement ?? humanId(e.entity_id)) : '');
  const text = tpl.includes('%q') ? tpl.replaceAll('%q', q ? `“${clip(q, 65)}”` : 'uma entidade sem identificação publicada').replace(/: $/, '.') : tpl;
  return humanize(text);
}

function Typewriter({ text }: { text: string }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) { setN(text.length); return; }
    setN(0);
    const t = window.setInterval(() => setN(k => { if (k >= text.length) { window.clearInterval(t); return k; } return k + 2; }), 18);
    return () => window.clearInterval(t);
  }, [text, reduced]);
  return <span className="mono-typewriter" data-writing={n < text.length ? 'true' : 'false'}>{text.slice(0, n)}{n < text.length && <i className="caret" aria-hidden="true">▍</i>}</span>;
}

type ActivityRow = { at: string; role: string; event_type: string; entity_id?: string; times?: number };
function Monologue({ lab, state, onReplay, replayCount }: { lab: Lab; state: SystemState; onReplay: () => void; replayCount: number }) {
  // Rotina repetida (auditoria, NO-OP) vira uma linha só com a contagem.
  const recent: Array<ActivityRow> = [];
  for (const e of observedActivity(lab.activity).reverse()) {
    const prev = recent[recent.length - 1];
    if (prev && prev.role === e.role && prev.event_type === e.event_type
        && ((!e.entity_id && !prev.entity_id) || (e.event_type === 'TEST_RESULT_RECORDED' && prev.entity_id === e.entity_id))) { prev.times = (prev.times ?? 1) + 1; continue; }
    recent.push({ ...e, times: 1 });
    if (recent.length >= 8) break;
  }
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 30000); return () => window.clearInterval(t); }, []);
  if (!recent.length) return null;
  const last = recent[0]!;
  const eventAge = publishedAgeMs(last.at);
  const quiet = eventAge === null ? Infinity : Math.round(eventAge / 60000);
  return <section className="hud-section monologue" aria-labelledby="mono-title">
    <p className="hud-kicker"><i className={`pulse-dot${quiet < 30 ? ' live' : ''}`} aria-hidden="true" />
      {quiet < 30 ? 'Evento recente publicado' : `Última ação ${ago(last.at)}`} · {activityWindow(lab.activity, 24).label}</p>
    <h2 id="mono-title">Diário dos papéis</h2>
    <p className="feed-kind">Eventos narrados · interface</p>
    <details className="reading-details"><summary>Fonte e variação das falas</summary><p className="hud-note">Fonte recebida {ago(lab.generatedAt)}. As falas resumem o recorte recebido, com o papel original; não indicam uma ação em curso. Os campos da ficha podem refletir um estado posterior ao evento.</p><p className="hud-note">{narrationDeck.persistence === 'local' ? 'Cursor salvo neste navegador, inclusive entre recargas' : 'Variação limitada à memória desta visita; armazenamento local indisponível'}. Só campos publicados habilitam variações; sem sincronização entre aparelhos.</p></details>
    <p className="mono-now"><b>{ROLE_PT[last.role.toUpperCase()] ?? last.role}</b> <Typewriter text={narrate(last, lab, state)} /></p>
    <ul className="mono-self">{selfLines(lab, state).map((l, i) => <li key={i}><i aria-hidden="true"><Icon n={l.icon} /></i>{l.link ? <a href={l.link}>{l.text}</a> : l.text}</li>)}</ul>
    <ol className="mono-log">{recent.slice(1).map((e, i) => <li key={i}>
      <time>{ago(e.at)}</time><b>{ROLE_PT[e.role.toUpperCase()] ?? e.role}</b>
      <span>{e.entity_id ? <a href={labHref('entidade', e.entity_id)}>{narrate(e, lab, state)}</a> : narrate(e, lab, state)}{(e.times ?? 1) > 1 && <em className="mono-times"> · {e.times}×</em>}</span>
    </li>)}</ol>
    {replayCount > 0 && <button type="button" className="replay-btn" onClick={onReplay}>▶ Rever o recorte de até 24 h ({replayCount} eventos)</button>}
  </section>;
}

/** Quanto o NEXO acerta das próprias previsões (congeladas antes de rodar). */
// ---------- Autonomia: o que o ciclo fecha sem operador (métricas do livro, cap. 11)
const pctOf = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const FEATURE_PT: Record<string, string> = { units: 'número de faixas ou grupos', n_compilations: 'número de coleções de supernovas', has_union3: 'usa Union3', mode: 'modo da análise', recipe: 'receita' };
function Autonomy({ state, lab }: { state: SystemState; lab: Lab }) {
  const a = state.evolution?.autonomy;
  if (!a) return null;
  const rules = (state.evolution?.learning?.rules ?? []).filter(r => r.state === 'ACTIVE');
  const view = autonomyPresentation(a);
  const queueGap = publishedQueueGap(a, ((state as unknown as { read_model?: { tests?: Record<string, Record<string, unknown>> } }).read_model?.tests ?? {}));
  return <Section title="Resultados, revisão e fila" kicker={`${view.results ?? '—'} registros com veredito na janela publicada${view.legacy ? ` · período legado declarado: ${a.window_hours}h` : ''}`} id="now-autonomy">
    {view.legacy
      ? <p className="hud-note">Agregado legado: definições versionadas, bases numéricas e cobertura não publicadas. Os percentuais abaixo não comprovam autonomia sem supervisão.</p>
      : <p className="hud-note">Calculado em {a.computed_at ?? 'data não publicada'}. Janela: {a.window_start ?? 'início não publicado'} a {a.window_end ?? 'fim não publicado'}.</p>}
    {view.resultDiscrepancy && <p className="hud-note metric-discrepancy">{view.resultDiscrepancy}</p>}
    <h3>Resultados na janela · testes principais</h3>
    {view.outcomes.length > 0 && <p className="hud-note">Vereditos registrados: {view.outcomes.map(([verdict, total]) => `${total} ${verdict}`).join(' · ')}.</p>}
    <dl className="aut-grid">{view.recent.map(cell => <div key={cell.label}><dt>{cell.value}</dt><dd><b>{cell.label}</b><span>{cell.base}</span><span>{cell.description}</span></dd></div>)}</dl>
    <h3>Estoque na leitura · sem recorte temporal</h3>
    <p className="hud-note">Nesta leitura: <b>{lab.counts.BLOCKED} bloqueados entre {lab.tests.size} testes recebidos</b>. WORK fica fora desta contagem.</p>
    <dl className="aut-grid">{view.inventory.map(cell => <div key={cell.label}><dt>{cell.value}</dt><dd><b>{cell.label}</b><span>{cell.base}</span><span>{cell.description}</span></dd></div>)}</dl>
    {queueGap && <p className="hud-note metric-discrepancy">Contagens divergentes entre as leituras: o agregado declara {queueGap.publishedBlocked}/{queueGap.publishedBase}; os estados públicos normalizados contêm {queueGap.blocked} BLOCKED* e {queueGap.ready} READY. O percentual acima preserva o agregado publicado; o escopo e a normalização precisam ser conferidos na origem.</p>}
    {rules.length > 0 && <>
      <p className="hud-kicker" style={{ marginTop: 14 }}>Regras que o NEXO aprendeu sobre como pesquisar</p>
      <ul className="fam-list">{rules.map(r => <li key={`${r.feature}=${r.value}`}>
        <b>{FEATURE_PT[r.feature] ?? r.feature}: {r.value}</b>
        <span>termina inconclusivo em {pctOf(r.inconclusive_rate)} das vezes · previsão certa em {pctOf(r.holdout_accuracy)} contra {pctOf(r.baseline)} sem a regra · esses testes passam para o fim da fila</span>
      </li>)}</ul></>}
  </Section>;
}

// ---------- Famílias: grades de testes que o robô roda sozinho
const CLOSE_PT: Record<string, string> = { EXHAUSTED: 'grade completa sem decisão', SUCCESS: 'sustentada (2 promovidos)', KILL: 'derrubada (2 rejeitados)', ROADMAP_CLOSED: 'roteiro fechado' };
function Families({ state }: { state: SystemState }) {
  const fams = state.evolution?.families ?? [];
  const open = Object.keys(state.evolution?.recipe_health ?? {});
  if (!fams.length && !open.length) return null;
  const active = fams.filter(f => f.state === 'ACTIVE').length;
  return <Section title="Famílias de testes" kicker={`${active} ${active === 1 ? 'ativa' : 'ativas'} · estados declarados das famílias`} id="now-families">
    <ul className="fam-list">{fams.map(f => <li key={f.family_id}>
      <b>{f.display_name || f.family_id}</b>
      <span>{f.state === 'ACTIVE' ? 'ativa' : `fechada: ${CLOSE_PT[f.close_reason ?? ''] ?? 'encerrada'}`} · {f.done} de {f.cells} feitos · {f.promoted} passaram, {f.rejected} caíram, {f.inconclusive} mistos</span>
    </li>)}</ul>
    {open.length > 0 && <p className="fam-open">Receita parada por falhas repetidas: {open.join(', ')}. O Engenheiro conserta; o robô testa uma vez antes de voltar ao ritmo.</p>}
  </Section>;
}

function Calibration({ lab }: { lab: Lab }) {
  const pts: Array<{ p: number; hit: number; area: string }> = [];
  for (const t of lab.tests.values()) {
    const p = (t.prereg.prediction as { p_promoted?: number } | null)?.p_promoted;
    const v = (t.verdictRaw ?? '').toUpperCase();
    if (typeof p !== 'number' || !v) continue;
    const pass = /PROMOT|SUPPORT|CONFIRM|PASS|SURVIV/.test(v) ? 1 : /REJECT|REFUT|FAIL|KILL|CONTRADICT/.test(v) ? 0 : -1;
    if (pass < 0) continue;
    pts.push({ p: Math.min(1, Math.max(0, p)), hit: pass, area: t.topic ?? AREA_PT[normArea(t.domain)] ?? t.domain });
  }
  if (pts.length < 5) return null;
  const brier = pts.reduce((a, x) => a + (x.p - x.hit) ** 2, 0) / pts.length;
  const right = pts.filter(x => (x.p >= 0.5 ? 1 : 0) === x.hit).length;
  const confident = pts.filter(x => x.p >= 0.7);
  const acc = (xs: typeof pts) => xs.filter(x => (x.p >= 0.5 ? 1 : 0) === x.hit).length / xs.length;
  const overall = acc(pts);
  const weak = [...new Set(pts.map(x => x.area))].map(a => ({ a, xs: pts.filter(x => x.area === a) }))
    .filter(g => g.xs.length >= 5).map(g => ({ a: g.a, n: g.xs.length, r: acc(g.xs) })).sort((x, y) => x.r - y.r)[0];
  const confHit = confident.filter(x => x.hit === 1).length;
  const bins = [0, 1, 2, 3, 4].map(b => {
    const inBin = pts.filter(x => Math.min(4, Math.floor(x.p * 5)) === b);
    return { b, n: inBin.length, rate: inBin.length ? inBin.filter(x => x.hit).length / inBin.length : 0 };
  });
  return <section className="hud-section calib" aria-labelledby="calib-title">
    <p className="hud-kicker">{pts.length} previsões feitas antes de cada teste</p>
    <h2 id="calib-title">Calibração das previsões</h2>
    <p className="hud-big">Previsões compatíveis com o desfecho bruto: <b>{Math.round(100 * right / pts.length)}%</b> dos registros medidos
      {confident.length >= 3 && <> · entre probabilidades declaradas ≥70%, foram compatíveis <b>{Math.round(100 * confHit / confident.length)}%</b></>}.</p>
    {weak && overall - weak.r >= 0.1 && <p className="calib-weak">Taxa menor na amostra de <b>{weak.a.toLowerCase()}</b>: lá acerto {Math.round(weak.r * 100)}%, contra {Math.round(overall * 100)}% no geral. A amostra descreve desempenho passado.</p>}
    <div className="calib-chart" role="img" aria-label={bins.map(x => `${x.b * 20}-${x.b * 20 + 20}%: ${x.n ? Math.round(x.rate * 100) + '% passaram' : 'sem dados'}`).join('; ')}>
      {bins.map(x => <span key={x.b} title={`${x.n} testes`}>
        <b style={{ height: `${x.n ? Math.max(4, x.rate * 100) : 0}%` }} /><i style={{ bottom: `${x.b * 20 + 10}%` }} />
        <em>{x.b * 20}–{x.b * 20 + 20}%</em></span>)}
    </div>
    <p className="hud-note">Barra = fração de desfechos brutos positivos; traço = faixa de probabilidade declarada. A calibração não estabelece confirmação científica. Erro médio (Brier): {brier.toFixed(2)}.</p>
  </section>;
}

// ---------- tradução semântica: a história de cada teste em 1ª pessoa ----------
type Beat = { icon: string; text: string; tone: 'why' | 'bet' | 'fact' | 'surprise' | 'doubt' | 'belief' | 'change' | 'block'; link?: { id: string; label: string } };
const AXIS_PT: Record<string, string> = { dados: 'com outros dados', data: 'com outros dados', 'método': 'com outro método', metodo: 'com outro método', method: 'com outro método',
  coorte: 'com outra amostra', cohort: 'com outra amostra', 'critério': 'com uma regra mais dura', criterio: 'com uma regra mais dura', criterion: 'com uma regra mais dura' };
export function outcomeOf(t: TestEntity): 1 | 0 | null {
  const v = (t.verdictRaw ?? '').toUpperCase();
  if (/PROMOT|SUPPORT|CONFIRM|PASS|SURVIV/.test(v)) return 1;
  if (/REJECT|REFUT|FAIL|KILL|CONTRADICT/.test(v)) return 0;
  return null;
}
function pct(p: number) { return `${Math.round(p * 100)}%`; }
function testStory(t: TestEntity, lab: Lab): Beat[] {
  if (t.historical) return [{ icon: t.verdict === 'REFUTED' ? 'cross' : 'check', tone: 'fact', text: 'Resultado terminal auditado da Tower antiga, no escopo do contrato original. A revisão histórica não equivale à escada de contestações da Tower atual.' }];
  const beats: Beat[] = [];
  const parent = t.contestOf ? lab.tests.get(t.contestOf) : undefined;
  const hyp = t.hypothesisId ? lab.hypotheses.get(t.hypothesisId) : undefined;
  const rm = t.roadmapId ? lab.roadmaps.get(t.roadmapId) : undefined;
  if (parent) beats.push({ icon: 'attack', tone: 'doubt', text: 'Contestação vinculada ao resultado:', link: { id: parent.id, label: parent.name } });
  else if (hyp?.statement) beats.push({ icon: 'idea', tone: 'why', text: `Hipótese publicada: ${hyp.statement}` });
  if (rm && !parent) beats.push({ icon: 'compass', tone: 'why', text: `Roadmap publicado: ${rm.title}.` });
  const pred = (t.prereg.prediction ?? {}) as { p_promoted?: number };
  const p = typeof pred.p_promoted === 'number' ? Math.min(1, Math.max(0, pred.p_promoted)) : null;
  if (p !== null) beats.push({ icon: 'bet', tone: 'bet', text: `Probabilidade de promoção declarada no pré-registro: ${pct(p)}.` });
  if (t.prereg.success.length || t.prereg.kill.length) beats.push({ icon: 'lock', tone: 'bet', text: 'Critérios de sucesso e encerramento publicados no pré-registro.' });
  const o = outcomeOf(t);
  if (isReady(t)) beats.push({ icon: 'wait', tone: 'fact', text: 'O teste está marcado READY; o despacho depende de elegibilidade e da bateria.' });
  else if (t.verdict === 'BLOCKED') beats.push({ icon: 'block', tone: 'block', text: `Bloqueio operacional publicado${t.blocker ? `: ${t.blocker}` : ': motivo não publicado.'}` });
  else if (o === 1) beats.push({ icon: 'check', tone: 'fact', text: parent ? 'O resultado bruto da contestação foi positivo; consulte o eixo e o contrato.' : 'A execução registrou um resultado positivo; a conclusão atual depende da revisão.' });
  else if (o === 0) beats.push({ icon: 'cross', tone: 'fact', text: parent ? 'A contestação registrou um resultado negativo; consulte sua interpretação publicada.' : 'A execução registrou um resultado negativo pelo critério do teste.' });
  else if (t.verdictRaw) beats.push({ icon: 'even', tone: 'fact', text: 'O rótulo bruto publicado não foi classificado como positivo ou negativo nesta apresentação.' });
  if (p !== null && o !== null) {
    const err = Math.abs(p - o);
    if (err >= 0.5) beats.push({ icon: 'spark', tone: 'surprise', text: `O desfecho divergiu da probabilidade declarada no pré-registro.` });
    else if (err <= 0.3) beats.push({ icon: 'target', tone: 'surprise', text: 'O desfecho é compatível com a probabilidade declarada no pré-registro.' });
  }
  const axes = [...new Set(t.reviews.map(r => AXIS_PT[String(r.axis ?? '').toLowerCase().trim()]).filter(Boolean))];
  if (t.contests.length || t.reviews.length) {
    const n = Math.max(t.contests.length, t.reviews.filter(r => r.kind === 'CONTEST').length);
    beats.push({ icon: 'shield', tone: 'doubt', text: `Foram publicados ${n} vínculos de contestação${axes.length ? ` (${axes.join(', ')})` : ''}.` });
  }
  const belief: Record<string, Beat> = {
    CONFIRMED: { icon: 'star', tone: 'belief', text: 'A revisão publicada confirmou o resultado no escopo do teste.' },
    REFUTED: { icon: 'undo', tone: 'change', text: o === 1 ? 'O resultado positivo da execução foi posteriormente refutado pela revisão.' : 'A revisão publicada refutou o resultado.' },
    REVIEW: { icon: 'half', tone: 'belief', text: 'O resultado está em revisão.' },
    PROVISIONAL: { icon: 'dot', tone: 'belief', text: 'O resultado é provisório na revisão publicada.' },
    REJECTED: { icon: 'dash', tone: 'belief', text: 'A execução rejeitou a hipótese pelo critério registrado.' },
    DISCARDED: { icon: 'dash', tone: 'belief', text: 'O teste foi arquivado, retirado ou descartado no registro publicado.' },
  };
  if (belief[t.verdict]) beats.push(belief[t.verdict]!);
  return beats;
}

const AREA_PT: Record<string, string> = { SCIENCE: 'Ciência', ENGINEERING: 'Engenharia do NEXO', OLYMPUS: 'Olympus' };
const normArea = (d: string) => { const u = (d || '').toUpperCase(); return u === 'NEXO' || u === 'ARTIFACT' ? 'ENGINEERING' : u; };
/** Estados internos que mudam devagar: onde está minha atenção, o que estou ignorando, se me peguei numa isca. */
function selfLines(lab: Lab, state: SystemState): Array<{ icon: string; text: string; link?: string }> {
  const out: Array<{ icon: string; text: string; link?: string }> = [];
  const day = activityWindow(lab.activity, 24).recent;
  const touched = new Map<string, number>();
  for (const e of day) {
    const rid = e.entity_id ? lab.tests.get(e.entity_id)?.roadmapId : null;
    if (rid) touched.set(rid, (touched.get(rid) ?? 0) + 1);
  }
  const active = [...lab.roadmaps.values()].filter(r => r.state === 'ACTIVE' || r.state === 'CHARTERED');
  const focus = [...touched].sort((a, b) => b[1] - a[1])[0];
  if (focus) {
    const r = lab.roadmaps.get(focus[0]);
    if (r) out.push({ icon: 'eye', text: say('SELF_FOCUS', r.id + new Date().toDateString(), { title: clip(r.title.toLowerCase(), 62), n: focus[1] })!, link: labHref('roadmap', r.id) });
  }
  const ignored = active.filter(r => !touched.has(r.id) && (r.frontier ?? 0) > 0).sort((a, b) => (b.frontier ?? 0) - (a.frontier ?? 0))[0];
  if (ignored) out.push({ icon: 'eyeoff', text: say('SELF_IGNORED', ignored.id + new Date().toDateString(), { title: clip(ignored.title.toLowerCase(), 62), n: ignored.frontier ?? 0 })!, link: labHref('roadmap', ignored.id) });
  const blockedRoadmap = active.map(r => ({ r, tests: r.tests.map(id => lab.tests.get(id)).filter(t => t?.verdict === 'BLOCKED') })).sort((a, b) => b.tests.length - a.tests.length)[0];
  if (blockedRoadmap?.tests.length) {
    const blocker = blockedRoadmap.tests[0]?.blocker;
    out.push({ icon: 'block', text: say('SELF_BLOCKED', blockedRoadmap.r.id + lab.generatedAt, { title: clip(blockedRoadmap.r.title, 62), n: blockedRoadmap.tests.length, ...(blocker ? { blocker: clip(humanize(blocker), 85) } : {}) })!, link: labHref('roadmap', blockedRoadmap.r.id) });
  }
  const d = state.evolution?.decoys;
  if (d && d.revealed > 0) out.push({ icon: 'trap', text: say('SELF_DECOY_CAUGHT', new Date().toDateString(), { n: d.caught, m: d.revealed })! });
  else if (d && d.planted > 0) out.push({ icon: 'trap', text: say('SELF_DECOY_PLANTED', new Date().toDateString(), { n: d.planted })! });
  const gate = (state.evolution?.gate.charters_waiting.length ?? 0) + (state.evolution?.gate.canaries_waiting.length ?? 0);
  if (gate) out.push({ icon: 'hand', text: say('SELF_GATE', new Date().toDateString(), { n: gate })!, link: '#/ciclo' });
  return out;
}

// ---------- ícones de traço fino (um só estilo; nada de emoji) ----------
const ICON: Record<string, string> = {
  idea: 'M8 2.5a4 4 0 0 0-2.3 7.3V11h4.6V9.8A4 4 0 0 0 8 2.5ZM6.2 13h3.6',
  compass: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Zm2.4 3.8-1.4 3.4-3.4 1.4 1.4-3.4 3.4-1.4Z',
  bet: 'M3 3h10v10H3zM6 6h.01M10 6h.01M8 8h.01M6 10h.01M10 10h.01',
  lock: 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2',
  wait: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3v3.2l2 1.3',
  block: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM3.8 3.8l8.4 8.4',
  check: 'M3 8.5 6.5 12 13 4.5',
  cross: 'M4 4l8 8M12 4l-8 8',
  even: 'M3 6.5h10M3 9.5h10',
  spark: 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z',
  gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1',
  replay: 'M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8',
  page: 'M4 2.5h6l2 2v9H4zM6 7h4M6 9.5h4',
  target: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 2.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2Z',
  shield: 'M8 1.8 13 3.8v3.7c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.8z',
  attack: 'M3 13 11 5M9 3h4v4M5.5 10.5l-2-2',
  star: 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.2L8 11.3 4.3 13.4l.8-4.2L2 6.3l4.2-.5z',
  undo: 'M4 6h6a3.5 3.5 0 0 1 0 7H6M4 6l2.5-2.5M4 6l2.5 2.5',
  half: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 0v12',
  dot: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  dash: 'M4 8h8',
  eye: 'M1.8 8S4.2 3.8 8 3.8 14.2 8 14.2 8 11.8 12.2 8 12.2 1.8 8 1.8 8Zm6.2-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  eyeoff: 'M1.8 8S4.2 3.8 8 3.8 14.2 8 14.2 8 11.8 12.2 8 12.2 1.8 8 1.8 8ZM2.5 2.5l11 11',
  trap: 'M2.5 12.5h11M4 12.5 8 4l4 8.5M6 9h4',
  sound: 'M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9',
  mute: 'M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 6l3.5 4M14.5 6 11 10',
  hand: 'M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7V3a1 1 0 0 1 2 0v4M9.5 7.2V4a1 1 0 0 1 2 0v5.5a4.5 4.5 0 0 1-8.3 2.4L2.5 10a1 1 0 0 1 1.6-1.2l1.4 1.4',
};
function Icon({ n }: { n: string }) {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[n] ?? ICON.dot} /></svg>;
}

// ---------- assinatura: picos acústicos do CMB (forma ilustrativa de D_ℓ) ----------
const ACOUSTIC = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const l = 2 + (i / 120) * 2500;
    const rise = 1 - Math.exp(-l / 180);
    const d = rise * (0.55 + 0.45 * Math.cos(Math.PI * (l - 220) / 300) ** 2 * (1 + 0.35 * Math.cos(Math.PI * (l - 220) / 600)))
      * Math.exp(-((l / 1650) ** 2));
    pts.push(`${(i * 1.5).toFixed(1)},${(38 - d * 34).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
})();
function Acoustic() {
  return <p className="sig-acoustic" aria-hidden="true">
    <svg viewBox="0 0 180 40"><defs><linearGradient id="sig-spec" x1="0" x2="1">
      <stop offset="0" stopColor="var(--atlas-cyan)" /><stop offset=".45" stopColor="var(--atlas-cyan-soft)" /><stop offset=".75" stopColor="#f0dfbd" /><stop offset="1" stopColor="#fff6e4" />
    </linearGradient></defs><path d={ACOUSTIC} /></svg>
    <span><em>Λ</em>_ observatório NEXO · ℓ(ℓ+1)C<sub>ℓ</sub></span>
  </p>;
}

// ---------- Trilha do roadmap: o caminho andado (cor = veredito), a fronteira acesa e a meta ----------
const TRAIL_COLOR: Record<Verdict, string> = {
  CONFIRMED: 'var(--v-confirmed)', REFUTED: 'var(--atlas-cyan)', REVIEW: 'var(--atlas-cyan-soft)', PROVISIONAL: '#9fb4d8', READY: 'var(--atlas-cyan)',
  RUNNING: '#9fb4d8', CHECKPOINTED: '#7f8ca3', BLOCKED: '#6b6f7a', REJECTED: 'var(--atlas-cyan)', DISCARDED: '#3d414a',
};
function Trail({ tests, frontier, target }: { tests: TestEntity[]; frontier: string[] | null; target: number | null }) {
  const { walked, ahead, other } = roadmapTrail(tests, frontier);
  const frontierLabel = frontier === null ? 'candidatos READY; fronteira não publicada' : 'na fronteira';
  if (!walked.length && !ahead.length) return null;
  const n = walked.length + ahead.length + 1, step = 40, W = Math.max(320, 48 + (n - 1) * step);
  const x = (i: number) => 24 + i * step;
  const y = (i: number) => 46 + Math.sin(i * 0.55) * 14;
  const pathD = Array.from({ length: n }, (_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(' ');
  const walkedEnd = walked.length ? x(walked.length - 1) : 24;
  const confirmed = tests.filter(t => t.verdict === 'CONFIRMED').length;
  return <figure className="trail" aria-label={`Trilha: ${walked.length} resultados fora da fronteira, ${ahead.length} ${frontierLabel}, ${other.length} outros registros`}>
    <svg viewBox={`0 0 ${W} 92`} style={{ maxHeight: 140 }}>
      <defs><linearGradient id="trail-walk" x1="0" x2="1"><stop offset="0" stopColor="#8a7a5c" stopOpacity=".2" /><stop offset="1" stopColor="#d4bf95" /></linearGradient></defs>
      <path d={pathD} className="trail-ahead" />
      <path d={pathD} className="trail-walk" style={{ clipPath: `inset(0 ${W - walkedEnd}px 0 0)` }} />
      {walked.map((t, i) => <a key={t.id} href={labHref('entidade', t.id)}><circle cx={x(i)} cy={y(i)} r={t.verdict === 'CONFIRMED' ? 6 : 4} fill={TRAIL_COLOR[t.verdict]}><title>{t.name}</title></circle></a>)}
      {ahead.map((t, k) => { const i = walked.length + k; return <a key={t.id} href={labHref('entidade', t.id)}>
        <circle cx={x(i)} cy={y(i)} r={4} className="trail-front"><title>{`Próximo: ${t.name}`}</title></circle></a>; })}
      <g transform={`translate(${x(n - 1)},${y(n - 1)})`} className="trail-goal"><circle r={9} /><path d="M-4 0h8M0-4v8" /></g>
    </svg>
    <figcaption><span>{walked.length} resultados fora da fronteira</span><span className="tf">{ahead.length} {frontierLabel}{other.length > 0 && ` · ${other.length} outros registros`}</span><span className="tg">meta: {confirmed}/{target ?? '?'} confirmados</span></figcaption>
  </figure>;
}

const LOOP_PT: Record<string, string> = {
  thought: 'pensamentos', dream: 'sonhos', genome_mutation: 'mutações do genoma', fitness: 'medição de aptidão',
  new_hypothesis: 'hipóteses novas', result: 'resultados', contest: 'ataques', decoy: 'iscas',
};

// ---------- Mural: os agentes conversando entre si ----------
// Recados dos agentes citam IDs técnicos; no site viram nomes em português.
const RECIPE_PT: Record<string, string> = {
  w0wa_bao_sn_multi: 'a receita de energia escura com duas compilações de supernovas',
  w0wa_bao_sn: 'a receita de energia escura (BAO + supernovas)', seed_bounds: 'a receita de limites', runner_readback_canary: 'a receita de teste do executor',
};
function nameIds(text: string, lab: Lab): string {
  return text
    .replace(/[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+){1,}/g, tok => {
      const t = lab.tests.get(tok); if (t) return `“${t.name}”`;
      const h = lab.hypotheses.get(tok); if (h) return `“${clip(h.statement ?? 'uma hipótese', 60)}”`;
      if (RECIPE_PT[tok]) return RECIPE_PT[tok]!;
      if (/^(HYP|H-|HYP-)/i.test(tok)) return 'uma hipótese';
      if (/[A-Z]/.test(tok) && tok.includes('-')) return 'um teste';
      return tok.replace(/_/g, ' ');
    })
    .replace(/(um teste)(,? e um teste)+/g, 'alguns testes');
}

const boardRole = (role: string) => role === 'ALL' ? 'todos os papéis' : roleLabel(role);
function BoardFocus({ state, lab, post, onOpenBoard }: { state: SystemState; lab: Lab; post: ReturnType<typeof latestBoardRecord>; onOpenBoard: () => void }) {
  const records = state.evolution?.board ?? [];
  if (!post) return null;
  return <section className="hud-section board-focus" aria-labelledby="board-focus-title">
    <p className="hud-kicker">Recado aguardando resposta</p>
    <h2 id="board-focus-title">O papo no mural</h2>
    <p className="board-caption"><span>Narração · interface</span>{boardRole(post.from)} deixou um recado para {boardRole(post.to)}.</p>
    <BoardMessage key={post.id} post={post} lab={lab} from={boardRole(post.from)} to={boardRole(post.to)} records={records} focus />
    <button type="button" className="board-open" onClick={onOpenBoard}>Ver todos os recados <span aria-hidden="true">→</span></button>
  </section>;
}

function Board({ state, lab, visit = 0 }: { state: SystemState; lab: Lab; visit?: number }) {
  const now = Date.now();
  const [all, setAll] = useState(false);
  const [owner, setOwner] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('Aguardando resposta');
  useEffect(() => {
    if (!visit) return;
    setOwner(''); setKind(''); setStatus('Aguardando resposta'); setAll(true);
    const heading = document.getElementById('now-board');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [visit]);
  const raw = state.evolution?.board ?? [];
  const every = boardThreads(raw, now).slice().reverse().map(post => ({ ...post, conversation: boardConversation(post, raw, now) }));
  if (!every.length) return null;
  const filtered = every.filter(p => (!owner || p.to === owner) && (!kind || p.conversation.kind === kind)
    && (!status || (status === 'Aguardando resposta' ? p.conversation.awaiting : !p.conversation.awaiting)));
  const posts = all ? filtered : filtered.slice(0, 8);
  const who = boardRole;
  return <Section title="Conversa entre os agentes" kicker={`${filtered.length} conversas ${status === 'Aguardando resposta' ? 'aguardando resposta' : status === 'Histórico' ? 'no histórico' : 'nos filtros'} · mostrando ${posts.length}`} id="now-board">
    <div className="board-filters" role="group" aria-label="Filtrar mural">
      <label>Para<select aria-label="Para" value={owner} onChange={e => { setOwner(e.target.value); setAll(false); }}><option value="">Todos</option>{[...new Set(every.map(p => p.to))].map(x => <option key={x} value={x}>{who(x)}</option>)}</select></label>
      <label>Tipo<select aria-label="Tipo" value={kind} onChange={e => { setKind(e.target.value); setAll(false); }}><option value="">Todos</option><option>Conteúdo</option><option>Reclamação</option></select></label>
      <label>Mostrar<select aria-label="Mostrar" value={status} onChange={e => { setStatus(e.target.value); setAll(false); }}><option>Aguardando resposta</option><option>Histórico</option><option value="">Todos</option></select></label>
    </div>
    <p className="hud-note">Respostas ficam ligadas à conversa no histórico. Responder não significa resolver o problema. Reclamação aparece apenas quando o autor declara esse tipo.</p>
    {!posts.length && <p role="status">Nenhum recado com estes filtros.</p>}
    <ol className="board">{posts.map(p => <li key={p.id}><BoardMessage post={p} lab={lab} from={who(p.from)} to={who(p.to)} records={raw} /></li>)}</ol>
    {filtered.length > 8 && <button type="button" className="board-all" onClick={() => setAll(x => !x)}>{all ? 'Mostrar só os 8 mais recentes' : `Ver todos os ${filtered.length} recados`}</button>}
  </Section>;
}

// ---------- Quem trabalha: as tarefas e o último sinal de vida de cada uma ----------
function Crew({ lab, state }: { lab: Lab; state: SystemState }) {
  const now = Date.now();
  return <section className="crew" aria-label="Quem trabalha">
    {TASKS.map(t => {
      const mine = observedActivity(lab.activity, now).filter(e => t.hats.includes(String(e.role).toUpperCase()));
      const last = mine.at(-1);
      const day = activityWindow(mine, 24, now).count;
      const quiet = !last || !isPublishedFresh(last.at, 3 * 3600e3, now);
      const delivery = latestDelivery(lab, t.hats);
      const board = state.evolution?.board ?? [];
      const request = boardThreads(board, now).reverse().find(p => t.hats.includes(p.to) && boardConversation(p, board, now).awaiting);
      const action = request ? boardMeta(request, now).nextAction : null;
      const sharedRole = TASKS.some(other => other.id !== t.id && other.hats.some(h => t.hats.includes(h)));
      return <article key={t.id} className={`crew-card${quiet ? ' quiet' : ''}`}>
        <p className="crew-top"><b>{t.name}</b><span>{t.rhythm}</span></p>
        <p className="crew-hats">{[...new Set(t.hats.map(h => ROLE_PT[h] ?? h))].join(' + ')}</p>
        <p className="crew-does">{t.does}</p>
        <div className="crew-continuity"><p><b>Última entrega do papel</b>{delivery ? <>{eventLabel(delivery)} · {ago(delivery.at)}{delivery.entity_id && lab.tests.has(delivery.entity_id) && <> · <E id={delivery.entity_id} /></>}</> : 'Não publicada no histórico recebido'}</p><p><b>Pedido original · mural</b>{request ? <>{roleLabel(request.from)}: {clip(request.text, 170)}<a href="#/agora"> Ver mural →</a></> : 'Nenhum pedido aberto direcionado neste snapshot'}</p><p><b>Próxima ação declarada</b>{action ?? 'Não publicada'}</p></div>
        <p className="crew-pulse"><i aria-hidden="true" />{last ? `último sinal do papel ${ago(last.at)} · ${day} eventos deste papel em até 24 h${sharedRole ? ' · compartilhado entre operadores' : ''} · recorte parcial` : 'Nenhum evento deste papel no recorte recebido; cobertura parcial'}</p>
      </article>;
    })}
  </section>;
}

// ---------- Telemetria publicada (desktop largo): recados entre agentes + ações, em ordem de tempo ----------
function Telemetry({ lab, state }: { lab: Lab; state: SystemState }) {
  const now = Date.now();
  const board = state.evolution?.board ?? [];
  const notes = boardThreads(board, now).filter(p => boardConversation(p, board, now).awaiting)
    .map(p => ({ kind: 'note' as const, at: p.at, who: roleLabel(p.from), to: p.to === p.from ? '' : p.to === 'ALL' ? 'todos' : roleLabel(p.to),
      self: p.to === p.from, text: p.text, id: p.id }));
  // Ações iguais e seguidas do mesmo papel (ex.: 46 nomes preenchidos) viram uma linha só.
  const GROUP_PT: Record<string, (n: number) => string> = {
    SEMANTIC_BACKFILLED: n => `Dei nome e leitura simples a ${n} testes.`,
    TEST_ENRICHED: n => `Completei a ficha de ${n} testes antigos.`,
    LEARNING_SIGNAL_RECORDED: n => `Anotei ${n} lacunas para resolver (receitas ou dados que faltam).`,
    TEST_DISPATCHED: n => `Mandei ${n} testes para a bateria.`,
    ROADMAP_TEST_FROZEN: n => `Congelei as regras de ${n} testes antes de olhar os dados.`,
    INTEGRITY_REPORT_RECORDED: n => `Registrei ${n} auditorias no recorte publicado.`,
    NEXO_THOUGHT_NOOP_RECORDED: n => `${n} registros de revisão sem pensamento novo publicado.`,
    TEST_RESULT_RECORDED: n => `Recebi ${n} registros de resultado do mesmo teste.`,
  };
  const WINDOW: Record<string, number> = { INTEGRITY_REPORT_RECORDED: 12 * 3600e3, NEXO_THOUGHT_NOOP_RECORDED: 12 * 3600e3 };
  const raw = observedActivity(lab.activity, now).slice(-160);
  const grouped: Array<{ e: (typeof raw)[number]; n: number }> = [];
  for (const e of raw) {
    const last = grouped.at(-1);
    if (last && last.e.event_type === e.event_type && last.e.role === e.role && GROUP_PT[e.event_type]
        && (e.event_type !== 'TEST_RESULT_RECORDED' || last.e.entity_id === e.entity_id)
        && Math.abs(Date.parse(e.at) - Date.parse(last.e.at)) < (WINDOW[e.event_type] ?? 20 * 60e3)) { last.n += Number((e as { count?: number }).count ?? 1); last.e = e; }
    else grouped.push({ e, n: Number((e as { count?: number }).count ?? 1) });
  }
  const acts = grouped.slice(-60).map(({ e, n }, i) => ({ kind: 'act' as const, at: e.at, who: roleLabel(String(e.role)), to: '',
    text: n > 1 ? (say(`GROUP_${e.event_type}`, e.at, { n }) ?? GROUP_PT[e.event_type]!(n)) : narrate(e, lab, state), id: `${e.at}-${i}` }));
  const feed = [...notes, ...acts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  const day = activityWindow(lab.activity, 24, now).count;
  return <aside className="telemetry" aria-label="Telemetria publicada">
    <header><p><i aria-hidden="true" />Telemetria publicada</p><small>Snapshot {ago(lab.generatedAt)} · {day} eventos de todos os papéis em até 24 h · recorte parcial</small></header>
    <ol className="tele-feed">{feed.map(f => <li key={f.id} className={f.kind === 'note' ? 'tele-note' : undefined}>
      <span className="feed-kind">{f.kind === 'note' ? 'Mural · original' : 'Evento narrado · interface'}</span>
      <p className="tele-h"><b>{f.who}</b>{'self' in f && f.self ? <span>anotou</span> : f.to && <><i aria-hidden="true">→</i><span>{f.to}</span></>}<time>{ago(f.at)}</time></p>
      <p className="tele-t">{f.text}</p>
    </li>)}</ol>
  </aside>;
}

// ---------- Qualidade gráfica escolhida pelo usuário (auto por padrão) ----------
const Q_LABEL: Record<string, string> = { auto: 'Auto', high: 'Alta', medium: 'Média', low: 'Baixa' };
function QualityButton() {
  const [q, setQ] = useState(() => { try { return localStorage.getItem('nexo.quality') ?? 'auto'; } catch { return 'auto'; } });
  const next = () => {
    const order = ['auto', 'high', 'medium', 'low'];
    const n = order[(order.indexOf(q) + 1) % order.length]!;
    try { if (n === 'auto') localStorage.removeItem('nexo.quality'); else localStorage.setItem('nexo.quality', n); } catch { /* sem armazenamento */ }
    setQ(n); window.location.reload();
  };
  return <button type="button" onClick={next} title="Qualidade gráfica da teia (clique para trocar)" aria-label={`Qualidade gráfica: ${Q_LABEL[q]}`}>
    <Icon n="gear" /><span className="bt">Qualidade: {Q_LABEL[q]}</span></button>;
}

// ---------- Cartão de resultado: seleção editorial, revisão e números publicados ----------
function ResultCard({ t, selectionReason }: { t: TestEntity; selectionReason: string }) {
  const rows = scientificStatRows(t);
  const full = (t.result as { statistics?: { full?: Record<string, number>; subset?: Record<string, number> } } | null)?.statistics;
  const pt = full?.subset ?? full?.full;
  return <section className="hud-section result-card" aria-label="Resultado em foco">
    <h2>Resultado em foco</h2>
    <p className="rc-name"><E id={t.id}>{t.name}</E> <VerdictChip v={t.verdict} small /></p>
    <p className="hud-note"><b>Por que este destaque:</b> {selectionReason}</p>
    <p className="rc-meaning"><b>Veredito atual:</b> {currentVerdictText(t)}</p>
    <p className="hud-note">Revisão publicada: {t.review ?? 'não publicada'} · Resultado bruto: {t.verdictRaw ?? 'não publicado'}</p>
    {t.meaning && <p className="hud-note"><b>Interpretação registrada na execução:</b> {humanize(t.meaning)}</p>}
    {hasPublishedValue(t.claimBoundary) && <p className="boundary"><b>Limite publicado da conclusão:</b> {text(t.claimBoundary)}</p>}
    {hasPublishedValue(t.limitations) && <p className="hud-note"><b>Limitações publicadas:</b> {text(t.limitations)}</p>}
    {rows.length > 0 && <dl className="rc-stats">{rows.map(([label, explanation]) => <div key={label}><dt>{label}</dt><dd>{explanation}</dd></div>)}</dl>}
    {pt && typeof pt.w0 === 'number' && Number.isFinite(pt.w0) && typeof pt.wa === 'number' && Number.isFinite(pt.wa) && <>
      <W0WaPlot w0={pt.w0} wa={pt.wa} />
      <p className="hud-note">Ponto estimado publicado; incerteza e covariância não representadas.</p>
    </>}
    {rows.length === 0 && <p className="hud-muted">Nenhuma estatística resumida disponível neste cartão. Consulte o registro completo.</p>}
    <E id={t.id}>abrir resultado, revisão e evidências →</E>
  </section>;
}
function W0WaPlot({ w0, wa }: { w0: number; wa: number }) {
  const X = (v: number) => 20 + (v + 1.6) / 1.4 * 240, Y = (v: number) => 110 - (v + 2.5) / 3.5 * 100;
  return <svg className="rc-plane" viewBox="0 0 280 124" aria-label={`w0 ${w0.toFixed(2)}, wa ${wa.toFixed(2)}`}>
    <line x1="20" x2="260" y1={Y(0)} y2={Y(0)} className="g-axis" /><line x1={X(-1)} x2={X(-1)} y1="10" y2="110" className="g-axis" />
    <text x="262" y={Y(0) + 4} className="g-lab">wa=0</text><text x={X(-1) + 4} y="18" className="g-lab">w0=−1</text>
    <circle cx={X(-1)} cy={Y(0)} r="3.5" className="g-lcdm" /><text x={X(-1) + 6} y={Y(0) - 6} className="g-lab">ΛCDM</text>
    <circle cx={X(w0)} cy={Y(wa)} r="3" className="g-dot" />
  </svg>;
}

// ---------- Frentes da cosmologia: estado da literatura x o que o NEXO testou ----------
// O agrupamento segue a taxonomia canônica projetada pela Tower. IDs/nomes de teste nunca decidem a frente.
const isSubdomain = (t: TestEntity, id: string, label: string) =>
  t.subdomainId ? t.subdomainId === id : t.subdomain === label;
const isTopic = (t: TestEntity, id: string, label: string) =>
  t.topicId ? t.topicId === id : t.topic === label;

const LSS_STRUCTURE_TOPICS = new Set([
  'science.cosmology.lss_growth.galaxy_distribution',
  'science.cosmology.lss_growth.megastructures',
]);
function Frontiers({ state }: { state: SystemState }) {
  const cosmology = state.cosmology_state;
  if (!cosmology?.frontiers.length) return <Section title="Frentes da cosmologia" id="now-fronts"><p className="hud-muted">Síntese versionada não publicada nesta leitura.</p></Section>;
  return <Section title="Frentes da cosmologia" kicker="Síntese publicada pela Tower" id="now-fronts">
    <p className="hud-note">Modelo {cosmology.model}. A data da literatura é a declarada na fonte; a atualização da projeção não representa uma nova revisão bibliográfica.</p>
    <ul className="fronts">{cosmology.frontiers.map(frontier => {
      const source = frontier.literature_source ?? cosmology.literature_source;
      const counts = frontier.evidence_counts;
      return <li key={frontier.id}>
        <p className="fr-top"><a href={labHref('universo', frontier.id)}><b>{frontier.title}</b></a><span className={`fr-grade g-${frontier.state === 'SOLID' ? 'solid' : frontier.state === 'TENSION' ? 'tension' : 'open'}`}>{frontier.state_label}</span></p>
        <p className="fr-note">{frontier.short_summary ?? frontier.summary}</p>
        <p className="fr-source">{source ? <><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a> · versão {source.version ?? 'não publicada'} · literatura {source.updated_at ?? 'sem data publicada'}</> : 'Fonte e data da literatura não publicadas'}</p>
        <p className="fr-nexo">Evidência na síntese: {counts.confirmed} confirmados · {counts.refuted} refutados · {counts.review} em revisão · {counts.open} abertos</p>
      </li>;
    })}</ul>
    <a className="elink" href="#/universo">Consultar síntese, literatura e fontes →</a>
  </Section>;
}

// ---------- Números que contam até o valor (uma vez; respeita "reduzir movimento") ----------
function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) { setV(to); return; }
    let raf = 0; const t0 = performance.now(), dur = 900;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span data-counting={v !== to ? 'true' : 'false'}>{v}</span>;
}

// ---------- Abertura (só na primeira visita): a teia se forma, uma frase, e sai ----------
function Intro() {
  const [on, setOn] = useState(() => { try { return !localStorage.getItem('nexo.intro.seen'); } catch { return false; } });
  useEffect(() => {
    if (!on) return;
    try { localStorage.setItem('nexo.intro.seen', '1'); } catch { /* sem armazenamento */ }
    const t = window.setTimeout(() => setOn(false), 3400); return () => window.clearTimeout(t);
  }, [on]);
  if (!on) return null;
  return <div className="intro" role="presentation" onClick={() => setOn(false)}>
    <p className="intro-mark">Λ<i /></p>
    <p className="intro-line">um laboratório que pensa sozinho</p>
    <p className="intro-sub">cada estrela é um teste · cada filamento, uma hipótese</p>
  </div>;
}

// ---------- Laços quietos: ausência de evento científico não é falha da automação ----------
function QuietLoops({ lab, quiet, at }: { lab: Lab; quiet: Array<{ role: string; hours: number | null; loops: string[] }>; at: string }) {
  const loops = new Map<string, { hours: number | null; roles: Set<string> }>();
  for (const q of quiet) for (const l of q.loops) {
    const cur = loops.get(l) ?? { hours: q.hours, roles: new Set<string>() };
    cur.roles.add(q.role.toUpperCase()); loops.set(l, cur);
  }
  const lastOf = (role: string) => { const t = taskOf(role); const hats = t?.hats ?? [role];
    return observedActivity(lab.activity).filter(e => hats.includes(String(e.role).toUpperCase())).at(-1)?.at; };
  const dur = (h: number | null) => h == null ? 'sem evento registrado' : `sem evento há ${h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`}`;
  return <Section title="Laços quietos" kicker={`vigia do robô · ${ago(at)}`} id="he-quiet">
    <ul className="quiet-list">{[...loops].map(([loop, v]) => { const role = [...v.roles][0]!; const t = taskOf(role); const last = lastOf(role);
      return <li key={loop}>
        <b>{(LOOP_PT[loop] ?? loop).replace(/^./, c => c.toUpperCase())}</b>
        <span>{dur(v.hours)}</span>
        <em>responsável: {t ? t.name : roleLabel(role)}{last ? ` · último evento do papel ${ago(last)}` : ' · sem evento do papel'}</em>
      </li>; })}</ul>
    <p className="hud-note">Quietude mede ausência de evento científico no laço; não indica que a automação parou.</p>
  </Section>;
}

// ---------- Semântica: corte em palavra inteira e jargão traduzido ----------
function clip(text: string, n: number) {
  const t = text.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n).replace(/\s+\S*$/, '');
  return cut.replace(/[,;:.\s]+$/, '') + '…';
}
const JARGON: Array<[RegExp, string]> = [
  [/numbers sem statistics/g, 'números sem o bloco de estatísticas'], [/statistics/g, 'estatísticas'], [/artifact/g, 'artefato'],
  [/campaign_objective/g, 'objetivo da campanha'], [/created_at/g, 'data de criação'], [/event_id/g, 'identificador do evento'],
  [/schema/g, 'formato'], [/runtime/g, 'motor de execução'], [/preflight/gi, 'checagem prévia'], [/checkpoints?/g, 'pontos salvos'],
  [/staging/g, 'área de preparo'], [/stageada/g, 'preparada'], [/read-back/g, 'releitura'], [/PROMOTED/g, 'promovidos'],
  [/SEMANTIC_BACKFILL[^.;)]*/g, 'ficha dos testes'], [/hypothesis_id/g, 'hipótese'], [/display_name/g, 'nome'], [/topic_id/g, 'tópico'],
  [/question\/null\/rival/g, 'pergunta, nula e rival'], [/result_meaning\/verdict_plain\/confidence_plain/g, 'leitura do resultado'],
  [/HYPOTHESIS/g, 'hipótese'], [/ENGINEERING/g, 'Engenharia'], [/SCIENCE/g, 'Ciência'], [/runtime_revision/g, 'versão do motor'],
  [/\bTEST_BATTERY\b/g, 'baterias de teste'], [/\bREADY\b/g, 'prontos'], [/\bCONFIRMED\b/g, 'confirmados'], [/\bREFUTED\b/g, 'refutados'],
  [/\bBLOCKED_INPUT\b/g, 'bloqueados por falta de dado'], [/\bscript inline\b/gi, 'código solto'], [/\bnão-Olympus\b/g, 'fora do Olympus'],
  [/\bRECIPE_REQUEST\b/g, 'pedido de receita'], [/\bstale\b/gi, 'desatualizada'], [/\bbootstraps?\b/gi, 'arranques'],
  [/\bread-back\b/gi, 'conferência'], [/\bstaging\b/gi, 'área de espera'], [/\bfull-shape\b/gi, 'completa'],
];
function humanize(text: string) { return JARGON.reduce((acc, [re, to]) => acc.replace(re, to), text); }
