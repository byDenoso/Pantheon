import { useEffect, useMemo, useRef } from 'react';
import { useNexoStore } from '../data/NexoStore.tsx';
import {
  buildConnectome, CONNECTOME_DOMAINS, CONNECTOME_RGB,
  type ConnectomeDomain, type ConnectomeModel,
} from '../viewmodels/connectome.ts';
import './ConnectomeView.css';

const NAME: Record<ConnectomeDomain, string> = { NEXO: 'Nexo', SCIENCE: 'Ciência', ENGINEERING: 'Engenharia', OLYMPUS: 'Olympus' };
type RGB = [number, number, number];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const GREY: RGB = [132, 144, 162];
const SEG = 9;

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

/** Draws one frame. Kept outside React so the loop never re-renders the tree. */
function paint(ctx: CanvasRenderingContext2D, W: number, H: number, model: ConnectomeModel, t: number, reduced: boolean) {
  const nodes = model.nodes;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  const proj = nodes.map(n => { const x = n.x, y = n.y * 0.55 + n.z * 0.62;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; return [x, y]; });
  const pad = Math.max(24, Math.min(W, H) * 0.055);
  const s = Math.min((W - pad * 2) / ((maxx - minx) || 1), (H - pad * 2) / ((maxy - miny) || 1));
  const ox = W / 2 - ((minx + maxx) / 2) * s, oy = H / 2 - ((miny + maxy) / 2) * s;
  const P = (i: number): [number, number] => [proj[i][0] * s + ox, proj[i][1] * s + oy];
  const clock = reduced ? 0 : t;

  ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const noise = seeded(3);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(120,145,180,${(0.012 + noise() * 0.03).toFixed(3)})`;
    ctx.fillRect(noise() * W, noise() * H, 1, 1);
  }

  /* axons and their action potentials; cadence follows the measured weight */
  model.axons.forEach((ax, idx) => {
    const pa = P(ax.a), pb = P(ax.b);
    const bow = (0.13 + (idx % 5) * 0.035) * (idx % 2 ? 1 : -1);
    const c: [number, number] = [(pa[0] + pb[0]) / 2 + (pb[1] - pa[1]) * bow, (pa[1] + pb[1]) / 2 - (pb[0] - pa[0]) * bow];
    const ca = CONNECTOME_RGB[ax.from], cb = CONNECTOME_RGB[ax.to];
    const mid: RGB = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
    ctx.strokeStyle = rgba(mid, 0.05 + 0.1 * ax.conduction * ax.weight);
    ctx.lineWidth = 0.6 + ax.weight * 1.7 * ax.conduction;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(c[0], c[1], pb[0], pb[1]); ctx.stroke();
    const on = (u: number): [number, number] => { const v = 1 - u;
      return [v * v * pa[0] + 2 * v * u * c[0] + u * u * pb[0], v * v * pa[1] + 2 * v * u * c[1] + u * u * pb[1]]; };
    const pulses = ax.status === 'ESTABLISHED' ? 3 : ax.status === 'PROVISIONAL' ? 2 : 1;
    const hot: RGB = [Math.min(255, mid[0] + 70), Math.min(255, mid[1] + 70), Math.min(255, mid[2] + 70)];
    for (let k = 0; k < pulses; k++) {
      const u = ((clock * (0.18 + ax.weight * 0.38) + idx * 0.137 + k / pulses) % 1);
      const head = 0.55 + 0.45 * Math.sin(u * Math.PI);
      for (let tr = 0; tr < 5; tr++) {
        const ut = u - tr * 0.018; if (ut < 0) continue;
        const q = on(ut);
        ctx.fillStyle = rgba(hot, (1 - tr / 5) * head * ax.conduction * 0.42);
        ctx.beginPath(); ctx.arc(q[0], q[1], 2.4 - tr * 0.34, 0, 6.2832); ctx.fill();
      }
    }
  });

  model.supports.forEach(([a, b], i) => {
    const pa = P(a), pb = P(b);
    ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(186,200,222,.16)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
    const bo = 0.5 + 0.5 * Math.sin(clock * 1.4 + i);
    ctx.fillStyle = `rgba(200,214,235,${(0.16 + 0.22 * bo).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(pb[0], pb[1], 1.7 + 0.8 * bo, 0, 6.2832); ctx.fill();
  });

  const width = (i: number) => Math.max(0.4, Math.min(7.5, 0.42 * Math.sqrt(nodes[i].mass)));
  const tree = (i: number, depth: number, from: [number, number] | null, col: RGB, visited: Set<number>) => {
    if (visited.has(i)) return; visited.add(i);
    const p = P(i), node = nodes[i];
    if (from) {
      const dead = node.status === 'BLOCKED', mye = node.myelinated;
      const c = dead ? GREY : col, alpha = dead ? 0.1 : mye ? 0.6 : 0.34;
      const bend = 0.13 * (depth % 2 ? 1 : -1);
      const mx = (from[0] + p[0]) / 2 + (p[1] - from[1]) * bend, my = (from[1] + p[1]) / 2 - (p[0] - from[0]) * bend;
      const w0 = width(node.parent >= 0 ? node.parent : i) * 0.75, w1 = width(i) * 0.75;
      let prev = from;
      for (let k = 1; k <= SEG; k++) {
        const u = k / SEG, v = 1 - u;
        const x = v * v * from[0] + 2 * v * u * mx + u * u * p[0], y = v * v * from[1] + 2 * v * u * my + u * u * p[1];
        ctx.strokeStyle = rgba(c, alpha * (1 - 0.25 * u)); ctx.lineWidth = Math.max(0.35, w0 + (w1 - w0) * u);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke();
        prev = [x, y];
      }
      if (mye) {
        ctx.strokeStyle = rgba(col, alpha * 0.27); ctx.lineWidth = Math.max(1.2, (w0 + w1) * 1.9);
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mx, my, p[0], p[1]); ctx.stroke();
      }
    }
    for (const k of node.children) tree(k, depth + 1, p, col, visited);
    if (!node.children.length) {
      if (node.status === 'READY') {
        /* growth cone: the motile tip of a neurite still reaching for a connection */
        const fl = 0.55 + 0.45 * Math.sin(clock * 2.6 + i * 1.7);
        ctx.fillStyle = rgba(col, 0.22 + 0.4 * fl);
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.5 + 1.7 * fl, 0, 6.2832); ctx.fill();
        const r = seeded(400 + i);
        for (let f = 0; f < 4; f++) {
          const ang = r() * 6.2832, len = 3 + 5 * r() * fl;
          ctx.strokeStyle = rgba(col, 0.1 + 0.22 * fl); ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len); ctx.stroke();
        }
      } else if (node.status === 'BLOCKED') {
        ctx.strokeStyle = 'rgba(150,160,175,.3)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(p[0] - 2.6, p[1] - 2.6); ctx.lineTo(p[0] + 2.6, p[1] + 2.6);
        ctx.moveTo(p[0] + 2.6, p[1] - 2.6); ctx.lineTo(p[0] - 2.6, p[1] + 2.6); ctx.stroke();
      }
    }
  };
  for (const d of CONNECTOME_DOMAINS) { const i = model.somata[d]; if (i !== undefined) tree(i, 0, null, CONNECTOME_RGB[d], new Set()); }

  // Resolve label collisions from the actual projected soma positions. This keeps
  // the layout data-driven while preventing close domains from printing on top of
  // each other as the graph changes.
  const labelAnchors = new Map<ConnectomeDomain, [number, number]>();
  for (const d of CONNECTOME_DOMAINS) {
    const i = model.somata[d]; if (i === undefined) continue;
    const p = P(i);
    const r = 7 + Math.min(15, Math.sqrt(nodes[i].mass) * 1.15);
    labelAnchors.set(d, [p[0], p[1] + r * 2 + 6]);
  }
  const anchors = [...labelAnchors.entries()];
  for (let pass = 0; pass < 4; pass++) {
    for (let a = 0; a < anchors.length; a++) for (let b = a + 1; b < anchors.length; b++) {
      const pa = anchors[a][1], pb = anchors[b][1];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (Math.abs(dx) >= 104 || Math.abs(dy) >= 28) continue;
      const sign = dx === 0 ? (a % 2 ? -1 : 1) : Math.sign(dx);
      const push = (104 - Math.abs(dx)) * 0.5 + 4;
      pa[0] = Math.max(58, Math.min(W - 58, pa[0] - sign * push));
      pb[0] = Math.max(58, Math.min(W - 58, pb[0] + sign * push));
    }
  }

  for (const d of CONNECTOME_DOMAINS) {
    const i = model.somata[d]; if (i === undefined) continue;
    const p = P(i), c = CONNECTOME_RGB[d], q = model.lanes[d];
    const r = 7 + Math.min(15, Math.sqrt(nodes[i].mass) * 1.15);
    /* a soma waiting for a decision fires in bursts and keeps firing */
    const burst = model.attention[d] ? 0.55 + 0.45 * Math.sin(clock * 5.2) * Math.max(0, Math.sin(clock * 1.25)) : 0;
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.4);
    g.addColorStop(0, rgba([255, 255, 255], 0.3 + 0.45 * burst));
    g.addColorStop(0.22, rgba(c, 0.34 + 0.4 * burst));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 3.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = rgba(c, 0.88); ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.55, 0, 6.2832); ctx.fill();
    ctx.font = '600 12px "IBM Plex Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const anchor = labelAnchors.get(d) ?? [p[0], p[1] + r * 2 + 6];
    const lx = anchor[0], ly = anchor[1];
    ctx.fillStyle = 'rgba(5,7,11,.8)'; ctx.fillText(NAME[d], lx + 1, ly + 1);
    ctx.fillStyle = rgba(c, 1); ctx.fillText(NAME[d], lx, ly);
    ctx.font = '400 10px "IBM Plex Mono",monospace'; ctx.fillStyle = 'rgba(150,168,192,.65)';
    ctx.fillText(q ? `${q.done} de ${q.tests} mielinizados` : 'sem axónios próprios', lx, ly + 14);
  }
}

