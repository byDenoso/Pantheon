// Observatório: teia cósmica WebGL contínua atrás de todas as páginas.
// Leitura: cada domínio é uma região (halo grande) da teia; cada hipótese é um nó;
// cada teste é uma estrela no filamento que liga sua hipótese ao domínio.
// Cor/pulso = veredito (confirmado queima estável, em revisão pulsa, bloqueado apaga, refutado vermelho).
// A câmera muda de enquadramento por página; clicar numa estrela abre o teste.
import { useEffect, useRef } from 'react';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments,
  PerspectiveCamera, Points, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { TestEntity, Verdict } from './model.ts';

export type ScenePage = 'agora' | 'ciclo' | 'roadmaps' | 'roadmap' | 'evidencia' | 'entidade' | 'saude';

const DOMAINS: Array<{ id: string; label: string; at: [number, number, number] }> = [
  { id: 'SCIENCE', label: 'Ciência', at: [-6.5, 1.5, -2] },
  { id: 'ENGINEERING', label: 'Engenharia', at: [6, -1, 3] },
  { id: 'OLYMPUS', label: 'Olympus', at: [1.5, 5, 7] },
];
const domainIndex = (d: string) => (d === 'ENGINEERING' || d === 'NEXO' || d === 'ARTIFACT' ? 1 : d === 'OLYMPUS' ? 2 : 0);

const VERDICT_RGB: Record<Verdict, [number, number, number]> = {
  CONFIRMED: [0.5, 1, 0.75], REFUTED: [1, 0.3, 0.26], REVIEW: [1, 0.78, 0.35], PROVISIONAL: [0.72, 0.8, 1],
  READY: [0.85, 0.72, 0.95], BLOCKED: [0.4, 0.38, 0.48], DISCARDED: [0.28, 0.26, 0.32],
};
const VERDICT_SIZE: Record<Verdict, number> = { CONFIRMED: 34, REFUTED: 24, REVIEW: 26, PROVISIONAL: 17, READY: 12, BLOCKED: 11, DISCARDED: 7 };
const VERDICT_PULSE: Record<Verdict, number> = { CONFIRMED: 0.12, REFUTED: 0, REVIEW: 1, PROVISIONAL: 0.25, READY: 0.45, BLOCKED: 0, DISCARDED: 0 };

// [distância, elevação, azimute, alvo(domínio índice ou -1 = centro)]
const SHOTS: Record<ScenePage, [number, number, number, number]> = {
  agora: [30, 0.42, 0.7, -1], ciclo: [21, 0.2, 1.8, -1], roadmaps: [17, 0.55, 2.6, 0], roadmap: [12, 0.4, 3.1, 0],
  evidencia: [24, 0.9, 3.9, -1], entidade: [10, 0.3, 4.4, 0], saude: [38, 0.12, 5.3, -1],
};

const VERT = `
attribute float size; attribute vec3 tint; attribute float pulse; attribute float seed;
uniform float time; uniform float pixelRatio; varying vec3 vTint; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  float p = 1.0 + pulse * 0.4 * sin(time*2.4 + seed*6.28);
  gl_PointSize = size * p * pixelRatio * (18.0 / -mv.z);
  vTint = tint; vAlpha = clamp(0.5 + 0.5*p, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vTint; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float glow = exp(-d*d*20.0); float core = smoothstep(0.12, 0.0, d);
  float a = (glow + core) * vAlpha; if (a < 0.01) discard;
  gl_FragColor = vec4(vTint * (0.55 + glow*0.8) + core*0.6, a);
}`;

const rnd = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Finalizador murmur3: sem ele, ids curtos parecidos caem alinhados.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const jitter = (seed: string, s: number): [number, number, number] =>
  [(rnd(seed + 'x') - 0.5) * s, (rnd(seed + 'y') - 0.5) * s, (rnd(seed + 'z') - 0.5) * s];

