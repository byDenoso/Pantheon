// NEXO Observatório: páginas em HUD sobre a teia cósmica.
// Rotas: #/agora #/ciclo #/roadmaps #/roadmap/<id> #/evidencia[?v=] #/e/<id> #/saude
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
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
const E = ({ id, children }: { id: string; children?: ReactNode }) => <a className="elink" href={labHref('entidade', id)}>{children ?? humanId(id)}</a>;
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
const text = (v: unknown): string | null => v === null || v === undefined || v === '' ? null : typeof v === 'string' ? v : JSON.stringify(v, null, 1);

function Bar({ parts, total }: { parts: Array<[Verdict, number]>; total: number }) {
  return <span className="vbar" role="img" aria-label={parts.map(([v, n]) => `${n} ${VERDICT_PT[v]}`).join(', ')}>
    {parts.filter(([, n]) => n > 0).map(([v, n]) => <b key={v} className={`v-${v.toLowerCase()}`} style={{ flexGrow: n, flexBasis: 0 }} title={`${n} ${VERDICT_PT[v]}`} />)}
    {total > 0 ? null : <b className="v-ready" style={{ flexGrow: 1 }} />}
  </span>;
}

// ---------- app ----------
export default function LabApp({ state, route, theme }: { state: SystemState; route: LabRoute; theme: 'dark' | 'light' }) {
  const lab = useMemo(() => buildLab(state), [state]);
  const tests = useMemo(() => [...lab.tests.values()].filter(t => !t.contestOf), [lab]);
  const [focus, setFocus] = useState<string[]>([]);
  const events = useMemo<SceneEvents>(() => sceneEvents(state, lab), [state, lab]);
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
      default: return <Now lab={lab} state={state} />;
    }
  })();

  return <div className="observatory" data-page={route.page}>
    <Suspense fallback={<div className="obs-scene obs-scene--loading" />}>
      <ObservatoryScene tests={tests} events={events} page={route.page} focusIds={focus} theme={theme}
        onPick={id => { window.location.hash = labHref('entidade', id); }} />
    </Suspense>
    <div className="hud" key={`${route.page}:${route.id ?? ''}`}>{page}</div>
  </div>;
}

