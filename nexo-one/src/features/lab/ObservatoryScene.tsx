// Observatório: teia cósmica WebGL contínua atrás de todas as páginas.
// Leitura: cada domínio é uma região (halo grande) da teia; cada hipótese é um nó;
// cada teste é uma estrela no filamento que liga sua hipótese ao domínio.
// Cor/pulso = veredito (confirmado queima estável, em revisão pulsa, bloqueado apaga, refutado vermelho).
// A câmera muda de enquadramento por página; clicar numa estrela abre o teste.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending, NormalBlending, HalfFloatType, WebGLRenderTarget, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments,
  PerspectiveCamera, Points, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { TestEntity, Verdict } from './model.ts';
import { normDomain } from './domains.ts';

/** Fenômenos da teia: o que o NEXO faz agora, na escala certa (galáxias ativas, não estrelas).
 *  Quasar = decisão sua · AGN com jatos = testes rodando/na fila · GRB = pensamento novo. */
export interface SceneEvents {
  quasars: Array<{ domain: string; label: string; href: string }>;
  agn: Array<{ domain: string; count: number; label: string; href: string }>;
  grbs: Array<{ domain: string; label: string; href: string }>;
}

export type ScenePage = 'agora' | 'ciclo' | 'roadmaps' | 'roadmap' | 'evidencia' | 'entidade' | 'saude';

// Domínios vêm dos dados: um domínio novo (ex.: PHILOSOPHY) ganha sua região da teia sozinho.
// Os três fundadores têm posição fixa; os novos são postos numa esfera, em posição estável pelo nome.
export interface DomainSpot { id: string; label: string; at: [number, number, number] }
const BASE: DomainSpot[] = [
  { id: 'SCIENCE', label: 'Ciência', at: [-6.5, 1.5, -2] },
  { id: 'ENGINEERING', label: 'Engenharia', at: [6, -1, 3] },
  { id: 'OLYMPUS', label: 'Olympus', at: [1.5, 5, 7] },
];
const LABEL_PT: Record<string, string> = {
  PHILOSOPHY: 'Filosofia', FILOSOFIA: 'Filosofia', MATHEMATICS: 'Matemática', BIOLOGY: 'Biologia', PHYSICS: 'Física',
  ECONOMICS: 'Economia', HISTORY: 'História', PSYCHOLOGY: 'Psicologia', LINGUISTICS: 'Linguística', MEDICINE: 'Medicina',
};
export function layoutDomains(ids: string[]): DomainSpot[] {
  const extra = [...new Set(ids.map(normDomain))].filter(id => !BASE.some(b => b.id === id)).sort();
  return [...BASE, ...extra.map(id => {
    const h = rnd(id), g = rnd(id + '#');
    const th = h * Math.PI * 2, ph = Math.acos(0.6 * (2 * g - 1));
    const r = 9.5;
    const label = LABEL_PT[id] ?? id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, ' ');
    return { id, label, at: [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)] as [number, number, number] };
  })];
}

const VERDICT_RGB: Record<Verdict, [number, number, number]> = {
  CONFIRMED: [0.62, 0.86, 0.7], REFUTED: [0.9, 0.46, 0.4], REVIEW: [0.92, 0.76, 0.48], PROVISIONAL: [0.7, 0.75, 0.86],
  READY: [0.74, 0.71, 0.8], BLOCKED: [0.36, 0.35, 0.4], DISCARDED: [0.25, 0.24, 0.28],
};
const VERDICT_TXT: Record<Verdict, string> = { CONFIRMED: 'confirmado', REFUTED: 'refutado', REVIEW: 'em revisão', PROVISIONAL: 'resultado provisório', READY: 'na fila', BLOCKED: 'bloqueado', DISCARDED: 'descartado' };
const VERDICT_SIZE: Record<Verdict, number> = { CONFIRMED: 34, REFUTED: 24, REVIEW: 26, PROVISIONAL: 17, READY: 12, BLOCKED: 11, DISCARDED: 7 };
const VERDICT_PULSE: Record<Verdict, number> = { CONFIRMED: 0.12, REFUTED: 0, REVIEW: 1, PROVISIONAL: 0.25, READY: 0.45, BLOCKED: 0, DISCARDED: 0 };

