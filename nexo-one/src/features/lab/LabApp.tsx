// NEXO Observatório: páginas em HUD sobre a teia cósmica.
// Rotas: #/agora #/ciclo #/roadmaps #/roadmap/<id> #/evidencia[?v=] #/e/<id> #/saude
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SystemState } from '../../contracts/system.ts';
import {
  ago, buildLab, guardianArea, humanId, readBaseline, VERDICT_GLYPH, VERDICT_ORDER, VERDICT_PT,
  type Lab, type TestEntity, type Verdict,
} from './model.ts';
import type { ScenePage, SceneEvents } from './ObservatoryScene.tsx';
import { normDomain } from './domains.ts';
import './lab.css';

const ObservatoryScene = lazy(() => import('./ObservatoryScene.tsx').then(m => ({ default: m.ObservatoryScene })));

import { labHref, type LabRoute } from './routes.ts';
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
  const lab = useMemo(() => buildLab(state), [state]);
  nameOf = (id: string) => lab.tests.get(id)?.name ?? lab.hypotheses.get(id)?.statement ?? lab.roadmaps.get(id)?.title ?? humanId(id);
  const tests = useMemo(() => [...lab.tests.values()].filter(t => !t.contestOf), [lab]);
  const [focus, setFocus] = useState<string[]>([]);
  const [explore, setExplore] = useState(false);
  // "Só a página": sem a teia atrás (mais leve no celular e mais legível); lembrado neste aparelho.
  const [flat, setFlat] = useState(() => { try { return localStorage.getItem('nexo.flat') === '1'; } catch { return false; } });
  const toggleFlat = () => setFlat(x => { const n = !x; try { localStorage.setItem('nexo.flat', n ? '1' : '0'); } catch { /* sem armazenamento */ } if (n) setExplore(false); return n; });
  useEffect(() => { setExplore(false); }, [route.page, route.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExplore(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, []);
  const events = useMemo<SceneEvents>(() => sceneEvents(state, lab), [state, lab]);
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
  const hot = useMemo(() => [...new Set(lab.activity.filter(e => e.entity_id && Date.now() - Date.parse(e.at) < 2 * 3600e3)
    .map(e => starOf(lab, e.entity_id!)).filter(Boolean) as string[])], [lab]);
  // Replay: a câmera percorre as últimas 24 h de eventos reais, na ordem em que aconteceram.
  const [replay, setReplay] = useState<number | null>(null);
  const reel = useMemo(() => lab.activity.filter(e => Date.now() - Date.parse(e.at) < 24 * 3600e3), [lab]);
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
    if (route.page === 'entidade' && route.id) setFocus([route.id]);
    else if (route.page === 'roadmap' && route.id) setFocus(lab.roadmaps.get(route.id)?.tests ?? []);
    else if (route.page === 'evidencia' && route.q) setFocus(tests.filter(t => t.verdict === route.q).map(t => t.id));
    else setFocus([]);
    window.scrollTo({ top: 0 });
  }, [route.page, route.id, route.q, lab, tests]);

  const page = (() => {
    switch (route.page) {
      case 'ciclo': return <Cycle lab={lab} state={state} />;
      case 'roadmaps': return <Roadmaps lab={lab} />;
      case 'roadmap': return <RoadmapPage lab={lab} id={route.id!} />;
      case 'evidencia': return <Evidence lab={lab} filter={route.q as Verdict | undefined} />;
      case 'entidade': return <EntityPage lab={lab} id={route.id!} />;
      case 'saude': return <Health state={state} lab={lab} />;
      default: return <Now lab={lab} state={state} onReplay={() => { setExplore(false); setReplay(0); }} replayCount={reel.length} />;
    }
  })();

  const cur = replay !== null ? reel[replay] : null;
  return <div className={`observatory${explore || replay !== null ? ' exploring' : ''}${flat ? ' flat' : ''}`} data-page={route.page}>
    <Intro />
    {cur && <div className="replay-caption" role="status" aria-live="polite">
      <span className="replay-clock">{new Date(cur.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <p><b>{ROLE_PT[cur.role.toUpperCase()] ?? cur.role}</b> {narrate(cur, lab)}</p>
      <span className="replay-bar"><i style={{ width: `${((replay! + 1) / reel.length) * 100}%` }} /></span>
      <button type="button" onClick={() => { setReplay(null); setFocus([]); }}>✕ parar</button>
    </div>}

    <div className="obs-tools">
  {!flat && <button type="button" className="explore-toggle" aria-pressed={explore} onClick={() => setExplore(x => !x)}>
      {explore ? <><i aria-hidden="true">✕</i><span className="bt">Voltar ao painel</span></> : <><i aria-hidden="true">⤢</i><span className="bt">Explorar a teia</span></>}</button>}
      <button type="button" aria-pressed={flat} onClick={toggleFlat} title={flat ? 'Mostrar a teia atrás do painel' : 'Mostrar só a página, sem a teia'} aria-label={flat ? 'Mostrar a teia' : 'Mostrar só a página'}>
        <Icon n="page" /><span className="bt">{flat ? 'Com a teia' : 'Só a página'}</span></button>
      <button type="button" onClick={() => setSearching(true)} title="Procurar (Ctrl K)" aria-label="Procurar"><Icon n="target" /><span className="bt">Procurar</span></button>
      {!flat && <button type="button" onClick={() => window.dispatchEvent(new Event('nexo:replay-formation'))} title="Volta a teia ao quase-uniforme e mostra, em ~3 minutos, os nós aglomerando e os vazios se expandindo" aria-label="Rever a formação da teia">
        <Icon n="replay" /><span className="bt">Rever formação</span></button>}
      {!flat && <QualityButton />}
      <button type="button" aria-pressed={sound} onClick={() => setSound(x => !x)} title="Som ambiente" aria-label="Som ambiente"><Icon n={sound ? 'sound' : 'mute'} /><span className="bt">{sound ? 'Som ligado' : 'Som'}</span></button>
    </div>
    {searching && <Search lab={lab} onClose={() => setSearching(false)} />}
    {explore && <p className="explore-hint" role="status">Arraste para girar · roda ou pinça para zoom · botão direito, Shift ou 2 dedos para mover · duplo clique recentra · Esc sai</p>}
    {!flat && <Suspense fallback={<div className="obs-scene obs-scene--loading" />}>
      <ObservatoryScene explore={explore || replay !== null} hot={hot} tests={tests} events={events} page={route.page} focusIds={focus} theme={theme}
        onPick={id => { window.location.hash = labHref('entidade', id); }} />
    </Suspense>}
    <div className="hud" key={`${route.page}:${route.id ?? ''}`}>{page}<Acoustic /></div>
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
/** Números científicos publicados de um teste (Δχ², p, σ, ΔBIC, ln B, w0, wa…), ignorando campos ausentes. */
function numbersOf(t: TestEntity): Record<string, number> {
  const out: Record<string, number> = {};
  const scan = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number') ? (v as { value: number }).value : null;
      if (n !== null && Number.isFinite(n)) out[k] = n;
    }
  };
  scan(t.statistics); scan((t.result as { statistics?: unknown } | null)?.statistics); scan(t.result);
  return out;
}
const hasNumbers = (t: TestEntity) => Object.keys(numbersOf(t)).some(k => /chi2|p_value|sigma|bic|bayes|w0|wa|shift/.test(k));

