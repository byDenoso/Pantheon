// NEXO Observatório: páginas em HUD sobre a teia cósmica.
// Rotas: #/agora #/ciclo #/roadmaps #/roadmap/<id> #/evidencia[?v=] #/e/<id> #/saude
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SystemState } from '../../contracts/system.ts';
import {
  ago, buildLab, GUARDIAN_AREA_PT, humanId, readBaseline, VERDICT_GLYPH, VERDICT_ORDER, VERDICT_PT,
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
    <strong>{n}</strong><span>{label}</span>
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
  return <div className={`observatory${explore || replay !== null ? ' exploring' : ''}`} data-page={route.page}>
    {cur && <div className="replay-caption" role="status" aria-live="polite">
      <span className="replay-clock">{new Date(cur.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <p><b>{ROLE_PT[cur.role.toUpperCase()] ?? cur.role}</b> {narrate(cur, lab)}</p>
      <span className="replay-bar"><i style={{ width: `${((replay! + 1) / reel.length) * 100}%` }} /></span>
      <button type="button" onClick={() => { setReplay(null); setFocus([]); }}>✕ parar</button>
    </div>}
    <button type="button" className="explore-toggle" aria-pressed={explore} onClick={() => setExplore(x => !x)}>
      {explore ? '✕ Voltar ao painel' : '⤢ Explorar a teia'}</button>
    <div className="obs-tools">
      <button type="button" onClick={() => setSearching(true)} title="Procurar (Ctrl K)"><Icon n="target" /> Procurar</button>
      <button type="button" aria-pressed={sound} onClick={() => setSound(x => !x)} title="Som ambiente">{sound ? 'Som ligado' : 'Som'}</button>
    </div>
    {searching && <Search lab={lab} onClose={() => setSearching(false)} />}
    {legend && route.page === 'agora' && <Legend onClose={closeLegend} />}
    {explore && <p className="explore-hint" role="status">Arraste para girar · roda ou pinça para zoom · botão direito, Shift ou 2 dedos para mover · duplo clique recentra · Esc sai</p>}
    <Suspense fallback={<div className="obs-scene obs-scene--loading" />}>
      <ObservatoryScene explore={explore || replay !== null} hot={hot} tests={tests} events={events} page={route.page} focusIds={focus} theme={theme}
        onPick={id => { window.location.hash = labHref('entidade', id); }} />
    </Suspense>
    <div className="hud" key={`${route.page}:${route.id ?? ''}`}>{page}</div>
  </div>;
}

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
  const next = [...lab.tests.values()].filter(t => t.verdict === 'READY' && t.question).slice(0, 3);
  const health = !g ? 'unknown' : g.status === 'GREEN' ? 'ok' : g.status === 'YELLOW' ? 'warn' : 'crit';

  return <>
    <header className="hud-hero">
      <p className={`hud-status s-${stale ? 'warn' : health}`}>
        <i aria-hidden="true" />
        {g ? { GREEN: 'Sistema saudável', YELLOW: 'Sistema com alertas', RED: 'Sistema com falhas' }[g.status] : 'Saúde desconhecida'}
        <span> · dados {ago(state.generated_at)}{stale ? ' — atrasados' : ''}</span>
      </p>
      <h1>O NEXO agora</h1>
      {g && g.failing_areas.length > 0 && <p className="hud-lead">{g.failing_areas.map(a => GUARDIAN_AREA_PT[a] ?? a).join(' · ')}.</p>}
    </header>

    <GatePanel state={state} />
    {gate > 0 && !state.inbox?.some(i => i.kind === 'APROVAR') && <a className="hud-gate" href="#/ciclo">
      <strong>{gate}</strong><span>{gate === 1 ? 'decisão espera por você' : 'decisões esperam por você'}</span><em>abrir o portão →</em>
    </a>}

    {base && <AwaySummary lab={lab} since={base.at} />}

    <Section title={base ? `Desde ${ago(base.at)}` : 'Placar da ciência'} kicker="Progresso, não atividade" id="now-since">
      <div className="stats">
        <Stat n={lab.reviews.CONFIRMED ?? 0} label="confirmados" delta={d('confirmed')} tone="ok" />
        <Stat n={lab.reviews.REFUTED ?? 0} label="refutados" delta={d('refuted')} tone="crit" />
        <Stat n={review} label="em revisão" tone="warn" />
        <Stat n={lab.counts.BLOCKED} label="bloqueados" delta={d('BLOCKED')} tone="mute" lowerIsBetter />
      </div>
      <p className="hud-note">
        Conversão: <b>{resolved}</b> de <b>{resolved + review}</b> resultados que entraram em revisão já têm veredito final
        {resolved + review ? ` (${Math.round(100 * resolved / (resolved + review))}%)` : ''}.
      </p>
    </Section>

    <Monologue lab={lab} state={state} onReplay={onReplay} replayCount={replayCount} />

    <Calibration lab={lab} />

    {thought && <Section title="O que o NEXO está pensando" kicker={`Pítia · ${ago(thought.at)}`} id="now-thought">
      <blockquote className="hud-thought">{thought.text}</blockquote>
      <p className="hud-refs">{thought.refs.slice(0, 4).map(r => <E key={r} id={r} />)}</p>
    </Section>}

    <div className="hud-pair">
      {discovery && <Section title="Descoberta em foco" kicker={VERDICT_PT[discovery.verdict]} id="now-disc">
        <p className="hud-big">{discovery.meaning ?? discovery.question ?? humanId(discovery.id)}</p>
        <E id={discovery.id}>ver a evidência →</E>
      </Section>}
      <Section title="Problema principal" kicker={blocked.length ? `${blocked.length} testes parados` : 'Nenhum bloqueio'} id="now-problem">
        {blocked.length
          ? <><p className="hud-big">{blocked[0]!.blocker ?? blocked[0]!.summary ?? 'Motivo não publicado'}</p><E id={blocked[0]!.id}>investigar →</E></>
          : <p className="hud-muted">Nada impedindo a fila agora.</p>}
      </Section>
    </div>

    <Section title="Próximo movimento" kicker="Fila do Executor" id="now-next">
      {next.length ? <ol className="hud-list">{next.map(t => <li key={t.id}><E id={t.id}>{t.question}</E></li>)}</ol>
        : <p className="hud-muted">Fila vazia: o Learner precisa gerar hipóteses.</p>}
    </Section>
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
  const n = (re: RegExp) => evs.filter(e => re.test(e.event_type)).length;
  const results = n(/RESULT/), created = n(/CREATED|PROPOSED|ENQUEUED/), verdicts = n(/VERDICT|REVIEW|CONFIRM|REFUT/), thoughts = n(/THOUGHT/);
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
  { key: 'thought', label: 'Pensamento', who: 'Pítia', get: (_l, s) => s.evolution?.thoughts?.length ?? 0 },
  { key: 'hyp', label: 'Hipóteses', who: 'Learner', get: l => l.hypotheses.size },
  { key: 'ready', label: 'Na fila', who: 'Executor', get: l => l.counts.READY },
  { key: 'result', label: 'Resultado', who: 'Runner', get: l => l.counts.PROVISIONAL },
  { key: 'review', label: 'Contestação', who: 'Refutador', get: l => (l.reviews.PENDING_REVIEW ?? 0) + (l.reviews.CONTESTED ?? 0) },
  { key: 'ref1', label: 'Referee 1', who: 'Refutador', get: l => l.reviews.REFEREE1_PASSED ?? 0 },
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
  const nextUp = (r.frontierIds?.length ? r.frontierIds.map(id => lab.tests.get(id)!).filter(Boolean) : tests.filter(t => t.verdict === 'READY')).slice(0, 6);
  const blocked = tests.filter(t => t.verdict === 'BLOCKED');
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/roadmaps">Roadmaps</a> · {r.state === 'ACTIVE' ? 'ativo' : r.state.toLowerCase()}{r.renewable ? ' · campanha permanente' : ''}</p>
      <h1>{r.title}</h1>
      {r.question && <p className="hud-lead">{r.question}</p>}
      {r.objectives?.length ? <ul className="crit objectives">{r.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null}
    </header>
    <div className="stop-rules">
      <div><span>Meta</span><strong>{r.confirmed}/{r.target ?? '?'}</strong><i style={{ width: `${pct(r.confirmed, r.target)}%` }} className="ok" /><em>confirmações para encerrar com sucesso</em></div>
      <div><span>Refutações seguidas</span><strong>{r.refutedStreak}/{r.killStreak ?? '?'}</strong><i style={{ width: `${pct(r.refutedStreak, r.killStreak)}%` }} className="crit" /><em>encerra por refutação</em></div>
      <div><span>Orçamento</span><strong>{r.used}/{r.maxTests ?? '?'}</strong><i style={{ width: `${pct(r.used, r.maxTests)}%` }} className="warn" /><em>testes usados{r.maxDays ? ` · ${r.maxDays} dias` : ''}</em></div>
    </div>
    <Section title="Árvore de hipóteses" kicker={`${hyps.size} hipóteses · ${tests.length} testes`} id="rm-tree">
      {tests.length === 0 ? <Missing what="tests[].roadmap_id (roadmap sem campanha ligada)" /> :
        <div className="tree">{[...hyps].map(([h, ts]) => <details key={h} open={hyps.size < 6}>
          <summary><span>{h === '—' ? 'Sem hipótese declarada' : (lab.hypotheses.get(h)?.statement ?? humanId(h))}</span><Bar parts={roadmapParts(lab, ts.map(t => t.id))} total={ts.length} /></summary>
          <ul>{ts.map(t => <li key={t.id}><VerdictChip v={t.verdict} small /><E id={t.id}>{t.question ?? humanId(t.id)}</E></li>)}</ul>
        </details>)}</div>}
    </Section>
    <div className="hud-pair">
      <Section title="Evidência acumulada" kicker={`${confirmed.length} confirmados`} id="rm-ev">
        {confirmed.length ? <ul className="hud-list">{confirmed.map(t => <li key={t.id}><E id={t.id}>{t.meaning ?? t.question}</E></li>)}</ul> : <p className="hud-muted">Nada confirmado ainda.</p>}
      </Section>
      <Section title="Próximos testes" kicker={`${r.frontier} na fronteira`} id="rm-next">
        {nextUp.length ? <ul className="hud-list">{nextUp.map(t => <li key={t.id}><E id={t.id}>{t.question ?? humanId(t.id)}</E></li>)}</ul> : <p className="hud-muted">Sem testes prontos.</p>}
        {blocked.length > 0 && <p className="hud-note">{blocked.length} bloqueados: <E id={blocked[0]!.id}>{blocked[0]!.blocker ?? 'ver motivo'}</E></p>}
      </Section>
    </div>
  </>;
}

// ---------- Evidência ----------
function Evidence({ lab, filter }: { lab: Lab; filter?: Verdict }) {
  const [q, setQ] = useState('');
  const all = [...lab.tests.values()].filter(t => !t.contestOf);
  const list = all.filter(t => (!filter || t.verdict === filter) && (!q || `${t.id} ${t.question ?? ''} ${t.meaning ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return <>
    <header className="hud-hero"><p className="hud-kicker">{all.length} testes publicados</p><h1>Evidência</h1>
      <p className="hud-lead">Todo teste, do pré-registro ao veredito. Filtre pelo estado; clique para ver o que foi prometido antes e o que aconteceu.</p></header>
    <nav className="filters" aria-label="Filtrar por veredito">
      <a href="#/evidencia" aria-current={!filter ? 'page' : undefined}>Todos <b>{all.length}</b></a>
      {VERDICT_ORDER.map(v => <a key={v} href={`#/evidencia?v=${v}`} aria-current={filter === v ? 'page' : undefined} className={`v-${v.toLowerCase()}`}>
        <i aria-hidden="true">{VERDICT_GLYPH[v]}</i>{VERDICT_PT[v]} <b>{all.filter(t => t.verdict === v).length}</b></a>)}
    </nav>
    <input className="hud-search" type="search" placeholder="Buscar pergunta, resultado ou id…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar testes" />
    <table className="ev-table">
      <thead><tr><th scope="col">Estado</th><th scope="col">Pergunta / resultado</th><th scope="col">Contestações</th><th scope="col">Domínio</th></tr></thead>
      <tbody>{list.slice(0, 200).map(t => <tr key={t.id}>
        <td><VerdictChip v={t.verdict} small /></td>
        <td><E id={t.id}>{t.question ?? humanId(t.id)}</E>{t.meaning && <small>{t.meaning}</small>}</td>
        <td>{t.contests.length || ''}</td>
        <td>{t.topic ?? t.domain.toLowerCase()}</td>
      </tr>)}</tbody>
    </table>
    {list.length > 200 && <p className="hud-muted">Mostrando 200 de {list.length}. Use a busca.</p>}
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
      {t.meaning && <p className="hud-big">{t.meaning}</p>}
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
    {g && g.failing_areas.length > 0 && <Section title="O que está falhando" id="he-fail">
      <ul className="hud-list">{g.failing_areas.map(a => <li key={a}><b>{a}</b> — {GUARDIAN_AREA_PT[a] ?? 'ver relatório do Guardião'}</li>)}</ul>
    </Section>}
    {(ev?.incidents?.length ?? 0) > 0 && <Section title="Incidentes" kicker={`${ev!.incidents!.length} abertos`} id="he-inc">
      <ul className="incidents">{ev!.incidents!.map(i => {
        const st = INCIDENT_STATE[i.state.toUpperCase()] ?? { label: i.state.toLowerCase(), tone: 'warn' };
        const links = [...i.public_ids.tests, ...i.public_ids.hypotheses];
        return <li key={i.incident_id} className={`incident s-${st.tone}`}>
          <p className="incident-head"><span className="incident-state">{st.label}</span>
            <span className="hud-muted">visto {i.evidence_count} {i.evidence_count === 1 ? 'vez' : 'vezes'} · quem investiga: {ROLE_PT[i.next_owner.toUpperCase()] ?? i.next_owner}</span></p>
          <p className="incident-text">{i.summary_plain ?? i.summary_pt ?? 'Problema registrado sem descrição pública.'}</p>
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
    ...(ev?.gate.charters_waiting ?? []).map(c => ({ domain: domainOfId(c.roadmap_id, lab), label: `Quasar · decisão sua: ${humanId(c.roadmap_id)}`, href: '#/ciclo' })),
    ...(ev?.gate.canaries_waiting ?? []).map(c => ({ domain: 'ENGINEERING', label: `Quasar · canonizar ${c.gene}`, href: '#/ciclo' })),
  ];
  const running = Number((ev as unknown as { batteries?: Record<string, number> })?.batteries?.DISPATCHED ?? 0);
  const perDomain = new Map<string, number>();
  for (const t of lab.tests.values()) {
    if (t.verdict !== 'READY' || t.contestOf) continue;
    const d = normDomain(t.domain);
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
  }
  const agn = [...perDomain].map(([domain, n]) => ({
    domain, count: n, href: '#/evidencia?v=READY',
    label: `AGN · ${n} ${n === 1 ? "teste" : "testes"} ${running ? 'rodando/na fila' : 'na fila'}`,
  }));
  const grbs = (ev?.thoughts ?? []).filter(t => Date.now() - Date.parse(t.at) < 2 * 3600e3).slice(-2)
    .map(t => ({ domain: domainOfId(t.refs[0] ?? '', lab), label: 'GRB · a Pítia pensou', href: '#/ciclo' }));
  return { quasars, agn, grbs };
}

// ---------- raias do ciclo ----------
const LANES: Array<[string, string]> = [['PITIA', 'Pítia'], ['LEARNER', 'Learner'], ['EXECUTOR', 'Executor'], ['REFUTADOR', 'Refutador'], ['GUARDIAO', 'Guardião'], ['DENER', 'Dener']];
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
  const lane = (role: string) => Math.max(0, LANES.findIndex(([k]) => k === role.toUpperCase()));
  const counts = LANES.map(([k]) => recent.filter(e => e.role.toUpperCase() === k).length);
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
const ROLE_PT: Record<string, string> = { PITIA: 'Pítia', LEARNER: 'Learner', EXECUTOR: 'Executor', REFUTADOR: 'Refutador', GUARDIAO: 'Guardião', DENER: 'Dener' };
const NARRATION: Record<string, string> = {
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
  const q = t?.name ?? (e.entity_id ? (lab.hypotheses.get(e.entity_id)?.statement ?? humanId(e.entity_id)) : '');
  const text = tpl.includes('%q') ? tpl.replace('%q', q ? `“${q.length > 140 ? q.slice(0, 137) + '…' : q}”` : '').replace(/: $/, '.') : tpl;
  return text;
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
  if (t.verdict === 'READY') beats.push({ icon: 'wait', tone: 'fact', text: 'Ainda vou rodar este teste.' });
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