// [distância, elevação, azimute, alvo(domínio índice ou -1 = centro)]
const SHOTS: Record<ScenePage, [number, number, number, number]> = {
  agora: [30, 0.42, 0.7, -1], ciclo: [21, 0.2, 1.8, -1], roadmaps: [17, 0.55, 2.6, 0], roadmap: [12, 0.4, 3.1, 0],
  evidencia: [24, 0.9, 3.9, -1], entidade: [10, 0.3, 4.4, 0], saude: [38, 0.12, 5.3, -1],
};

// Física de brinquedo (fiel à ideia): aglomeração da matéria escura puxa o gás dos filamentos para o nó
// mais próximo; nos vazios a expansão é mais rápida que nas paredes (backreaction). 'evo' satura:
// visível em segundos, quase parado em horas.
const VERT = `
attribute float size; attribute vec3 tint; attribute float pulse; attribute float seed; attribute vec3 node;
uniform float time; uniform float pixelRatio; uniform float evo; varying vec3 vTint; varying float vAlpha;
void main(){
  vec3 toNode = node - position; float dn = length(toNode);
  vec3 q = position + toNode * (0.22 * evo);                                   // clustering
  q += normalize(position + vec3(1e-4)) * (0.55 * evo) * smoothstep(0.6, 3.2, dn); // vazios crescem mais
  q += toNode * 0.015 * sin(time * 0.07 + seed * 6.28);                      // respiração lenta
  vec4 mv = modelViewMatrix * vec4(q,1.0);
  float p = 1.0 + pulse * 0.4 * sin(time*2.4 + seed*6.28);
  float px = size * p * pixelRatio * (18.0 / -mv.z);
  gl_PointSize = max(px, 1.25 * pixelRatio);                                  // nada menor que ~1px: sem cintilar
  vTint = tint; vAlpha = clamp(0.5 + 0.5*p, 0.0, 1.0) * clamp(px / (1.8 * pixelRatio), 0.22, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float ink;
varying vec3 vTint; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float glow = exp(-d*d*42.0); float core = 1.0 - smoothstep(0.035, 0.065, d);
  float a = (glow*0.85 + core) * vAlpha; if (a < 0.01) discard;
  vec3 lit = vTint * (0.55 + glow*0.8) + core*0.6;
  // Tema claro: tinta ciano-escura sobre papel (mesma matiz, sem brilho aditivo).
  vec3 inked = mix(vec3(0.02,0.24,0.29), vTint*0.45, 0.35);
  gl_FragColor = vec4(mix(lit, inked, ink), ink > 0.5 ? a*0.55 : a);
}`;

