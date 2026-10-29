// The Tower as a cosmic web (#/teia): one point per published node, one thin segment per real edge, in a 3D observation volume.
// One dominant canvas, discoverable controls and an optional inspector (bottom sheet on phones).
// Search, filters, replay and quality change VISIBILITY only: positions come from the incremental layout and survive new generations.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {buildTowerGraph, type TowerTest, type TowerNode} from './model.ts';
import {drift, gridify, layoutCosmos} from './embed3d.ts';
import {fitCamera, lerpCamera, orbit, pan, zoom, type Camera} from './camera3d.ts';
import {ALL_KINDS, buildScene, hitTest, KINDS, projectScene, sampleEdges, searchNodes, styleOf, visibility, type SceneKind} from './scene.ts';
import {BIRTH_MS, drawFallback, drawOverlay, type Frame2d} from './draw2d.ts';
import {buildFilaments, updateFilaments} from './filaments.ts';
import {createGlCosmos, type GlCosmos} from './gl3d.ts';
import {canvasResolution} from './resolution.ts';
import {createTowerLcdm, PHYSICS_MODEL, type TowerLcdm} from './lcdm.ts';
import {PLAYBACK_RATES} from './playback.ts';
import {useTowerPlayback} from './useTowerPlayback.ts';
import type {CosmosCache} from './cosmosCache.ts';
import {towerMemory} from './memory.ts';
import type {Theme} from './palette.ts';
import {describeReason, describeState, UI} from '../i18n/state-language.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import './tower-cosmos.css';
import {WORKSPACE_COPY} from '../private-workspace/copy.ts';
import {useGlobalMotionPaused} from '../private-workspace/global-motion.ts';
import {TOWER_COPY} from './tower-copy.ts';

export const AUTO_REFRESH_MS = 5 * 60_000;
export type QualityPref = 'auto' | 'low' | 'high';
/** how far the embedding is spread toward a uniform box: half-way, so the clusters and the voids of the real structure stay readable */
export const GRID_STRENGTH = 0.5;
/** Auto quality starts in low detail above this many real edges (fewer strands per bundle, fewer segments) */
export const AUTO_LOW_EDGES = 2500;
/** edges drawn before deterministic sampling starts */
export const EDGE_BUDGET = {low: 4000, high: 30000} as const;
export interface TowerCosmosProps {
  cache?: CosmosCache;
  tests: readonly TowerTest[];
  campaignLabel?: (id: string) => string | null;
  normDomain?: (d: string) => string;
  theme?: Theme;
  /** timestamp of the authenticated generation being shown */
  generatedAt?: string | null;
  /** asks the backend for a NEW generation through the existing private refresh path; absent outside the private area */
  refresh?: () => Promise<void>;
  autoRefreshMs?: number;
  backHref?: string;
  /** Same-document drill-down supplied only by the authenticated private workspace. */
  nodeHref?: (node: TowerNode) => string;
  emptyMessage?: string;
}

type PreviousView={camera:Camera;selected:string|null;kinds:ReadonlySet<SceneKind>;minDegree:number;cut:number|null};
const bare = (s: string) => s.replace(/^(?:test|hypothesis|campaign|roadmap|domain|subdomain):/i, '');
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function MotionIcon({running}:{running:boolean}){return <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">{running?<path d="M3 2h3v12H3zM10 2h3v12h-3z"/>:<path d="M4 2 13 8 4 14Z"/>}</svg>;}
/** Cinematic framing: the eye sits close to the volume (strong perspective: near filaments are thick, far ones recede) and slightly below its middle. */
export function frameCamera(extent: number, w: number, h: number, center: {x: number; y: number; z: number}): Camera {
  const c = fitCamera(extent, w, h, center), dist = Math.max(4, extent * 1.55);
  // the volume is about twice as wide as it is tall: on a portrait screen the width decides the zoom
  return {...c, yaw: 0.66, pitch: 0.2, dist, focal: c.focal * (dist / c.dist) * 1.34 * Math.min(1, Math.max(0.74, (w / h) * 1.5))};
}
const media = (q: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
/** names of published sources / evidence, exactly as published; null when there is none */
const names = (v: unknown): string[] | null => {
  if (v === null || v === undefined || v === '') return null; const arr = Array.isArray(v) ? v : typeof v === 'object' ? Object.values(v as object) : [v];
  const out = arr.map(x => (typeof x === 'string' || typeof x === 'number' ? String(x) : x && typeof x === 'object' ? String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).id ?? (x as Record<string, unknown>).ref ?? (x as Record<string, unknown>).path ?? (x as Record<string, unknown>).title ?? '') : '')).filter(Boolean);
  return out.length ? out : null;
};
// session-only preference (memory, never persisted)
let qualityPref: QualityPref = 'auto';

