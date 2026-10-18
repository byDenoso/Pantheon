import {useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent} from 'react';
import type {SystemState} from '../contracts/system.ts';
import {buildKnowledge, layoutKnowledge, scoreHypothesis, type KClaim} from './model.ts';
import './knowledge.css';

type SourceFilter = 'all' | 'LITERATURE' | 'NEXO' | 'conflicts';
const STATUS_CLASS: Record<string, string> = {PROMOTED: 'promoted', ACTIVE: 'active', READY: 'active', KILLED: 'dead', REJECTED: 'dead', PARKED: 'parked', SUPERSEDED: 'parked', INCONCLUSIVE: 'open'};
type View = {x: number; y: number; w: number; h: number};
type Pt = {x: number; y: number};
const NARROW = '(max-width: 600px)';
const narrowNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches;
const bbox = (ps: Pt[], pad = 1): View => { if (!ps.length) return {x: 0, y: 0, w: 1400, h: 820};
  const x0 = Math.min(...ps.map(p => p.x)) - 130 * pad, x1 = Math.max(...ps.map(p => p.x)) + 130 * pad, y0 = Math.min(...ps.map(p => p.y)) - 80 * pad, y1 = Math.max(...ps.map(p => p.y)) + 50 * pad;
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0}; };
const zoomAt = (v: View, sx: number, sy: number, f: number): View => ({x: sx - (sx - v.x) * f, y: sy - (sy - v.y) * f, w: v.w * f, h: v.h * f});
/** Gentle quadratic curve between two points; bend is a fraction of the chord. */
const curve = (a: Pt, b: Pt, bend = 0.12) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)}Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`; };

/** Read-only logical graph of questions, hypotheses and weighted claims. */
export default function KnowledgeGraph({state, lang}: {state: SystemState; lang: 'pt-BR' | 'en'}) {
  const pt = lang === 'pt-BR';
  const k = useMemo(() => buildKnowledge(state), [state]);
  const [compact, setCompact] = useState(narrowNow);
  useEffect(() => { const m = window.matchMedia?.(NARROW); if (!m) return; const on = () => setCompact(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  const pos = useMemo(() => layoutKnowledge(k, {compact}), [k, compact]);
  const dates = useMemo(() => [...new Set(k.claims.map(c => c.date?.slice(0, 10)).filter((d): d is string => !!d))].sort(), [k]);
  const [day, setDay] = useState(dates.length);
  const at = day >= dates.length ? null : dates[day] ?? null;
  const [source, setSource] = useState<SourceFilter>('all');
  const [roadmap, setRoadmap] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const fit = useMemo(() => bbox([...pos.values()]), [pos]);
  /** On narrow screens open on the first question group so labels stay legible. */
  const start = useMemo(() => { if (!compact) return fit; const q = k.hypotheses[0]?.question ?? '∅';
    const ids = new Set([q, ...k.hypotheses.filter(h => (h.question ?? '∅') === q).map(h => h.id)]);
    return bbox([...pos.values()].filter(p => ids.has(p.id) || (p.kind === 'claim' && ids.has(k.claims.find(c => c.id === p.id)?.links[0]?.hypothesis ?? '')))); }, [pos, compact, fit, k]);
  const [view, setView] = useState(start);
  useEffect(() => setView(start), [start]);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Pt>());
  const moved = useRef(0);

  /** Neighbourhood of each node: itself, its question, its hypotheses and their claims. */
  const near = useMemo(() => { const m = new Map<string, Set<string>>(); const get = (id: string) => m.get(id) ?? m.set(id, new Set([id])).get(id)!;
    for (const h of k.hypotheses) { const s = get(h.id); if (h.question) { s.add(h.question); get(h.question).add(h.id); } }
    for (const c of k.claims) for (const l of c.links) { get(c.id).add(l.hypothesis); get(l.hypothesis).add(c.id);
      const q = k.hypotheses.find(h => h.id === l.hypothesis)?.question; if (q) { get(c.id).add(q); get(q).add(c.id); } }
    return m; }, [k]);
  const focus = hover ?? selected;
  const lit = focus ? near.get(focus) ?? new Set([focus]) : null;
  const on = (...ids: string[]) => !lit || ids.every(id => lit.has(id));

  const roadmaps = [...new Set(k.hypotheses.map(h => h.roadmap).filter((r): r is string => !!r))].sort();
  const hypothesisVisible = (id: string) => roadmap === 'all' || k.hypotheses.find(h => h.id === id)?.roadmap === roadmap;
  const conflicted = new Set(k.hypotheses.filter(h => { const s = scoreHypothesis(k.claims, h.id, at); return s.pro > 0 && s.con > 0; }).map(h => h.id));
  const claimVisible = (c: KClaim) => (!at || !c.date || c.date.slice(0, 10) <= at) && c.links.some(l => hypothesisVisible(l.hypothesis))
    && (source === 'all' || (source === 'conflicts' ? c.links.some(l => conflicted.has(l.hypothesis)) : c.source === source));

  const toSvg = (cx: number, cy: number, v: View) => { const r = svg.current!.getBoundingClientRect(), u = Math.max(v.w / r.width, v.h / r.height);
    return {x: v.x + (cx - r.left - (r.width - v.w / u) / 2) * u, y: v.y + (cy - r.top - (r.height - v.h / u) / 2) * u, u}; };
  const onWheel = (e: WheelEvent<SVGSVGElement>) => { const f = e.deltaY > 0 ? 1.1 : 0.9; setView(v => { const p = toSvg(e.clientX, e.clientY, v); return zoomAt(v, p.x, p.y, f); }); };
  const onDown = (e: PointerEvent<SVGSVGElement>) => { pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pointers.current.size === 1) moved.current = 0; };
  const onMove = (e: PointerEvent<SVGSVGElement>) => { const ps = pointers.current, prev = ps.get(e.pointerId); if (!prev) return;
    const other = [...ps.entries()].find(([id]) => id !== e.pointerId)?.[1]; ps.set(e.pointerId, {x: e.clientX, y: e.clientY});
    moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    if (other) { const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0 && d1 > 0) setView(v => { const m = toSvg((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, v); return zoomAt(v, m.x, m.y, d0 / d1); }); return; }
    setView(v => { const u = toSvg(0, 0, v).u; return {...v, x: v.x - (e.clientX - prev.x) * u, y: v.y - (e.clientY - prev.y) * u}; }); };
  const onUp = (e: PointerEvent<SVGSVGElement>) => { pointers.current.delete(e.pointerId); };
  const node = (id: string) => ({onClick: () => setSelected(id), onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(id); }, onPointerLeave: () => setHover(null)});

  const sel = selected ? k.claims.find(c => c.id === selected) ?? k.hypotheses.find(h => h.id === selected) ?? k.questions.find(q => q.id === selected) : null;
  const empty = !k.hypotheses.length;
  const hs = k.hypotheses.filter(h => hypothesisVisible(h.id)), cs = k.claims.filter(claimVisible);
  const orbit = compact ? 150 : 200;

  return <main className={`kg${compact ? ' kg-compact' : ''}`} aria-label={pt ? 'Grafo de conhecimento' : 'Knowledge graph'}>
    <div className="kg-tools">
      <h1 data-private-heading tabIndex={-1}>{pt ? 'Conhecimento' : 'Knowledge'}</h1>
      <label>{pt ? 'Fonte' : 'Source'} <select value={source} onChange={e => setSource(e.target.value as SourceFilter)}>
        <option value="all">{pt ? 'Tudo' : 'All'}</option><option value="LITERATURE">{pt ? 'Literatura' : 'Literature'}</option>
        <option value="NEXO">NEXO</option><option value="conflicts">{pt ? 'Só conflitos' : 'Conflicts only'}</option></select></label>
      {roadmaps.length > 0 && <label>Roadmap <select value={roadmap} onChange={e => setRoadmap(e.target.value)}><option value="all">{pt ? 'Todos' : 'All'}</option>{roadmaps.map(r => <option key={r}>{r}</option>)}</select></label>}
      {dates.length > 1 && <label className="kg-time"><span className="kg-time-label">{pt ? 'Estado em' : 'State at'}</span><input type="range" min={0} max={dates.length} value={day} onChange={e => setDay(Number(e.target.value))}/><span className="kg-time-value">{at ?? (pt ? 'hoje' : 'today')}</span></label>}
      <span className="kg-actions"><button type="button" className="pw-button kg-fit" onClick={() => setView(fit)}>{pt ? 'Enquadrar' : 'Fit'}</button>
        <a className="kg-cosmos" href="#/teia/cosmos">{pt ? 'Teia cósmica' : 'Cosmic web'}</a></span>
    </div>
    {empty ? <p className="kg-empty">{pt ? 'A fonte ainda não tem hipóteses registradas. O grafo aparece quando a Tower tiver HYPOTHESIS e CLAIM.' : 'The source has no hypotheses yet.'}</p> :
    <svg ref={svg} className={`kg-canvas${lit ? ' kg-focus' : ''}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
      onClickCapture={e => { if (moved.current > 6) e.stopPropagation(); }} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }} role="img" aria-label={pt ? 'Grafo de perguntas, hipóteses e evidências' : 'Graph of questions, hypotheses and evidence'}>
      <defs>
        <filter id="kg-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="kg-halo"><stop offset="0" className="kg-halo-in"/><stop offset="0.55" className="kg-halo-mid"/><stop offset="1" className="kg-halo-out"/></radialGradient>
      </defs>
      {k.questions.map(q => { const p = pos.get(`q:${q.id}`); return p ? <g key={`bg${q.id}`} className="kg-bg"><circle cx={p.x} cy={p.y} r={orbit * 1.7} fill="url(#kg-halo)"/><circle className="kg-orbit" cx={p.x} cy={p.y} r={orbit}/></g> : null; })}
      {hs.map(h => { const a = pos.get(`h:${h.id}`), q = h.question ? pos.get(`q:${h.question}`) : null; return a && q ? <path key={`qh${h.id}`} className={`kg-edge-q${lit && on(h.id, h.question!) ? ' on' : ''}`} d={curve(q, a, 0.08)}/> : null; })}
      {cs.flatMap(c => c.links.filter(l => hypothesisVisible(l.hypothesis)).map(l => { const a = pos.get(`c:${c.id}`), b = pos.get(`h:${l.hypothesis}`);
        return a && b ? <path key={`${c.id}${l.hypothesis}`} className={`kg-edge ${l.stance === 'SUPPORTS' ? 'pro' : 'con'}${lit && on(c.id, l.hypothesis) ? ' on' : ''}`} style={{'--w': (0.25 + c.weight * 0.55).toFixed(2)} as CSSProperties} strokeWidth={0.8 + c.weight * 2.2} d={curve(b, a, l === c.links[0] ? 0.1 : 0.05)}/> : null; }))}
      {k.questions.map(q => { const p = pos.get(`q:${q.id}`); if (!p) return null; const lines = wrap(q.label, compact ? 24 : 30, 2);
        return <g key={q.id} className={`kg-node kg-q${lit && !on(q.id) ? ' off' : ''}${selected === q.id ? ' sel' : ''}`} transform={`translate(${p.x},${p.y})`} {...node(q.id)}>
          <circle className="kg-core" r={p.r} filter="url(#kg-glow)"/><circle className="kg-core-ring" r={p.r + 8}/>
          <text className="kg-label" y={-p.r - 20 - (lines.length - 1) * 18}>{lines.map((t, i) => <tspan key={i} x={0} dy={i ? 18 : 0}>{t}</tspan>)}</text><title>{q.label}</title></g>; })}
      {cs.map(c => { const p = pos.get(`c:${c.id}`); if (!p) return null;
        return <g key={c.id} className={`kg-node kg-c ${c.source === 'NEXO' ? 'nexo' : 'lit'}${c.survived ? ' survived' : ''}${selected === c.id ? ' sel' : ''}${lit && !on(c.id) ? ' off' : ''}`} transform={`translate(${p.x},${p.y})`} {...node(c.id)}>
          <circle className="kg-hit" r={Math.max(p.r + 6, 12)}/>
          {c.source === 'NEXO' ? <rect x={-p.r * 0.85} y={-p.r * 0.85} width={p.r * 1.7} height={p.r * 1.7} rx={1.5} transform="rotate(45)"/> : <circle r={p.r}/>}
          {c.tier && <text className="kg-tier" dy={p.r + 11}>{c.tier}</text>}<title>{c.label}</title></g>; })}
      {hs.map(h => { const p = pos.get(`h:${h.id}`); if (!p) return null; const s = scoreHypothesis(k.claims, h.id, at), total = s.pro + s.con || 1, W = 44;
        return <g key={h.id} className={`kg-node kg-h ${STATUS_CLASS[h.status] ?? 'open'}${lit && !on(h.id) ? ' off' : ''}${selected === h.id ? ' sel' : ''}`} transform={`translate(${p.x},${p.y})`} {...node(h.id)}>
          <circle className="kg-h-glow" r={p.r} filter="url(#kg-glow)"/><circle className="kg-h-body" r={p.r}/><circle className="kg-h-core" r={4}/>
          <g transform={`translate(${-W / 2},${-p.r - 12})`}><rect className="kg-bar-track" width={W} height={3} rx={1.5}/>
            {s.pro + s.con > 0 && <><rect className="kg-bar-pro" width={W * s.pro / total} height={3} rx={1.5}/><rect className="kg-bar-con" x={W * s.pro / total} width={W * s.con / total} height={3} rx={1.5}/></>}</g>
          <text className="kg-label" y={p.r + 20}>{clip(h.label, compact ? 22 : 26)}</text><title>{h.label}</title></g>; })}
    </svg>}
    {!empty && <aside className="kg-legend"><span className="pro"><i/>{pt ? 'apoia' : 'supports'}</span><span className="con"><i/>{pt ? 'contradiz' : 'contradicts'}</span><span><b className="dot"/>{pt ? 'literatura · A/B/C' : 'literature · A/B/C'}</span><span><b className="dia"/>NEXO{pt ? ' · cheio = sobreviveu' : ' · solid = survived'}</span></aside>}
    {sel && <aside className="kg-panel" aria-live="polite"><button type="button" className="pw-button" aria-label={pt ? 'Fechar' : 'Close'} onClick={() => setSelected(null)}>×</button><Inspector item={sel} k={k} at={at} pt={pt}/></aside>}
  </main>;
}