// Paleta "inferno" da teia: violeta profundo -> magenta -> laranja -> branco-quente.
const INFERNO = ['#04121e', '#0a3452', '#15699a', '#2fa6d8', '#86dcf5', '#e8fbff'].map(c => new Color(c));
const inferno = (t: number) => {
  const x = Math.max(0, Math.min(0.999, t)) * (INFERNO.length - 1), i = Math.floor(x), f = x - i;
  return INFERNO[i]!.clone().lerp(INFERNO[i + 1]!, f);
};

interface Buf { pos: number[]; tint: number[]; size: number[]; pulse: number[]; seed: number[] }
const buf = (): Buf => ({ pos: [], tint: [], size: [], pulse: [], seed: [] });
const push = (b: Buf, p: number[], c: Color | number[], s: number, pu = 0, sd = Math.random()) => {
  b.pos.push(...p); b.tint.push(...(c instanceof Color ? [c.r, c.g, c.b] : c)); b.size.push(s); b.pulse.push(pu); b.seed.push(sd);
};
const geom = (b: Buf) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('tint', new BufferAttribute(new Float32Array(b.tint), 3));
  g.setAttribute('size', new BufferAttribute(new Float32Array(b.size), 1));
  g.setAttribute('pulse', new BufferAttribute(new Float32Array(b.pulse), 1));
  g.setAttribute('seed', new BufferAttribute(new Float32Array(b.seed), 1));
  return g;
};

/** Filamento: partículas ao longo de uma curva levemente arqueada entre dois nós. */
function filament(b: Buf, a: Vector3, c: Vector3, density: number, heat: number, seed: string) {
  const mid = a.clone().add(c).multiplyScalar(0.5).add(new Vector3(...jitter(seed, a.distanceTo(c) * 0.35)));
  const n = Math.max(6, Math.round(a.distanceTo(c) * density));
  const p = new Vector3();
  for (let i = 0; i < n; i += 1) {
    const t = Math.random(), u = 1 - t;
    p.set(u * u * a.x + 2 * u * t * mid.x + t * t * c.x, u * u * a.y + 2 * u * t * mid.y + t * t * c.y, u * u * a.z + 2 * u * t * mid.z + t * t * c.z);
    const spread = 0.12 + 0.25 * Math.sin(Math.PI * t);
    const edge = Math.min(t, u);
    push(b, [p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread],
      inferno(heat * (0.6 + 0.4 * (1 - edge * 2)) * (0.7 + Math.random() * 0.3)).multiplyScalar(1.15), 3 + Math.random() * 4.5);
  }
  return mid;
}

