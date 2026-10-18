import {useMemo, useRef, useState, type PointerEvent, type WheelEvent} from 'react';
import type {SystemState} from '../contracts/system.ts';
import {buildKnowledge, layoutKnowledge, scoreHypothesis, type KClaim} from './model.ts';
import './knowledge.css';

type SourceFilter = 'all' | 'LITERATURE' | 'NEXO' | 'conflicts';
const STATUS_CLASS: Record<string, string> = {PROMOTED: 'promoted', ACTIVE: 'active', READY: 'active', KILLED: 'dead', REJECTED: 'dead', PARKED: 'parked', SUPERSEDED: 'parked', INCONCLUSIVE: 'open'};

/** Read-only logical graph of questions, hypotheses and weighted claims. */
export default function KnowledgeGraph({state, lang}: {state: SystemState; lang: 'pt-BR' | 'en'}) {
  const pt = lang === 'pt-BR';
  const k = useMemo(() => buildKnowledge(state), [state]);
  const pos = useMemo(() => layoutKnowledge(k), [k]);
  const dates = useMemo(() => [...new Set(k.claims.map(c => c.date?.slice(0, 10)).filter((d): d is string => !!d))].sort(), [k]);
  const [day, setDay] = useState(dates.length);
  const at = day >= dates.length ? null : dates[day] ?? null;
  const [source, setSource] = useState<SourceFilter>('all');
  const [roadmap, setRoadmap] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const fit = useMemo(() => { const ps = [...pos.values()]; if (!ps.length) return {x: 0, y: 0, w: 1400, h: 820};
    const x0 = Math.min(...ps.map(p => p.x - 160)), x1 = Math.max(...ps.map(p => p.x + 160)), y0 = Math.min(...ps.map(p => p.y - 90)), y1 = Math.max(...ps.map(p => p.y + 60));
    return {x: x0, y: y0, w: x1 - x0, h: y1 - y0}; }, [pos]);
  const [view, setView] = useState(fit);
  const drag = useRef<{x: number; y: number} | null>(null);

  const roadmaps = [...new Set(k.hypotheses.map(h => h.roadmap).filter((r): r is string => !!r))].sort();
  const hypothesisVisible = (id: string) => roadmap === 'all' || k.hypotheses.find(h => h.id === id)?.roadmap === roadmap;
  const conflicted = new Set(k.hypotheses.filter(h => { const s = scoreHypothesis(k.claims, h.id, at); return s.pro > 0 && s.con > 0; }).map(h => h.id));
  const claimVisible = (c: KClaim) => (!at || !c.date || c.date.slice(0, 10) <= at) && c.links.some(l => hypothesisVisible(l.hypothesis))
    && (source === 'all' || (source === 'conflicts' ? c.links.some(l => conflicted.has(l.hypothesis)) : c.source === source));

  const onWheel = (e: WheelEvent<SVGSVGElement>) => { const f = e.deltaY > 0 ? 1.1 : 0.9; setView(v => ({x: v.x + v.w * (1 - f) / 2, y: v.y + v.h * (1 - f) / 2, w: v.w * f, h: v.h * f})); };
  const onDown = (e: PointerEvent<SVGSVGElement>) => { drag.current = {x: e.clientX, y: e.clientY}; };
  const onMove = (e: PointerEvent<SVGSVGElement>) => { if (!drag.current) return; const d = drag.current; drag.current = {x: e.clientX, y: e.clientY}; const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(), u = Math.max(view.w / r.width, view.h / r.height); setView(v => ({...v, x: v.x - (e.clientX - d.x) * u, y: v.y - (e.clientY - d.y) * u})); };

  const sel = selected ? k.claims.find(c => c.id === selected) ?? k.hypotheses.find(h => h.id === selected) ?? k.questions.find(q => q.id === selected) : null;
  const empty = !k.hypotheses.length;

  return <main className="kg" aria-label={pt ? 'Grafo de conhecimento' : 'Knowledge graph'}>
    <div className="kg-tools">
      <h1 data-private-heading tabIndex={-1}>{pt ? 'Conhecimento' : 'Knowledge'}</h1>
      <label>{pt ? 'Fonte' : 'Source'} <select value={source} onChange={e => setSource(e.target.value as SourceFilter)}>
        <option value="all">{pt ? 'Tudo' : 'All'}</option><option value="LITERATURE">{pt ? 'Literatura' : 'Literature'}</option>
        <option value="NEXO">NEXO</option><option value="conflicts">{pt ? 'Só conflitos' : 'Conflicts only'}</option></select></label>
      {roadmaps.length > 0 && <label>Roadmap <select value={roadmap} onChange={e => setRoadmap(e.target.value)}><option value="all">{pt ? 'Todos' : 'All'}</option>{roadmaps.map(r => <option key={r}>{r}</option>)}</select></label>}
      {dates.length > 1 && <label className="kg-time">{pt ? 'Estado em' : 'State at'} <input type="range" min={0} max={dates.length} value={day} onChange={e => setDay(Number(e.target.value))}/><span>{at ?? (pt ? 'hoje' : 'today')}</span></label>}
      <button type="button" className="pw-button kg-fit" onClick={() => setView(fit)}>{pt ? 'Enquadrar' : 'Fit'}</button>
      <a className="kg-cosmos" href="#/teia/cosmos">{pt ? 'Teia cósmica' : 'Cosmic web'}</a>
    </div>
    {empty ? <p className="kg-empty">{pt ? 'A fonte ainda não tem hipóteses registradas. O grafo aparece quando a Tower tiver HYPOTHESIS e CLAIM.' : 'The source has no hypotheses yet.'}</p> :
    <svg className="kg-canvas" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }} role="img" aria-label={pt ? 'Grafo de perguntas, hipóteses e evidências' : 'Graph of questions, hypotheses and evidence'}>
      {k.hypotheses.filter(h => hypothesisVisible(h.id)).map(h => { const a = pos.get(`h:${h.id}`), q = h.question ? pos.get(`q:${h.question}`) : null; return a && q ? <line key={`qh${h.id}`} className="kg-edge-q" x1={q.x} y1={q.y} x2={a.x} y2={a.y}/> : null; })}
      {k.claims.filter(claimVisible).flatMap(c => c.links.filter(l => hypothesisVisible(l.hypothesis)).map(l => { const a = pos.get(`c:${c.id}`), b = pos.get(`h:${l.hypothesis}`); return a && b ? <line key={`${c.id}${l.hypothesis}`} className={`kg-edge ${l.stance === 'SUPPORTS' ? 'pro' : 'con'}`} strokeWidth={1 + c.weight * 4} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/> : null; }))}
      {k.questions.map(q => { const p = pos.get(`q:${q.id}`); return p ? <g key={q.id} className="kg-node kg-q" transform={`translate(${p.x},${p.y})`} onClick={() => setSelected(q.id)}><rect x={-140} y={-p.r} width={280} height={p.r * 2} rx={8}/><text dy="0.35em">{clip(q.label, 40)}</text></g> : null; })}
      {k.hypotheses.filter(h => hypothesisVisible(h.id)).map(h => { const p = pos.get(`h:${h.id}`); if (!p) return null; const s = scoreHypothesis(k.claims, h.id, at), total = s.pro + s.con || 1;
        return <g key={h.id} className={`kg-node kg-h ${STATUS_CLASS[h.status] ?? 'open'}`} transform={`translate(${p.x},${p.y})`} onClick={() => setSelected(h.id)}>
          <circle r={p.r}/><text dy={-p.r - 22}>{clip(h.label, 34)}</text>
          <g transform={`translate(-40,${-p.r - 14})`}><rect className="kg-bar-con" width={80} height={6}/><rect className="kg-bar-pro" width={80 * s.pro / total} height={6}/></g></g>; })}
      {k.claims.filter(claimVisible).map(c => { const p = pos.get(`c:${c.id}`); if (!p) return null;
        return <g key={c.id} className={`kg-node kg-c ${c.source === 'NEXO' ? 'nexo' : 'lit'} ${c.survived ? 'survived' : ''} ${selected === c.id ? 'sel' : ''}`} transform={`translate(${p.x},${p.y})`} onClick={() => setSelected(c.id)}>
          {c.source === 'NEXO' ? <rect x={-p.r} y={-p.r} width={p.r * 2} height={p.r * 2}/> : <circle r={p.r}/>}
          {c.tier && <text className="kg-tier" dy="0.35em">{c.tier}</text>}</g>; })}
    </svg>}
    {!empty && <aside className="kg-legend"><span className="pro">{pt ? 'apoia' : 'supports'}</span><span className="con">{pt ? 'contradiz' : 'contradicts'}</span><span>● {pt ? 'literatura (A/B/C = nível)' : 'literature (A/B/C tier)'}</span><span>■ NEXO ({pt ? 'contorno cheio = passou no refutador' : 'solid = survived refuter'})</span></aside>}
    {sel && <aside className="kg-panel" aria-live="polite"><button type="button" className="pw-button" onClick={() => setSelected(null)}>×</button><Inspector item={sel} k={k} at={at} pt={pt}/></aside>}
  </main>;
}

