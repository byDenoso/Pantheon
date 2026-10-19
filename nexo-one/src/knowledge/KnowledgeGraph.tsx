import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent} from 'react';
import type {SystemState} from '../contracts/system.ts';
import {buildKnowledge, planKnowledge, PAGE_N, satellites, scoreHypothesis, sceneLabels, TOP_N, type Box, type KClaim, type KHypothesis, type SNode, type Score} from './model.ts';
import './knowledge.css';

type SourceFilter = 'all' | 'LITERATURE' | 'NEXO' | 'conflicts';
const STATUS_CLASS: Record<string, string> = {PROMOTED: 'promoted', ACTIVE: 'active', READY: 'active', KILLED: 'dead', REJECTED: 'dead', PARKED: 'parked', SUPERSEDED: 'parked', INCONCLUSIVE: 'open'};
type View = {tx: number; ty: number; k: number};
type Size = {w: number; h: number};
type Sync = {kq: number; cull: Box};
const NARROW = '(max-width: 600px)';
const narrowNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches;
const DEEP = 1.6; // zoom from which more labels and claims appear
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Gentle quadratic curve between two points; bend is a fraction of the chord. */
const curve = (a: {x: number; y: number}, b: {x: number; y: number}, bend = 0.12) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)}Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`; };
const fmt = (s: Score) => `+${s.pro.toFixed(1)} −${s.con.toFixed(1)}`;

/** Read-only logical graph of questions, hypotheses and weighted claims, with progressive disclosure. */
export default function KnowledgeGraph({state, lang}: {state: SystemState; lang: 'pt-BR' | 'en'}) {
  const pt = lang === 'pt-BR';
  const k = useMemo(() => buildKnowledge(state), [state]);
  const [compact, setCompact] = useState(narrowNow);
  useEffect(() => { const m = window.matchMedia?.(NARROW); if (!m) return; const on = () => setCompact(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  const dates = useMemo(() => [...new Set(k.claims.map(c => c.date?.slice(0, 10)).filter((d): d is string => !!d))].sort(), [k]);
  const [day, setDay] = useState(dates.length);
  const at = day >= dates.length ? null : dates[day] ?? null;
  const [source, setSource] = useState<SourceFilter>('all');
  const [roadmap, setRoadmap] = useState('all');
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pages, setPages] = useState<ReadonlyMap<string, number>>(new Map());
  const [tray, setTray] = useState(false);
  const [size, setSize] = useState<Size & {ready: boolean}>({w: 1200, h: 700, ready: false});
  const [sync, setSync] = useState<Sync>({kq: 1, cull: {x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5}});

  // ---- derived data ------------------------------------------------------------------------------------------------
  const hypById = useMemo(() => new Map(k.hypotheses.map(h => [h.id, h])), [k]);
  const claimById = useMemo(() => new Map(k.claims.map(c => [c.id, c])), [k]);
  const roadmaps = useMemo(() => [...new Set(k.hypotheses.map(h => h.roadmap).filter((r): r is string => !!r))].sort(), [k]);
  const scores = useMemo(() => new Map(k.hypotheses.map(h => [h.id, scoreHypothesis(k.claims, h.id, at)])), [k, at]);
  const score = useCallback((id: string) => scores.get(id) ?? {pro: 0, con: 0, lineages: 0}, [scores]);
  const conflicted = useMemo(() => new Set([...scores].filter(([, s]) => s.pro > 0 && s.con > 0).map(([id]) => id)), [scores]);
  const roadmapOk = useCallback((id: string) => roadmap === 'all' || hypById.get(id)?.roadmap === roadmap, [roadmap, hypById]);
  const claimOk = useCallback((c: KClaim) => (!at || !c.date || c.date.slice(0, 10) <= at) && c.links.some(l => roadmapOk(l.hypothesis))
    && (source === 'all' || (source === 'conflicts' ? c.links.some(l => conflicted.has(l.hypothesis)) : c.source === source)), [at, roadmapOk, source, conflicted]);
  const byHyp = useMemo(() => { const m = new Map<string, KClaim[]>(); for (const c of k.claims) if (claimOk(c)) for (const l of c.links) { const a = m.get(l.hypothesis); if (a) a.push(c); else m.set(l.hypothesis, [c]); }
    for (const a of m.values()) a.sort((x, y) => y.weight - x.weight || (x.id < y.id ? -1 : 1)); return m; }, [k, claimOk]);
  const hypothesisOk = useCallback((h: KHypothesis) => roadmapOk(h.id) && (!onlyEvidence || (byHyp.get(h.id)?.length ?? 0) > 0), [roadmapOk, onlyEvidence, byHyp]);

  const aspect = size.w / size.h;
  const scene = useMemo(() => planKnowledge(k, {aspect, compact, expanded, pages, tray, hypothesis: hypothesisOk, claim: claimOk, score,
    noQuestion: pt ? 'Sem pergunta' : 'No question', trayLabel: pt ? 'Outras perguntas' : 'Other questions'}), [k, aspect, compact, expanded, pages, tray, hypothesisOk, claimOk, score, pt]);
  const sceneRef = useRef(scene); sceneRef.current = scene;

  // ---- search ------------------------------------------------------------------------------------------------------
  useEffect(() => { const t = setTimeout(() => setQ(query), 180); return () => clearTimeout(t); }, [query]);
  const index = useMemo(() => ({hyps: k.hypotheses.map(h => [h.id, norm(`${h.id} ${h.label}`)] as const), claims: k.claims.map(c => [c, norm(`${c.id} ${c.label} ${c.ref ?? ''} ${c.value ?? ''}`)] as const)}), [k]);
  const hits = useMemo(() => { const n = norm(q.trim()); if (n.length < 2) return null; const hyps = new Set<string>();
    for (const [id, t] of index.hyps) if (t.includes(n)) hyps.add(id);
    for (const [c, t] of index.claims) if (t.includes(n)) for (const l of c.links) hyps.add(l.hypothesis);
    return hyps; }, [q, index]);

  // ---- viewport: a ref plus a DOM transform, so panning never touches React state -----------------------------------
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const view = useRef<View>({tx: 0, ty: 0, k: 1});
  const pointers = useRef(new Map<number, {x: number; y: number}>());
  const moved = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | null>(null);
  const pendingBox = useRef<string | null>(null); // 'tray' or a group id: zoom there once the scene has been replanned
  const apply = () => { const v = view.current; world.current?.setAttribute('transform', `translate(${v.tx.toFixed(2)} ${v.ty.toFixed(2)}) scale(${v.k.toFixed(4)})`); svg.current?.style.setProperty('--inv', (1 / v.k).toFixed(4)); };
  const commit = useCallback(() => { const v = view.current, pad = 160 / v.k, kq = Math.max(0.0625, Math.round(v.k * 16) / 16);
    const cull = {x0: Math.floor((-v.tx / v.k - pad) / 80) * 80, y0: Math.floor((-v.ty / v.k - pad) / 80) * 80, x1: Math.ceil(((size.w - v.tx) / v.k + pad) / 80) * 80, y1: Math.ceil(((size.h - v.ty) / v.k + pad) / 80) * 80};
    setSync(p => p.kq === kq && p.cull.x0 === cull.x0 && p.cull.y0 === cull.y0 && p.cull.x1 === cull.x1 && p.cull.y1 === cull.y1 ? p : {kq, cull}); }, [size]);
  const later = () => { clearTimeout(timer.current); timer.current = setTimeout(commit, 120); };
  useLayoutEffect(apply);
  useEffect(() => () => clearTimeout(timer.current), []);
  const zoomBox = useCallback((b: Box, pad = 24, max = 3) => { const vh = size.h - (compact ? 96 : 52), /* room kept free for the legend */ kk = clamp(Math.min((size.w - 2 * pad) / (b.x1 - b.x0), (vh - 2 * pad) / (b.y1 - b.y0)), 0.06, max);
    view.current = {k: kk, tx: size.w / 2 - kk * (b.x0 + b.x1) / 2, ty: vh / 2 - kk * (b.y0 + b.y1) / 2}; apply(); commit(); }, [size, commit, compact]);
  const fit = useCallback(() => zoomBox(scene.box, 14, 1.4), [zoomBox, scene.box]);
  const empty = !k.hypotheses.length;

  useEffect(() => { const el = svg.current; if (!el) return; const measure = () => { const r = el.getBoundingClientRect(); if (r.width > 40 && r.height > 40) setSize(p => p.ready && Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : {w: r.width, h: r.height, ready: true}); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect(); }, [empty]);
  const first = useRef(true);
  useEffect(() => { if (empty || !size.ready || !first.current) return; first.current = false; if (compact && scene.groups[0]) zoomBox(scene.groups[0].box, 8, 1.3); else fit(); }, [size.ready, empty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const pb = pendingBox.current;
    if (pb) { const bs = pb === 'tray' ? [...scene.groups.filter(g => g.tray).map(g => g.box), ...(scene.tray ? [scene.tray.box] : [])] : scene.groups.filter(g => g.id === pb).map(g => g.box);
      if (bs.length) { pendingBox.current = null; zoomBox({x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1))}, 16, 2.4); return; } }
    const id = pending.current, n = id ? scene.nodes.get(`h:${id}`) : null; if (!id || !n) return; pending.current = null;
    zoomBox({x0: n.x - 190, y0: n.y - 130, x1: n.x + 190, y1: n.y + 130}, 16, 1.45); }, [scene, zoomBox]);

  const zoomAround = (sx: number, sy: number, f: number) => { const v = view.current, kk = clamp(v.k * f, 0.06, 8), r = kk / v.k; view.current = {k: kk, tx: sx - (sx - v.tx) * r, ty: sy - (sy - v.ty) * r}; apply(); };
  useEffect(() => { const el = svg.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAround(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.04 : 0.0011))); later(); };
    el.addEventListener('wheel', onWheel, {passive: false}); return () => el.removeEventListener('wheel', onWheel); }, [empty, commit]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e: PointerEvent<SVGSVGElement>) => { pointers.current.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pointers.current.size === 1) moved.current = 0; };
  const onMove = (e: PointerEvent<SVGSVGElement>) => { const ps = pointers.current, prev = ps.get(e.pointerId); if (!prev) return;
    const other = [...ps.entries()].find(([id]) => id !== e.pointerId)?.[1]; ps.set(e.pointerId, {x: e.clientX, y: e.clientY});
    moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    if (other) { const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y), r = svg.current!.getBoundingClientRect();
      if (d0 > 0 && d1 > 0) zoomAround((e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top, d1 / d0); }
    else { view.current = {...view.current, tx: view.current.tx + e.clientX - prev.x, ty: view.current.ty + e.clientY - prev.y}; apply(); } };
  const onUp = (e: PointerEvent<SVGSVGElement>) => { if (pointers.current.delete(e.pointerId) && moved.current > 0) commit(); };

  // ---- actions -----------------------------------------------------------------------------------------------------
  const reveal = useCallback((id: string) => { const w = sceneRef.current.where.get(id); if (!w) return;
    if (w.inTray) setTray(true);
    if (w.restIndex >= 0) { setExpanded(p => new Set(p).add(w.group)); setPages(p => new Map(p).set(w.group, Math.floor(w.restIndex / PAGE_N))); }
    pending.current = id; setSelected(id); }, []);
  useEffect(() => { if (!hits || !hits.size) return; const ex = new Set<string>(), pg = new Map<string, number>(); let tr = false, firstHit: string | null = null;
    [...hits].slice(0, 6).forEach(id => { const w = sceneRef.current.where.get(id); if (!w) return; firstHit ??= id; if (w.inTray) tr = true;
      if (w.restIndex >= 0) { ex.add(w.group); if (!pg.has(w.group)) pg.set(w.group, Math.floor(w.restIndex / PAGE_N)); } });
    if (tr) setTray(true);
    if (ex.size) { setExpanded(p => new Set([...p, ...ex])); setPages(p => new Map([...p, ...pg])); }
    setSelected(null); pending.current = firstHit;
    if (firstHit && !ex.size && !tr) { const n = sceneRef.current.nodes.get(`h:${firstHit}`); if (n) { pending.current = null; zoomBox({x0: n.x - 190, y0: n.y - 130, x1: n.x + 190, y1: n.y + 130}, 16, 1.45); } }
  }, [hits]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleGroup = (g: string) => setExpanded(p => { const n = new Set(p); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const nextPage = (g: string) => { const gr = scene.groups.find(x => x.id === g); if (gr) setPages(p => new Map(p).set(g, (gr.page + 1) % gr.pages)); };
  const act = (n: SNode) => { if (n.kind === 'cluster') { if (!expanded.has(n.group)) pendingBox.current = n.group; toggleGroup(n.group); setSelected(`k:${n.group}`); } else if (n.kind === 'pager') nextPage(n.group);
    else if (n.kind === 'tray') { if (!tray) pendingBox.current = 'tray'; setTray(t => !t); } else setSelected(n.id); };

  // ---- focus / dimming ---------------------------------------------------------------------------------------------
  const near = useMemo(() => { const m = new Map<string, Set<string>>(); const get = (id: string) => m.get(id) ?? m.set(id, new Set([id])).get(id)!;
    for (const h of k.hypotheses) { const s = get(h.id); if (h.question) { s.add(h.question); get(h.question).add(h.id); } }
    for (const c of k.claims) for (const l of c.links) { get(c.id).add(l.hypothesis); get(l.hypothesis).add(c.id); const qq = hypById.get(l.hypothesis)?.question; if (qq) { get(c.id).add(qq); get(qq).add(c.id); } }
    return m; }, [k, hypById]);
  const focus = hover ?? selected;
  const lit = useMemo(() => { if (focus && near.has(focus)) return near.get(focus)!;
    if (hits) { const s = new Set<string>(); for (const id of hits) { s.add(id); const qq = hypById.get(id)?.question; if (qq) s.add(qq); } return s; } return null; }, [focus, near, hits, hypById]);
  const on = (...ids: string[]) => !lit || ids.every(id => lit.has(id));
  const hypFocus = selected && hypById.has(selected) ? selected : null;
  const hoverHyp = hover && hover !== hypFocus && hypById.has(hover) ? hover : null;

  // ---- satellites for focus and deep zoom; labels placed at the current zoom ---------------------------------------
  const deep = sync.kq >= DEEP;
  const baseIds = useMemo(() => new Set(scene.claims.map(c => c.id)), [scene]);
  const extra = useMemo(() => { const out: SNode[] = [], seen = new Set<string>();
    const put = (id: string, cap: number, skip: ReadonlySet<string>) => { for (const n of satellites(scene, id, byHyp.get(id) ?? [], cap, skip)) if (!seen.has(n.id)) { seen.add(n.id); out.push(n); } };
    if (hypFocus) put(hypFocus, 36, new Set());
    if (hoverHyp) put(hoverHyp, 12, new Set());
    if (deep) for (const g of scene.groups) for (const id of [...g.top, ...g.members]) { if (out.length >= 200) break; const n = scene.nodes.get(`h:${id}`);
      if (!n || id === hypFocus || n.x < sync.cull.x0 || n.x > sync.cull.x1 || n.y < sync.cull.y0 || n.y > sync.cull.y1) continue; put(id, scene.nodes.get(`h:${id}`)!.r > 8 ? 6 : sync.kq >= 3.5 ? 4 : 0, new Set([...baseIds, ...seen])); }
    return out; }, [scene, byHyp, hypFocus, hoverHyp, deep, sync.cull, baseIds]);
  const extraIds = useMemo(() => new Set(extra.map(n => n.id)), [extra]);
  const labelFocus = useMemo(() => { const s = new Set<string>(); if (hypFocus) s.add(hypFocus); if (hoverHyp) s.add(hoverHyp); return s; }, [hypFocus, hoverHyp]);
  const highlight = useMemo(() => hits ? new Set([...hits].slice(0, 40)) : undefined, [hits]);
  const labels = useMemo(() => sceneLabels(k, scene, {scale: sync.kq, compact, lang, deep, focus: labelFocus, highlight, cull: sync.cull, extra}), [k, scene, sync, compact, lang, deep, labelFocus, highlight, extra]);
  const drawnClaims = useMemo(() => [...scene.claims.filter(n => !extraIds.has(n.id)), ...extra].map(n => ({n, c: claimById.get(n.id)})).filter((x): x is {n: SNode; c: KClaim} => !!x.c), [scene, extra, extraIds, claimById]);

  const sel: object | null = !selected ? null : claimById.get(selected) ?? hypById.get(selected) ?? (selected.startsWith('k:') ? {cluster: selected.slice(2)} : selected === 't:tray' ? {tray: true}
    : k.questions.find(x => x.id === selected) ?? (scene.ranked.has(selected) ? {id: selected, label: scene.groups.find(g => g.id === selected)?.label ?? selected} : null));
  const total = scene.groups.reduce((s, g) => s + g.top.length + g.members.length, 0);
  const node = (n: SNode) => ({onClick: () => act(n), onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(n.kind === 'cluster' || n.kind === 'pager' || n.kind === 'tray' ? null : n.id); }, onPointerLeave: () => setHover(null)});
  const label = (n: SNode) => { const l = labels.get(n.key); if (!l) return null;
    return <g key={`l${n.key}`} className="kg-lab" transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}><g className="kg-inv"><text className={`kg-label${l.title ? ' kg-title' : ''}`} textAnchor={l.anchor} x={l.x} y={l.y}>{l.lines.map((t, i) => <tspan key={i} x={l.x} dy={i ? l.size + 3 : 0}>{t}</tspan>)}</text></g></g>; };
  const allHyp = scene.groups.flatMap(g => [...g.top, ...g.members]);

  return <main className={`kg${compact ? ' kg-compact' : ''}`} aria-label={pt ? 'Grafo de conhecimento' : 'Knowledge graph'}>
    <div className="kg-tools">
      <h1 data-private-heading tabIndex={-1}>{pt ? 'Conhecimento' : 'Knowledge'}</h1>
      <label className="kg-search"><span className="kg-sr">{pt ? 'Buscar' : 'Search'}</span><input type="search" value={query} placeholder={pt ? 'Buscar id ou texto' : 'Search id or text'} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}/>
        {hits && <span className="kg-hits" aria-live="polite">{hits.size}</span>}</label>
      <label>{pt ? 'Fonte' : 'Source'} <select value={source} onChange={e => setSource(e.target.value as SourceFilter)}>
        <option value="all">{pt ? 'Tudo' : 'All'}</option><option value="LITERATURE">{pt ? 'Literatura' : 'Literature'}</option>
        <option value="NEXO">NEXO</option><option value="conflicts">{pt ? 'Só conflitos' : 'Conflicts only'}</option></select></label>
      {roadmaps.length > 0 && <label>Roadmap <select value={roadmap} onChange={e => setRoadmap(e.target.value)}><option value="all">{pt ? 'Todos' : 'All'}</option>{roadmaps.map(r => <option key={r}>{r}</option>)}</select></label>}
      <button type="button" className="kg-chip" aria-pressed={onlyEvidence} onClick={() => setOnlyEvidence(v => !v)}>{pt ? 'Só com evidência' : 'With evidence only'}</button>
      {dates.length > 1 && <label className="kg-time"><span className="kg-time-label">{pt ? 'Estado em' : 'State at'}</span><input type="range" min={0} max={dates.length} value={day} onChange={e => setDay(Number(e.target.value))}/><span className="kg-time-value">{at ?? (pt ? 'hoje' : 'today')}</span></label>}
      <span className="kg-actions"><button type="button" className="pw-button kg-fit" onClick={fit}>{pt ? 'Enquadrar' : 'Fit'}</button>
        <a className="kg-cosmos" href="#/teia/cosmos">{pt ? 'Teia cósmica' : 'Cosmic web'}</a></span>
    </div>
    {empty ? <p className="kg-empty">{pt ? 'A fonte ainda não tem hipóteses registradas. O grafo aparece quando a Tower tiver HYPOTHESIS e CLAIM.' : 'The source has no hypotheses yet.'}</p> :
    <svg ref={svg} className={`kg-canvas${lit ? ' kg-focus' : ''}${deep ? ' kg-deep' : ''}`} viewBox={`0 0 ${size.w} ${size.h}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
      onClickCapture={e => { if (moved.current > 6) e.stopPropagation(); }} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }} role="img"
      aria-label={pt ? `Grafo de perguntas, hipóteses e evidências: ${scene.groups.length} perguntas, ${total} de ${k.hypotheses.length} hipóteses desenhadas` : `Graph of questions, hypotheses and evidence: ${scene.groups.length} questions, ${total} of ${k.hypotheses.length} hypotheses drawn`}>
      <defs>
        <filter id="kg-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="kg-halo"><stop offset="0" className="kg-halo-in"/><stop offset="0.55" className="kg-halo-mid"/><stop offset="1" className="kg-halo-out"/></radialGradient>
      </defs>
      <g ref={world}>
        {scene.groups.map(g => <g key={`bg${g.id}`} className="kg-bg">
          <rect className="kg-cell" x={g.box.x0 + 4} y={g.box.y0 + 4} width={g.box.x1 - g.box.x0 - 8} height={g.box.y1 - g.box.y0 - 8} rx={14}/>
          <circle cx={g.hub.x} cy={g.hub.y} r={170} fill="url(#kg-halo)"/></g>)}
        {scene.groups.flatMap(g => [...g.top, ...g.members].map(id => { const a = scene.nodes.get(`h:${id}`); return a ? <path key={`qh${id}`} className={`kg-edge-q${a.r < 8 ? ' m' : ''}${lit && on(id, g.id) ? ' on' : ''}`} d={curve(g.hub, a, 0.08)}/> : null; }))}
        {drawnClaims.flatMap(({n, c}) => c.links.filter(l => l.hypothesis === n.host).map(l => { const b = scene.nodes.get(`h:${l.hypothesis}`);
          return b ? <path key={`${c.id}${l.hypothesis}`} className={`kg-edge ${l.stance === 'SUPPORTS' ? 'pro' : 'con'}${lit && on(c.id, l.hypothesis) ? ' on' : ''}`} style={{'--w': (0.25 + c.weight * 0.55).toFixed(2)} as CSSProperties} strokeWidth={0.8 + c.weight * 2.2} d={curve(b, n, 0.1)}/> : null; }))}
        {scene.groups.map(g => { const p = g.hub; return <g key={g.id} className={`kg-node kg-q${lit && !on(g.id) ? ' off' : ''}${selected === g.id ? ' sel' : ''}`} transform={`translate(${p.x},${p.y})`} {...node(p)} onDoubleClick={() => zoomBox(g.box, 16, 2.4)}>
          <circle className="kg-core" r={p.r} filter="url(#kg-glow)"/><circle className="kg-core-ring" r={p.r + 8}/><title>{g.label}</title></g>; })}
        {scene.groups.map(g => { const c = scene.nodes.get(`k:${g.id}`); if (!c) return null; const p = scene.nodes.get(`p:${g.id}`);
          return <g key={`k${g.id}`}><g className={`kg-node kg-cl${g.expanded ? ' open' : ''}${selected === `k:${g.id}` ? ' sel' : ''}`} transform={`translate(${c.x},${c.y})`} {...node(c)} role="button" aria-expanded={g.expanded}>
            <rect x={-c.r} y={-c.r} width={c.r * 2} height={c.r * 2} rx={5}/><path d={g.expanded ? 'M-5,0H5' : 'M-5,0H5M0,-5V5'}/><title>{pt ? `${g.rest.length} hipóteses restantes` : `${g.rest.length} more hypotheses`}</title></g>
            {p && <g className="kg-node kg-pg" transform={`translate(${p.x},${p.y})`} {...node(p)} role="button"><rect x={-p.r - 3} y={-p.r} width={p.r * 2 + 6} height={p.r * 2} rx={11}/><path d="M-3,-4L2,0L-3,4"/><title>{pt ? 'Próximas hipóteses' : 'Next hypotheses'}</title></g>}</g>; })}
        {scene.tray && <g className={`kg-node kg-cl kg-tray${scene.tray.open ? ' open' : ''}`} transform={`translate(${scene.tray.node.x},${scene.tray.node.y})`} {...node(scene.tray.node)} role="button" aria-expanded={scene.tray.open}>
          <circle r={scene.tray.node.r}/><path d={scene.tray.open ? 'M-6,0H6' : 'M-6,0H6M0,-6V6'}/><title>{scene.tray.label}</title></g>}
        {drawnClaims.map(({n, c}) => <g key={c.id} className={`kg-node kg-c ${c.source === 'NEXO' ? 'nexo' : 'lit'}${c.survived ? ' survived' : ''}${selected === c.id ? ' sel' : ''}${lit && !on(c.id) ? ' off' : ''}`} transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`} {...node(n)}>
          <circle className="kg-hit" r={Math.max(n.r + 5, 10)}/>
          {c.source === 'NEXO' ? <rect x={-n.r * 0.85} y={-n.r * 0.85} width={n.r * 1.7} height={n.r * 1.7} rx={1.5} transform="rotate(45)"/> : <circle r={n.r}/>}<title>{c.label}</title></g>)}
        {allHyp.map(id => { const h = hypById.get(id), p = scene.nodes.get(`h:${id}`); if (!h || !p) return null;
          const s = score(id), tot = s.pro + s.con || 1, W = p.r > 8 ? 34 : 22, cnt = byHyp.get(id)?.length ?? 0, hit = hits?.has(id);
          return <g key={id} className={`kg-node kg-h ${STATUS_CLASS[h.status] ?? 'open'}${p.r < 8 ? ' kg-m' : ''}${lit && !on(id) ? ' off' : ''}${selected === id ? ' sel' : ''}${hit ? ' hit' : ''}`} transform={`translate(${p.x},${p.y})`} {...node(p)}>
            {p.r > 8 && <circle className="kg-h-glow" r={p.r + 3}/>}<circle className="kg-h-body" r={p.r}/>{(p.r < 8 || !cnt) && <circle className="kg-h-core" r={p.r < 8 ? 2.2 : 3.5}/>}
            <g transform={`translate(${-W / 2},${-p.r - 8})`}><rect className="kg-bar-track" width={W} height={3} rx={1.5}/>
              {s.pro + s.con > 0 && <><rect className="kg-bar-pro" width={W * s.pro / tot} height={3} rx={1.5}/><rect className="kg-bar-con" x={W * s.pro / tot} width={W * s.con / tot} height={3} rx={1.5}/></>}</g>
            {cnt > 0 && (p.r > 8 || deep) && <g className="kg-inv"><text className="kg-badge" y={3.5}>{cnt > 99 ? '99+' : cnt}</text></g>}
            <title>{`${h.label}\n${pt ? 'evidências' : 'evidence'}: ${cnt} · ${fmt(s)}`}</title></g>; })}
        {[...scene.groups.map(g => g.hub), ...(scene.tray ? [scene.tray.node] : []), ...[...scene.nodes.values()].filter(n => n.kind === 'hypothesis' || n.kind === 'cluster' || n.kind === 'pager'), ...extra].map(label)}
      </g>
    </svg>}
    {!empty && <aside className="kg-legend"><span className="pro"><i/>{pt ? 'apoia' : 'supports'}</span><span className="con"><i/>{pt ? 'contradiz' : 'contradicts'}</span><span><b className="dot"/>{pt ? 'literatura · A/B/C' : 'literature · A/B/C'}</span><span><b className="dia"/>NEXO{pt ? ' · cheio = sobreviveu' : ' · solid = survived'}</span>
      <span>{pt ? `${total}/${k.hypotheses.length} hipóteses · ${drawnClaims.length}/${k.claims.length} evidências` : `${total}/${k.hypotheses.length} hypotheses · ${drawnClaims.length}/${k.claims.length} evidence`}</span></aside>}
    {sel && <aside className="kg-panel" aria-live="polite"><button type="button" className="pw-button" aria-label={pt ? 'Fechar' : 'Close'} onClick={() => setSelected(null)}>×</button>
      <Inspector item={sel} scene={scene} score={score} byHyp={byHyp} pt={pt} open={reveal} toggle={toggleGroup} next={nextPage} setTray={setTray} tray={tray} zoom={zoomBox} select={setSelected}/></aside>}
  </main>;
}

type Dispatch = {open: (id: string) => void; toggle: (g: string) => void; next: (g: string) => void; setTray: (f: (t: boolean) => boolean) => void; zoom: (b: Box, pad?: number, max?: number) => void; select: (id: string | null) => void};
function Inspector({item, scene, score, byHyp, pt, tray, ...d}: {item: object; scene: ReturnType<typeof planKnowledge>; score: (id: string) => Score; byHyp: Map<string, KClaim[]>; pt: boolean; tray: boolean} & Dispatch) {
  const row = (h: KHypothesis) => { const s = score(h.id), t = s.pro + s.con || 1;
    return <li key={h.id}><button type="button" onClick={() => d.open(h.id)}><span className="kg-li-t">{h.label}</span><span className="kg-li-s">{h.id !== h.label ? `${h.id} · ` : ''}{fmt(s)}</span>
      <span className="kg-score" aria-hidden="true"><span className="pro" style={{width: `${100 * s.pro / t}%`}}/><span className="con" style={{width: `${100 * s.con / t}%`}}/></span></button></li>; };
  if ('weight' in item) { const c = item as KClaim; return <><p className="pw-eyebrow">{c.source === 'NEXO' ? 'NEXO' : pt ? 'Literatura' : 'Literature'}</p><h2>{c.label}</h2>
    <dl>{c.value && <><dt>{pt ? 'Valor' : 'Value'}</dt><dd>{c.value}</dd></>}{c.ref && <><dt>Ref</dt><dd>{c.ref}</dd></>}{c.journal && <><dt>{pt ? 'Revista' : 'Journal'}</dt><dd>{c.journal}{c.tier ? ` (${c.tier})` : ''}</dd></>}
      <dt>{pt ? 'Peso' : 'Weight'}</dt><dd>{c.weight.toFixed(2)}</dd><dt>{pt ? 'Dados' : 'Data'}</dt><dd>{c.lineage.join(', ') || '—'}</dd>{c.date && <><dt>{pt ? 'Data' : 'Date'}</dt><dd>{c.date.slice(0, 10)}</dd></>}
      <dt>{pt ? 'Ligações' : 'Links'}</dt><dd>{c.links.map(l => `${l.stance === 'SUPPORTS' ? '+' : '−'} ${l.hypothesis}`).join('\n')}</dd></dl></>; }
  if ('status' in item) { const h = item as KHypothesis, s = score(h.id), total = s.pro + s.con || 1, cs = byHyp.get(h.id) ?? [];
    return <><p className="pw-eyebrow">{pt ? 'Hipótese' : 'Hypothesis'} · {h.status}</p><h2>{h.label}</h2>
      <div className="kg-score" aria-hidden="true"><span className="pro" style={{width: `${100 * s.pro / total}%`}}/><span className="con" style={{width: `${100 * s.con / total}%`}}/></div>
      <dl><dt>ID</dt><dd>{h.id}</dd><dt>{pt ? 'A favor' : 'For'}</dt><dd>{s.pro.toFixed(2)}</dd><dt>{pt ? 'Contra' : 'Against'}</dt><dd>{s.con.toFixed(2)}</dd><dt>{pt ? 'Linhagens independentes' : 'Independent lineages'}</dt><dd>{s.lineages}</dd></dl>
      {cs.length > 0 && <><p className="pw-eyebrow kg-sub">{pt ? `Evidências (${cs.length})` : `Evidence (${cs.length})`}</p>
        <ul className="kg-list">{cs.slice(0, 12).map(c => <li key={c.id}><button type="button" onClick={() => d.select(c.id)}><span className="kg-li-t">{c.label}</span><span className="kg-li-s">{c.links.find(l => l.hypothesis === h.id)?.stance === 'SUPPORTS' ? '+' : '−'}{c.weight.toFixed(2)} · {c.source === 'NEXO' ? 'NEXO' : pt ? 'literatura' : 'literature'}</span></button></li>)}</ul></>}</>; }
  if ('cluster' in item) { const g = scene.groups.find(x => x.id === (item as {cluster: string}).cluster); if (!g) return null; const hs = (scene.ranked.get(g.id) ?? []).slice(TOP_N);
    return <><p className="pw-eyebrow">{pt ? 'Hipóteses restantes' : 'More hypotheses'}</p><h2>+{g.rest.length} · {g.label}</h2>
      <div className="kg-actions-row"><button type="button" className="pw-button" onClick={() => d.toggle(g.id)}>{g.expanded ? (pt ? 'Recolher' : 'Collapse') : (pt ? 'Expandir' : 'Expand')}</button>
        {g.expanded && g.pages > 1 && <button type="button" className="pw-button" onClick={() => d.next(g.id)}>{pt ? 'Ver mais' : 'More'} {g.page + 1}/{g.pages}</button>}</div>
      <ul className="kg-list">{hs.map(row)}</ul></>; }
  if ('tray' in item) return <><p className="pw-eyebrow">{pt ? 'Perguntas menores' : 'Minor questions'}</p><h2>{scene.tray?.label}</h2>
    <div className="kg-actions-row"><button type="button" className="pw-button" onClick={() => d.setTray(t => !t)}>{tray ? (pt ? 'Recolher' : 'Collapse') : (pt ? 'Expandir' : 'Expand')}</button></div></>;
  const qq = item as {id: string; label: string}, g = scene.groups.find(x => x.id === qq.id), hs = scene.ranked.get(qq.id) ?? [];
  return <><p className="pw-eyebrow">{pt ? 'Pergunta' : 'Question'} · {hs.length} {pt ? 'hipóteses' : 'hypotheses'}</p><h2>{qq.label}</h2>
    {g && <div className="kg-actions-row"><button type="button" className="pw-button" onClick={() => d.zoom(g.box, 16, 2.4)}>{pt ? 'Aproximar' : 'Zoom to group'}</button></div>}
    <ul className="kg-list">{hs.map(row)}</ul></>;
}
