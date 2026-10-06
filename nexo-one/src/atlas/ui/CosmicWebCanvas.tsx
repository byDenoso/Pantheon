import {useEffect, useRef, useState} from 'react';
import {QUALITY, buildWeb, initialQuality, nextQuality, project, type Web} from '../web/webModel.ts';

const SEED = 20251;
const PALETTE = {
  dark: {line: '30,91,255', hub: '185,219,255', node: '104,144,255'},
  light: {line: '30,91,255', hub: '18,52,143', node: '30,91,255'},
} as const;

function sprite(rgb: string): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.28)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

export default function CosmicWebCanvas({label}: {label: string}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', {alpha: true});
    if (!ctx) { setFallback(true); return; }
    const c2d: CanvasRenderingContext2D = ctx;
    const nav = navigator as Navigator & {deviceMemory?: number};
    let qKey = initialQuality(window.innerWidth, nav.hardwareConcurrency, nav.deviceMemory);
    let web: Web = buildWeb(SEED, QUALITY[qKey]);
    let w = 0, h = 0, dpr = 1;
    let angle = 0.6;
    let raf = 0;
    let last = 0;
    let ema = 0;
    let visible = true;
    let tabVisible = !document.hidden;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = rm.matches;
    let palette = document.documentElement.dataset.theme === 'light' ? PALETTE.light : PALETTE.dark;
    let sprites = {hub: sprite(palette.hub), node: sprite(palette.node)};

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, QUALITY[qKey].dprCap);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      c2d.clearRect(0, 0, w, h);
      const q = QUALITY[qKey];
      const pts = web.nodes.map(n => project(n, angle, w, h, w > 760 ? w * 0.64 : w / 2));
      // arcs: three depth bins, one stroke per bin
      for (let bin = 0; bin < 3; bin++) {
        c2d.beginPath();
        for (const [a, b] of web.arcs) {
          const pa = pts[a]!, pb = pts[b]!;
          const d = (pa.depth + pb.depth) / 2;
          const k = d < 0.62 ? 0 : d < 0.8 ? 1 : 2;
          if (k !== bin) continue;
          c2d.moveTo(pa.sx, pa.sy); c2d.lineTo(pb.sx, pb.sy);
        }
        c2d.strokeStyle = `rgba(${palette.line},${0.1 + bin * 0.12})`;
        c2d.lineWidth = 0.6 + bin * 0.35;
        c2d.stroke();
      }
      for (let i = 0; i < web.nodes.length; i++) {
        const n = web.nodes[i]!, p = pts[i]!;
        const r = n.r * (0.7 + p.depth * 0.9) * (n.r > 2 ? 4 : 1.2);
        const s = n.r > 2 ? sprites.hub : sprites.node;
        if (q.glow && s) { c2d.drawImage(s, p.sx - r * 2, p.sy - r * 2, r * 4, r * 4); }
        else { c2d.fillStyle = `rgba(${n.r > 2 ? palette.hub : palette.node},0.85)`; c2d.beginPath(); c2d.arc(p.sx, p.sy, Math.max(0.8, r / 2), 0, 6.2832); c2d.fill(); }
      }
    };

    const canRun = () => visible && tabVisible && !reduced;
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const tick = (t: number) => {
      raf = 0;
      if (!canRun()) return;
      const dt = last ? Math.min(t - last, 64) : 16;
      last = t;
      angle += dt * 0.00004;
      const t0 = performance.now();
      draw();
      ema = ema ? ema * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0;
      const nq = nextQuality(qKey, ema);
      if (nq !== qKey) { qKey = nq; web = buildWeb(SEED, QUALITY[qKey]); ema = 0; resize(); }
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop(); last = 0;
      if (canRun()) raf = requestAnimationFrame(tick);
      else draw(); // paused or reduced motion: a single static frame
    };

    const ro = new ResizeObserver(() => { resize(); sync(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(es => { visible = es[es.length - 1]?.isIntersecting ?? true; sync(); });
    io.observe(canvas);
    const onVis = () => { tabVisible = !document.hidden; sync(); };
    const onRm = () => { reduced = rm.matches; sync(); };
    const mo = new MutationObserver(() => {
      palette = document.documentElement.dataset.theme === 'light' ? PALETTE.light : PALETTE.dark;
      sprites = {hub: sprite(palette.hub), node: sprite(palette.node)};
      sync();
    });
    mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    document.addEventListener('visibilitychange', onVis);
    rm.addEventListener('change', onRm);
    resize(); sync();
    return () => {
      stop(); ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      rm.removeEventListener('change', onRm);
    };
  }, []);

  return <canvas ref={ref} className="atlas-web" role="img" aria-label={label} data-fallback={fallback ? 'static' : undefined}/>;
}
