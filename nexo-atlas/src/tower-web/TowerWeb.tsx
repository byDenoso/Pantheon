// Tower web page: Canvas 2D renderer over the graph engine (graph.ts / model.ts / layout.ts / draw.ts).
// No Three.js, no per-frame loop: the canvas is redrawn on demand (pointer, wheel, resize, toggles).
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {buildTowerGraph, TOWER_ID, type TowerNode, type TowerTest} from './model.ts';
import {layoutTower} from './layout.ts';
import {buildScene, domainHue, drawScene, fitView, hitTest, hsl, toWorld, verdictColor, VERDICT_KEYS, type DrawState, type Show, type Theme, type View} from './draw.ts';
import {describeState, stateLabel, UI} from '../i18n/state-language.ts';
import {useDocumentLang} from '../i18n/useDocumentLang.ts';
import './tower-web.css';

export type TowerWebProps = {
  tests: readonly TowerTest[];
  campaignLabel?: (id: string) => string | null;
  normDomain?: (d: string) => string;
  theme?: Theme;
  backHref?: string;
};

const KIND_PT: Record<string, string> = {root: 'Torre', domain: 'Domínio', subdomain: 'Subdomínio', campaign: 'Campanha de testes', test: 'Teste'};
const na = 'indisponível';
const fmt = (n: number | undefined, d = 3) => (n === undefined || !Number.isFinite(n) ? na : n.toFixed(d));

