// Observatório: teia cósmica 3D vetorial projetada pela câmera.
// Leitura: cada domínio é uma região (halo grande) da teia; cada hipótese é um nó;
// cada teste é uma estrela no filamento que liga sua hipótese ao domínio.
// Cor/pulso = veredito (confirmado queima estável, em revisão pulsa, bloqueado apaga, refutado vermelho).
// A câmera muda de enquadramento por página; clicar numa estrela abre o teste.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, Color, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { TestEntity, Verdict } from './model.ts';
import { normDomain } from './domains.ts';
import { createCosmicDynamics } from './cosmicDynamics.ts';
import { environmentStride } from './vector-budget.ts';

/** Fenômenos da teia: o que o NEXO faz agora, na escala certa (galáxias ativas, não estrelas).
 *  Quasar = decisão sua · AGN com jatos = testes rodando/na fila · GRB = pensamento novo. */
export interface SceneEvents {
  quasars: Array<{ domain: string; label: string; href: string }>;
  agn: Array<{ domain: string; count: number; label: string; href: string }>;
  grbs: Array<{ domain: string; label: string; href: string }>;
}

export type ScenePage = 'agora' | 'universo' | 'ciclo' | 'roadmaps' | 'roadmap' | 'evidencia' | 'entidade' | 'saude';

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
  READY: [0.74, 0.71, 0.8], RUNNING: [0.68, 0.76, 0.88], CHECKPOINTED: [0.52, 0.57, 0.68],
  BLOCKED: [0.36, 0.35, 0.4], REJECTED: [0.82, 0.64, 0.47], DISCARDED: [0.25, 0.24, 0.28],
};
const VERDICT_TXT: Record<Verdict, string> = {
  CONFIRMED: 'confirmado', REFUTED: 'refutado', REVIEW: 'em revisão', PROVISIONAL: 'resultado provisório',
  READY: 'na fila', RUNNING: 'em processamento', CHECKPOINTED: 'execução salva', BLOCKED: 'bloqueado', REJECTED: 'rejeitado pelo critério', DISCARDED: 'descartado',
};
const VERDICT_SIZE: Record<Verdict, number> = {
  CONFIRMED: 34, REFUTED: 24, REVIEW: 26, PROVISIONAL: 17, READY: 12, RUNNING: 15, CHECKPOINTED: 12, BLOCKED: 11, REJECTED: 17, DISCARDED: 7,
};
const VERDICT_PULSE: Record<Verdict, number> = {
  CONFIRMED: 0.12, REFUTED: 0, REVIEW: 1, PROVISIONAL: 0.25, READY: 0.45, RUNNING: 0.8, CHECKPOINTED: 0.12, BLOCKED: 0, REJECTED: 0, DISCARDED: 0,
};

// [distância, elevação, azimute, alvo(domínio índice ou -1 = centro)]
const SHOTS: Record<ScenePage, [number, number, number, number]> = {
  universo: [32, 0.6, 1.2, -1], agora: [30, 0.42, 0.7, -1], ciclo: [21, 0.2, 1.8, -1], roadmaps: [17, 0.55, 2.6, 0], roadmap: [12, 0.4, 3.1, 0],
  evidencia: [24, 0.9, 3.9, -1], entidade: [10, 0.3, 4.4, 0], saude: [38, 0.12, 5.3, -1],
};