// Quasar: núcleo branco-quente + raios de difração, pulso lento.
const QSO_FRAG = `
varying vec3 vTint; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float glow = exp(-d*d*14.0); float core = smoothstep(0.08, 0.0, d);
  float spikes = exp(-abs(c.x)*90.0)*exp(-abs(c.y)*5.0) + exp(-abs(c.y)*90.0)*exp(-abs(c.x)*5.0);
  float a = (glow*0.9 + core + spikes*0.9) * vAlpha; if (a < 0.01) discard;
  gl_FragColor = vec4(vTint*(0.7+glow) + core, a);
}`;
// Jatos do AGN: partículas que correm ao longo do eixo e somem na ponta.
const JET_VERT = `
attribute vec3 dir; attribute float phase; attribute float speed;
uniform float time; uniform float pixelRatio; varying float vFade;
void main(){
  float f = fract(time*speed + phase);
  vec3 p = position + dir * f;
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_PointSize = (4.0 - 2.5*f) * pixelRatio * (18.0 / -mv.z);
  vFade = 1.0 - f;
  gl_Position = projectionMatrix * mv;
}`;
const JET_FRAG = `
varying float vFade;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = exp(-d*d*20.0) * vFade; if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.95,0.9,0.82)*(0.6+vFade*0.6), a);
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

// Paleta da teia (assinatura preto + ciano): gás frio -> filamento ciano -> nó branco-azulado.
const INFERNO = ['#020405', '#06141a', '#0c2e38', '#1d6574', '#62cbd8', '#effcff'].map(c => new Color(c));
const inferno = (t: number) => {
  const x = Math.max(0, Math.min(0.999, t)) * (INFERNO.length - 1), i = Math.floor(x), f = x - i;
  return INFERNO[i]!.clone().lerp(INFERNO[i + 1]!, f);
};

/** Qualidade gráfica: alta (GPU dedicada / Apple M), média (Intel Iris / UHD / integradas), baixa (celular ou fraca).
 *  Pode ser forçada com localStorage 'nexo.quality' = high | medium | low. */
export type Quality = 'high' | 'medium' | 'low';
export function detectQuality(): Quality {
  try {
    const forced = localStorage.getItem('nexo.quality');
    if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  } catch { /* sem armazenamento */ }
  if (window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) < 4) return 'low';
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || '');
  } catch { /* sem WebGL de diagnóstico */ }
  if (/RTX|GTX|Radeon RX|Radeon Pro|Apple M\d|Arc A|Quadro/i.test(gpu)) return 'high';
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 'low';
  return 'medium';
}
const DENSITY: Record<Quality, number> = { high: 1.7, medium: 1.05, low: 0.55 };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };

interface Buf { pos: number[]; tint: number[]; size: number[]; pulse: number[]; seed: number[]; node: number[] }
const buf = (): Buf => ({ pos: [], tint: [], size: [], pulse: [], seed: [], node: [] });
const push = (b: Buf, p: number[], c: Color | number[], s: number, pu = 0, sd = Math.random(), node?: number[]) => {
  b.pos.push(...p); b.tint.push(...(c instanceof Color ? [c.r, c.g, c.b] : c)); b.size.push(s); b.pulse.push(pu); b.seed.push(sd);
  b.node.push(...(node ?? p));
};
const geom = (b: Buf) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('tint', new BufferAttribute(new Float32Array(b.tint), 3));
  g.setAttribute('size', new BufferAttribute(new Float32Array(b.size), 1));
  g.setAttribute('pulse', new BufferAttribute(new Float32Array(b.pulse), 1));
  g.setAttribute('seed', new BufferAttribute(new Float32Array(b.seed), 1));
  g.setAttribute('node', new BufferAttribute(new Float32Array(b.node), 3));
  return g;
};

/** Filamento: partículas ao longo de uma curva levemente arqueada entre dois nós. */
function filament(b: Buf, a: Vector3, c: Vector3, density: number, heat: number, seed: string) {
  const mid = a.clone().add(c).multiplyScalar(0.5).add(new Vector3(...jitter(seed, a.distanceTo(c) * 0.35)));
  const n = Math.max(6, Math.round(a.distanceTo(c) * density * 1.35));
  const p = new Vector3();
  for (let i = 0; i < n; i += 1) {
    const t = Math.random(), u = 1 - t;
    p.set(u * u * a.x + 2 * u * t * mid.x + t * t * c.x, u * u * a.y + 2 * u * t * mid.y + t * t * c.y, u * u * a.z + 2 * u * t * mid.z + t * t * c.z);
    const edge = Math.min(t, u);
    const spread = 0.022 + 0.05 * (1 - 2 * edge); // fino no meio, mais grosso perto dos nós
    const end = t < 0.5 ? a : c;
    push(b, [p.x + gauss() * spread, p.y + gauss() * spread, p.z + gauss() * spread],
      inferno(heat * (0.62 + 0.38 * (1 - edge * 2)) * (0.72 + Math.random() * 0.28)).multiplyScalar(1.05), 1.4 + Math.random() * 2, 0, Math.random(), [end.x, end.y, end.z]);
  }
  return mid;
}

export function ObservatoryScene({ tests, page, focusIds, onPick, theme, events, explore = false, hot }: {
  hot?: string[]; explore?: boolean; events?: SceneEvents; tests: TestEntity[]; page: ScenePage; focusIds?: string[]; onPick: (id: string) => void; theme: 'dark' | 'light';
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ shot: (p: ScenePage) => void; focus: (ids: string[]) => void; heat: (ids: string[]) => void; goDomain: (i: number | null) => void } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const exploreRef = useRef(explore);
  exploreRef.current = explore;
  const resetView = useRef<() => void>(() => {});
  const domains = useMemo(() => layoutDomains([...tests.map(t => t.domain), ...(events?.quasars ?? []).map(e => e.domain), ...(events?.agn ?? []).map(e => e.domain)]), [tests, events]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { el.dataset.fallback = 'true'; return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    let quality: Quality = detectQuality();
    const dens = DENSITY[quality];
    const dprFor = (q: Quality) => Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1.25);
    let dpr = dprFor(quality);
    renderer.setPixelRatio(dpr);
    el.dataset.quality = quality;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(48, 1, 0.1, 300);
    const uniforms = { time: { value: 0 }, pixelRatio: { value: dpr }, evo: { value: 0 } };
    const light = theme === 'light';
    const mat = new ShaderMaterial({ uniforms: { ...uniforms, ink: { value: light ? 1 : 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: light ? NormalBlending : AdditiveBlending });

    // --- Estrutura: domínios, hipóteses, filamentos ---
    const web = buf();
    const domainPos = domains.map(d => new Vector3(...d.at));
    const indexOf = new Map(domains.map((d, i) => [d.id, i]));
    const domainIndex = (d: string) => indexOf.get(normDomain(d)) ?? 0;
    // Filamentos entre domínios (a teia maior) + ramos cegos para dar textura de rede.
    for (let i = 0; i < domainPos.length; i += 1) for (let j = i + 1; j < domainPos.length; j += 1) filament(web, domainPos[i]!, domainPos[j]!, 120 * dens, 0.85, `d${i}${j}`);
    const scale = 13;
    const voids: Vector3[] = [];
    for (let k = 0; k < Math.round(70 * Math.min(1.25, dens)); k += 1) voids.push(new Vector3(...jitter(`v${k}`, scale * 2)));
    voids.forEach((v, k) => {
      const nearest = [...voids].sort((a, b) => a.distanceTo(v) - b.distanceTo(v)).slice(1, 4);
      nearest.forEach((w, m) => filament(web, v, w, 50 * dens, 0.78, `w${k}${m}`));
      push(web, [v.x, v.y, v.z], inferno(0.88), 12 + rnd(`vn${k}`) * 18, 0.1);
      for (let q = 0; q < Math.round(40 * dens); q += 1) { const r = Math.pow(Math.random(), 2.4) * 0.8; push(web, [v.x + (Math.random() - 0.5) * r * 2, v.y + (Math.random() - 0.5) * r * 2, v.z + (Math.random() - 0.5) * r * 2], inferno(0.75 + Math.random() * 0.2), 2 + Math.random() * 3); }
    });
    domainPos.forEach((d, i) => {
      const nearest = [...voids].sort((a, b) => a.distanceTo(d) - b.distanceTo(d)).slice(0, 3);
      nearest.forEach((w, m) => filament(web, d, w, 46 * dens, 0.85, `dv${i}${m}`));
      // Halo do domínio: aglomerado quente.
      for (let k = 0; k < Math.round(480 * dens); k += 1) {
        const r = Math.pow(Math.random(), 2.2) * 2.4, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        push(web, [d.x + r * Math.sin(ph) * Math.cos(th), d.y + r * Math.cos(ph), d.z + r * Math.sin(ph) * Math.sin(th)], inferno(0.95 - r * 0.2), 3 + Math.random() * 4);
      }
      push(web, [d.x, d.y, d.z], new Color('#effcff'), 95, 0.08);
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
      filament(web, d, node, 30 * dens, 0.7, key);
      push(web, [node.x, node.y, node.z], inferno(0.8), 22 + Math.min(40, list.length * 4), 0.05);
      // Nuvem de formação: hipótese com muitos testes prontos.
      const ready = list.filter(t => t.verdict === 'READY').length;
      if (ready >= 3) for (let q = 0; q < 60 + ready * 20; q += 1) {
        const r = Math.pow(Math.random(), 0.8) * (0.8 + ready * 0.08);
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        push(web, [node.x + r * Math.sin(ph) * Math.cos(th), node.y + r * Math.cos(ph) * 0.6, node.z + r * Math.sin(ph) * Math.sin(th)],
          [0.42 + Math.random() * 0.1, 0.36, 0.46], 8 + Math.random() * 10, 0.2);
      }
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
    const boxMat = new LineBasicMaterial({ color: theme === 'dark' ? 0x3a3d4c : 0x55586a, transparent: true, opacity: 0.22 });
    scene.add(new LineSegments(boxGeo, boxMat));

    // --- Fenômenos ---
    const ev = events ?? { quasars: [], agn: [], grbs: [] };
    const anchors: Vector3[] = [];
    const qso = buf();
    ev.quasars.forEach((e, k) => {
      const at = domainPos[domainIndex(e.domain)]!.clone().add(new Vector3(...jitter(`q${k}${e.label}`, 5)));
      push(qso, [at.x, at.y, at.z], [1, 0.93, 0.82], 150, reduced ? 0 : 0.35, rnd(e.label));
      anchors.push(at);
    });
    ev.grbs.forEach((e, k) => {
      const at = domainPos[domainIndex(e.domain)]!.clone().add(new Vector3(...jitter(`g${k}`, 2.5)));
      push(qso, [at.x, at.y, at.z], [0.98, 0.92, 0.8], 70, reduced ? 0 : 1, rnd(`g${k}`));
      anchors.push(at);
    });
    const qsoMat = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: QSO_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const qsoGeo = geom(qso);
    scene.add(new Points(qsoGeo, qsoMat));
    const jp: number[] = [], jd: number[] = [], jph: number[] = [], jsp: number[] = [];
    ev.agn.forEach((e, k) => {
      // Perto do domínio, não no núcleo: uma galáxia ativa vizinha.
      const d = domainPos[domainIndex(e.domain)]!.clone().add(new Vector3(...jitter(`agnpos${e.domain}`, 7)));
      const axis = new Vector3(...jitter(`agn${k}`, 1)).add(new Vector3(0, 1.4, 0)).normalize();
      const len = 2 + Math.min(3.5, e.count * 0.15);
      const n = 60 + Math.min(120, e.count * 5);
      for (let i = 0; i < n; i += 1) for (const sgn of [1, -1]) {
        jp.push(d.x + (Math.random() - 0.5) * 0.12, d.y + (Math.random() - 0.5) * 0.12, d.z + (Math.random() - 0.5) * 0.12);
        jd.push(axis.x * len * sgn, axis.y * len * sgn, axis.z * len * sgn);
        jph.push(Math.random()); jsp.push(reduced ? 0 : 0.18 + Math.random() * 0.12);
      }
      anchors.push(d.clone().add(axis.clone().multiplyScalar(len * 0.6)));
    });
    const jetGeo = new BufferGeometry();
    jetGeo.setAttribute('position', new BufferAttribute(new Float32Array(jp), 3));
    jetGeo.setAttribute('dir', new BufferAttribute(new Float32Array(jd), 3));
    jetGeo.setAttribute('phase', new BufferAttribute(new Float32Array(jph), 1));
    jetGeo.setAttribute('speed', new BufferAttribute(new Float32Array(jsp), 1));
    const jetMat = new ShaderMaterial({ uniforms, vertexShader: JET_VERT, fragmentShader: JET_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending });
    scene.add(new Points(jetGeo, jetMat));

    // --- Câmera ---
    const cam = { dist: 40, elev: 0.5, az: 0.3 };
    let zoom = 1;
    const pan = new Vector3();
    const target = { dist: 30, elev: 0.42, az: 0.7, look: new Vector3() };
    const look = new Vector3();
    const lookGoal = new Vector3();
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
        if (i >= 0) target.look.set(stars.pos[i * 3]!, stars.pos[i * 3 + 1]!, stars.pos[i * 3 + 2]!).multiplyScalar(scene.scale.x);
      }
    };
    const basePulse = Float32Array.from(stars.pulse);
    const heat = (list: string[]) => {
      const set = new Set(list);
      const pulses = starGeo.getAttribute('pulse') as BufferAttribute;
      ids.forEach((id, i) => pulses.setX(i, set.has(id) && !reduced ? 1.8 : basePulse[i]!));
      pulses.needsUpdate = true;
    };
    // Navegação: NEXO (visão geral) -> domínio (câmera vai até ele e aproxima).
    const goDomain = (i: number | null) => {
      zoom = 1; pan.set(0, 0, 0);
      if (i === null || !domainPos[i]) { shot(pageRef.current); return; }
      target.look.copy(domainPos[i]!).multiplyScalar(scene.scale.x);
      target.dist = 13; target.elev = 0.32;
    };
    api.current = { shot, focus, heat, goDomain };

    const resize = () => {
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Desktop: a teia vive à direita, a coluna de leitura à esquerda.
      // Desktop: a coluna de leitura ocupa ~600px à esquerda; a teia se desloca para a área livre.
      // ≥1280: leitura (~600px) à esquerda e telemetria (340px) à direita; a teia centra no espaço entre as duas.
      if (window.innerWidth >= 1280) camera.setViewOffset(w, h, -130, 0, w, h);
      else if (w > 900) camera.setViewOffset(w, h, -Math.min(w * 0.3, 300), 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    // Bloom: brilho físico dos aglomerados e filamentos (alta = resolução cheia, média = meia, baixa = sem).
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    const buildComposer = () => {
      composer?.dispose(); composer = null; bloom = null;
      if (quality === 'low' || theme === 'light') { renderer.setClearColor(0x000000, 0); return; }
      renderer.setClearColor(0x000000, 1); // o bloom precisa de fundo opaco
      composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { samples: quality === 'high' ? 4 : 2, type: HalfFloatType }));
      composer.setPixelRatio(dpr);
      composer.addPass(new RenderPass(scene, camera));
      // Bloom contido: só os núcleos mais brilhantes vazam luz; o preto do fundo continua preto.
      bloom = new UnrealBloomPass(new Vector2(1, 1), quality === 'high' ? 0.42 : 0.36, 0.32, 0.62);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    };
    buildComposer();
    const resizeComposer = () => {
      if (!composer || !bloom) return;
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      composer.setSize(w, h);
      const f = quality === 'high' ? 1 : 0.5; // média: bloom em meia resolução
      bloom.setSize(Math.max(1, Math.round(w * dpr * f)), Math.max(1, Math.round(h * dpr * f)));
    };
    const resizeAll = () => { resize(); resizeComposer(); };
    resizeAll();
    const ro = new ResizeObserver(resizeAll); ro.observe(el);
    // Guarda de fluidez: média de quadros ruim por ~3 s desce um nível (resolução e bloom), nunca sobe sozinho.
    let slowAcc = 0, slowN = 0;
    const degrade = () => {
      if (quality === 'low') return;
      quality = quality === 'high' ? 'medium' : 'low';
      dpr = dprFor(quality); renderer.setPixelRatio(dpr); uniforms.pixelRatio.value = dpr;
      el.dataset.quality = quality;
      buildComposer(); resizeAll();
    };

    // Controles (como nos grafos): arrastar gira · roda/pinça dá zoom · botão direito, Shift ou 2 dedos movem · duplo clique recentra.
    // Fora do modo Explorar, a roda e o toque vertical continuam rolando a página.
    const ray = new Raycaster(); ray.params.Points = { threshold: 0.35 };
    const ndc = new Vector2();
    const canvas = renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean; pan: boolean } | null = null;
    let pinch: { d: number; cx: number; cy: number } | null = null;
    const right = new Vector3(), upv = new Vector3();
    const panBy = (dx: number, dy: number) => {
      camera.matrixWorld.extractBasis(right, upv, new Vector3());
      const scale = cam.dist * 0.0016;
      pan.addScaledVector(right, -dx * scale).addScaledVector(upv, dy * scale);
    };
    const zoomBy = (factor: number) => { zoom = Math.max(0.12, Math.min(2.6, zoom * factor)); };
    const down = (ev: PointerEvent) => {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinch = { d: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y), cx: (p1!.x + p2!.x) / 2, cy: (p1!.y + p2!.y) / 2 };
        drag = null; return;
      }
      drag = { x: ev.clientX, y: ev.clientY, moved: false, pan: ev.button === 2 || ev.shiftKey };
      if (exploreRef.current) canvas.setPointerCapture?.(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y), cx = (p1!.x + p2!.x) / 2, cy = (p1!.y + p2!.y) / 2;
        if (pinch.d > 0) zoomBy(pinch.d / d);
        panBy(cx - pinch.cx, cy - pinch.cy);
        pinch = { d, cx, cy }; return;
      }
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.pan) panBy(dx, dy);
      else { target.az += dx * 0.005; target.elev = Math.max(-1.35, Math.min(1.4, target.elev + dy * 0.004)); }
      drag.x = ev.clientX; drag.y = ev.clientY;
    };
    const up = (ev: PointerEvent) => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      const was = drag; drag = null;
      if (!was || was.moved || ev.target !== canvas) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(starPoints)[0];
      if (hit?.index !== undefined && ids[hit.index]) pickRef.current(ids[hit.index]!);
    };
    const byId = new Map(tests.map(t => [t.id, t]));
    let hoverAt = 0;
    const hover = (ev: PointerEvent) => {
      const tipEl = tip.current;
      if (!tipEl || drag || pinch || ev.pointerType === 'touch') { if (tipEl) tipEl.style.opacity = '0'; return; }
      const now = performance.now(); if (now - hoverAt < 50) return; hoverAt = now;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(starPoints)[0];
      const t = hit?.index !== undefined ? byId.get(ids[hit.index] ?? '') : undefined;
      if (!t) { tipEl.style.opacity = '0'; canvas.style.cursor = ''; return; }
      tipEl.innerHTML = '';
      const b = document.createElement('b'); b.textContent = t.name;
      const i = document.createElement('i'); i.textContent = VERDICT_TXT[t.verdict]; i.dataset.v = t.verdict.toLowerCase();
      tipEl.append(b, i);
      tipEl.style.transform = `translate(${ev.clientX - rect.left + 14}px, ${ev.clientY - rect.top + 12}px)`;
      tipEl.style.opacity = '1'; canvas.style.cursor = 'pointer';
    };
    canvas.addEventListener('pointermove', hover);
    const leave = () => { if (tip.current) tip.current.style.opacity = '0'; };
    canvas.addEventListener('pointerleave', leave);
    const wheel = (ev: WheelEvent) => {
      if (!exploreRef.current && !ev.ctrlKey) return; // rolando a página
      ev.preventDefault();
      zoomBy(Math.exp(ev.deltaY * 0.0012));
    };
    const dbl = () => { zoom = 1; pan.set(0, 0, 0); };
    const noMenu = (ev: Event) => { if (exploreRef.current) ev.preventDefault(); };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', dbl);
    canvas.addEventListener('contextmenu', noMenu);
    resetView.current = dbl;

    // Rótulos dos domínios projetados em HTML (nítidos, legíveis, sem textura).
    const labelEls = [...(labels.current?.querySelectorAll('[data-domain]') ?? [])] as HTMLElement[];
    const eventEls = [...(labels.current?.querySelectorAll('[data-event]') ?? [])] as HTMLElement[];
    const proj = new Vector3();

    let raf = 0, last = performance.now(), visible = true, expansion = 1, lodTick = 0;
    const vis = () => { visible = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', vis);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      uniforms.time.value += dt;
      { const s = uniforms.time.value / 40; uniforms.evo.value = reduced ? 0.6 : s / (s + 1); }
      // Expansão do universo, bem lenta: ~6% em 15 min, desacelerando (a(t) monotônico, nunca volta).
      const el = uniforms.time.value;
      expansion = reduced ? 1 : 1 + 0.12 * (el / (el + 900));
      scene.scale.setScalar(expansion);
      if (!reduced && !drag && !exploreRef.current) target.az += dt * 0.025;
      const k = reduced ? 1 : 1 - Math.pow(0.03, dt);
      const fit = camera.aspect < 1 ? 1 / Math.max(0.55, camera.aspect) : 1;
      cam.dist += (target.dist * fit * zoom - cam.dist) * k; cam.elev += (target.elev - cam.elev) * k; cam.az += (target.az - cam.az) * k;
      look.lerp(lookGoal.copy(target.look).add(pan), k);
      camera.position.set(
        look.x + Math.cos(cam.az) * Math.cos(cam.elev) * cam.dist, look.y + Math.sin(cam.elev) * cam.dist,
        look.z + Math.sin(cam.az) * Math.cos(cam.elev) * cam.dist);
      camera.lookAt(look);
      if (composer) composer.render(dt); else renderer.render(scene, camera);
      if (!reduced) {
        slowAcc += dt; slowN += 1;
        if (slowAcc > 3) { if (slowAcc / slowN > 1 / 42) degrade(); slowAcc = 0; slowN = 0; }
      }
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const placed: Array<[number, number, number]> = [];
      const place = (node: HTMLElement, x: number, y: number) => {
        const wd = node.offsetWidth || 120;
        for (let tries = 0; tries < 6 && placed.some(([px, py, pw]) => Math.abs(py - y) < 22 && x < px + pw + 8 && px < x + wd + 8); tries += 1) y += 22;
        placed.push([x, y, wd]);
        node.style.transform = `translate(${x}px, ${y}px)`;
      };
      labelEls.forEach((node, i) => {
        proj.copy(domainPos[i]!).multiplyScalar(expansion).project(camera);
        const off = proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1 || (!exploreRef.current && w > 900 && (proj.x * 0.5 + 0.5) * w < Math.min(820, w * 0.6));
        node.style.opacity = off ? '0' : '1';
        node.style.pointerEvents = off ? 'none' : 'auto';
        if (!off) place(node, (proj.x * 0.5 + 0.5) * w, (-proj.y * 0.5 + 0.5) * h);
      });
      // Detalhe por distância: perto de um domínio, os testes mais próximos mostram o nome.
      const nearEls = near.current ? [...near.current.children] as HTMLElement[] : [];
      if (nearEls.length && ++lodTick % 8 === 0) {
        const close = cam.dist < 17;
        const cand: Array<[number, number, number, string]> = [];
        if (close) for (let i = 0; i < ids.length; i += 1) {
          proj.set(stars.pos[i * 3]!, stars.pos[i * 3 + 1]!, stars.pos[i * 3 + 2]!).multiplyScalar(expansion).project(camera);
          if (proj.z > 1 || Math.abs(proj.x) > 0.9 || Math.abs(proj.y) > 0.9) continue;
          const sx = (proj.x * 0.5 + 0.5) * w, sy = (-proj.y * 0.5 + 0.5) * h;
          if (w > 900 && !exploreRef.current && sx < Math.min(640, w * 0.45)) continue;
          cand.push([Math.hypot(proj.x, proj.y), sx, sy, byId.get(ids[i]!)?.name ?? '']);
        }
        cand.sort((a, b) => a[0] - b[0]);
        nearEls.forEach((node, k) => {
          const c = cand[k];
          if (!c || !c[3]) { node.style.opacity = '0'; return; }
          node.textContent = c[3].length > 42 ? c[3].slice(0, 40) + '…' : c[3];
          node.style.opacity = '1';
          node.style.transform = `translate(${c[1] + 10}px, ${c[2] - 8}px)`;
        });
      }
      eventEls.forEach((node, i) => {
        const a = anchors[i]; if (!a) return;
        proj.copy(a).multiplyScalar(expansion).project(camera);
        const off = proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05 || (!exploreRef.current && w > 900 && (proj.x * 0.5 + 0.5) * w < Math.min(820, w * 0.6));
        node.style.opacity = off ? '0' : '1';
        if (!off) place(node, (proj.x * 0.5 + 0.5) * w, (-proj.y * 0.5 + 0.5) * h);
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointermove', hover);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('dblclick', dbl);
      canvas.removeEventListener('contextmenu', noMenu);
      composer?.dispose(); webGeo.dispose(); starGeo.dispose(); qsoGeo.dispose(); qsoMat.dispose(); jetGeo.dispose(); jetMat.dispose(); boxGeo.dispose(); boxMat.dispose(); mat.dispose(); renderer.dispose();
      canvas.remove(); api.current = null;
    };
  }, [tests, theme, events, domains]);

  useEffect(() => { api.current?.shot(page); }, [page, tests, theme]);
  useEffect(() => { api.current?.focus(focusIds ?? []); }, [focusIds, tests, theme]);
  useEffect(() => { api.current?.heat(hot ?? []); }, [hot, tests, theme, events]);

  const go = (i: number | null) => { setSel(i); api.current?.goDomain(i); };
  useEffect(() => { setSel(null); }, [page]);
  return <div ref={host} className={`obs-scene obs-scene--${theme}`}>
    <nav className="obs-crumb" aria-label="Onde você está na teia">
      <button type="button" onClick={() => go(null)} aria-current={sel === null ? 'location' : undefined}>NEXO</button>
      {sel !== null && domains[sel] && <><i aria-hidden="true">›</i><span aria-current="location">{domains[sel]!.label}</span>
        <em>{tests.filter(t => normDomain(t.domain) === domains[sel]!.id).length} testes</em></>}
    </nav>
    <div ref={tip} className="obs-tip" role="tooltip" />
    <div ref={near} className="obs-near" aria-hidden="true">{Array.from({ length: 7 }, (_, k) => <span key={k} />)}</div>
    <div ref={labels} className="obs-scene-labels">
      {domains.map((d, i) => <button type="button" key={d.id} data-domain={d.id} className={sel === i ? 'on' : undefined}
        onClick={() => go(sel === i ? null : i)} title={`Ir até ${d.label}`}>{d.label}</button>)}
      {[...(events?.quasars ?? []).map(e => ['qso', e] as const), ...(events?.grbs ?? []).map(e => ['grb', e] as const), ...(events?.agn ?? []).map(e => ['agn', e] as const)]
        .map(([kind, e], i) => <a key={i} data-event={kind} href={e.href} className={`obs-ev obs-ev--${kind}`}>{e.label}</a>)}
    </div>
  </div>;
}