function Inspector({item, k, at, pt}: {item: object; k: ReturnType<typeof buildKnowledge>; at: string | null; pt: boolean}) {
  if ('weight' in item) { const c = item as KClaim; return <><p className="pw-eyebrow">{c.source === 'NEXO' ? 'NEXO' : pt ? 'Literatura' : 'Literature'}</p><h2>{c.label}</h2>
    <dl>{c.value && <><dt>{pt ? 'Valor' : 'Value'}</dt><dd>{c.value}</dd></>}{c.ref && <><dt>Ref</dt><dd>{c.ref}</dd></>}{c.journal && <><dt>{pt ? 'Revista' : 'Journal'}</dt><dd>{c.journal}{c.tier ? ` (${c.tier})` : ''}</dd></>}
      <dt>{pt ? 'Peso' : 'Weight'}</dt><dd>{c.weight.toFixed(2)}</dd><dt>{pt ? 'Dados' : 'Data'}</dt><dd>{c.lineage.join(', ') || '—'}</dd>{c.date && <><dt>{pt ? 'Data' : 'Date'}</dt><dd>{c.date.slice(0, 10)}</dd></>}
      <dt>{pt ? 'Ligações' : 'Links'}</dt><dd>{c.links.map(l => `${l.stance === 'SUPPORTS' ? '+' : '−'} ${l.hypothesis}`).join('\n')}</dd></dl></>; }
  if ('status' in item) { const h = item as {id: string; label: string; status: string}; const s = scoreHypothesis(k.claims, h.id, at), total = s.pro + s.con || 1;
    return <><p className="pw-eyebrow">{pt ? 'Hipótese' : 'Hypothesis'} · {h.status}</p><h2>{h.label}</h2>
      <div className="kg-score" aria-hidden="true"><span className="pro" style={{width: `${100 * s.pro / total}%`}}/><span className="con" style={{width: `${100 * s.con / total}%`}}/></div>
      <dl><dt>{pt ? 'A favor' : 'For'}</dt><dd>{s.pro.toFixed(2)}</dd><dt>{pt ? 'Contra' : 'Against'}</dt><dd>{s.con.toFixed(2)}</dd><dt>{pt ? 'Linhagens independentes' : 'Independent lineages'}</dt><dd>{s.lineages}</dd></dl></>; }
  const q = item as {label: string}; return <><p className="pw-eyebrow">{pt ? 'Pergunta' : 'Question'}</p><h2>{q.label}</h2></>;
}
const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
/** Word-wrap into at most `max` lines of about n chars; the overflow is clipped on the last line. */
const wrap = (s: string, n: number, max: number) => { const out: string[] = []; let line = '';
  for (const w of s.split(/\s+/)) { if (line && `${line} ${w}`.length > n) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) out.push(line); return out.length > max ? [...out.slice(0, max - 1), clip(out.slice(max - 1).join(' '), n)] : out; };