// Física de brinquedo (fiel à ideia): aglomeração da matéria escura puxa o gás dos filamentos para o nó
// mais próximo; nos vazios a expansão é mais rápida que nas paredes (backreaction). 'evo' satura:
// visível em segundos, quase parado em horas.
const VERT = `
attribute float size; attribute vec3 tint; attribute float pulse; attribute float seed; attribute vec3 node;
uniform float time; uniform float pixelRatio; uniform float evo; varying vec3 vTint; varying float vAlpha; varying float vSize;
void main(){
  vec3 toNode = node - position; float dn = length(toNode);
  vec3 q = position + toNode * (0.30 * evo);                                   // clustering
  q += normalize(position + vec3(1e-4)) * (0.75 * evo) * smoothstep(0.6, 3.2, dn); // vazios crescem mais
  q += toNode * 0.015 * sin(time * 0.07 + seed * 6.28);                      // respiração lenta
  vec4 mv = modelViewMatrix * vec4(q,1.0);
  float p = 1.0 + pulse * 0.4 * sin(time*2.4 + seed*6.28);
  float px = size * p * pixelRatio * (18.0 / -mv.z);
  gl_PointSize = max(px, 2.0 * pixelRatio);                                   // nada menor que 2px: sem cintilar
  vSize = gl_PointSize / pixelRatio;
  vTint = tint; vAlpha = clamp(0.5 + 0.5*p, 0.0, 1.0) * clamp(px / (2.6 * pixelRatio), 0.18, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float ink;
varying vec3 vTint; varying float vAlpha; varying float vSize;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float glow = exp(-d*d*42.0);
  // Núcleo nítido só em pontos grandes: em pontos de poucos pixels ele vira sub-pixel e cintila.
  float core = (1.0 - smoothstep(0.035, 0.09, d)) * smoothstep(7.0, 16.0, vSize);
  float a = (glow*0.85 + core) * vAlpha * (1.0 - smoothstep(0.42, 0.5, d)); if (a < 0.004) discard;
  vec3 lit = vTint * (0.55 + glow*0.8) + core*0.6;
  // Tema claro: tinta ciano-escura sobre papel (mesma matiz, sem brilho aditivo).
  vec3 inked = mix(vec3(0.30,0.22,0.08), vTint*0.42, 0.3);
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

// Paleta da teia (dourado sobre preto): gás escuro -> filamento dourado-queimado -> nó branco quente.
const INFERNO = ['#030302', '#130f08', '#35291a', '#7a5f35', '#d4bf95', '#fff6e4'].map(c => new Color(c));
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
  if ((navigator.hardwareConcurrency || 8) >= 12) return 'high';
  if ((navigator.hardwareConcurrency || 8) <= 4) return 'low';
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

export function ObservatoryScene({ tests, page, focusIds, onPick, onAvailability, theme, events, explore = false, hot, sourceCurrent = false }: {
  sourceCurrent?: boolean; hot?: string[]; explore?: boolean; events?: SceneEvents; tests: TestEntity[]; page: ScenePage; focusIds?: string[]; onPick: (id: string) => void; onAvailability?: (available: boolean) => void; theme: 'dark' | 'light';
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{ shot: (p: ScenePage) => void; focus: (ids: string[]) => void; heat: (ids: string[]) => void; goDomain: (i: number | null) => void; zoom: (factor: number) => void; orbit: (az: number, elev: number) => void } | null>(null);
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
    delete el.dataset.fallback;
    onAvailability?.(true);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionPreference.matches;
    const updateMotionPreference = (event: MediaQueryListEvent) => { reduced = event.matches; };
    motionPreference.addEventListener('change', updateMotionPreference);
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    let quality: Quality = detectQuality();
    const dens = DENSITY[quality];
    el.dataset.quality = quality;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('obs-vector-canvas');
    svg.dataset.towerSvgNative = 'observatory';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Modelo visual ilustrativo flat-ΛCDM: expansão acelerada e atração suavizada para âncoras de domínio, sem massas inferidas dos registros.');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab';
    svg.style.background = theme === 'dark' && quality !== 'low' ? '#000' : 'transparent';
    el.dataset.physicsModel = 'illustrative-flat-lcdm-toy';
    el.dataset.physicsModelStatus = 'TOY_MODEL';
    const svgTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    svgTitle.textContent = 'Modelo visual ilustrativo flat-ΛCDM. As âncoras de domínio têm peso visual igual; massas não são inferidas dos registros.';
    svg.appendChild(svgTitle);
    el.prepend(svg);
    const scene = new Scene();
    const camera = new PerspectiveCamera(48, 1, 0.1, 300);
    const uniforms = { time: { value: 0 }, pixelRatio: { value: 1 }, evo: { value: 0 } };
    const light = theme === 'light';

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
      push(web, [d.x, d.y, d.z], new Color('#fff4df'), 95, 0.08);
    });

    // Hipóteses: nós ao redor do seu domínio; testes ao longo do filamento hipótese->domínio.
    const byHyp = new Map<string, TestEntity[]>();
    for (const t of tests) {
      const key = `${domainIndex(t.domain)}|${t.hypothesisId ?? t.campaignId ?? t.id}`;
      (byHyp.get(key) ?? byHyp.set(key, []).get(key)!).push(t);
    }
    const stars = buf();
    const ids: string[] = [];
    const clouds: Array<{ at: Vector3; ready: number; label: string }> = [];
    for (const [key, list] of byHyp) {
      const [di] = key.split('|');
      const d = domainPos[Number(di)]!;
      const node = d.clone().add(new Vector3(...jitter(key, 9)));
      filament(web, d, node, 30 * dens, 0.7, key);
      push(web, [node.x, node.y, node.z], inferno(0.8), 22 + Math.min(40, list.length * 4), 0.05);
      // Nuvem de formação (nuvem molecular): hipótese com testes prontos esperando. Poeira quente difusa,
      // quase sem pontos nítidos; encolhe sozinha quando os testes rodam (o tamanho vem da fila).
      const ready = list.filter(t => t.verdict === 'READY').length;
      if (ready >= 3) {
        const R = 0.9 + ready * 0.07;
        for (let q = 0; q < 26 + ready * 7; q += 1) {           // véu de poeira: pontos grandes e muito tênues
          const r = Math.pow(Math.random(), 0.6) * R;
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
          push(web, [node.x + r * Math.sin(ph) * Math.cos(th), node.y + r * Math.cos(ph) * 0.55, node.z + r * Math.sin(ph) * Math.sin(th)],
            [0.2 + Math.random() * 0.06, 0.11, 0.05], 38 + Math.random() * 46, 0.05);
        }
        for (let q = 0; q < ready * 2; q += 1) {                // proto-estrelas: poucas, pequenas, quentes
          const r = Math.pow(Math.random(), 1.4) * R * 0.7;
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
          push(web, [node.x + r * Math.sin(ph) * Math.cos(th), node.y + r * Math.cos(ph) * 0.55, node.z + r * Math.sin(ph) * Math.sin(th)],
            [0.85, 0.62, 0.42], 5 + Math.random() * 4, 0.35);
        }
        clouds.push({ at: node.clone(), ready, label: list[0]?.name ?? '' });
      }
      list.forEach(t => {
        const s = 0.15 + rnd(t.id) * 0.85;
        const p = node.clone().lerp(d, s * 0.8).add(new Vector3(...jitter(t.id, 0.9)));
        push(stars, [p.x, p.y, p.z], VERDICT_RGB[t.verdict], VERDICT_SIZE[t.verdict], reduced || !sourceCurrent ? 0 : VERDICT_PULSE[t.verdict], rnd(t.id));
        ids.push(t.id);
      });
    }
    if (reduced) web.pulse.fill(0);
    const webGeo = geom(web), starGeo = geom(stars);
    const starPositions = starGeo.getAttribute('position').array as Float32Array;
    const baseSize = Float32Array.from(stars.size);

    // Cubo de simulação: linhas finas que dão escala e a sensação de "caixa observada".
    const B = scale + 2, e: number[] = [];
    const corners = [-B, B];
    for (const x of corners) for (const y of corners) { e.push(x, y, -B, x, y, B); e.push(x, -B, y, x, B, y); e.push(-B, x, y, B, x, y); }
    const boxGeo = new BufferGeometry(); boxGeo.setAttribute('position', new BufferAttribute(new Float32Array(e), 3));

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
    const qsoGeo = geom(qso);
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

    const domainAnchors = Float32Array.from(domainPos.flatMap(d => [d.x, d.y, d.z]));
    const dynamics = createCosmicDynamics({
      particleBuffers: [
        webGeo.getAttribute('position').array as Float32Array,
        starPositions,
        qsoGeo.getAttribute('position').array as Float32Array,
        jetGeo.getAttribute('position').array as Float32Array,
      ],
      anchors: domainAnchors,
    });

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
        if (i >= 0) target.look.set(starPositions[i * 3]!, starPositions[i * 3 + 1]!, starPositions[i * 3 + 2]!).multiplyScalar(scene.scale.x);
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
    api.current = { shot, focus, heat, goDomain, zoom: factor => { zoom = Math.max(0.12, Math.min(2.6, zoom * factor)); }, orbit: (az, elev) => { target.az += az; target.elev = Math.max(-1.35, Math.min(1.4, target.elev + elev)); } };

    const resize = () => {
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); camera.aspect = w / h;
      // Desktop: a teia vive à direita, a coluna de leitura à esquerda.
      // Desktop: a coluna de leitura ocupa ~600px à esquerda; a teia se desloca para a área livre.
      // ≥1280: leitura (~600px) à esquerda e telemetria (340px) à direita; a teia centra no espaço entre as duas.
      if (window.innerWidth >= 1280) camera.clearViewOffset(); // a teia tem a própria janela no meio: centralizada
      else if (w > 900) camera.setViewOffset(w, h, -Math.min(w * 0.3, 300), 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const resizeAll = () => resize();
    resizeAll();
    const ro = new ResizeObserver(resizeAll); ro.observe(el);

    // Controles (como nos grafos): arrastar gira · roda/pinça dá zoom · botão direito, Shift ou 2 dedos movem · duplo clique recentra.
    // Fora do modo Explorar, a roda e o toque vertical continuam rolando a página.
    const canvas = svg;
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
      if (!was || was.moved || !(ev.target instanceof Node) || !canvas.contains(ev.target)) return;
      const rect = canvas.getBoundingClientRect();
      const i = nearestStar(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
      if (i !== null && ids[i]) pickRef.current(ids[i]!);
    };
    const byId = new Map(tests.map(t => [t.id, t]));
    let hoverAt = 0;
    const hover = (ev: PointerEvent) => {
      const tipEl = tip.current;
      if (!tipEl || drag || pinch || ev.pointerType === 'touch') { if (tipEl) tipEl.style.opacity = '0'; return; }
      const now = performance.now(); if (now - hoverAt < 50) return; hoverAt = now;
      const rect = canvas.getBoundingClientRect();
      const index = nearestStar(ev.clientX - rect.left, ev.clientY - rect.top, rect.width, rect.height);
      const t = index !== null ? byId.get(ids[index] ?? '') : undefined;
      if (!t) {
        // Perto de uma nuvem de formação? explica o que é.
        const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
        const hitCloud = clouds.find(c => {
          proj.copy(c.at).multiplyScalar(scene.scale.x).project(camera);
          const sx = (proj.x * 0.5 + 0.5) * rect.width, sy = (-proj.y * 0.5 + 0.5) * rect.height;
          return proj.z < 1 && Math.hypot(sx - mx, sy - my) < 46;
        });
        if (!hitCloud) { tipEl.style.opacity = '0'; canvas.style.cursor = ''; return; }
        tipEl.innerHTML = '';
        const b = document.createElement('b'); b.textContent = `Nuvem de formação: ${hitCloud.ready} candidatos marcados READY na leitura`;
        const i = document.createElement('i'); i.textContent = 'A elegibilidade e o despacho dependem da verificação publicada; consulte a fila.';
        tipEl.append(b, i);
        tipEl.style.transform = `translate(${mx + 14}px, ${my + 12}px)`;
        tipEl.style.opacity = '1'; canvas.style.cursor = 'pointer';
        return;
      }
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
    const clipMatrix = new Matrix4();
    const updateProjectionMatrix = () => {
      camera.updateMatrixWorld();
      clipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    };

    const vectorLayers = ['environment', 'tests', 'events', 'jets', 'bounds'].map(name => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `obs-vector-${name}`); g.setAttribute('pointer-events', 'none'); svg.appendChild(g); return g;
    });
    const pathCaches = vectorLayers.map(() => new Map<string, SVGPathElement>());
    // Lookup de alta resolução mantém a quantização visual original sem pow() por vértice.
    const srgb = new Uint8Array(65_536);
    for (let i = 0; i < srgb.length; i += 1) srgb[i] = Math.round(Math.pow(i / 65_535, 1 / 2.2) * 255);
    const colorCache = new Map<number, string>();
    const rgb = (r: number, g: number, b: number) => {
      const ri = Math.max(0, Math.min(65_535, Math.round(r * 65_535)));
      const gi = Math.max(0, Math.min(65_535, Math.round(g * 65_535)));
      const bi = Math.max(0, Math.min(65_535, Math.round(b * 65_535)));
      const red = srgb[ri]!, green = srgb[gi]!, blue = srgb[bi]!;
      const key = (red << 16) | (green << 8) | blue;
      let color = colorCache.get(key);
      if (!color) {
        color = `rgb(${red},${green},${blue})`;
        colorCache.set(key, color);
      }
      return color;
    };
    const updateLayer = (index: number, data: Map<string, string[]>) => {
      const layer = vectorLayers[index]!, cache = pathCaches[index]!, live = new Set<string>();
      for (const [key, parts] of data) {
        live.add(key); let path = cache.get(key);
        if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('fill', 'none'); path.setAttribute('pointer-events', 'none'); path.setAttribute('stroke', key.split('|')[0]!); path.setAttribute('stroke-opacity', key.split('|')[1]!); path.setAttribute('stroke-width', key.split('|')[2]!); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('vector-effect', 'non-scaling-stroke'); cache.set(key, path); layer.appendChild(path); }
        const d = parts.join('');
        if (path.getAttribute('d') !== d) path.setAttribute('d', d);
      }
      for (const [key, path] of cache) if (!live.has(key)) { path.remove(); cache.delete(key); }
    };
    const projectPaths = (geo: BufferGeometry, index: number, deform: boolean, time: number, omit = 1) => {
      const positions = geo.getAttribute('position'), tints = geo.getAttribute('tint'), sizes = geo.getAttribute('size'), pulses = geo.getAttribute('pulse'), seeds = geo.getAttribute('seed'), nodesAttr = geo.getAttribute('node');
      const groups = new Map<string, string[]>();
      // Layout dimensions are constant during this projection, not per vertex.
      const m = clipMatrix.elements, viewportWidth = el.clientWidth || window.innerWidth, viewportHeight = el.clientHeight || window.innerHeight;
      for (let i = 0; i < positions.count; i += omit) {
        let x=positions.getX(i), y=positions.getY(i), z=positions.getZ(i), pulse=pulses.getX(i), seed=seeds.getX(i);
        if (deform) { const nx=nodesAttr.getX(i), ny=nodesAttr.getY(i), nz=nodesAttr.getZ(i), dx=nx-x, dy=ny-y, dz=nz-z, distance=Math.hypot(dx,dy,dz), evo=uniforms.evo.value, outward=Math.min(1,Math.max(0,(distance-.6)/2.6))*.75*evo, norm=Math.hypot(x,y,z)||1, breath=Math.sin(time*.07+seed*6.28)*.015; x+=(dx*.3*evo)+x/norm*outward+dx*breath; y+=(dy*.3*evo)+y/norm*outward+dy*breath; z+=(dz*.3*evo)+z/norm*outward+dz*breath; }
        const px = x * expansion, py = y * expansion, pz = z * expansion;
        const cx=m[0]!*px+m[4]!*py+m[8]!*pz+m[12]!, cy=m[1]!*px+m[5]!*py+m[9]!*pz+m[13]!, cz=m[2]!*px+m[6]!*py+m[10]!*pz+m[14]!, cw=m[3]!*px+m[7]!*py+m[11]!*pz+m[15]!;
        if (cw <= 0) continue;
        const ndcX=cx/cw, ndcY=cy/cw, ndcZ=cz/cw;
        if(ndcZ < -1 || ndcZ > 1 || Math.abs(ndcX)>1.05 || Math.abs(ndcY)>1.05) continue;
        const sx=(ndcX*.5+.5)*viewportWidth, sy=(-ndcY*.5+.5)*viewportHeight, pulseFactor=1+pulse*.32*Math.sin(time*2.4+seed*6.28), radius=Math.max(.45,Math.min(6,sizes.getX(i)*18/Math.max(8,cw)*pulseFactor*.14)), alpha=Math.round(Math.max(.16,Math.min(.95,(.45+.45*pulseFactor)*(light?.62:1)))*4)/4;
        const color=rgb(tints.getX(i),tints.getY(i),tints.getZ(i)), width=Math.max(1,Math.round(radius*2*2)/2), key=`${color}|${alpha}|${width}`, d=`M${sx.toFixed(1)},${sy.toFixed(1)}h.01`, list=groups.get(key); if(list) list.push(d); else groups.set(key,[d]);
      }
      updateLayer(index, groups);
    };
    const nearestStar = (x: number, y: number, w: number, h: number): number | null => {
      updateProjectionMatrix();
      const m = clipMatrix.elements;
      let best: number|null=null, distance=18;
      for(let i=0;i<ids.length;i++){
        const px=starPositions[i*3]!*expansion,py=starPositions[i*3+1]!*expansion,pz=starPositions[i*3+2]!*expansion;
        const cx=m[0]!*px+m[4]!*py+m[8]!*pz+m[12]!,cy=m[1]!*px+m[5]!*py+m[9]!*pz+m[13]!,cz=m[2]!*px+m[6]!*py+m[10]!*pz+m[14]!,cw=m[3]!*px+m[7]!*py+m[11]!*pz+m[15]!;
        if(cw<=0)continue;const nz=cz/cw;if(nz < -1||nz>1)continue;
        const sx=(cx/cw*.5+.5)*w,sy=(-cy/cw*.5+.5)*h,d=Math.hypot(x-sx,y-sy);if(d<distance){best=i;distance=d;}
      }
      return best;
    };
    const renderJets = (time: number) => {
      const pos=jetGeo.getAttribute('position'),dir=jetGeo.getAttribute('dir'),phase=jetGeo.getAttribute('phase'),speed=jetGeo.getAttribute('speed'),parts:string[]=[];
      const m=clipMatrix.elements,w=el.clientWidth||window.innerWidth,h=el.clientHeight||window.innerHeight;
      for(let i=0;i<pos.count;i++){const f=((time*speed.getX(i)+phase.getX(i))%1+1)%1,px=(pos.getX(i)+dir.getX(i)*f)*expansion,py=(pos.getY(i)+dir.getY(i)*f)*expansion,pz=(pos.getZ(i)+dir.getZ(i)*f)*expansion,cx=m[0]!*px+m[4]!*py+m[8]!*pz+m[12]!,cy=m[1]!*px+m[5]!*py+m[9]!*pz+m[13]!,cz=m[2]!*px+m[6]!*py+m[10]!*pz+m[14]!,cw=m[3]!*px+m[7]!*py+m[11]!*pz+m[15]!;if(cw<=0)continue;const nz=cz/cw;if(nz < -1||nz>1)continue;parts.push(`M${((cx/cw*.5+.5)*w).toFixed(1)},${((-.5*cy/cw+.5)*h).toFixed(1)}h.01`);}
      updateLayer(3,new Map([[`${light?'#69471f':'#f2e6d1'}|0.65|1.5`,parts]]));
    };
    const renderVectors = (time: number) => {
      updateProjectionMatrix();
      // Bound decorative projection even as the publication gains hypotheses.
      // Every published test and event retains stride 1 and remains selectable.
      const qualityStep = environmentStride(webGeo.getAttribute('position').count, quality);
      projectPaths(webGeo,0,true,time,qualityStep); projectPaths(starGeo,1,false,time,1); projectPaths(qsoGeo,2,false,time,1);
      renderJets(time);
      const bounds=boxGeo.getAttribute('position'), lines:string[]=[],m=clipMatrix.elements,bw=el.clientWidth||window.innerWidth,bh=el.clientHeight||window.innerHeight;
      for(let i=0;i+1<bounds.count;i+=2){const ax=bounds.getX(i)*expansion,ay=bounds.getY(i)*expansion,az=bounds.getZ(i)*expansion,bx=bounds.getX(i+1)*expansion,by=bounds.getY(i+1)*expansion,bz=bounds.getZ(i+1)*expansion,acx=m[0]!*ax+m[4]!*ay+m[8]!*az+m[12]!,acy=m[1]!*ax+m[5]!*ay+m[9]!*az+m[13]!,acz=m[2]!*ax+m[6]!*ay+m[10]!*az+m[14]!,acw=m[3]!*ax+m[7]!*ay+m[11]!*az+m[15]!,bcx=m[0]!*bx+m[4]!*by+m[8]!*bz+m[12]!,bcy=m[1]!*bx+m[5]!*by+m[9]!*bz+m[13]!,bcz=m[2]!*bx+m[6]!*by+m[10]!*bz+m[14]!,bcw=m[3]!*bx+m[7]!*by+m[11]!*bz+m[15]!;if(acw<=0||bcw<=0)continue;const azN=acz/acw,bzN=bcz/bcw;if(azN>1&&bzN>1)continue;lines.push(`M${((acx/acw*.5+.5)*bw).toFixed(1)},${(-acy/acw*.5+.5)*bh}L${((bcx/bcw*.5+.5)*bw).toFixed(1)},${(-bcy/bcw*.5+.5)*bh}`);}
      updateLayer(4,new Map([['#9a8d75|0.20|0.6',lines]])); el.dataset.renderCount=String(Number(el.dataset.renderCount||0)+1); svg.dataset.ready='true'; svg.dataset.renderCount=el.dataset.renderCount;
    };

    let raf = 0, last = performance.now(), lastVector = 0, visible = true, expansion = 1, lodTick = 0;
    const FORM_S = 180; let cosmic = 0;
    const replay = () => { cosmic = 0; dynamics.reset(); expansion = dynamics.state.expansion; };
    window.addEventListener('nexo:replay-formation', replay);
    const vis = () => { visible = document.visibilityState === 'visible'; if (visible && !raf) raf = requestAnimationFrame(frame); else if (!visible) { cancelAnimationFrame(raf); raf = 0; } };
    document.addEventListener('visibilitychange', vis);
    const frame = (now: number) => {
      raf = 0;
      if (!visible) { last = now; return; }
      // A reading surface does not need 60 WebGL frames per second.
      const frameBudget = 1000 / (reduced ? 15 : mobile || !exploreRef.current ? 30 : 60);
      if (now - last < frameBudget) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduced) uniforms.time.value += dt;
      const physics = dynamics.step(dt, {
        paused: !visible,
        hidden: document.visibilityState !== 'visible',
        reducedMotion: reduced,
      });
      expansion = physics.expansion;
      // Relógio cósmico: a formação é visível — ~3 min do quase-uniforme até a teia madura
      // (aglomeração nos nós, vazios crescendo), depois segue bem devagar. "Rever formação" zera o relógio.
      cosmic += dt;
      { const u = Math.min(1, cosmic / FORM_S); const e = u * u * (3 - 2 * u); const tail = cosmic > FORM_S ? (cosmic - FORM_S) / (cosmic - FORM_S + 600) : 0;
        uniforms.evo.value = reduced ? 0.6 : 0.08 + 0.8 * e + 0.12 * tail; }
      // O fator de escala flat-ΛCDM é comprimido para caber no volume visual.
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
      camera.updateMatrixWorld();
      if (now - lastVector >= (exploreRef.current ? 1000 / 30 : 250)) { lastVector = now; renderVectors(uniforms.time.value); }
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
        const off = proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1 || (!exploreRef.current && w > 900 && window.innerWidth < 1280 && (proj.x * 0.5 + 0.5) * w < Math.min(820, w * 0.6));
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
          proj.set(starPositions[i * 3]!, starPositions[i * 3 + 1]!, starPositions[i * 3 + 2]!).multiplyScalar(expansion).project(camera);
          if (proj.z > 1 || Math.abs(proj.x) > 0.9 || Math.abs(proj.y) > 0.9) continue;
          const sx = (proj.x * 0.5 + 0.5) * w, sy = (-proj.y * 0.5 + 0.5) * h;
          if (w > 900 && window.innerWidth < 1280 && !exploreRef.current && sx < Math.min(640, w * 0.45)) continue;
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
        const off = proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05 || (!exploreRef.current && w > 900 && window.innerWidth < 1280 && (proj.x * 0.5 + 0.5) * w < Math.min(820, w * 0.6));
        node.style.opacity = off ? '0' : '1';
        if (!off) place(node, (proj.x * 0.5 + 0.5) * w, (-proj.y * 0.5 + 0.5) * h);
      });
      if (visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      motionPreference.removeEventListener('change', updateMotionPreference);
      window.removeEventListener('nexo:replay-formation', replay); document.removeEventListener('visibilitychange', vis);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointermove', hover);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('dblclick', dbl);
      canvas.removeEventListener('contextmenu', noMenu);
      webGeo.dispose(); starGeo.dispose(); qsoGeo.dispose(); jetGeo.dispose(); boxGeo.dispose();
      delete el.dataset.physicsModel;
      delete el.dataset.physicsModelStatus;
      canvas.remove(); api.current = null;
    };
  }, [tests, theme, events, domains, sourceCurrent]);

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
    <div className="obs-camera-controls" role="group" aria-label="Câmera da teia; setas giram, mais e menos aproximam" tabIndex={0}
      onKeyDown={event => {
        const commands: Record<string, () => void> = { ArrowLeft: () => api.current?.orbit(-0.12, 0), ArrowRight: () => api.current?.orbit(0.12, 0), ArrowUp: () => api.current?.orbit(0, -0.1), ArrowDown: () => api.current?.orbit(0, 0.1), '+': () => api.current?.zoom(0.8), '=': () => api.current?.zoom(0.8), '-': () => api.current?.zoom(1.25), Home: () => resetView.current() };
        if (commands[event.key]) { event.preventDefault(); commands[event.key]!(); }
      }}>
      <button type="button" aria-label="Aproximar câmera" onClick={() => api.current?.zoom(0.8)}>+</button>
      <button type="button" aria-label="Afastar câmera" onClick={() => api.current?.zoom(1.25)}>−</button>
      <button type="button" aria-label="Recentrar câmera" onClick={() => resetView.current()}>Centro</button>
    </div>
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