export function ConnectomeView() {
  const { system } = useNexoStore();
  const state = system.state;
  const model = useMemo(() => state ? buildConnectome(state) : null, [state?.bus.fingerprint]);
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !model) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    };
    const t0 = performance.now();
    const frame = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, W, H, model, (now - t0) / 1000, reduced);
      raf = requestAnimationFrame(frame);
    };
    resize(); window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [model]);

  if (!model) return <div className="connectome-empty">A carregar a projeção…</div>;

  return (
    <div className="connectome" data-renderer="connectome">
      <canvas ref={ref} className="connectome-canvas" aria-label="Conectoma do estado do NEXO" />
      <section className="connectome-key" aria-label="Como ler">
        <h2>Carta de leitura</h2>
        <p className="sub">Nada aqui é decorativo. Cada traço corresponde a um campo dos dados publicados.</p>
        <dl>
          <div><dt>Soma</dt><dd>domínio. O tamanho é a massa que possui.</dd></div>
          <div><dt>Dendrite</dt><dd>hierarquia. A espessura é o trabalho que carrega.</dd></div>
          <div><dt>Mielina</dt><dd>teste concluído: bainha espessa, conduz melhor.</dd></div>
          <div><dt>Cone</dt><dd>teste pronto. Ponta que ainda procura ligação.</dd></div>
          <div><dt>Podada</dt><dd>bloqueado: fica visível, deixa de conduzir.</dd></div>
          <div><dt>Axónio</dt><dd>filamento entre domínios. O tráfego é o peso medido.</dd></div>
          <div><dt>Disparo</dt><dd>soma em rajada: <em>espera decisão tua.</em> Não para sozinha.</dd></div>
        </dl>
        <p className="note">O Learning Loop é plasticidade sináptica: uma relação estabelecida conduz, uma provisória conduz pouco, uma em teste quase não conduz.</p>
        <p className="meta">{model.nodes.length} nós · {model.axons.length} axónios · {model.supports.length} sinapses colaterais{model.selfLoops ? ` · ${model.selfLoops} filamentos internos` : ''}</p>
      </section>
    </div>
  );
}