function Inspector({item, k, at, pt}: {item: object; k: ReturnType<typeof buildKnowledge>; at: string | null; pt: boolean}) {
  if ('weight' in item) { const c = item as KClaim; return <><p className="pw-eyebrow">{c.source === 'NEXO' ? 'NEXO' : pt ? 'Literatura' : 'Literature'}</p><h2>{c.label}</h2>
    <dl>{c.value && <><dt>{pt ? 'Valor' : 'Value'}</dt><dd>{c.value}</dd></>}{c.ref && <><dt>Ref</dt><dd>{c.ref}</dd></>}{c.journal && <><dt>{pt ? 'Revista' : 'Journal'}</dt><dd>{c.journal}{c.tier ? ` (${c.tier})` : ''}</dd></>}
      <dt>{pt ? 'Peso' : 'Weight'}</dt><dd>{c.weight.toFixed(2)}</dd><dt>{pt ? 'Dados' : 'Data'}</dt><dd>{c.lineage.join(', ') || '—'}</dd>{c.date && <><dt>{pt ? 'Data' : 'Date'}</dt><dd>{c.date.slice(0, 10)}</dd></>}
      <dt>{pt ? 'Ligações' : 'Links'}</dt><dd>{c.links.map(l => `${l.stance === 'SUPPORTS' ? '+' : '−'} ${l.hypothesis}`).join('\n')}</dd></dl></>; }
  if ('status' in item) { const h = item as {id: string; label: string; status: string}; const s = scoreHypothesis(k.claims, h.id, at);
    return <><p className="pw-eyebrow">{pt ? 'Hipótese' : 'Hypothesis'} · {h.status}</p><h2>{h.label}</h2><dl><dt>{pt ? 'A favor' : 'For'}</dt><dd>{s.pro.toFixed(2)}</dd><dt>{pt ? 'Contra' : 'Against'}</dt><dd>{s.con.toFixed(2)}</dd><dt>{pt ? 'Linhagens independentes' : 'Independent lineages'}</dt><dd>{s.lineages}</dd></dl></>; }
  const q = item as {label: string}; return <><p className="pw-eyebrow">{pt ? 'Pergunta' : 'Question'}</p><h2>{q.label}</h2></>;
}
const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