// ---------- Agora ----------
function Now({ lab, state, onReplay, replayCount }: { lab: Lab; state: SystemState; onReplay: () => void; replayCount: number }) {
  const ev = state.evolution;
  const g = state.guardian;
  const age = Math.round((Date.now() - Date.parse(state.generated_at)) / 60000);
  const stale = age > 45;
  const current = { ...lab.counts, confirmed: lab.reviews.CONFIRMED ?? 0, refuted: lab.reviews.REFUTED ?? 0 } as Record<string, number>;
  const [base] = useState(() => readBaseline(current));
  const d = (k: string) => (base ? (current[k] ?? 0) - (base.counts[k] ?? 0) : null);
  const gate = (ev?.gate.charters_waiting.length ?? 0) + (ev?.gate.canaries_waiting.length ?? 0);
  const thought = ev?.thoughts?.at(-1);
  const review = (lab.reviews.PENDING_REVIEW ?? 0) + (lab.reviews.CONTESTED ?? 0) + (lab.reviews.REFEREE1_PASSED ?? 0);
  const resolved = (lab.reviews.CONFIRMED ?? 0) + (lab.reviews.REFUTED ?? 0);
  const blocked = [...lab.tests.values()].filter(t => t.verdict === 'BLOCKED');
  const discovery = [...lab.tests.values()].find(t => t.verdict === 'CONFIRMED') ?? [...lab.tests.values()].find(t => t.meaning && t.verdict === 'PROVISIONAL');
  const next = [...lab.tests.values()].filter(t => isReady(t) && t.question).slice(0, 3);
  // Gravidade real: vermelho só quando algo trava o ciclo; o resto é atenção.
  const CRITICAL = ['writer', 'tower_integrity', 'relay', 'inbox', 'batteries', 'executor'];
  const blocking = (g?.failing_areas ?? []).filter(a => CRITICAL.includes(a));
  const health = !g ? 'unknown' : g.status === 'GREEN' ? 'ok' : blocking.length ? 'crit' : 'warn';

  const all = [...lab.tests.values()].filter(t => !t.contestOf);
  const sci = all.filter(isScience), self = all.filter(isSelf);
  const S = tally(sci), E2 = tally(self);
  const byTime = (a: TestEntity, b: TestEntity) => String(b.executedAt ?? b.createdAt ?? '').localeCompare(String(a.executedAt ?? a.createdAt ?? ''));
  const latest = sci.filter(t => t.meaning && t.verdict !== 'READY' && t.verdict !== 'BLOCKED').sort(byTime)[0];
  const focus = sci.filter(hasNumbers).sort(byTime)[0] ?? latest;
  const warnings = g?.failing_areas.length ?? 0;
  void d; void review; void resolved; void discovery;
  return <>
    <header className="hud-hero">
      <p className={`hud-status s-${stale ? 'warn' : health}`}>
        <i aria-hidden="true" />
        {{ ok: 'Operando', warn: 'Operando com atenção', crit: 'Com falhas: o ciclo está travado', unknown: 'Saúde desconhecida' }[health]}
        <span> · dados {ago(state.generated_at)}{stale ? ' — atrasados' : ''}</span>
        {warnings > 0 && <a className="ops-link" href="#/saude">{warnings} {warnings === 1 ? 'aviso' : 'avisos'} de operação →</a>}
      </p>
      <span className="sig-prompt" aria-hidden="true"><b>nexo@atlas</b>:<i>~</i>$ observe --agora</span>
      <h1>O NEXO <em>agora</em></h1>
      {latest
        ? <p className="thesis">Último achado científico: <E id={latest.id}>{latest.name}</E>. <span>{humanize(latest.meaning ?? "")}</span></p>
        : <p className="thesis">Ainda sem achado científico publicado; {S.ready} testes esperam para rodar.</p>}
    </header>

    <GatePanel state={state} />
    {gate > 0 && !state.inbox?.some(i => i.kind === 'APROVAR') && <a className="hud-gate" href="#/ciclo">
      <strong>{gate}</strong><span>{gate === 1 ? 'decisão espera por você' : 'decisões esperam por você'}</span><em>abrir o portão →</em>
    </a>}

    {base && <AwaySummary lab={lab} since={base.at} />}

    <Section title="Ciência" kicker={`${S.total} testes de cosmologia e física`} id="now-sci">
      <div className="stats">
        <Stat n={S.confirmed} label="confirmados" tone="ok" />
        <Stat n={S.refuted} label="refutados" tone="crit" />
        <Stat n={S.review} label="em revisão" tone="warn" />
        <Stat n={S.ready} label="na fila" tone="mute" />
      </div>
      <p className="hud-note self-line">Autoengenharia (o NEXO estudando a si mesmo): <b>{E2.confirmed}</b> confirmados · <b>{E2.refuted}</b> refutados · <b>{E2.review}</b> em revisão.</p>
    </Section>

    {focus && <ResultCard t={focus} />}

    <Frontiers lab={lab} />

    {thought && <Section title={Date.now() - Date.parse(thought.at) > 6 * 3600e3 ? 'Último pensamento registrado' : 'O que o NEXO está pensando'} kicker={`Pítia · ${ago(thought.at)}${Date.now() - Date.parse(thought.at) > 6 * 3600e3 ? ' · Pítia quieta desde então' : ''}`} id="now-thought">
      <blockquote className="hud-thought">{thought.text}</blockquote>
      {thought.refs.some(r => lab.tests.has(r) || lab.hypotheses.has(r)) &&
        <p className="hud-refs">{thought.refs.filter(r => lab.tests.has(r) || lab.hypotheses.has(r)).slice(0, 3).map(r => <E key={r} id={r} />)}</p>}
    </Section>}

    <Monologue lab={lab} state={state} onReplay={onReplay} replayCount={replayCount} />
    <Board state={state} lab={lab} />
    <Calibration lab={lab} />

    <div className="hud-pair">
      <Section title="Problema principal" kicker={blocked.length ? `${blocked.length} testes parados` : 'Nenhum bloqueio'} id="now-problem">
        {blocked.length
          ? <><p className="hud-big">{blocked[0]!.blocker ?? blocked[0]!.summary ?? 'Motivo não publicado'}</p><E id={blocked[0]!.id}>investigar →</E></>
          : <p className="hud-muted">Nada impedindo a fila agora.</p>}
      </Section>
      <Section title="Próximo movimento" kicker="Fila do Operador" id="now-next">
        {next.length ? <ol className="hud-list">{next.map(t => <li key={t.id}><E id={t.id}>{t.name}</E></li>)}</ol>
          : <p className="hud-muted">Fila vazia: o Cientista precisa gerar hipóteses.</p>}
      </Section>
    </div>
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
  const evs = lab.activity.filter(e => e.at > since);
  if (!evs.length) return null;
  // Soma a contagem dos itens agrupados; "resultado" é só resultado novo de teste (falha de execução não conta).
  const n = (re: RegExp) => evs.filter(e => re.test(e.event_type)).reduce((k, e) => k + Number((e as { count?: number }).count ?? 1), 0);
  const results = n(/^TEST_RESULT_RECORDED$/), created = n(/CREATED|PROPOSED|ENQUEUED/), verdicts = n(/VERDICT|REVIEW|CONFIRMED|REFUTED/), thoughts = n(/THOUGHT_RECORDED/);
  const parts = [
    results && `${results} ${results === 1 ? 'resultado chegou' : 'resultados chegaram'}`,
    created && `${created} ${created === 1 ? 'teste novo nasceu' : 'testes novos nasceram'}`,
    verdicts && `${verdicts} ${verdicts === 1 ? 'julgamento' : 'julgamentos'}`,
    thoughts && `${thoughts} ${thoughts === 1 ? 'pensamento' : 'pensamentos'}`,
  ].filter(Boolean) as string[];
  return <p className="away">
    <b>Enquanto você esteve fora</b> ({ago(since)}): {parts.length ? parts.join(', ') : `${evs.length} movimentos`}.
  </p>;
}