export default function TowerCosmos({cache, tests, campaignLabel, normDomain, theme: themeProp, generatedAt, refresh, autoRefreshMs = AUTO_REFRESH_MS, backHref = '#/agora', nodeHref, emptyMessage}: TowerCosmosProps) {
  const readTheme = (): Theme => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : themeProp ?? 'dark');
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => { const mo = new MutationObserver(() => setTheme(readTheme())); mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']}); return () => mo.disconnect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lang = useDocumentLang();
  const m=TOWER_COPY[lang],na=m.unavailable,globalPaused=useGlobalMotionPaused();
  const nodeLabel=useCallback((node:TowerNode)=>node.unpublished&&node.kind==='subdomain'?m.unpublished.subdomain:node.unpublished&&node.kind==='campaign'?m.unpublished.campaign:node.label,[m]);
  const [reduced, setReduced] = useState(() => media('(prefers-reduced-motion: reduce)'));
  useEffect(() => { if (typeof window.matchMedia !== 'function') return; const m = window.matchMedia('(prefers-reduced-motion: reduce)'); const f = () => setReduced(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  const coarse = useMemo(() => media('(pointer: coarse)'), []);
  const [narrow, setNarrow] = useState(() => media('(max-width: 720px)'));
  useEffect(() => { if (typeof window.matchMedia !== 'function') return; const m = window.matchMedia('(max-width: 720px)'); const f = () => setNarrow(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);

  const prepared = useMemo(() => cache?.read(tests, {normDomain, campaignLabel}, towerMemory.positions()), [cache, tests, normDomain, campaignLabel]);
  const g = useMemo(() => prepared?.graph ?? buildTowerGraph(tests, {normDomain, campaignLabel}), [prepared, tests, normDomain, campaignLabel]);
  const meta = useMemo(() => new Map<string, TowerTest>(tests.map(t => [`test:${bare(t.id)}`, t])), [tests]);
  const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  // layout continuity: warm start from the previous generation held in memory (ids -> coordinates, never persisted). The grid volume is a
  // display mapping applied afterwards; memory and warm start always use the raw embedding.
  const world = useMemo(() => {
    const prev = towerMemory.positions(); const raw = prepared?.raw ?? layoutCosmos(g, {prev}); const layout = gridify(raw, {strength: GRID_STRENGTH}); const scene = buildScene(g, layout);
    const ids = new Set(g.nodes.filter(n => n.kind === 'test').map(n => n.id));
    const born = new Set(towerMemory.newcomers(ids).map(id => scene.index.get(id)).filter((i): i is number => i !== undefined));
    return {raw, layout, scene, born, drift: prev ? drift(prev, raw) : null, before: towerMemory.ids()?.size ?? null};
  }, [g, prepared]);
  const {layout, scene, born} = world;
  const [history, setHistory] = useState(() => towerMemory.history());
  useEffect(() => { towerMemory.commit(generatedAt ?? `local-${g.counts.tests}`, world.raw.pos, new Set(g.nodes.filter(n => n.kind === 'test').map(n => n.id))); setHistory(towerMemory.history()); }, [g, world, generatedAt]);

  const stageRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), glCanvasRef = useRef<HTMLCanvasElement>(null), tipRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null);
  const glRef = useRef<GlCosmos | null>(null); const [renderer, setRenderer] = useState<'webgl' | 'canvas'>('canvas');
  const sizeRef = useRef({w: 0, h: 0, dpr: 1, glDpr: 1});
  const saved = useMemo(() => towerMemory.view(), []);
  const camRef = useRef<Camera>(saved?.cam ?? frameCamera(layout.extent, 900, 600, layout.center));
  const animRef = useRef<{from: Camera; to: Camera; t0: number} | null>(null);
  const raf = useRef(0), last = useRef(0), dirty = useRef(true), glMoved = useRef(true), hoverRef = useRef<number | null>(null), cost = useRef<number[]>([]);

  const [selected, setSelected] = useState<string | null>(() => (saved?.selected && scene.index.has(saved.selected) ? saved.selected : null));
  const [query, setQuery] = useState(''); const [searchOpen, setSearchOpen] = useState(false); const [active, setActive] = useState(0);
  const [kinds, setKinds] = useState<ReadonlySet<SceneKind>>(ALL_KINDS); const [minDegree, setMinDegree] = useState(0); const [filtersOpen, setFiltersOpen] = useState(false);
  const previousViews=useRef<PreviousView[]>([]),[previousDepth,setPreviousDepth]=useState(0);
  const [nodeListOpen,setNodeListOpen]=useState(false),[listQuery,setListQuery]=useState(''),[listHidden,setListHidden]=useState(false),[listLimit,setListLimit]=useState(40);
  const [helpOpen,setHelpOpen]=useState(false),helpButtonRef=useRef<HTMLButtonElement>(null),helpCloseRef=useRef<HTMLButtonElement>(null),pendingFocus=useRef<string|null>(null),searchBlur=useRef<number|undefined>(undefined);
  const [focusRequest,setFocusRequest]=useState(0);
  const filtersButtonRef = useRef<HTMLButtonElement>(null), inspectorButtonRef = useRef<HTMLButtonElement>(null);
  const closeFilters = () => { setFiltersOpen(false); filtersButtonRef.current?.focus(); };
  const closeInspector = () => { setInspector(false); inspectorButtonRef.current?.focus(); };
  useEffect(() => {
    if (!filtersOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFiltersOpen(false); filtersButtonRef.current?.focus(); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [filtersOpen]);
  const dated = useMemo(() => scene.nodes.filter(n => n.kind === 'test' && n.born !== null).map(n => n.born!), [scene]);
  const undated = g.counts.tests - dated.length;
  const tMin = dated.reduce((min, at) => Math.min(min, at), Infinity), tMax = dated.reduce((max, at) => Math.max(max, at), -Infinity);
  const playback = useTowerPlayback(tMin, tMax, reduced||globalPaused);
  const {cut, playing, rate, seek, pause, play, setRate, available: replay} = playback;
  const [show, setShow] = useState({labels: true, box: true, hierarchy: true, depends: true});
  const [motion, setMotion] = useState(true);
  useEffect(() => { if (!playing && cut !== null && cut >= tMax) setMotion(false); }, [playing, cut, tMax]);
  const [pref, setPref] = useState<QualityPref>(qualityPref); const [autoLow, setAutoLow] = useState(false);
  const [inspector, setInspector] = useState(() => !media('(max-width: 720px)'));
  const [auto, setAuto] = useState(autoRefreshMs > 0); const [status, setStatus] = useState<'refreshing'|'refreshed'|'refreshError'|null>(null);

  const quality: 'low' | 'high' = pref === 'auto' ? (coarse || narrow || autoLow || scene.edges.length > AUTO_LOW_EDGES ? 'low' : 'high') : pref;
  const selIdx = selected ? scene.index.get(selected) ?? null : null;
  const vis = useMemo(() => visibility(scene, {kinds, minDegree, cut}), [scene, kinds, minDegree, cut]);
  const focusIdx = selIdx !== null && vis.node[selIdx] ? selIdx : null;
  const sample = useMemo(() => sampleEdges(scene, vis.node, EDGE_BUDGET[quality], focusIdx, {hierarchy: show.hierarchy, depends: show.depends}), [scene, vis, quality, focusIdx, show.hierarchy, show.depends]);
  const style = useMemo(() => styleOf(scene, vis.node, sample.edge, focusIdx), [scene, vis, sample, focusIdx]);
  const searchScene=useMemo(()=>({...scene,nodes:scene.nodes.map(node=>({...node,label:nodeLabel(node)}))}),[scene,nodeLabel]);
  const results = useMemo(() => searchNodes(searchScene, query, 8, vis.node), [searchScene, query, vis]);
  const filtersOn = (kinds.size < KINDS.length ? 1 : 0) + (minDegree > 0 ? 1 : 0);

  // Existing bounded a(t) clock drives a visible, presentation-only dilation; no science is inferred from records.
  const lcdm = useMemo<TowerLcdm | null>(() => {
    const anchors = layout.domainIds.map(id => layout.pos.get(id)).filter((p): p is NonNullable<typeof p> => !!p); if (anchors.length === 0) return null;
    return createTowerLcdm({nodes: scene.xyz, dust: new Float32Array(0), containers: new Map(), anchors, center: layout.center, extent: layout.extent, initialScaleFactor: towerMemory.scale()});
  }, [scene, layout]);

  // visual geometry of the filaments: one curved bundle per real edge (see filaments.ts); rebuilt only when the scene or the level of detail changes
  const filaments = useMemo(() => buildFilaments(scene, quality), [scene, quality]);
  const filStale = useRef(false), filAt = useRef(0), filMoved = useRef(true);
  const motionOn = motion && !reduced && !globalPaused;
  const live = useRef({theme, style, selIdx, show, motion:motionOn, quality, vis, selected, rate,nodeLabel}); live.current = {theme, style, selIdx, show, motion:motionOn, quality, vis, selected, rate,nodeLabel};
  const viewOptions=useRef({kinds,minDegree,cut});viewOptions.current={kinds,minDegree,cut};
  const draw = useCallback(() => {
    raf.current = 0; const cv = canvasRef.current, ctx = cv?.getContext('2d'); if (!cv || !ctx) return; const {w, h, dpr, glDpr} = sizeRef.current; if (!w || !h) return;
    const hidden = document.visibilityState === 'hidden';
    if (hidden) { last.current = 0; return; }
    const now = performance.now(), dt = last.current ? Math.min(64, now - last.current) : 0; last.current = now; const L = live.current;
    let again = false, ambient = false; const a = animRef.current;
    if (a) { const t = Math.min(1, (now - a.t0) / 420), e = t * t * (3 - 2 * t); camRef.current = lerpCamera(a.from, a.to, e); if (t >= 1) animRef.current = null; else again = true; }
    if (lcdm) { const moved = lcdm.step(dt * L.rate / 1000, {paused: !L.motion, hidden, reducedMotion: reduced}); if (moved) { glMoved.current = true; filStale.current = true; scene.sig = ''; towerMemory.setScale(lcdm.state.scaleFactor); const ds = stageRef.current?.dataset; if (ds) { ds.scaleFactor = lcdm.state.scaleFactor.toFixed(4); ds.recession = lcdm.state.expansion.toFixed(4); ds.physicsSteps = String(lcdm.state.particleSteps); } again = true; } if (L.motion && !hidden && !reduced && !lcdm.state.settled) ambient = true; }
    const age = now - mountedAt.current; const births = !reduced && !globalPaused && age < BIRTH_MS ? new Map([...born].map(i => [i, age] as const)) : new Map<number, number>();
    // the loop stays alive while the model is still moving, but a frame is drawn only when something changed
    if (!(dirty.current || a || again || births.size > 0 || !ambient)) { raf.current = requestAnimationFrame(draw); return; }
    const worldDirty = dirty.current || !!a || glMoved.current || filMoved.current;
    dirty.current = false; const t0 = performance.now(); const gl = glRef.current;
    // the curves follow the (very slow) illustrative motion a few times per second, not every physics step
    if (filStale.current && now - filAt.current > (filaments.pos.length > 600000 ? 1500 : 350)) { updateFilaments(filaments, scene); filStale.current = false; filAt.current = now; filMoved.current = true; }
    const f: Frame2d = {cam: camRef.current, w, h, dpr, theme: L.theme, style: L.style, selected: L.selIdx, hover: hoverRef.current, births, labels: L.show.labels, box: L.show.box, labelLevel: L.quality === 'low' ? 0 : 2,
      nodeLabel:L.nodeLabel};
    let animating: boolean;
    if (gl) {
      // Halo-only frames reuse the existing WebGL image instead of re-rendering the whole cloud.
      if (worldDirty || filMoved.current) { const info = gl.render({cam: f.cam, w, h, dpr: glDpr, theme: f.theme, style: f.style, selected: f.selected, hover: f.hover, halo: L.quality === 'high' && L.theme === 'dark', moved: glMoved.current, filamentsMoved: filMoved.current}); glMoved.current = false; filMoved.current = false; const ds = stageRef.current?.dataset; if (ds && ds.drawCalls !== String(info.calls)) ds.drawCalls = String(info.calls); }
      animating = drawOverlay(ctx, scene, f, true);
    }
    else { drawFallback(ctx, scene, f, filaments); animating = drawOverlay(ctx, scene, f, false); }
    // measured cost of a frame while navigating: Auto drops to low quality once if it stays above budget
    const c = cost.current; c.push(performance.now() - t0); if (c.length > 24) c.shift(); const ds = stageRef.current?.dataset; if (ds && c.length === 24) ds.frameMs = (c.reduce((x, y) => x + y, 0) / 24).toFixed(1);
    if (c.length === 24 && c.reduce((x, y) => x + y, 0) / 24 > 26) setAutoLow(true);
    towerMemory.setView({cam: camRef.current, selected: L.selected});
    if (ds) { const k = `${camRef.current.yaw.toFixed(3)}|${camRef.current.pitch.toFixed(3)}|${camRef.current.dist.toFixed(1)}|${camRef.current.target.x.toFixed(1)},${camRef.current.target.y.toFixed(1)},${camRef.current.target.z.toFixed(1)}`; if (ds.cam !== k) ds.cam = k; }
    if (again || animating || ambient) raf.current = requestAnimationFrame(draw); else last.current = 0;
  }, [scene, born, lcdm, reduced, globalPaused,filaments]);
  const schedule = useCallback(() => { dirty.current = true; if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);
  useEffect(()=>{if(globalPaused||reduced)animRef.current=null;last.current=0;schedule();},[globalPaused,reduced,schedule]);
  const flyTo = useCallback((to: Camera) => { if (reduced||globalPaused) { animRef.current = null; camRef.current = to; } else animRef.current = {from: camRef.current, to, t0: performance.now()}; schedule(); }, [schedule, reduced,globalPaused]);
  const fit = useCallback(() => { const {w, h} = sizeRef.current; flyTo(frameCamera(layout.extent, w || 900, h || 600, layout.center)); }, [flyTo, layout]);
  useEffect(() => { schedule(); }, [theme, style, selIdx, show, motionOn, rate, quality,nodeLabel, schedule]);
  useEffect(() => { last.current = 0; }, [motion, reduced, rate]);

  // WebGL layer under the transparent 2D overlay; without WebGL2 the Canvas fallback draws the same scene and the UI says so
  useEffect(() => {
    const el = glCanvasRef.current; if (!el) return; const gl = createGlCosmos(el); if (!gl) return;
    glRef.current = gl; setRenderer('webgl');
    const lost = (e: Event) => { e.preventDefault(); glRef.current = null; setRenderer('canvas'); schedule(); };
    el.addEventListener('webglcontextlost', lost);
    return () => { el.removeEventListener('webglcontextlost', lost); gl.dispose(); if (glRef.current === gl) glRef.current = null; };
  }, [schedule]);
  useEffect(() => { glRef.current?.load(scene, filaments); glMoved.current = true; filMoved.current = true; schedule(); }, [scene, filaments, renderer, schedule]);

  useEffect(() => {
    const stage = stageRef.current, cv = canvasRef.current; if (!stage || !cv) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)); const first = sizeRef.current.w === 0;
      const {overlayDpr: dpr, glDpr} = canvasResolution(w, h, window.devicePixelRatio || 1, quality, pref === 'auto' && autoLow);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); sizeRef.current = {w, h, dpr, glDpr};
      stage.dataset.renderDpr = glDpr.toFixed(2); stage.dataset.overlayDpr = dpr.toFixed(2);
      if (first && !saved) camRef.current = frameCamera(layout.extent, w, h, layout.center);
      scene.sig = ''; cost.current = []; schedule();
    };
    measure(); const ro = new ResizeObserver(measure); ro.observe(stage);
    // Moving between displays or changing browser zoom may change DPR without a CSS resize.
    let screenDpr: MediaQueryList;
    const watchDpr = () => { screenDpr = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); screenDpr.addEventListener('change', onDpr); };
    const onDpr = () => { screenDpr.removeEventListener('change', onDpr); measure(); watchDpr(); };
    watchDpr();
    return () => { ro.disconnect(); screenDpr.removeEventListener('change', onDpr); if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [scene, layout, schedule, quality, pref, autoLow, saved]);
  useEffect(() => { const f = () => { last.current = 0; if (document.visibilityState === 'visible') schedule(); else { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; animRef.current = null; } }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [schedule]);

  const posOf = useCallback((i: number) => ({x: scene.xyz[3 * i]!, y: scene.xyz[3 * i + 1]!, z: scene.xyz[3 * i + 2]!}), [scene]);
  /** select: the node becomes the observer (camera target). `frame` also brings the camera closer when it is far away. */
  const select = useCallback((i: number | null, frame = false) => {
    const next=i===null?null:scene.nodes[i]!.id;
    if(next!==live.current.selected){const c=camRef.current;previousViews.current.push({camera:{...c,target:{...c.target}},selected:live.current.selected,kinds:new Set(viewOptions.current.kinds),minDegree:viewOptions.current.minDegree,cut:viewOptions.current.cut});if(previousViews.current.length>20)previousViews.current.shift();setPreviousDepth(previousViews.current.length);}
    setSelected(i === null ? null : scene.nodes[i]!.id); if (i === null) return;
    const c = camRef.current; flyTo({...c, target: posOf(i), dist: frame ? Math.min(c.dist, layout.extent * 2.2) : c.dist});
  }, [scene, layout, flyTo, posOf]);
  const reset = useCallback(() => { setSelected(null); setKinds(ALL_KINDS); setMinDegree(0); setQuery(''); setSearchOpen(false); seek(null); fit(); }, [fit, seek]);
  const pick = useCallback((i: number) => { select(i, true); setQuery(''); setSearchOpen(false); setInspector(true); canvasRef.current?.focus(); }, [select]);
  const previousView=()=>{const previous=previousViews.current.pop();if(!previous)return;setPreviousDepth(previousViews.current.length);setSelected(previous.selected&&scene.index.has(previous.selected)?previous.selected:null);setKinds(previous.kinds);setMinDegree(previous.minDegree);seek(previous.cut);setQuery('');setSearchOpen(false);flyTo(previous.camera);canvasRef.current?.focus();};
  const openList=(locate=false)=>{setInspector(true);setNodeListOpen(true);setListLimit(40);if(locate&&selected){setListQuery(bare(selected));setListHidden(true);pendingFocus.current='tc-list-selected';}else pendingFocus.current='tc-nodes-title';setFocusRequest(request=>request+1);};
  const openReplay=()=>{setInspector(true);pendingFocus.current='tc-replay-title';setFocusRequest(request=>request+1);};
  useEffect(()=>{if(!inspector||!pendingFocus.current)return;const frame=requestAnimationFrame(()=>{const target=document.getElementById(pendingFocus.current!);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});pendingFocus.current=null;}});return()=>cancelAnimationFrame(frame);},[inspector,nodeListOpen,listQuery,selected,focusRequest]);
  useEffect(()=>{if(!helpOpen)return;helpCloseRef.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setHelpOpen(false);helpButtonRef.current?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[helpOpen]);
  useEffect(()=>()=>{if(searchBlur.current!==undefined)window.clearTimeout(searchBlur.current);},[]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const pts = new Map<number, {x: number; y: number}>(); let drag: {moved: boolean; pan: boolean} | null = null; let pinch = 0;
    const local = (e: {clientX: number; clientY: number}) => { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
    const at = (p: {x: number; y: number}) => { projectScene(scene, camRef.current, sizeRef.current.w, sizeRef.current.h); return hitTest(scene, p.x, p.y, live.current.vis.node); };
    const tip = (i: number | null, x: number, y: number) => {
      const el = tipRef.current; if (!el) return; if (i === null) { el.hidden = true; return; } const n = scene.nodes[i]!;
      el.textContent = `${m.kinds[n.kind as SceneKind]} · ${nodeLabel(n)} · ${scene.degree[i]} ${m.connections.toLowerCase()}`; el.hidden = false;
      el.style.left = `${Math.max(4, Math.min(x + 14, sizeRef.current.w - 280))}px`; el.style.top = `${Math.max(4, y - 34)}px`;
    };
    const down = (e: PointerEvent) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); animRef.current = null; if (pts.size === 1) drag = {moved: false, pan: e.shiftKey || e.button === 1 || e.button === 2}; else { const [p, q] = [...pts.values()]; pinch = Math.hypot(p!.x - q!.x, p!.y - q!.y); if (drag) drag.moved = true; } cv.classList.add('tc-drag'); };
    const move = (e: PointerEvent) => {
      const p = local(e), prev = pts.get(e.pointerId);
      if (prev && pts.size === 2) { // two fingers: pinch zooms, the midpoint pans
        pts.set(e.pointerId, p); const [u, v] = [...pts.values()]; const d = Math.hypot(u!.x - v!.x, u!.y - v!.y);
        if (pinch > 0 && d > 0) camRef.current = zoom(camRef.current, pinch / d, layout.extent); pinch = d; camRef.current = pan(camRef.current, (p.x - prev.x) / 2, (p.y - prev.y) / 2); schedule(); return;
      }
      if (prev && drag) { const dx = p.x - prev.x, dy = p.y - prev.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved) { camRef.current = drag.pan ? pan(camRef.current, dx, dy) : orbit(camRef.current, dx, dy); pts.set(e.pointerId, p); schedule(); } return; }
      if (e.pointerType === 'touch') return; const i = at(p); if (i !== hoverRef.current) { hoverRef.current = i; schedule(); } tip(i, p.x, p.y);
    };
    const up = (e: PointerEvent) => {
      const d = drag, had = pts.size; pts.delete(e.pointerId); if (pts.size === 0) { cv.classList.remove('tc-drag'); drag = null; pinch = 0; }
      if (d && !d.moved && had === 1 && e.type === 'pointerup') { const i = at(local(e)); if (i === null || i === live.current.selIdx) setSelected(null); else { select(i); setInspector(true); } }
    };
    const leave = () => { hoverRef.current = null; tip(null, 0, 0); schedule(); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); animRef.current = null; camRef.current = zoom(camRef.current, Math.exp(e.deltaY * 0.0012), layout.extent); schedule(); };
    const key = (e: KeyboardEvent) => {
      const c = camRef.current;
      if (e.key === 'ArrowLeft') camRef.current = orbit(c, -30, 0); else if (e.key === 'ArrowRight') camRef.current = orbit(c, 30, 0); else if (e.key === 'ArrowUp') camRef.current = orbit(c, 0, -30); else if (e.key === 'ArrowDown') camRef.current = orbit(c, 0, 30);
      else if (e.key === '+' || e.key === '=') camRef.current = zoom(c, 0.8, layout.extent); else if (e.key === '-' || e.key === '_') camRef.current = zoom(c, 1.25, layout.extent);
      else if (e.key === '0') fit(); else if (e.key === 'Escape') setSelected(null); else return;
      animRef.current = e.key === '0' ? animRef.current : null; schedule(); e.preventDefault();
    };
    const menu = (e: Event) => e.preventDefault();
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', leave);
    cv.addEventListener('wheel', wheel, {passive: false}); cv.addEventListener('dblclick', fit); cv.addEventListener('keydown', key); cv.addEventListener('contextmenu', menu);
    return () => {
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); cv.removeEventListener('pointerleave', leave);
      cv.removeEventListener('wheel', wheel); cv.removeEventListener('dblclick', fit); cv.removeEventListener('keydown', key); cv.removeEventListener('contextmenu', menu);
    };
  }, [scene, layout, schedule, select, fit,m,nodeLabel]);

  // "/" or Ctrl/Cmd+K focuses the search from anywhere in the view
  useEffect(() => {
    const f = (e: KeyboardEvent) => { const el = e.target; const typing = (el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(el.type)) || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement; if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);
  const searchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchOpen(true); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { const i = results[active] ?? results[0]; if (i !== undefined) { e.preventDefault(); pick(i); } }
    else if (e.key === 'Escape') { if (query) { setQuery(''); setSearchOpen(false); } else (e.target as HTMLInputElement).blur(); }
  };

  // follow the backend: ask for a NEW generation (existing private refresh path); a new fingerprint remounts this view and the web grows in place
  const refreshing = useRef(false);
  const doRefresh = useCallback(async () => {
    if (!refresh || refreshing.current) return; refreshing.current = true; setStatus('refreshing');
    try { await refresh(); setStatus('refreshed'); } catch { setStatus('refreshError'); } finally { refreshing.current = false; }
  }, [refresh]);
  useEffect(() => {
    if (!refresh || !auto || autoRefreshMs <= 0) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void doRefresh(); }, autoRefreshMs); return () => window.clearInterval(id);
  }, [refresh, auto, autoRefreshMs, doRefresh]);

  const sel = selIdx !== null ? scene.nodes[selIdx]! : null;
  const neighbours = useMemo(() => {
    if (selIdx === null) return []; const out: Array<{i: number; rel: string}> = [];
    for (const e of scene.edges) { if (e.a !== selIdx && e.b !== selIdx) continue; const mine = e.a === selIdx; out.push({i: mine ? e.b : e.a, rel: e.kind === 0 ? (mine ? m.relations.contains : m.relations.belongs) : e.kind === 1 ? (mine ? m.relations.requiredBy : m.relations.depends) : (mine ? m.relations.contests : m.relations.contestedBy)}); }
    return out;
  }, [scene, selIdx,m]);
  const rec = sel && sel.kind === 'test' ? meta.get(sel.id) : undefined;
  const toggleKind = (k: SceneKind) => setKinds(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const onShow = (k: keyof typeof show) => (e: React.ChangeEvent<HTMLInputElement>) => setShow(s => ({...s, [k]: e.target.checked}));
  const crumbs = (id: string | null): string[] => { const out: string[] = []; let p = id; while (p) { const n = g.byId.get(p); if (!n || n.kind === 'root') break; out.unshift(nodeLabel(n)); p = n.parent; } return out; };
  const toggleMotion = () => { if (motionOn) { setMotion(false); pause(); } else setMotion(true); };
  const seekDate = (at: number | null) => { seek(at); setMotion(false); };
  const replayToggle=()=>{if(playing){pause();setMotion(false);}else{setMotion(true);play();}};
  const autoplayOff=reduced||globalPaused;
  const playLabel=playing?m.pauseReplay:cut!==null&&cut<tMax?m.continueReplay:m.play;
  const listNeedle=listQuery.trim().toLocaleLowerCase(lang);
  const listed=useMemo(()=>nodeListOpen?scene.nodes.map((node,i)=>({node,i})).filter(({node,i})=>(listHidden||vis.node[i])&&(!listNeedle||[nodeLabel(node),bare(node.id)].some(label=>label.toLocaleLowerCase(lang).includes(listNeedle)))):[],[nodeListOpen,scene,listHidden,vis.node,nodeLabel,listNeedle,lang]);
  // how states are worded: the single language formatter; the published codes stay untouched and live in the technical detail
  const ui = UI[lang]; const st = sel?.kind === 'test' ? describeState(sel.verdict, lang) : null;
  const needsReason = !!rec && (/BLOCKED|INCONCLUSIV|FAILED|ERROR/i.test(`${sel?.verdict ?? ''} ${rec.status ?? ''} ${rec.verdictRaw ?? ''}`) || rec.readiness?.eligible === false || !!rec.blocker);
  const why = needsReason ? describeReason({reason: rec?.blocker ?? (rec?.readiness?.eligible === false ? rec.readiness.reasons : null)}, lang) : null;

  return (
    <div className="tc" data-theme={theme} data-testid="tower-cosmos" data-inspector={inspector ? 'open' : 'closed'}>
      <header className="tc-bar">
        <a className="tc-btn tc-back" href={backHref} aria-label={m.back}>←</a><h1>{m.title}</h1>
        <div className="tc-search" role="search">
          <input ref={searchRef} type="search" role="combobox" aria-label={m.search} aria-autocomplete="list" aria-expanded={searchOpen && query !== ''} aria-controls="tc-results" aria-activedescendant={searchOpen && results[active] !== undefined ? `tc-opt-${active}` : undefined}
            placeholder={m.placeholder} value={query} onChange={e => { setQuery(e.target.value); setSearchOpen(true); setActive(0); }} onFocus={() => {if(searchBlur.current!==undefined)window.clearTimeout(searchBlur.current);setSearchOpen(true);}} onBlur={() => {searchBlur.current=window.setTimeout(()=>setSearchOpen(false),120);}} onKeyDown={searchKey}/>
          {searchOpen && query !== '' ? <ul id="tc-results" role="listbox" aria-label={m.results}>
            {results.length === 0 ? <li className="tc-none" role="option" aria-selected="false" aria-disabled="true">{m.noResults}</li> : results.map((i,k)=>{
              const n=scene.nodes[i]!;return <li key={n.id} id={`tc-opt-${k}`} role="option" aria-selected={k===active} className={k===active?'on':''} onPointerDown={event=>{event.preventDefault();pick(i);}} onMouseEnter={()=>setActive(k)}><span>{nodeLabel(n)}</span><small>{m.kinds[n.kind as SceneKind]}{vis.node[i]?'':` · ${m.hidden}`}</small><code>{bare(n.id)}</code></li>;
            })}
          </ul> : null}
        </div>
        <button ref={inspectorButtonRef} className="tc-btn tc-inspector-toggle" aria-pressed={inspector} aria-controls="tc-side" onClick={()=>setInspector(open=>!open)}>{m.panel}</button>
        <div className="tc-tools" role="group" aria-label={m.help}>
          <button className="tc-btn" onClick={()=>openList()} aria-expanded={nodeListOpen&&inspector} aria-controls="tc-node-list">{m.nodeList}</button>
          <button className="tc-btn" onClick={openReplay}>{m.timeline}</button>
          <div className="tc-pop"><button ref={filtersButtonRef} className="tc-btn" aria-expanded={filtersOpen} aria-controls="tc-filters" onClick={()=>{setHelpOpen(false);setFiltersOpen(open=>!open);}}>{m.filters}{filtersOn?` (${filtersOn})`:''}</button>
            {filtersOpen?<div id="tc-filters" className="tc-panel" role="group" aria-label={m.filters}><button className="tc-btn tc-panel-close" onClick={closeFilters}>{m.closeFilters} ×</button>
              <fieldset><legend>{m.type}</legend>{KINDS.map(kind=><label key={kind}><input type="checkbox" checked={kinds.has(kind)} onChange={()=>toggleKind(kind)}/>{m.kinds[kind]}</label>)}</fieldset>
              <label className="tc-range">{m.minimum} <output>{minDegree}</output><input type="range" aria-label={m.minimum} min={0} max={Math.min(scene.maxDegree,16)} step={1} value={minDegree} onChange={event=>setMinDegree(Number(event.target.value))}/></label>
              <button className="tc-btn" onClick={()=>{setKinds(ALL_KINDS);setMinDegree(0);}} disabled={!filtersOn}>{m.clearFilters}</button>
            </div>:null}
          </div>
          <output className="tc-count" data-testid="tower-count" aria-live="polite" title={m.visible}><b>{vis.visible}</b>/{vis.total} {m.nodes}{sample.sampled?<span data-testid="tower-sample"> · {sample.shown}/{sample.total} {m.edges} ({m.sample})</span>:null}</output>
          <span className="tc-grow"/><button className="tc-btn" onClick={previousView} disabled={!previousDepth} title={m.previousTitle}>{m.previousView}</button>
          <button className="tc-btn" onClick={fit} title={m.fitTitle}>{m.fit}</button><button className="tc-btn" onClick={reset} title={m.resetTitle}>{m.reset}</button>
          <label className="tc-q">{m.quality}<select aria-label={m.quality} value={pref} onChange={event=>{qualityPref=event.target.value as QualityPref;setPref(qualityPref);setAutoLow(false);}}><option value="auto">{m.auto}{pref==='auto'?` · ${quality==='low'?m.low.toLowerCase():m.high.toLowerCase()}`:''}</option><option value="low">{m.low}</option><option value="high">{m.high}</option></select></label>
          <a className="tc-btn" href="#/teia/organograma">{m.organogram}</a>
        </div>
      </header>
      <div className="tc-stage" ref={stageRef} data-renderer={renderer} data-quality={quality} data-drift={world.drift===null?'':world.drift.toFixed(4)} data-births={born.size} data-generation={generatedAt??''}
        data-physics-model={PHYSICS_MODEL} data-motion={motionOn?'on':'off'} data-visible={vis.visible} data-total={vis.total} data-selected={selected??''} data-highlighted-nodes={focusIdx===null?0:style.node.filter(alpha=>alpha>=.99).length} data-dimmed-nodes={focusIdx===null?0:style.node.filter(alpha=>alpha>0&&alpha<.99).length}
        data-replay-cut={cut??'current'} data-replay-playing={playing} data-playback-rate={rate}>
        <canvas ref={glCanvasRef} className="tc-gl" aria-hidden="true" hidden={renderer!=='webgl'}/>
        <canvas ref={canvasRef} className="tc-2d" tabIndex={0} role="img" aria-label={`${m.canvasCounts(g.counts.domains,g.counts.subdomains,g.counts.campaigns,g.counts.tests,scene.edges.length)} ${m.gestures} ${m.keys}`}/>
        <div className="tc-tip" ref={tipRef} role="presentation" hidden/>
        {g.counts.tests===0?<p className="tc-empty" role="status">{emptyMessage??m.noTests}</p>:vis.visible===0?<p className="tc-empty" role="status">{m.noVisible}<button className="tc-btn" onClick={reset}>{m.reset}</button></p>:null}
        {born.size>0?<p className="tc-note tc-birth" role="status" data-testid="tower-births">{m.newTests(born.size)}</p>:null}
        <button ref={helpButtonRef} className="tc-btn tc-help-toggle" aria-expanded={helpOpen} aria-controls="tc-view-help" onClick={()=>{setFiltersOpen(false);setHelpOpen(open=>!open);}}>{m.help} ?</button>
        {helpOpen?<section className="tc-help" id="tc-view-help" aria-label={m.help}><button ref={helpCloseRef} className="tc-btn" onClick={()=>{setHelpOpen(false);helpButtonRef.current?.focus();}}>{m.closeHelp} ×</button><h2>{m.help}</h2><p>{m.gestures}</p><p>{m.keys}</p><p className="tc-note">{m.selectLead}</p></section>:null}
        {sel?<section className="tc-context" aria-label={m.situation}><p><small>{m.kinds[sel.kind as SceneKind]}</small><strong>{nodeLabel(sel)}</strong></p><p className="tc-note">{focusIdx===null?m.hiddenSelection:m.selectionLead}</p>{focusIdx===null&&<button className="tc-btn" onClick={()=>{setKinds(ALL_KINDS);setMinDegree(0);seekDate(null);}}>{m.reveal}</button>}{nodeHref&&<a className="tc-btn" href={nodeHref(sel)}>{sel.kind==='test'?WORKSPACE_COPY[lang].openTest:WORKSPACE_COPY[lang].openDomain} →</a>}</section>:null}
        <div className="tc-cosmic-note" aria-label={m.webDescription}><strong>{m.webDescription}</strong><small>{m.expansionDisplay}</small></div>
        {replay?<div className="tc-playback-dock" role="group" aria-label={m.replay}><button className="tc-btn" onClick={replayToggle} disabled={autoplayOff} title={autoplayOff?(reduced?m.reducedAutoplay:lang==='en'?'Global animation is paused':'A animação global está pausada'):undefined}><MotionIcon running={playing}/> {playLabel}</button><select aria-label={m.speedLabel} value={rate} onChange={event=>setRate(Number(event.target.value))}>{PLAYBACK_RATES.map(value=><option key={value} value={value}>{value}×{value===.25?` · ${m.slowMotion}`:''}</option>)}</select><button className="tc-btn" onClick={openReplay}>{m.timeline}</button></div>:null}
        <button className="tc-btn tc-motion-control" onClick={toggleMotion} disabled={autoplayOff} aria-pressed={!motionOn} aria-label={motionOn?m.pauseMotion:m.resumeMotion}>{!autoplayOff&&<MotionIcon running={motionOn}/>} {reduced?m.reduced:globalPaused?(lang==='en'?'Global animation paused':'Animação global pausada'):motionOn?m.pauseMotion:m.resumeMotion}</button>
      </div>
      {inspector?<aside className="tc-side" id="tc-side" aria-label={m.details} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closeInspector();}}}>
        <button className="tc-btn tc-panel-close" onClick={closeInspector}>{m.closePanel} ×</button>
        {sel?<section data-testid="tower-selection"><p className="tc-kind">{m.kinds[sel.kind as SceneKind]}</p><h2 id="tc-selection-title" tabIndex={-1}>{nodeLabel(sel)}</h2><p><code>{bare(sel.id)}</code></p>
          <div className="tc-row"><button className="tc-btn" onClick={()=>openList(true)}>{m.findInList}</button><button className="tc-btn" onClick={previousView} disabled={!previousDepth}>{m.previousView}</button></div>
          {nodeHref&&<p><a className="tc-btn" data-testid="tower-open-detail" href={nodeHref(sel)}>{sel.kind==='test'?WORKSPACE_COPY[lang].openTest:WORKSPACE_COPY[lang].openDomain} →</a></p>}
          <dl><dt>{m.path}</dt><dd>{crumbs(sel.parent).join(' › ')||m.tower}</dd><dt>{m.connections}</dt><dd><code>{scene.degree[selIdx!]}</code> {m.publishedLinks}</dd>
            {sel.kind==='test'?<><dt>{m.situation}</dt><dd data-testid="tower-state">{st!.label}</dd><dt>{ui.status}</dt><dd>{describeState(rec?.status,lang).label}</dd><dt>{ui.review}</dt><dd>{describeState(rec?.review,lang).label}</dd>{rec?.verdictRaw?<><dt>{ui.result}</dt><dd>{describeState(rec.verdictRaw,lang).label}</dd></>:null}{why?<><dt>{ui.reason}</dt><dd>{why.reason}</dd><dt>{ui.next}</dt><dd>{why.nextStep}</dd></>:null}<dt>{m.hypothesis}</dt><dd>{rec?.hypothesisId?<code>{bare(rec.hypothesisId)}</code>:na}</dd><dt>{m.created}</dt><dd>{sel.born!==null?day(sel.born):`${na} (${m.outsideReplay})`}{rec?.createdSource?` · ${rec.createdSource}`:''}</dd><dt>{m.executed}</dt><dd>{rec?.executedAt??rec?.execution?.at??na}</dd></>:<><dt>{m.tests}</dt><dd><code>{sel.leaves}</code></dd></>}
          </dl>
          {sel.kind==='test'?<><p className="tc-note" data-testid="tower-state-meaning">{st!.meaning}</p><details className="tc-tech"><summary>{ui.technical}</summary><dl><dt>verdict</dt><dd><code>{sel.verdict??ui.none}</code></dd><dt>status</dt><dd><code>{rec?.status??ui.none}</code></dd><dt>review</dt><dd><code>{rec?.review??ui.none}</code></dd><dt>verdict (run)</dt><dd><code>{rec?.verdictRaw??ui.none}</code></dd></dl></details><h3>{m.sources}</h3><dl><dt>{m.execution}</dt><dd>{[rec?.execution?.battery_id,rec?.execution?.run_ref,rec?.execution?.runner].filter(Boolean).join(' · ')||na}</dd><dt>{m.datasets}</dt><dd>{names(rec?.datasets)?.join(', ')??na}</dd><dt>{m.artifacts}</dt><dd>{names(rec?.artifacts)?.join(', ')??na}</dd><dt>{m.reviews}</dt><dd>{rec?.reviews?.length?rec.reviews.map(review=>[review.kind,review.outcome,review.at?.slice(0,10)].filter(Boolean).join(' ')).join('; '):na}</dd></dl></>:null}
          <h3>{m.neighbours} <code>{neighbours.length}</code></h3>{neighbours.length===0?<p className="tc-note">{m.noLinks}</p>:<ul className="tc-nbrs" data-testid="tower-neighbours">{neighbours.slice(0,40).map(({i,rel},index)=><li key={`${i}-${index}`}><button onClick={()=>{select(i,true);pendingFocus.current='tc-selection-title';}}><small>{rel}</small><span>{nodeLabel(scene.nodes[i]!)}</span></button></li>)}{neighbours.length>40?<li className="tc-note">+{neighbours.length-40} {m.moreNeighbours}</li>:null}</ul>}
          <button className="tc-btn" onClick={()=>select(null)}>{m.clearSelection}</button>
        </section>:<section><h2>{m.noSelection}</h2><p className="tc-note">{m.selectLead}</p><button className="tc-btn" onClick={()=>openList()}>{m.nodeList}</button></section>}
        {nodeListOpen?<section className="tc-node-list" id="tc-node-list"><h3 id="tc-nodes-title" tabIndex={-1}>{m.nodeList}</h3><label>{m.listSearch}<input type="search" value={listQuery} onChange={event=>{setListQuery(event.target.value);setListLimit(40);}}/></label><label className="tc-row"><input type="checkbox" checked={listHidden} onChange={event=>setListHidden(event.target.checked)}/>{m.includeHidden}</label><p className="tc-note">{Math.min(listLimit,listed.length)}/{listed.length} {m.nodes}</p><ul>{listed.slice(0,listLimit).map(({node,i})=><li key={node.id}><button id={node.id===selected?'tc-list-selected':undefined} className="tc-btn" aria-pressed={node.id===selected} onClick={()=>{select(i,true);pendingFocus.current='tc-selection-title';}}><span>{nodeLabel(node)}</span><small>{m.kinds[node.kind as SceneKind]} · {bare(node.id)}{vis.node[i]?'':` · ${m.hidden}`}</small></button></li>)}</ul>{!listed.length&&<p className="tc-note">{m.listEmpty}</p>}{listed.length>listLimit&&<button className="tc-btn" onClick={()=>setListLimit(limit=>limit+40)}>{m.moreNodes}</button>}</section>:null}
        <section className="tc-replay"><h3 id="tc-replay-title" tabIndex={-1}>{m.timeline}</h3>{replay?<>
          <input type="range" aria-label={m.timeReplay} aria-valuetext={cut===null?m.currentValue:new Date(cut).toISOString()} min={tMin} max={tMax} step="any" value={cut??tMax} onChange={event=>seekDate(Number(event.target.value))}/><div className="tc-replay-dates"><time dateTime={new Date(tMin).toISOString()}>{day(tMin)}</time><time dateTime={new Date(tMax).toISOString()}>{day(tMax)}</time></div><p className="tc-note" data-testid="tower-replay">{cut===null?m.currentLead:`${day(cut)} · ${new Date(cut).toISOString().slice(11,19)} UTC`}</p>
          <p className="tc-row"><button className="tc-btn" onClick={replayToggle} disabled={autoplayOff} title={autoplayOff?(reduced?m.reducedAutoplay:lang==='en'?'Global animation is paused':'A animação global está pausada'):undefined}>{playLabel}</button><button className="tc-btn" onClick={()=>seekDate(tMin)} disabled={cut===tMin&&!playing}>{m.start}</button>{cut!==null?<button className="tc-btn" onClick={()=>seekDate(null)}>{m.current}</button>:null}</p>
          <fieldset className="tc-rate" aria-label={m.speedLabel}><legend>{m.speed}</legend>{PLAYBACK_RATES.map(value=><button key={value} type="button" className="tc-btn" aria-pressed={rate===value} onClick={()=>setRate(value)}>{value}×{value===.25?<small> · {m.slowMotion}</small>:null}</button>)}</fieldset><p className="tc-note">{m.dateLead}{undated>0?` ${m.undated(undated)}`:''}{reduced?` ${m.reducedDate}`:''}</p>
        </>:<p className="tc-note" data-testid="tower-replay">{m.replayUnavailable}</p>}</section>
        <section><h3>{m.generation}</h3><dl><dt>{m.published}</dt><dd data-testid="tower-generation"><code>{generatedAt??na}</code></dd><dt>{m.tests}</dt><dd><code>{g.counts.tests}</code>{world.before!==null?` (${m.before} ${world.before})`:''}</dd><dt>{m.drift}</dt><dd>{world.drift===null?m.firstView:`${(world.drift*100).toFixed(2)}% ${m.radius}`}</dd>{g.unresolved>0?<><dt>{m.references}</dt><dd><code>{g.unresolved}</code> {m.missingTest}</dd></>:null}</dl>{history.length>1?<p className="tc-note" data-testid="tower-history"><code>{history.slice(-6).map(item=>`${item.tests}${item.born?` (+${item.born})`:''}`).join(' → ')}</code></p>:null}{refresh?<p className="tc-row"><button className="tc-btn" onClick={()=>void doRefresh()}>{m.refresh}</button><label><input type="checkbox" checked={auto} onChange={event=>setAuto(event.target.checked)}/>{m.every} {Math.round(autoRefreshMs/60000)} {m.minutes}</label></p>:<p className="tc-note">{m.refreshUnavailable}</p>}{status?<p className="tc-note" role="status">{m[status]}</p>:null}</section>
        <section><h3>{m.display}</h3><div className="tc-toggles"><label><input type="checkbox" checked={show.labels} onChange={onShow('labels')}/>{m.labels}</label><label><input type="checkbox" checked={show.hierarchy} onChange={onShow('hierarchy')}/>{m.hierarchy}</label><label><input type="checkbox" checked={show.depends} onChange={onShow('depends')}/>{m.dependencies}</label><label><input type="checkbox" checked={show.box} onChange={onShow('box')}/>{m.box}</label><label><input type="checkbox" checked={motionOn} disabled={autoplayOff} onChange={toggleMotion}/>{m.motion}</label></div><p className="tc-note" data-testid="tower-renderer">{m.renderer}: {renderer==='webgl'?'WebGL2':m.canvasFallback} · {m.quality.toLowerCase()} {quality==='low'?m.low.toLowerCase():m.high.toLowerCase()}.</p><p className="tc-note" data-testid="tower-visual-note">{m.visualNote}</p><p className="tc-note" data-testid="tower-physics">{m.physics}{reduced?` ${m.reducedOff}`:''}</p></section>
      </aside>:null}
    </div>
  );
}