// ---------- Agora ----------
function Now({ lab, state }: { lab: Lab; state: SystemState }) {
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

    {gate > 0 && <a className="hud-gate" href="#/ciclo">
      <strong>{gate}</strong><span>{gate === 1 ? 'decisão espera por você' : 'decisões esperam por você'}</span><em>abrir o portão →</em>
    </a>}

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
  const events = (ev as unknown as { events?: Array<{ at: string; actor: string; kind: string; ref?: string; text?: string }> })?.events;
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
      {chains.length ? <ul className="chains">{chains.map(t => <li key={t.id}>
        <E id={t.id}>{t.question ?? humanId(t.id)}</E>
        <span className="chain-track">
          <VerdictChip v={t.verdict} small />
          {t.contests.map(c => <span key={c} className="chain-link"><i aria-hidden="true">→</i><a href={labHref('entidade', c)}><VerdictChip v={lab.tests.get(c)!.verdict} small /></a></span>)}
        </span>
      </li>)}</ul> : <p className="hud-muted">Nenhum resultado foi contestado ainda.</p>}
    </Section>

    <Section title="Diário" kicker="Últimos pensamentos da Pítia" id="cy-diary">
      {events?.length ? <ol className="stream">{events.slice(-24).reverse().map((e, i) => <li key={i}>
        <time>{ago(e.at)}</time><b>{e.actor}</b><span>{e.text ?? e.kind}</span>{e.ref && <E id={e.ref} />}
      </li>)}</ol> : <ol className="stream">{[...(ev?.thoughts ?? [])].reverse().slice(0, 8).map(t => <li key={t.id}>
        <time>{ago(t.at)}</time><b>Pítia</b><span>{t.text}</span>
      </li>)}</ol>}
      {!events && <Missing what="evolution.events[] {at, actor, kind, ref, text}" />}
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
  const nextUp = tests.filter(t => t.verdict === 'READY').slice(0, 5);
  const blocked = tests.filter(t => t.verdict === 'BLOCKED');
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/roadmaps">Roadmaps</a> · {r.state === 'ACTIVE' ? 'ativo' : r.state.toLowerCase()}{r.renewable ? ' · campanha permanente' : ''}</p>
      <h1>{r.title}</h1>
      {r.question && <p className="hud-lead">{r.question}</p>}
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
function EntityPage({ lab, id }: { lab: Lab; id: string }) {
  const t = lab.tests.get(id);
  const h = lab.hypotheses.get(id);
  if (!t && h) return <HypothesisView lab={lab} id={id} />;
  if (!t) {
    const rm = lab.roadmaps.get(id);
    if (rm) { window.location.hash = labHref('roadmap', id); return null; }
    return <NotFound id={id} />;
  }
  const parent = t.contestOf ? lab.tests.get(t.contestOf) : null;
  const hyp = t.hypothesisId ? lab.hypotheses.get(t.hypothesisId) : null;
  return <>
    <header className="hud-hero">
      <p className="hud-kicker"><a href="#/evidencia">Evidência</a>{t.roadmapId && <> · <a href={labHref('roadmap', t.roadmapId)}>{lab.roadmaps.get(t.roadmapId)?.title ?? humanId(t.roadmapId)}</a></>}{parent && <> · contesta <E id={parent.id} /></>}</p>
      <h1>{t.question ?? humanId(t.id)}</h1>
      <p className="hud-lead"><VerdictChip v={t.verdict} />{t.review && <span className="hud-muted"> · revisão: {t.review.toLowerCase().replace(/_/g, ' ')}</span>}</p>
      <code className="hud-id">{t.id}</code>
    </header>

    {t.meaning && <Section title="O que o resultado significa" id="en-mean"><p className="hud-big">{t.meaning}</p></Section>}

    <Section title="Congelado antes do teste" kicker="Pré-registro — não pode mudar depois do resultado" id="en-pre">
      <dl className="fields">
        <Field label="Métrica" value={t.prereg.metric} sealed /><Field label="Critério / limiar" value={t.prereg.threshold} sealed />
        <Field label="Previsão" value={t.prereg.prediction} sealed /><Field label="Hipótese nula" value={t.prereg.null_model} sealed />
        <Field label="Rival" value={t.prereg.rival} sealed /><Field label="Selo (hash)" value={t.prereg.hash} sealed />
      </dl>
    </Section>

    <Section title="Como foi feito" id="en-method">
      <dl className="fields"><Field label="Método" value={t.method} /><Field label="Dados" value={t.datasets} /><Field label="Artefatos" value={t.artifacts} /></dl>
    </Section>

    <Section title="Resultado" id="en-res">
      <dl className="fields"><Field label="Valor" value={t.result} /><Field label="Estatística" value={t.statistics} /><Field label="Robustez" value={t.robustness} /></dl>
    </Section>

    <Section title="Tentativas de derrubar" kicker={`${t.contests.length} contestações`} id="en-rev">
      {t.reviews.length > 0 && <ol className="stream">{t.reviews.map((r, i) => <li key={i}><time>{ago(r.at)}</time><b>{r.kind}</b><span>{[r.axis, r.outcome].filter(Boolean).join(' · ')}</span>{r.ref && <E id={r.ref} />}</li>)}</ol>}
      {t.contests.length > 0 ? <ul className="hud-list">{t.contests.map(c => <li key={c}><VerdictChip v={lab.tests.get(c)!.verdict} small /><E id={c}>{lab.tests.get(c)!.question ?? humanId(c)}</E></li>)}</ul>
        : <p className="hud-muted">Ainda não foi contestado. Só vira confirmado depois de sobreviver a duas contestações independentes.</p>}
    </Section>

    <Section title="Limites da conclusão" id="en-lim">
      <dl className="fields"><Field label="Limitações" value={t.limitations} /><Field label="O que isto NÃO mostra" value={t.claimBoundary} /><Field label="Nível da afirmação" value={t.claimLevel} /></dl>
    </Section>

    {hyp && <Section title="De onde veio" kicker="Hipótese" id="en-hyp"><p className="hud-big"><E id={hyp.id}>{hyp.statement ?? humanId(hyp.id)}</E></p></Section>}
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
    {(ev?.incidents?.length ?? 0) > 0 && <Section title="Incidentes" id="he-inc">
      <ul className="hud-list">{ev!.incidents!.map(i => <li key={i.incident_id}><b>{i.state}</b> {i.summary_plain ?? i.summary_pt ?? i.incident_id} <span className="hud-muted">· próximo: {i.next_owner}</span></li>)}</ul>
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