export default function TowerWeb({tests, campaignLabel, normDomain, theme: themeProp, backHref = '#/agora'}: TowerWebProps) {
  const theme: Theme = themeProp ?? (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const lang = useDocumentLang(); const langRef = useRef(lang); langRef.current = lang;
  const g = useMemo(() => buildTowerGraph(tests, {normDomain, campaignLabel}), [tests, normDomain, campaignLabel]);
  const layout = useMemo(() => layoutTower(g), [g]);
  const scene = useMemo(() => buildScene(g, layout), [g, layout]);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({k: 1, x: 0, y: 0});
  const sizeRef = useRef({w: 0, h: 0, dpr: 1});
  const raf = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [show, setShow] = useState<Show>({contain: true, depends: true, critical: true, articulation: true, voids: true});
  const stateRef = useRef({selected, show, theme});
  stateRef.current = {selected, show, theme};

  // everything connected to the selection stays lit
  const focus = useMemo(() => {
    const s = new Set<string>(); if (!selected) return s;
    s.add(selected);
    for (let n: TowerNode | undefined = g.byId.get(selected); n; n = n.parent ? g.byId.get(n.parent) : undefined) s.add(n.id);
    const node = g.byId.get(selected);
    if (node?.kind === 'test') for (const l of g.links) { if (l.source === selected) s.add(l.target); else if (l.target === selected) s.add(l.source); }
    else if (node) { const walk = (id: string) => { s.add(id); for (const c of g.byId.get(id)?.children ?? []) walk(c); }; walk(selected); }
    return s;
  }, [g, selected]);
  const focusRef = useRef(focus); focusRef.current = focus;

  const draw = useCallback(() => {
    raf.current = 0;
    const cv = canvasRef.current; const ctx = cv?.getContext('2d'); if (!cv || !ctx) return;
    const {w, h, dpr} = sizeRef.current; if (!w || !h) return;
    const st: DrawState = {view: viewRef.current, w, h, dpr, theme: stateRef.current.theme, show: stateRef.current.show, selected: stateRef.current.selected, hover: hoverRef.current, focus: focusRef.current};
    drawScene(ctx, scene, st);
  }, [scene]);
  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);
  const fit = useCallback(() => { viewRef.current = fitView(scene, sizeRef.current.w, sizeRef.current.h); schedule(); }, [scene, schedule]);

  useEffect(() => { schedule(); }, [selected, show, theme, focus, schedule]);

  // size + DPR
  useEffect(() => {
    const stage = stageRef.current, cv = canvasRef.current; if (!stage || !cv) return;
    let first = true;
    const measure = () => {
      const r = stage.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      sizeRef.current = {w, h, dpr};
      if (first) { first = false; viewRef.current = fitView(scene, w, h); }
      schedule();
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(stage);
    return () => { ro.disconnect(); if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };
  }, [scene, schedule]);

  // pointer: pan, wheel zoom around the cursor, hover, click
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    let drag: {x: number; y: number; vx: number; vy: number; moved: boolean} | null = null;
    const local = (e: {clientX: number; clientY: number}) => { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const v = viewRef.current; const k = Math.min(40, Math.max(0.05, v.k * factor)); const wp = toWorld(v, sx, sy);
      viewRef.current = {k, x: sx - wp.x * k, y: sy - wp.y * k}; schedule();
    };
    const tip = (id: string | null, sx: number, sy: number) => {
      const el = tipRef.current; if (!el) return;
      const n = id ? g.byId.get(id) : null;
      if (!n) { el.style.display = 'none'; return; }
      el.textContent = `${KIND_PT[n.kind]} · ${n.label}${n.verdict ? ` · ${stateLabel(n.verdict, langRef.current)}` : ''}`;
      el.style.display = 'block'; el.style.left = `${Math.min(sx + 12, sizeRef.current.w - 270)}px`; el.style.top = `${Math.max(4, sy - 30)}px`;
    };
    const down = (e: PointerEvent) => { cv.setPointerCapture(e.pointerId); const p = local(e); drag = {x: p.x, y: p.y, vx: viewRef.current.x, vy: viewRef.current.y, moved: false}; cv.classList.add('tw-drag'); };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        viewRef.current = {...viewRef.current, x: drag.vx + dx, y: drag.vy + dy}; schedule(); return;
      }
      const id = hitTest(scene, viewRef.current, p.x, p.y);
      if (id !== hoverRef.current) { hoverRef.current = id; tip(id, p.x, p.y); schedule(); } else if (id) tip(id, p.x, p.y);
    };
    const up = (e: PointerEvent) => {
      cv.classList.remove('tw-drag'); const d = drag; drag = null;
      if (d && !d.moved) { const p = local(e); const id = hitTest(scene, viewRef.current, p.x, p.y); setSelected(id === selectedNow() ? null : id); }
    };
    const selectedNow = () => stateRef.current.selected;
    const leave = () => { hoverRef.current = null; tip(null, 0, 0); schedule(); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); };
    const dbl = () => fit();
    const key = (e: KeyboardEvent) => {
      const {w, h} = sizeRef.current; const step = 60; let used = true;
      if (e.key === 'ArrowLeft') viewRef.current = {...viewRef.current, x: viewRef.current.x + step};
      else if (e.key === 'ArrowRight') viewRef.current = {...viewRef.current, x: viewRef.current.x - step};
      else if (e.key === 'ArrowUp') viewRef.current = {...viewRef.current, y: viewRef.current.y + step};
      else if (e.key === 'ArrowDown') viewRef.current = {...viewRef.current, y: viewRef.current.y - step};
      else if (e.key === '+' || e.key === '=') { zoomAt(w / 2, h / 2, 1.25); used = false; }
      else if (e.key === '-' || e.key === '_') { zoomAt(w / 2, h / 2, 0.8); used = false; }
      else if (e.key === '0') { fit(); used = false; }
      else if (e.key === 'Escape') setSelected(null);
      else return;
      if (used) schedule();
      e.preventDefault();
    };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', leave); cv.addEventListener('wheel', wheel, {passive: false}); cv.addEventListener('dblclick', dbl); cv.addEventListener('keydown', key);
    return () => {
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('pointerleave', leave); cv.removeEventListener('wheel', wheel); cv.removeEventListener('dblclick', dbl); cv.removeEventListener('keydown', key);
    };
  }, [scene, g, schedule, fit]);

  const sel = selected ? g.byId.get(selected) ?? null : null;
  const m = g.metrics;
  const chain = (n: TowerNode) => { const out: TowerNode[] = []; for (let c: TowerNode | undefined = n; c && c.kind !== 'root'; c = c.parent ? g.byId.get(c.parent) : undefined) out.unshift(c); return out; };
  const neighbours = (id: string) => ({
    from: g.links.filter(l => l.target === id).map(l => ({id: l.source, kind: l.kind})),
    to: g.links.filter(l => l.source === id).map(l => ({id: l.target, kind: l.kind})),
  });
  const toggle = (k: keyof Show) => (e: {target: {checked: boolean}}) => setShow(s => ({...s, [k]: e.target.checked}));
  const nb = sel?.kind === 'test' ? neighbours(sel.id) : null;
  const root = g.byId.get(TOWER_ID);
  const verdictsUsed = VERDICT_KEYS.filter(v => g.nodes.some(n => n.verdict === v));
  const voidMax = layout.voids.reduce((a, v) => Math.max(a, v.gap), 0), voidMin = layout.voids.reduce((a, v) => Math.min(a, v.gap), Infinity);

  return (
    <div className="tw" data-theme={theme} data-testid="tower-web">
      <header>
        <h1>Teia da Torre</h1>
        <a href={backHref}>← Atlas</a>
        <ul className="tw-stats" aria-label="Estatísticas do grafo">
          <li><b data-stat="domains">{g.counts.domains}</b> domínios</li>
          <li><b data-stat="subdomains">{g.counts.subdomains}</b> subdomínios</li>
          <li><b data-stat="campaigns">{g.counts.campaigns}</b> campanhas</li>
          <li><b data-stat="tests">{g.counts.tests}</b> testes</li>
          <li><b data-stat="dependencies">{g.counts.dependencies}</b> dependências</li>
          <li><b data-stat="contests">{g.counts.contests}</b> contestações</li>
          <li><b>{m.componentCount}</b> {m.componentCount === 1 ? 'componente' : 'componentes'} (maior {m.largestComponent})</li>
          <li>profundidade <b>{m.depth}</b></li>
          <li><b>{m.cyclic.size}</b> em ciclo</li>
          <li><b>{m.articulation.size}</b> pontos de articulação</li>
          {g.unresolved > 0 ? <li><b>{g.unresolved}</b> referências sem teste publicado</li> : null}
        </ul>
      </header>
      <div className="tw-stage" ref={stageRef}>
        <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={`Teia da Torre: ${g.counts.domains} domínios, ${g.counts.campaigns} campanhas, ${g.counts.tests} testes. Setas movem, + e - ampliam, 0 reajusta, Esc limpa a seleção.`}/>
        <div className="tw-tip" ref={tipRef} role="presentation"/>
        {g.counts.tests === 0 ? <div className="tw-empty" role="status">Nenhum teste publicado nesta geração.</div> : null}
      </div>
      <aside>
        <h2>Camadas</h2>
        <div className="tw-toggles">
          <label><input type="checkbox" checked={show.contain} onChange={toggle('contain')}/> Hierarquia (Torre › domínio › subdomínio › campanha › teste)</label>
          <label><input type="checkbox" checked={show.depends} onChange={toggle('depends')}/> Dependências e contestações</label>
          <label><input type="checkbox" checked={show.critical} onChange={toggle('critical')}/> Caminho crítico{m.criticalPath.length > 1 ? ` (${m.criticalPath.length} testes)` : ` (${na})`}</label>
          <label><input type="checkbox" checked={show.articulation} onChange={toggle('articulation')}/> Pontos de articulação</label>
          <label><input type="checkbox" checked={show.voids} onChange={toggle('voids')}/> Vazios entre domínios</label>
        </div>
        <p className="tw-note">Tamanho do nó de teste = centralidade de intermediação (escala log). Anel = ponto de articulação. Os vazios entre domínios usam escala logarítmica
          {layout.voids.length > 0 && Number.isFinite(voidMin) ? ` (de ${(voidMin * 180 / Math.PI).toFixed(1)}° a ${(voidMax * 180 / Math.PI).toFixed(1)}°)` : ''}: domínios sem ligação ganham mais espaço, mas nunca dominam o círculo.</p>

        <h2>Legenda</h2>
        <div className="tw-legend">
          {g.domains.map(d => <span key={d}><i style={{background: hsl(domainHue(d), 70, theme === 'dark' ? 60 : 45)}}/>{g.byId.get(`domain:${d}`)?.label ?? d}</span>)}
        </div>
        <div className="tw-legend" style={{marginTop: 6}}>
          {verdictsUsed.length === 0 ? <span>Sem vereditos publicados</span> : verdictsUsed.map(v => <span key={v}><i style={{background: verdictColor(v, theme)}}/>{stateLabel(v, lang)}</span>)}
          {g.nodes.some(n => n.kind === 'test' && !n.verdict) ? <span><i style={{background: verdictColor(null, theme)}}/>sem veredito</span> : null}
        </div>

        <h2>Seleção</h2>
        {!sel ? <p className="tw-note">Clique em um nó ou escolha na lista abaixo.</p> : (
          <div data-testid="tower-selection">
            <p style={{margin: '0 0 6px'}}><b>{sel.label}</b></p>
            <dl>
              <dt>Tipo</dt><dd>{KIND_PT[sel.kind]}</dd>
              {sel.kind !== 'root' ? <><dt>Caminho</dt><dd>{chain(sel).map(n => n.label).join(' › ')}</dd></> : null}
              {sel.kind === 'test' ? <>
                <dt>Situação</dt><dd>{describeState(sel.verdict, lang).label}{sel.verdict ? <details><summary>{UI[lang].technical}</summary><code>{sel.verdict}</code></details> : null}</dd>
                <dt>Grau</dt><dd>{m.degree.get(sel.id) ?? 0} (entram {m.inDeg.get(sel.id) ?? 0}, saem {m.outDeg.get(sel.id) ?? 0})</dd>
                <dt>Intermediação</dt><dd>{fmt(m.betweenness.get(sel.id))}</dd>
                <dt>Camada</dt><dd>{m.layer.get(sel.id) ?? na}</dd>
                <dt>Articulação</dt><dd>{m.articulation.has(sel.id) ? 'sim' : 'não'}</dd>
                <dt>Em ciclo</dt><dd>{m.cyclic.has(sel.id) ? 'sim' : 'não'}</dd>
                <dt>Caminho crítico</dt><dd>{m.criticalPath.includes(sel.id) ? 'sim' : 'não'}</dd>
              </> : <><dt>Testes</dt><dd>{sel.leaves}</dd></>}
              {sel.unpublished ? <><dt>Publicação</dt><dd>não publicado</dd></> : null}
            </dl>
            {nb ? <>
              {([['Depende de / contesta', nb.from], ['Alimenta / é contestado por', nb.to]] as const).map(([title, list]) => (
                <div key={title}><h2>{title}</h2>
                  {list.length === 0 ? <p className="tw-note">nenhum</p> : list.map(x => <div key={`${x.kind}${x.id}`}><button className="tw-link" onClick={() => setSelected(x.id)}>{g.byId.get(x.id)?.label ?? x.id}</button>{x.kind === 'contests' ? ' (contestação)' : ''}</div>)}
                </div>))}
            </> : null}
          </div>
        )}

        <h2>Hierarquia</h2>
        {root ? <ul className="tw-tree" style={{paddingLeft: 0}}><Tree g={g} id={root.id} select={setSelected} selected={selected} depth={0}/></ul> : null}
      </aside>
    </div>
  );
}

export function Tree({g, id, select, selected, depth}: {g: ReturnType<typeof buildTowerGraph>; id: string; select: (id: string) => void; selected: string | null; depth: number}) {
  const [open, setOpen] = useState(depth < 1);
  const n = g.byId.get(id); if (!n) return null;
  if (n.kind === 'test') return <li><button className="tw-link" aria-current={selected === id ? 'true' : undefined} onClick={() => select(id)}>{n.label}</button></li>;
  // children are mounted only while open: a Tower with thousands of tests must not put thousands of nodes in the DOM
  return (
    <li>
      <details open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary><button className="tw-link" aria-current={selected === id ? 'true' : undefined} onClick={e => { e.preventDefault(); select(id); }}>{n.label}</button> <span className="tw-note">({n.leaves})</span></summary>
        {open ? <ul className="tw-tree">{n.children.map(c => <Tree key={c} g={g} id={c} select={select} selected={selected} depth={depth + 1}/>)}</ul> : null}
      </details>
    </li>
  );
}