export function ObservatoryScene({ tests, page, focusIds, onPick, theme }: {
  tests: TestEntity[]; page: ScenePage; focusIds?: string[]; onPick: (id: string) => void; theme: 'dark' | 'light';
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ shot: (p: ScenePage) => void; focus: (ids: string[]) => void } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { el.dataset.fallback = 'true'; return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 2 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(48, 1, 0.1, 300);
    const uniforms = { time: { value: 0 }, pixelRatio: { value: dpr } };
    const mat = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending });

    // --- Estrutura: domínios, hipóteses, filamentos ---
    const web = buf();
    const domainPos = DOMAINS.map(d => new Vector3(...d.at));
    // Filamentos entre domínios (a teia maior) + ramos cegos para dar textura de rede.
    for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) filament(web, domainPos[i]!, domainPos[j]!, mobile ? 70 : 120, 0.85, `d${i}${j}`);
    const scale = 13;
    const voids: Vector3[] = [];
    for (let k = 0; k < (mobile ? 40 : 70); k += 1) voids.push(new Vector3(...jitter(`v${k}`, scale * 2)));
    voids.forEach((v, k) => {
      const nearest = [...voids].sort((a, b) => a.distanceTo(v) - b.distanceTo(v)).slice(1, 4);
      nearest.forEach((w, m) => filament(web, v, w, mobile ? 30 : 50, 0.78, `w${k}${m}`));
      push(web, [v.x, v.y, v.z], inferno(0.85), 26 + rnd(`vn${k}`) * 40, 0.1);
      for (let q = 0; q < 40; q += 1) { const r = Math.pow(Math.random(), 2) * 0.9; push(web, [v.x + (Math.random() - 0.5) * r * 2, v.y + (Math.random() - 0.5) * r * 2, v.z + (Math.random() - 0.5) * r * 2], inferno(0.75 + Math.random() * 0.2), 2 + Math.random() * 3); }
    });
    domainPos.forEach((d, i) => {
      const nearest = [...voids].sort((a, b) => a.distanceTo(d) - b.distanceTo(d)).slice(0, 3);
      nearest.forEach((w, m) => filament(web, d, w, mobile ? 26 : 46, 0.85, `dv${i}${m}`));
      // Halo do domínio: aglomerado quente.
      for (let k = 0; k < (mobile ? 260 : 480); k += 1) {
        const r = Math.pow(Math.random(), 2.2) * 2.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        push(web, [d.x + r * Math.sin(ph) * Math.cos(th), d.y + r * Math.cos(ph), d.z + r * Math.sin(ph) * Math.sin(th)], inferno(0.95 - r * 0.2), 3 + Math.random() * 4);
      }
      push(web, [d.x, d.y, d.z], new Color('#eafcff'), 180, 0.08);
    });

    // Hipóteses: nós ao redor do seu domínio; testes ao longo do filamento hipótese->domínio.
    const byHyp = new Map<string, TestEntity[]>();
    for (const t of tests) {
      const key = `${domainIndex(t.domain)}|${t.hypothesisId ?? t.campaignId ?? t.id}`;
      (byHyp.get(key) ?? byHyp.set(key, []).get(key)!).push(t);
    }
    const stars = buf();
    const ids: string[] = [];
    for (const [key, list] of byHyp) {
      const [di] = key.split('|');
      const d = domainPos[Number(di)]!;
      const node = d.clone().add(new Vector3(...jitter(key, 9)));
      filament(web, d, node, mobile ? 16 : 30, 0.7, key);
      push(web, [node.x, node.y, node.z], inferno(0.8), 22 + Math.min(40, list.length * 4), 0.05);
      list.forEach(t => {
        const s = 0.15 + rnd(t.id) * 0.85;
        const p = node.clone().lerp(d, s * 0.8).add(new Vector3(...jitter(t.id, 0.9)));
        push(stars, [p.x, p.y, p.z], VERDICT_RGB[t.verdict], VERDICT_SIZE[t.verdict], reduced ? 0 : VERDICT_PULSE[t.verdict], rnd(t.id));
        ids.push(t.id);
      });
    }
    if (reduced) web.pulse.fill(0);
    const webGeo = geom(web), starGeo = geom(stars);
    scene.add(new Points(webGeo, mat));
    const starPoints = new Points(starGeo, mat);
    scene.add(starPoints);
    const baseSize = Float32Array.from(stars.size);

    // Cubo de simulação: linhas finas que dão escala e a sensação de "caixa observada".
    const B = scale + 2, e: number[] = [];
    const corners = [-B, B];
    for (const x of corners) for (const y of corners) { e.push(x, y, -B, x, y, B); e.push(x, -B, y, x, B, y); e.push(-B, x, y, B, x, y); }
    const boxGeo = new BufferGeometry(); boxGeo.setAttribute('position', new BufferAttribute(new Float32Array(e), 3));
    const boxMat = new LineBasicMaterial({ color: theme === 'dark' ? 0x3f6f8c : 0x5a86a0, transparent: true, opacity: 0.22 });
    scene.add(new LineSegments(boxGeo, boxMat));

    // --- Câmera ---
    const cam = { dist: 40, elev: 0.5, az: 0.3 };
    const target = { dist: 30, elev: 0.42, az: 0.7, look: new Vector3() };
    const look = new Vector3();
    const shot = (p: ScenePage) => {
      const [dist, elev, az, t] = SHOTS[p];
      Object.assign(target, { dist, elev, az: az + Math.round((cam.az - az) / (Math.PI * 2)) * Math.PI * 2 });
      target.look.copy(t >= 0 ? domainPos[t]!.clone().multiplyScalar(0.6) : new Vector3());
    };
    const focus = (list: string[]) => {
      const set = new Set(list);
      const sizes = starGeo.getAttribute('size') as BufferAttribute;
      ids.forEach((id, i) => sizes.setX(i, set.size ? (set.has(id) ? baseSize[i]! * 2.6 : baseSize[i]! * 0.5) : baseSize[i]!));
      sizes.needsUpdate = true;
      if (set.size === 1) {
        const i = ids.indexOf(list[0]!);
        if (i >= 0) target.look.set(stars.pos[i * 3]!, stars.pos[i * 3 + 1]!, stars.pos[i * 3 + 2]!);
      }
    };
    api.current = { shot, focus };

    const resize = () => {
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Desktop: a teia vive à direita, a coluna de leitura à esquerda.
      if (w > 900) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    // Arrastar gira a teia; clicar numa estrela abre o teste.
    const ray = new Raycaster(); ray.params.Points = { threshold: 0.35 };
    const ndc = new Vector2();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const canvas = renderer.domElement;
    const down = (ev: PointerEvent) => { drag = { x: ev.clientX, y: ev.clientY, moved: false }; };
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      target.az += dx * 0.005; target.elev = Math.max(-1.2, Math.min(1.35, target.elev + dy * 0.004));
      drag.x = ev.clientX; drag.y = ev.clientY;
    };
    const up = (ev: PointerEvent) => {
      const was = drag; drag = null;
      if (!was || was.moved) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(starPoints)[0];
      if (hit?.index !== undefined && ids[hit.index]) pickRef.current(ids[hit.index]!);
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    // Rótulos dos domínios projetados em HTML (nítidos, legíveis, sem textura).
    const labelEls = [...(labels.current?.children ?? [])] as HTMLElement[];
    const proj = new Vector3();

    let raf = 0, last = performance.now(), visible = true;
    const vis = () => { visible = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', vis);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      uniforms.time.value += dt;
      if (!reduced && !drag) target.az += dt * 0.025;
      const k = reduced ? 1 : 1 - Math.pow(0.03, dt);
      const fit = camera.aspect < 1 ? 1 / Math.max(0.55, camera.aspect) : 1;
      cam.dist += (target.dist * fit - cam.dist) * k; cam.elev += (target.elev - cam.elev) * k; cam.az += (target.az - cam.az) * k;
      look.lerp(target.look, k);
      camera.position.set(
        look.x + Math.cos(cam.az) * Math.cos(cam.elev) * cam.dist, look.y + Math.sin(cam.elev) * cam.dist,
        look.z + Math.sin(cam.az) * Math.cos(cam.elev) * cam.dist);
      camera.lookAt(look);
      renderer.render(scene, camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      labelEls.forEach((node, i) => {
        proj.copy(domainPos[i]!).project(camera);
        const off = proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1;
        node.style.opacity = off ? '0' : '1';
        node.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px)`;
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      webGeo.dispose(); starGeo.dispose(); boxGeo.dispose(); boxMat.dispose(); mat.dispose(); renderer.dispose();
      canvas.remove(); api.current = null;
    };
  }, [tests, theme]);

  useEffect(() => { api.current?.shot(page); }, [page, tests, theme]);
  useEffect(() => { api.current?.focus(focusIds ?? []); }, [focusIds, tests, theme]);

  return <div ref={host} className={`obs-scene obs-scene--${theme}`}>
    <div ref={labels} className="obs-scene-labels" aria-hidden="true">
      {DOMAINS.map(d => <span key={d.id} data-domain={d.id}>{d.label}</span>)}
    </div>
  </div>;
}