// ---------- Busca (Ctrl/⌘ K) ----------
function Search({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => [
    ...[...lab.tests.values()].map(t => ({ id: t.id, label: t.name, sub: t.question ?? '', kind: 'teste', href: labHref('entidade', t.id) })),
    ...[...lab.hypotheses.values()].map(h => ({ id: h.id, label: h.statement ?? humanId(h.id), sub: '', kind: 'hipótese', href: labHref('entidade', h.id) })),
    ...[...lab.roadmaps.values()].map(r => ({ id: r.id, label: r.title ?? humanId(r.id), sub: '', kind: 'investigação', href: labHref('roadmap', r.id) })),
  ], [lab]);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hits = q.trim().length < 2 ? [] : all.filter(x => norm(`${x.label} ${x.sub}`).includes(norm(q.trim()))).slice(0, 12);
  return <div className="search-veil" role="dialog" aria-label="Procurar" onClick={onClose}>
    <div className="search-box" onClick={e => e.stopPropagation()}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar teste, hipótese ou investigação…"
        onKeyDown={e => { if (e.key === 'Enter' && hits[0]) { window.location.hash = hits[0].href; onClose(); } }} />
      <ul>{hits.map(h => <li key={h.kind + h.id}><a href={h.href} onClick={onClose}><em>{h.kind}</em>{h.label}</a></li>)}</ul>
      {q.trim().length >= 2 && !hits.length && <p className="hud-muted">Nada com esse nome.</p>}
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
      <li><i className="lg lg-agn" />jato: testes rodando agora</li>
      <li><i className="lg lg-grb" />clarão: acabou de nascer um pensamento</li>
      <li><i className="lg lg-cloud" />nuvem: muitos testes prontos para rodar</li>
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
    </header>

    <Crew lab={lab} />

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
      <span className="rm-meta"><b>{r.confirmed}</b>/{r.target ?? '?'} confirmados · {r.used}/{r.maxTests ?? '?'} testes{r.stop ? ` · parado: ${r.stop}` : ''}</span>
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
  const nextUp = (r.frontierIds?.length ? r.frontierIds.map(id => lab.tests.get(id)!).filter(Boolean) : tests.filter(isReady)).slice(0, 6);
  const blocked = tests.filter(t => t.verdict === 'BLOCKED');
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/roadmaps">Roadmaps</a> · {r.state === 'ACTIVE' ? 'ativo' : r.state.toLowerCase()}{r.renewable ? ' · campanha permanente' : ''}</p>
      <h1>{r.title}</h1>
      {r.question && <p className="hud-lead">{r.question}</p>}
      {r.objectives?.length ? <ul className="crit objectives">{r.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null}
    </header>
    <Trail tests={tests} frontier={nextUp.map(t => t.id)} target={r.target} />
    <div className="stop-rules">
      <div><span>Meta</span><strong>{r.confirmed}/{r.target ?? '?'}</strong><i style={{ width: `${pct(r.confirmed, r.target)}%` }} className="ok" /><em>confirmações para encerrar com sucesso</em></div>
      <div><span>Refutações seguidas</span><strong>{r.refutedStreak}/{r.killStreak ?? '?'}</strong><i style={{ width: `${pct(r.refutedStreak, r.killStreak)}%` }} className="crit" /><em>encerra por refutação</em></div>
      <div><span>Orçamento</span><strong>{r.used}/{r.maxTests ?? '?'}</strong><i style={{ width: `${pct(r.used, r.maxTests)}%` }} className="warn" /><em>testes usados{r.maxDays ? ` · ${r.maxDays} dias` : ''}</em></div>
    </div>
    <Section title="Árvore de hipóteses" kicker={`${hyps.size} hipóteses · ${tests.length} testes`} id="rm-tree">
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
      <Section title="Próximos testes" kicker={`${r.frontier} na fronteira`} id="rm-next">
        {nextUp.length ? <ul className="hud-list">{nextUp.map(t => <li key={t.id}><E id={t.id}>{t.name}</E></li>)}</ul> : <p className="hud-muted">Sem testes prontos.</p>}
        {blocked.length > 0 && <p className="hud-note">{blocked.length} bloqueados: <E id={blocked[0]!.id}>{blocked[0]!.blocker ?? 'ver motivo'}</E></p>}
      </Section>
    </div>
  </>;
}

// ---------- Evidência ----------
function Evidence({ lab, filter }: { lab: Lab; filter?: Verdict }) {
  const [q, setQ] = useState('');
  const all = [...lab.tests.values()].filter(t => !t.contestOf);
  const list = all.filter(t => (!filter || t.verdict === filter) && (!q || `${t.name} ${t.question ?? ''} ${t.meaning ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return <>
    <header className="hud-hero"><p className="hud-kicker">{all.length} testes publicados</p><h1>Evidência</h1>
      <p className="hud-lead">Todo teste, do pré-registro ao veredito. Filtre pelo estado; clique para ver o que foi prometido antes e o que aconteceu.</p></header>
    <nav className="filters" aria-label="Filtrar por veredito">
      <a href="#/evidencia" aria-current={!filter ? 'page' : undefined}>Todos <b>{all.length}</b></a>
      {VERDICT_ORDER.map(v => <a key={v} href={`#/evidencia?v=${v}`} aria-current={filter === v ? 'page' : undefined} className={`v-${v.toLowerCase()}`}>
        <i aria-hidden="true">{VERDICT_GLYPH[v]}</i>{VERDICT_PT[v]} <b>{all.filter(t => t.verdict === v).length}</b></a>)}
    </nav>
    <input className="hud-search" type="search" placeholder="Buscar por nome, pergunta ou resultado…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar testes" />
    {VERDICT_ORDER.filter(v => list.some(t => t.verdict === v)).map(v => {
      const group = list.filter(t => t.verdict === v);
      return <section key={v} className={`ev-group v-${v.toLowerCase()}`} aria-label={VERDICT_PT[v]}>
        <h2><VerdictChip v={v} small /> <span>{group.length}</span></h2>
        <ul className="ev-cards">{group.slice(0, filter ? 200 : 24).map(t => <li key={t.id}>
          <a className="ev-card" href={labHref('entidade', t.id)}>
            <strong>{t.name}</strong>
            {t.question && t.question !== t.name && <span className="ev-q">{t.question}</span>}
            {t.meaning && <span className="ev-m">{humanize(t.meaning)}</span>}
            <span className="ev-meta"><em>{normDomain(t.domain)}</em>{t.contests.length > 0 && <em>{t.contests.length} {t.contests.length === 1 ? 'ataque' : 'ataques'}</em>}</span>
          </a></li>)}</ul>
        {!filter && group.length > 24 && <a className="ev-more" href={`#/evidencia?v=${v}`}>ver os {group.length} →</a>}
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

function EntityPage({ lab, id }: { lab: Lab; id: string }) {
  const t = lab.tests.get(id);
  const h = lab.hypotheses.get(id);
  if (!t && h) return <HypothesisView lab={lab} id={id} />;
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
      <h1 className="h1-entity">{t.question ?? humanId(t.id)}</h1>
      <p className="hud-lead"><VerdictChip v={t.verdict} />{t.createdAt && <span className="hud-muted"> · começou {ago(t.createdAt)}</span>}</p>
    </header>

    <Section title="A história deste teste" id="en-story">
      <ol className="story">{story.map((b, i) => <li key={i} className={`beat beat-${b.tone}`}>
        <i aria-hidden="true"><Icon n={b.icon} /></i><p>{b.text}{b.link && <> <E id={b.link.id}>{b.link.label}</E></>}</p>
      </li>)}</ol>
    </Section>

    {(t.meaning || Boolean(t.claimBoundary)) && <Section title="No que acredito agora" id="en-mean">
      {t.meaning && <p className="hud-big">{humanize(t.meaning)}</p>}
      {Boolean(t.claimBoundary) && <p className="boundary"><b>O que isto não prova:</b> {text(t.claimBoundary)}</p>}
    </Section>}

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
  const ev = state.evolution as (SystemState['evolution'] & { batteries?: Record<string, number> }) | undefined;
  const providersDown = state.providers.filter(p => p.state === 'MISSING_PROVIDER' || p.state === 'BLOCKED');
  return <>
    <header className="hud-hero"><p className="hud-kicker">Guardião · {g ? ago(g.checked_at) : 'sem relatório'}</p><h1>Saúde</h1>
      <p className="hud-lead">A infraestrutura só aparece aqui. Se algo abaixo estiver vermelho, os números das outras páginas podem estar atrasados.</p></header>
    <div className="health-grid">
      <div className={`health-cell s-${!g ? 'unknown' : g.status === 'GREEN' ? 'ok' : g.status === 'YELLOW' ? 'warn' : 'crit'}`}>
        <span>Guardião</span><strong>{g ? `${g.checks_total - g.checks_failing}/${g.checks_total}` : '—'}</strong><em>verificações passando</em></div>
      <div className={`health-cell s-${Date.now() - Date.parse(state.generated_at) > 45 * 60e3 ? 'warn' : 'ok'}`}>
        <span>Projeção pública</span><strong>{ago(state.generated_at)}</strong><em>última atualização do site</em></div>
      <div className="health-cell"><span>Baterias</span><strong>{ev?.batteries ? `${ev.batteries.DISPATCHED ?? 0} rodando` : '—'}</strong><em>{ev?.batteries ? `${ev.batteries.DONE ?? 0} concluídas · ${ev.batteries.QUEUED ?? 0} na fila` : ''}</em></div>
      <div className={`health-cell s-${providersDown.length ? 'warn' : 'ok'}`}><span>Provedores</span><strong>{state.providers.length - providersDown.length}/{state.providers.length}</strong><em>disponíveis</em></div>
    </div>
    {(ev?.watchdog?.quiet?.length ?? 0) > 0 && <QuietLoops lab={lab} quiet={ev!.watchdog!.quiet!} at={ev!.watchdog!.checked_at ?? state.generated_at} />}
    {g && g.failing_areas.length > 0 && <Section title="O que está falhando" id="he-fail">
      <ul className="hud-list">{g.failing_areas.map(a => <li key={a}>{guardianArea(a).replace(/^./, c => c.toUpperCase())}</li>)}</ul>
    </Section>}
    {(ev?.incidents?.length ?? 0) > 0 && <Section title="Incidentes" kicker={`${ev!.incidents!.length} abertos`} id="he-inc">
      <ul className="incidents">{ev!.incidents!.map(i => {
        const st = INCIDENT_STATE[i.state.toUpperCase()] ?? { label: i.state.toLowerCase(), tone: 'warn' };
        const links = [...i.public_ids.tests, ...i.public_ids.hypotheses];
        return <li key={i.incident_id} className={`incident s-${st.tone}`}>
          <p className="incident-head"><span className="incident-state">{st.label}</span>
            <span className="hud-muted">visto {i.evidence_count} {i.evidence_count === 1 ? 'vez' : 'vezes'} · quem investiga: {ROLE_PT[i.next_owner.toUpperCase()] ?? i.next_owner}</span></p>
          <p className="incident-text">{humanize((i.summary_plain ?? i.summary_pt ?? 'Problema registrado sem descrição pública.').replace(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}Z/g, (_m: string, y: string, mo: string, d: string, h: string, mi: string) => `${d}/${mo} às ${h}:${mi} UTC`).replace(/Falta duas/g, 'Faltam duas'))}</p>
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
function sceneEvents(state: SystemState, lab: Lab): SceneEvents {
  const ev = state.evolution;
  const quasars = [
    ...(ev?.gate.charters_waiting ?? []).map(c => ({ domain: domainOfId(c.roadmap_id, lab), label: 'Decisão sua', href: '#/ciclo' })),
    ...(ev?.gate.canaries_waiting ?? []).map(c => ({ domain: 'ENGINEERING', label: 'Decisão sua: nova regra', href: '#/ciclo' })),
  ];
  const running = Number((ev as unknown as { batteries?: Record<string, number> })?.batteries?.DISPATCHED ?? 0);
  const perDomain = new Map<string, number>();
  for (const t of lab.tests.values()) {
    if (!isReady(t) || t.contestOf) continue;
    const d = normDomain(t.domain);
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
  }
  const agn = [...perDomain].map(([domain, n]) => ({
    domain, count: n, href: '#/evidencia?v=READY',
    label: `${n} ${n === 1 ? 'teste' : 'testes'} ${running ? 'rodando ou na fila' : 'na fila'}`,
  }));
  const grbs = (ev?.thoughts ?? []).filter(t => Date.now() - Date.parse(t.at) < 2 * 3600e3).slice(-2)
    .map(t => ({ domain: domainOfId(t.refs[0] ?? '', lab), label: 'Pensamento novo', href: '#/ciclo' }));
  return { quasars, agn, grbs };
}

// ---------- raias do ciclo ----------
const LANES: Array<[string, string]> = [['PITIA', 'Pítia'], ['LEARNER', 'Learner'], ['EXECUTOR', 'Executor'], ['REFUTADOR', 'Refutador'], ['GUARDIAO', 'Guardião'], ['DENER', 'Dener']];
const LANE_ALIAS: Record<string, string> = { REFEREE_1: 'REFUTADOR', SENTINEL: 'PITIA' };
const laneKey = (role: string) => LANE_ALIAS[role.toUpperCase()] ?? role.toUpperCase();
const EVENT_PT: Record<string, string> = {
  TEST_RESULT_RECORDED: 'registrou resultado', ROADMAP_TEST_FROZEN: 'congelou um teste (pré-registro)',
  RESULT_CONTESTED: 'contestou um resultado', RESULT_REFEREE1_PASSED: 'aprovou no Referee 1', RESULT_REFUTED: 'refutou um resultado',
  RESULT_CONFIRMED: 'confirmou um resultado', INTEGRITY_REPORT_RECORDED: 'auditou o sistema', HYPOTHESIS_UPSERTED: 'propôs/atualizou hipótese',
  NEXO_THOUGHT_NOOP_RECORDED: 'pensou (sem novidade)', NEXO_THOUGHT_RECORDED: 'pensou', TEST_BATTERY_DISPATCHED: 'despachou bateria',
  ROADMAP_CHARTERED: 'aprovou carta', GENOME_MUTATION_PROPOSED: 'propôs mutação',
};
function Swimlanes({ events }: { events: Array<{ event_type: string; role: string; at: string; entity_id?: string }> }) {
  const now = Date.now(), span = 48 * 3600e3;
  const recent = events.filter(e => now - Date.parse(e.at) <= span);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, rowH = 34, left = 92, H = LANES.length * rowH + 26;
  const x = (at: string) => left + ((Date.parse(at) - (now - span)) / span) * (W - left - 8);
  const lane = (role: string) => Math.max(0, LANES.findIndex(([k]) => k === laneKey(role)));
  const counts = LANES.map(([k]) => recent.filter(e => laneKey(e.role) === k).length);
  const h = hover !== null ? recent[hover] : null;
  return <div className="lanes">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={LANES.map(([, l], i) => `${l}: ${counts[i]} eventos`).join('; ')}>
      {LANES.map(([k, l], i) => <g key={k}>
        <line x1={left} x2={W - 8} y1={i * rowH + rowH / 2} y2={i * rowH + rowH / 2} className="lane-line" />
        <text x={0} y={i * rowH + rowH / 2 + 4} className="lane-label">{l}</text>
        <text x={left - 10} y={i * rowH + rowH / 2 + 4} textAnchor="end" className="lane-count">{counts[i]}</text>
      </g>)}
      {[0, 12, 24, 36, 48].map(hh => <text key={hh} x={left + ((48 - hh) / 48) * (W - left - 8)} y={H - 4} textAnchor="middle" className="lane-tick">{hh ? `-${hh}h` : 'agora'}</text>)}
      {recent.map((e, i) => <circle key={i} cx={x(e.at)} cy={lane(e.role) * rowH + rowH / 2} r={hover === i ? 7 : 4.5}
        className={`lane-dot r-${e.role.toLowerCase()}`} tabIndex={0}
        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)}
        onClick={() => { if (e.entity_id) window.location.hash = labHref('entidade', e.entity_id); }} />)}
    </svg>
    <p className="lane-caption" aria-live="polite">{h
      ? <>{LANES[lane(h.role)]![1]} {EVENT_PT[h.event_type] ?? h.event_type.toLowerCase().replace(/_/g, ' ')} · {ago(h.at)}{h.entity_id && <> · <E id={h.entity_id} /></>}</>
      : `${recent.length} eventos em 48 h. Passe o dedo ou o mouse num ponto; clique para abrir a entidade.`}</p>
  </div>;
}

// ---------- "vivo": monólogo, calibração, replay ----------
const ROLE_PT: Record<string, string> = {
  PITIA: 'Pítia', LEARNER: 'Learner', EXECUTOR: 'Executor', REFUTADOR: 'Refutador', REFEREE_1: 'Refutador', GUARDIAO: 'Guardião',
  DENER: 'Dener', CONVERSA: 'Conversa', WRITER_ROBOT: 'Robô escritor', SENTINEL: 'Pítia', ENGINEER: 'Engenheiro', CLAUDE: 'Claude', CHATGPT_CONVERSATION: 'Conversa',
};
/** Três tarefas agendadas vestem os seis papéis; o papel continua sendo quem assina cada ação. */
const TASKS: Array<{ id: string; name: string; hats: string[]; rhythm: string; does: string }> = [
  { id: 'cientista', name: 'Cientista', hats: ['LEARNER', 'PITIA', 'SENTINEL'], rhythm: 'toda hora · :05', does: 'propõe hipóteses, nomeia testes, pensa e vigia a literatura' },
  { id: 'operador', name: 'Operador', hats: ['EXECUTOR'], rhythm: 'toda hora · :20', does: 'monta as baterias, pede e escreve receitas, liga dados' },
  { id: 'engenheiro', name: 'Engenheiro', hats: ['ENGINEER'], rhythm: 'a cada 2 horas · :50', does: 'escreve e conserta receitas, vigia o robô e a bateria' },
  { id: 'critico', name: 'Crítico', hats: ['REFUTADOR', 'REFEREE_1', 'GUARDIAO'], rhythm: 'toda hora · :35', does: 'ataca resultados, julga, audita a saúde e escreve o bom-dia' },
];
const taskOf = (role: string) => TASKS.find(t => t.hats.includes(role.toUpperCase()));
const roleLabel = (role: string) => { const t = taskOf(role); const r = ROLE_PT[role.toUpperCase()] ?? role; return t ? `${t.name} · ${r}` : r; };
const NARRATION: Record<string, string> = {
  SEMANTIC_BACKFILLED: 'Dei nome e leitura simples a %q',
  TEST_ENRICHED: 'Completei a ficha de %q',
  LEARNING_SIGNAL_RECORDED: 'Anotei uma lacuna para resolver (receita ou dado que falta).',
  TEST_DISPATCHED: 'Mandei para a bateria de testes: %q',
  TEST_RESULT_RECORDED: 'Terminei um teste: %q',
  ROADMAP_TEST_FROZEN: 'Congelei as regras antes de olhar os dados: %q',
  RESULT_CONTESTED: 'Não confiei no meu próprio resultado e abri um ataque contra ele: %q',
  RESULT_REFEREE1_PASSED: 'O resultado sobreviveu ao primeiro ataque: %q',
  RESULT_REFUTED: 'Derrubei uma conclusão minha: %q',
  RESULT_CONFIRMED: 'Confirmado depois de dois ataques independentes: %q',
  HYPOTHESIS_UPSERTED: 'Tive uma ideia nova para testar: %q',
  INTEGRITY_REPORT_RECORDED: 'Auditei a mim mesmo para ver se nada está corrompido.',
  NEXO_THOUGHT_RECORDED: 'Parei para pensar sobre o que estou vendo.',
  NEXO_THOUGHT_NOOP_RECORDED: 'Olhei tudo de novo e não vi nada que mereça atenção.',
  TEST_BATTERY_DISPATCHED: 'Mandei uma bateria de testes rodar em paralelo.',
  GENOME_MUTATION_PROPOSED: 'Propus mudar uma regra de como eu mesmo funciono.',
  ROADMAP_CHARTERED: 'Recebi uma nova pergunta para investigar.',
};
/** Estrela que representa a entidade na teia (contestações apontam para o resultado atacado). */
function starOf(lab: Lab, id: string): string | null {
  let t = lab.tests.get(id);
  for (let i = 0; t?.contestOf && i < 8; i += 1) t = lab.tests.get(t.contestOf) ?? undefined;
  return t ? t.id : null;
}
function narrate(e: { event_type: string; entity_id?: string }, lab: Lab): string {
  let tpl = NARRATION[e.event_type] ?? `Registrei ${e.event_type.toLowerCase().replace(/_/g, ' ')}: %q`;
  const te = e.entity_id ? lab.tests.get(e.entity_id) : undefined;
  if (te && e.event_type === 'TEST_RESULT_RECORDED') {
    const p = (te.prereg.prediction as { p_promoted?: number } | null)?.p_promoted;
    const o = outcomeOf(te);
    if (typeof p === 'number' && o !== null && Math.abs(p - o) >= 0.5) tpl = o ? 'Me surpreendi: apostei contra e deu certo. %q' : 'Me surpreendi: estava confiante e falhou. %q';
    else if (te.contestOf) tpl = o === 0 ? 'Meu ataque achou um problema no que eu tinha concluído: %q' : 'Ataquei um resultado meu e ele resistiu: %q';
  }
  if (te && e.event_type === 'RESULT_REFUTED' && outcomeOf(te) === 1) tpl = 'Mudei de ideia: parecia certo, mas eu mesmo derrubei. %q';
  const t = e.entity_id ? lab.tests.get(e.entity_id) : undefined;
  // Hipótese: prefira o nome curto de um teste dela ao enunciado inteiro.
  const viaTest = !t && e.entity_id ? [...lab.tests.values()].find(x => x.hypothesisId === e.entity_id)?.name : undefined;
  const q = t?.name ?? viaTest ?? (e.entity_id ? (lab.hypotheses.get(e.entity_id)?.statement ?? humanId(e.entity_id)) : '');
  const text = tpl.includes('%q') ? tpl.replace('%q', q ? `“${clip(q, 110)}”` : '').replace(/: $/, '.') : tpl;
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
  return <>{text.slice(0, n)}{n < text.length && <i className="caret" aria-hidden="true">▍</i>}</>;
}

function Monologue({ lab, state, onReplay, replayCount }: { lab: Lab; state: SystemState; onReplay: () => void; replayCount: number }) {
  const recent = [...lab.activity].reverse().slice(0, 7);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 30000); return () => window.clearInterval(t); }, []);
  if (!recent.length) return null;
  const last = recent[0]!;
  const quiet = Math.round((Date.now() - Date.parse(last.at)) / 60000);
  return <section className="hud-section monologue" aria-labelledby="mono-title">
    <p className="hud-kicker"><i className={`pulse-dot${quiet < 30 ? ' live' : ''}`} aria-hidden="true" />
      {quiet < 30 ? 'Ativo agora' : `Última ação ${ago(last.at)}`} · {lab.activity.filter(e => Date.now() - Date.parse(e.at) < 864e5).length} ações em 24 h</p>
    <h2 id="mono-title">Monólogo interno</h2>
    <p className="mono-now"><b>{ROLE_PT[last.role.toUpperCase()] ?? last.role}</b> <Typewriter text={narrate(last, lab)} /></p>
    <ul className="mono-self">{selfLines(lab, state).map((l, i) => <li key={i}><i aria-hidden="true"><Icon n={l.icon} /></i>{l.link ? <a href={l.link}>{l.text}</a> : l.text}</li>)}</ul>
    <ol className="mono-log">{recent.slice(1).map((e, i) => <li key={i}>
      <time>{ago(e.at)}</time><b>{ROLE_PT[e.role.toUpperCase()] ?? e.role}</b>
      <span>{e.entity_id ? <a href={labHref('entidade', e.entity_id)}>{narrate(e, lab)}</a> : narrate(e, lab)}</span>
    </li>)}</ol>
    {replayCount > 0 && <button type="button" className="replay-btn" onClick={onReplay}>▶ Rever as últimas 24 h ({replayCount} ações)</button>}
  </section>;
}

/** Quanto o NEXO acerta das próprias previsões (congeladas antes de rodar). */
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
    <h2 id="calib-title">Quanto eu acerto</h2>
    <p className="hud-big">Acertei <b>{Math.round(100 * right / pts.length)}%</b> das minhas previsões
      {confident.length >= 3 && <> · quando tive ≥70% de certeza, acertei <b>{Math.round(100 * confHit / confident.length)}%</b></>}.</p>
    {weak && overall - weak.r >= 0.1 && <p className="calib-weak">Sei que sou mais fraco em <b>{weak.a.toLowerCase()}</b>: lá acerto {Math.round(weak.r * 100)}%, contra {Math.round(overall * 100)}% no geral. Vou desconfiar mais de mim nessa área.</p>}
    <div className="calib-chart" role="img" aria-label={bins.map(x => `${x.b * 20}-${x.b * 20 + 20}%: ${x.n ? Math.round(x.rate * 100) + '% passaram' : 'sem dados'}`).join('; ')}>
      {bins.map(x => <span key={x.b} title={`${x.n} testes`}>
        <b style={{ height: `${x.n ? Math.max(4, x.rate * 100) : 0}%` }} /><i style={{ bottom: `${x.b * 20 + 10}%` }} />
        <em>{x.b * 20}–{x.b * 20 + 20}%</em></span>)}
    </div>
    <p className="hud-note">Barra = quantos passaram de verdade; traço = o que eu tinha previsto. Quanto mais perto, mais honesto sou comigo mesmo. Erro médio (Brier): {brier.toFixed(2)}.</p>
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
  const beats: Beat[] = [];
  const parent = t.contestOf ? lab.tests.get(t.contestOf) : undefined;
  const hyp = t.hypothesisId ? lab.hypotheses.get(t.hypothesisId) : undefined;
  const rm = t.roadmapId ? lab.roadmaps.get(t.roadmapId) : undefined;
  if (parent) beats.push({ icon: 'attack', tone: 'doubt', text: 'Este é um ataque meu contra algo que eu mesmo tinha concluído:', link: { id: parent.id, label: parent.name } });
  else if (hyp?.statement) beats.push({ icon: 'idea', tone: 'why', text: `Tive esta ideia: ${hyp.statement}` });
  if (rm && !parent) beats.push({ icon: 'compass', tone: 'why', text: `Faz parte da minha investigação sobre ${rm.title.toLowerCase()}.` });
  const pred = (t.prereg.prediction ?? {}) as { p_promoted?: number };
  const p = typeof pred.p_promoted === 'number' ? Math.min(1, Math.max(0, pred.p_promoted)) : null;
  if (p !== null) beats.push({ icon: 'bet', tone: 'bet', text: `Antes de olhar os dados, apostei ${pct(p)} de chance de dar certo.` });
  if (t.prereg.success.length || t.prereg.kill.length) beats.push({ icon: 'lock', tone: 'bet', text: 'Combinei comigo mesmo, antes de rodar, em que caso eu desistiria da ideia. Não dá para mudar depois.' });
  const o = outcomeOf(t);
  if (isReady(t)) beats.push({ icon: 'wait', tone: 'fact', text: 'Ainda vou rodar este teste.' });
  else if (t.verdict === 'BLOCKED') beats.push({ icon: 'block', tone: 'block', text: `Travei aqui${t.blocker ? `: ${t.blocker}` : ': falta algo para eu conseguir testar.'}` });
  else if (o === 1) beats.push({ icon: 'check', tone: 'fact', text: parent ? 'O resultado atacado resistiu a este ataque.' : 'Deu certo: a ideia passou no critério que eu tinha combinado.' });
  else if (o === 0) beats.push({ icon: 'cross', tone: 'fact', text: parent ? 'Este ataque encontrou um problema no resultado anterior.' : 'Não deu certo: a ideia falhou no critério que eu tinha combinado.' });
  else if (t.verdictRaw) beats.push({ icon: 'even', tone: 'fact', text: 'Os dados não decidiram. Fica no meio do caminho.' });
  if (p !== null && o !== null) {
    const err = Math.abs(p - o);
    if (err >= 0.5) beats.push({ icon: 'spark', tone: 'surprise', text: `Isso me surpreendeu: eu esperava ${o ? 'que falhasse' : 'que desse certo'}.` });
    else if (err <= 0.3) beats.push({ icon: 'target', tone: 'surprise', text: 'Era o que eu esperava.' });
  }
  const axes = [...new Set(t.reviews.map(r => AXIS_PT[String(r.axis ?? '').toLowerCase().trim()]).filter(Boolean))];
  if (t.contests.length || t.reviews.length) {
    const n = Math.max(t.contests.length, t.reviews.filter(r => r.kind === 'CONTEST').length);
    beats.push({ icon: 'shield', tone: 'doubt', text: `Não confiei no resultado e tentei derrubá-lo ${n === 1 ? 'uma vez' : `${n} vezes`}${axes.length ? ` (${axes.join(', ')})` : ''}.` });
  }
  const belief: Record<string, Beat> = {
    CONFIRMED: { icon: 'star', tone: 'belief', text: 'Agora eu acredito nisso: sobreviveu a dois ataques independentes.' },
    REFUTED: { icon: 'undo', tone: 'change', text: o === 1 ? 'Mudei de ideia: parecia certo, mas meu próprio ataque derrubou.' : 'Descartei essa ideia.' },
    REVIEW: { icon: 'half', tone: 'belief', text: 'Ainda não acredito totalmente: está sob ataque.' },
    PROVISIONAL: { icon: 'dot', tone: 'belief', text: 'É provisório: ninguém tentou derrubar ainda.' },
    DISCARDED: { icon: 'dash', tone: 'belief', text: 'Deixei de lado: o teste não servia como estava.' },
  };
  if (belief[t.verdict]) beats.push(belief[t.verdict]!);
  return beats;
}

const AREA_PT: Record<string, string> = { SCIENCE: 'Ciência', ENGINEERING: 'Engenharia do NEXO', OLYMPUS: 'Olympus' };
const normArea = (d: string) => { const u = (d || '').toUpperCase(); return u === 'NEXO' || u === 'ARTIFACT' ? 'ENGINEERING' : u; };
/** Estados internos que mudam devagar: onde está minha atenção, o que estou ignorando, se me peguei numa isca. */
function selfLines(lab: Lab, state: SystemState): Array<{ icon: string; text: string; link?: string }> {
  const out: Array<{ icon: string; text: string; link?: string }> = [];
  const day = lab.activity.filter(e => Date.now() - Date.parse(e.at) < 864e5);
  const touched = new Map<string, number>();
  for (const e of day) {
    const rid = e.entity_id ? lab.tests.get(e.entity_id)?.roadmapId : null;
    if (rid) touched.set(rid, (touched.get(rid) ?? 0) + 1);
  }
  const active = [...lab.roadmaps.values()].filter(r => r.state === 'ACTIVE' || r.state === 'CHARTERED');
  const focus = [...touched].sort((a, b) => b[1] - a[1])[0];
  if (focus) {
    const r = lab.roadmaps.get(focus[0]);
    if (r) out.push({ icon: 'eye', text: `Minha atenção está em ${r.title.toLowerCase()}: ${focus[1]} ações nas últimas 24 h.`, link: labHref('roadmap', r.id) });
  }
  const ignored = active.filter(r => !touched.has(r.id) && r.frontier > 0).sort((a, b) => b.frontier - a.frontier)[0];
  if (ignored) out.push({ icon: 'eyeoff', text: `Estou deixando de lado ${ignored.title.toLowerCase()}, com ${ignored.frontier} testes esperando.`, link: labHref('roadmap', ignored.id) });
  const d = state.evolution?.decoys;
  if (d && d.revealed > 0) out.push({ icon: 'trap', text: `Plantei iscas contra mim mesmo: me peguei em ${d.caught} de ${d.revealed}.` });
  else if (d && d.planted > 0) out.push({ icon: 'trap', text: `Há ${d.planted === 1 ? 'uma isca plantada' : `${d.planted} iscas plantadas`} contra mim mesmo. Ainda não sei ${d.planted === 1 ? 'qual é' : 'quais são'}.` });
  const gate = (state.evolution?.gate.charters_waiting.length ?? 0) + (state.evolution?.gate.canaries_waiting.length ?? 0);
  if (gate) out.push({ icon: 'hand', text: `Estou esperando o Dener decidir ${gate === 1 ? 'uma coisa' : `${gate} coisas`} que eu não posso decidir sozinho.`, link: '#/ciclo' });
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

const INCIDENT_STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' }> = {
  OBSERVED: { label: 'Percebido', tone: 'warn' }, OPEN: { label: 'Aberto', tone: 'warn' }, INVESTIGATING: { label: 'Investigando', tone: 'warn' },
  MITIGATED: { label: 'Contornado', tone: 'ok' }, RESOLVED: { label: 'Resolvido', tone: 'ok' }, CLOSED: { label: 'Resolvido', tone: 'ok' },
  ESCALATED: { label: 'Precisa do Dener', tone: 'crit' }, BLOCKED: { label: 'Travado', tone: 'crit' },
};

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
      <stop offset="0" stopColor="#8a7a5c" /><stop offset=".45" stopColor="#d4bf95" /><stop offset=".75" stopColor="#f0dfbd" /><stop offset="1" stopColor="#fff6e4" />
    </linearGradient></defs><path d={ACOUSTIC} /></svg>
    <span><em>Λ</em>_ observatório NEXO · ℓ(ℓ+1)C<sub>ℓ</sub></span>
  </p>;
}

// ---------- Trilha do roadmap: o caminho andado (cor = veredito), a fronteira acesa e a meta ----------
const TRAIL_COLOR: Record<Verdict, string> = {
  CONFIRMED: '#5fd0a0', REFUTED: '#e0664f', REVIEW: '#e0b24f', PROVISIONAL: '#9fb4d8', READY: '#d4bf95',
  RUNNING: '#9fb4d8', CHECKPOINTED: '#7f8ca3', BLOCKED: '#6b6f7a', DISCARDED: '#3d414a',
};
function Trail({ tests, frontier, target }: { tests: TestEntity[]; frontier: string[]; target: number | null }) {
  const walked = tests.filter(t => !frontier.includes(t.id) && !isReady(t))
    .sort((a, b) => String(a.executedAt ?? a.createdAt ?? '').localeCompare(String(b.executedAt ?? b.createdAt ?? '')));
  const ahead = tests.filter(t => frontier.includes(t.id) || isReady(t)).slice(0, 8);
  if (!walked.length && !ahead.length) return null;
  const n = walked.length + ahead.length + 1, step = 40, W = Math.max(320, 48 + (n - 1) * step);
  const x = (i: number) => 24 + i * step;
  const y = (i: number) => 46 + Math.sin(i * 0.55) * 14;
  const pathD = Array.from({ length: n }, (_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(' ');
  const walkedEnd = walked.length ? x(walked.length - 1) : 24;
  const confirmed = tests.filter(t => t.verdict === 'CONFIRMED').length;
  return <figure className="trail" aria-label={`Trilha: ${walked.length} testes andados, ${ahead.length} na fronteira`}>
    <svg viewBox={`0 0 ${W} 92`} style={{ maxHeight: 140 }}>
      <defs><linearGradient id="trail-walk" x1="0" x2="1"><stop offset="0" stopColor="#8a7a5c" stopOpacity=".2" /><stop offset="1" stopColor="#d4bf95" /></linearGradient></defs>
      <path d={pathD} className="trail-ahead" />
      <path d={pathD} className="trail-walk" style={{ clipPath: `inset(0 ${W - walkedEnd}px 0 0)` }} />
      {walked.map((t, i) => <a key={t.id} href={labHref('entidade', t.id)}><circle cx={x(i)} cy={y(i)} r={t.verdict === 'CONFIRMED' ? 6 : 4} fill={TRAIL_COLOR[t.verdict]}><title>{t.name}</title></circle></a>)}
      {ahead.map((t, k) => { const i = walked.length + k; return <a key={t.id} href={labHref('entidade', t.id)}>
        <circle cx={x(i)} cy={y(i)} r={4} className="trail-front"><title>{`Próximo: ${t.name}`}</title></circle></a>; })}
      <g transform={`translate(${x(n - 1)},${y(n - 1)})`} className="trail-goal"><circle r={9} /><path d="M-4 0h8M0-4v8" /></g>
    </svg>
    <figcaption><span>{walked.length} andados</span><span className="tf">{ahead.length} na fronteira</span><span className="tg">meta: {confirmed}/{target ?? '?'} confirmados</span></figcaption>
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

function Board({ state, lab }: { state: SystemState; lab: Lab }) {
  const now = Date.now();
  const posts = (state.evolution?.board ?? []).filter(p => !p.resolved_at && (!p.expires_at || Date.parse(p.expires_at) > now)).slice(-8).reverse();
  if (!posts.length) return null;
  const who = (r: string) => (r === 'ALL' ? 'todos' : roleLabel(r));
  return <Section title="Conversa entre os agentes" kicker={`${posts.length} ${posts.length === 1 ? 'recado aberto' : 'recados abertos'}`} id="now-board">
    <ol className="board">{posts.map(p => <li key={p.id}>
      <p className="board-head"><b>{who(p.from)}</b><i aria-hidden="true">→</i><span>{who(p.to)}</span><time>{ago(p.at)}</time></p>
      <p className="board-text">{clip(humanize(nameIds(p.text, lab)), 220)}</p>
      {(p.refs?.length ?? 0) > 0 && <p className="hud-refs">{p.refs!.filter(r => lab.tests.has(r) || lab.hypotheses.has(r)).slice(0, 3).map(r => <E key={r} id={r} />)}</p>}
    </li>)}</ol>
  </Section>;
}

// ---------- Quem trabalha: as três tarefas e o último sinal de vida de cada uma ----------
function Crew({ lab }: { lab: Lab }) {
  const now = Date.now();
  return <section className="crew" aria-label="Quem trabalha">
    {TASKS.map(t => {
      const mine = lab.activity.filter(e => t.hats.includes(String(e.role).toUpperCase()));
      const last = mine.at(-1);
      const day = mine.filter(e => now - Date.parse(e.at) < 24 * 3600e3).length;
      const quiet = !last || now - Date.parse(last.at) > 3 * 3600e3;
      return <article key={t.id} className={`crew-card${quiet ? ' quiet' : ''}`}>
        <p className="crew-top"><b>{t.name}</b><span>{t.rhythm}</span></p>
        <p className="crew-hats">{[...new Set(t.hats.map(h => ROLE_PT[h] ?? h))].join(' + ')}</p>
        <p className="crew-does">{t.does}</p>
        <p className="crew-pulse"><i aria-hidden="true" />{last ? `último sinal ${ago(last.at)} · ${day} ações em 24 h` : 'ainda sem ações registradas'}</p>
      </article>;
    })}
  </section>;
}

// ---------- Telemetria ao vivo (desktop largo): recados entre agentes + ações, em ordem de tempo ----------
function Telemetry({ lab, state }: { lab: Lab; state: SystemState }) {
  const now = Date.now();
  const notes = (state.evolution?.board ?? []).filter(p => !p.resolved_at && (!p.expires_at || Date.parse(p.expires_at) > now))
    .map(p => ({ kind: 'note' as const, at: p.at, who: roleLabel(p.from), to: p.to === p.from ? '' : p.to === 'ALL' ? 'todos' : roleLabel(p.to),
      self: p.to === p.from, text: humanize(p.text), id: p.id }));
  // Ações iguais e seguidas do mesmo papel (ex.: 46 nomes preenchidos) viram uma linha só.
  const GROUP_PT: Record<string, (n: number) => string> = {
    SEMANTIC_BACKFILLED: n => `Dei nome e leitura simples a ${n} testes.`,
    TEST_ENRICHED: n => `Completei a ficha de ${n} testes antigos.`,
    LEARNING_SIGNAL_RECORDED: n => `Anotei ${n} lacunas para resolver (receitas ou dados que faltam).`,
    TEST_DISPATCHED: n => `Mandei ${n} testes para a bateria.`,
    ROADMAP_TEST_FROZEN: n => `Congelei as regras de ${n} testes antes de olhar os dados.`,
  };
  const raw = lab.activity.slice(-160);
  const grouped: Array<{ e: (typeof raw)[number]; n: number }> = [];
  for (const e of raw) {
    const last = grouped.at(-1);
    if (last && last.e.event_type === e.event_type && last.e.role === e.role && GROUP_PT[e.event_type]
        && Math.abs(Date.parse(e.at) - Date.parse(last.e.at)) < 20 * 60e3) { last.n += Number((e as { count?: number }).count ?? 1); last.e = e; }
    else grouped.push({ e, n: Number((e as { count?: number }).count ?? 1) });
  }
  const acts = grouped.slice(-60).map(({ e, n }, i) => ({ kind: 'act' as const, at: e.at, who: roleLabel(String(e.role)), to: '',
    text: n > 1 ? GROUP_PT[e.event_type]!(n) : narrate(e, lab), id: `${e.at}-${i}` }));
  const feed = [...notes, ...acts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  const day = lab.activity.filter(e => now - Date.parse(e.at) < 864e5).length;
  return <aside className="telemetry" aria-label="Telemetria ao vivo">
    <header><p><i aria-hidden="true" />Telemetria ao vivo</p><small>agentes conversando e agindo · {day} ações em 24 h</small></header>
    <ol className="tele-feed">{feed.map(f => <li key={f.id} className={f.kind === 'note' ? 'tele-note' : undefined}>
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

// ---------- Cartão de resultado: números com leitura (e elipse w0–wa quando houver) ----------
const STAT_PT: Record<string, (v: number) => [string, string]> = {
  delta_chi2: v => [`Δχ² = ${v.toFixed(1)}`, v < -4 ? 'o modelo novo ajusta claramente melhor que o de referência' : v < 0 ? 'o modelo novo ajusta um pouco melhor' : 'o modelo de referência ajusta melhor'],
  delta_chi2_lcdm_minus_w0wa: v => [`Δχ²(ΛCDM − w0wa) = ${v.toFixed(1)}`, v >= 4 ? 'dados preferem energia escura que muda' : 'preferência fraca'],
  p_value: v => [`p = ${v < 0.001 ? v.toExponential(1) : v.toFixed(3)}`, v < 0.003 ? 'muito improvável por acaso' : v < 0.05 ? 'improvável por acaso' : 'compatível com acaso'],
  sigma_raw: v => [`${v.toFixed(1)}σ`, 'significância bruta'],
  sigma_lee: v => [`${v.toFixed(1)}σ`, 'significância corrigida por olhar em muitos lugares'],
  delta_bic: v => [`ΔBIC = ${v.toFixed(1)}`, Math.abs(v) > 10 ? 'evidência forte' : Math.abs(v) > 6 ? 'evidência positiva' : 'evidência fraca'],
  ln_bayes_factor: v => [`ln B = ${v.toFixed(2)}`, Math.abs(v) > 5 ? 'evidência forte (Jeffreys)' : Math.abs(v) > 2.5 ? 'evidência moderada' : 'evidência fraca'],
  shift_sigma: v => [`deslocamento ${v.toFixed(1)}σ`, v < 1 ? 'o resultado quase não se move' : 'o resultado se move'],
};
const zFromP = (p: number) => { // bicaudal, aproximação suficiente para exibição
  const q = Math.max(1e-12, Math.min(1, p)) / 2, t = Math.sqrt(-2 * Math.log(q));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
};
function ResultCard({ t }: { t: TestEntity }) {
  const n = numbersOf(t);
  const rows = Object.entries(n).filter(([k]) => STAT_PT[k]).map(([k, v]) => STAT_PT[k]!(v));
  const sigma = n.sigma_lee ?? n.sigma_raw ?? (n.p_value !== undefined ? zFromP(n.p_value) : undefined);
  const full = (t.result as { statistics?: { full?: Record<string, number>; subset?: Record<string, number> } } | null)?.statistics;
  const pt = full?.subset ?? full?.full;
  return <section className="hud-section result-card" aria-label="Resultado em foco">
    <h2>Resultado em foco</h2>
    <p className="rc-name"><E id={t.id}>{t.name}</E> <VerdictChip v={t.verdict} small /></p>
    {t.meaning && <p className="rc-meaning">{humanize(t.meaning)}</p>}
    {rows.length > 0 && <dl className="rc-stats">{rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}
    {sigma !== undefined && <div className="rc-gauge" aria-label={`Significância ${sigma.toFixed(1)} sigma`}>
      <svg viewBox="0 0 300 34"><line x1="10" x2="290" y1="18" y2="18" className="g-axis" />
        {[0, 1, 2, 3, 4, 5].map(k => <g key={k}><line x1={10 + k * 56} x2={10 + k * 56} y1="13" y2="23" className="g-tick" /><text x={10 + k * 56} y="33" className="g-lab">{k}σ</text></g>)}
        <line x1={10 + 3 * 56} x2={10 + 5 * 56} y1="18" y2="18" className="g-disc" />
        <circle cx={10 + Math.min(5, Math.max(0, sigma)) * 56} cy="18" r="6" className="g-dot" /></svg>
      <span>{sigma >= 5 ? 'nível de descoberta' : sigma >= 3 ? 'indício' : 'abaixo de indício'}</span></div>}
    {pt && typeof pt.w0 === 'number' && typeof pt.wa === 'number' && <W0WaPlot w0={pt.w0} wa={pt.wa} />}
    {rows.length === 0 && sigma === undefined && <p className="hud-muted">Este teste ainda não publicou números; a leitura acima é qualitativa.</p>}
  </section>;
}
function W0WaPlot({ w0, wa }: { w0: number; wa: number }) {
  const X = (v: number) => 20 + (v + 1.6) / 1.4 * 240, Y = (v: number) => 110 - (v + 2.5) / 3.5 * 100;
  return <svg className="rc-plane" viewBox="0 0 280 124" aria-label={`w0 ${w0.toFixed(2)}, wa ${wa.toFixed(2)}`}>
    <line x1="20" x2="260" y1={Y(0)} y2={Y(0)} className="g-axis" /><line x1={X(-1)} x2={X(-1)} y1="10" y2="110" className="g-axis" />
    <text x="262" y={Y(0) + 4} className="g-lab">wa=0</text><text x={X(-1) + 4} y="18" className="g-lab">w0=−1</text>
    <circle cx={X(-1)} cy={Y(0)} r="3.5" className="g-lcdm" /><text x={X(-1) + 6} y={Y(0) - 6} className="g-lab">ΛCDM</text>
    <ellipse cx={X(w0)} cy={Y(wa)} rx="14" ry="22" className="g-ell" transform={`rotate(-28 ${X(w0)} ${Y(wa)})`} />
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
const FRONTS: Array<{ name: string; grade: 'sólido' | 'tensão' | 'aberto'; note: string; match: (t: TestEntity) => boolean }> = [
  { name: 'Energia escura', grade: 'tensão', note: 'DESI DR2 + SNe preferem w0-wa em 2,8–4,2σ',
    match: t => isSubdomain(t, 'science.cosmology.dark_energy', 'Energia escura') },
  { name: 'Expansão local (H0)', grade: 'tensão', note: 'Cefeidas ~5σ acima do CMB; TRGB no meio',
    match: t => isSubdomain(t, 'science.cosmology.h0', 'Expansão do Universo · H0') },
  { name: 'Aglomeração (S8)', grade: 'tensão', note: 'lentes fracas abaixo do CMB; diferença encolhendo',
    match: t => isSubdomain(t, 'science.cosmology.lss_growth', 'Crescimento da estrutura em larga escala')
      && !(t.topicId && LSS_STRUCTURE_TOPICS.has(t.topicId)) },
  { name: 'Matéria escura', grade: 'aberto', note: 'existência sólida; natureza em aberto',
    match: t => isSubdomain(t, 'science.cosmology.dark_matter', 'Matéria escura') },
  { name: 'Estrutura em grande escala', grade: 'sólido', note: 'ΛCDM descreve bem; anomalias pontuais',
    match: t => isTopic(t, 'science.cosmology.lss_growth.galaxy_distribution', 'Galáxias · Redshift 3D')
      || isTopic(t, 'science.cosmology.lss_growth.megastructures', 'Megaestruturas cosmológicas') },
];
function Frontiers({ lab }: { lab: Lab }) {
  const sci = [...lab.tests.values()].filter(t => !t.contestOf && isScience(t));
  const rows = FRONTS.map(f => ({ ...f, list: sci.filter(f.match) }));
  return <Section title="Frentes da cosmologia" kicker="literatura × NEXO" id="now-fronts">
    <ul className="fronts">{rows.map(r => { const T = tally(r.list); return <li key={r.name}>
      <p className="fr-top"><b>{r.name}</b><span className={`fr-grade g-${r.grade === 'sólido' ? 'solid' : r.grade === 'tensão' ? 'tension' : 'open'}`}>{r.grade}</span></p>
      <p className="fr-note">{r.note}</p>
      <p className="fr-nexo">{T.total ? <>NEXO: <b>{T.total}</b> testes · {T.confirmed} {T.confirmed === 1 ? 'confirmado' : 'confirmados'} · {T.refuted} {T.refuted === 1 ? 'refutado' : 'refutados'} · {T.ready} na fila</> : 'NEXO ainda não testou esta frente'}</p>
    </li>; })}</ul>
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
  return <>{v}</>;
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

// ---------- Laços parados (por laço, não por papel): o papel pode estar vivo e só um laço dele parado ----------
function QuietLoops({ lab, quiet, at }: { lab: Lab; quiet: Array<{ role: string; hours: number | null; loops: string[] }>; at: string }) {
  const loops = new Map<string, { hours: number | null; roles: Set<string> }>();
  for (const q of quiet) for (const l of q.loops) {
    const cur = loops.get(l) ?? { hours: q.hours, roles: new Set<string>() };
    cur.roles.add(q.role.toUpperCase()); loops.set(l, cur);
  }
  const lastOf = (role: string) => { const t = taskOf(role); const hats = t?.hats ?? [role];
    return lab.activity.filter(e => hats.includes(String(e.role).toUpperCase())).at(-1)?.at; };
  const dur = (h: number | null) => h == null ? 'nunca aconteceu' : `parado há ${h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`}`;
  return <Section title="Laços parados" kicker={`vigia do robô · ${ago(at)}`} id="he-quiet">
    <ul className="quiet-list">{[...loops].map(([loop, v]) => { const role = [...v.roles][0]!; const t = taskOf(role); const last = lastOf(role);
      return <li key={loop}>
        <b>{(LOOP_PT[loop] ?? loop).replace(/^./, c => c.toUpperCase())}</b>
        <span>{dur(v.hours)}</span>
        <em>dono: {t ? t.name : roleLabel(role)}{last ? ` · o papel agiu ${ago(last)}` : ' · sem sinal do papel'}</em>
      </li>; })}</ul>
    <p className="hud-note">Um laço parado não quer dizer que o agente parou: mutação do genoma, por exemplo, é rara por natureza.</p>
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
