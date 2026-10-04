// A semantic cosmic-web view of published projects, hypotheses, tests and dependencies.
// The scene is a read-only projection: it does not infer missing graph edges or animate
// records that are not explicitly marked as running.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, HalfFloatType, LineBasicMaterial, LineSegments, NormalBlending,
  PerspectiveCamera, Points, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { TestEntity } from './model.ts';
import { normDomain } from './domains.ts';
import {
  buildObservatoryLayout, dependenciesAtScale, SCALE_DISTANCE, scaleForDistance,
  isRecentSceneResult, stableSceneOffset, type ObservatoryLayout, type ObservatoryScale, type SceneEntity,
  type SceneHypothesis, type SceneProject, type ScenePosition,
} from './sceneModel.ts';
import { buildCosmicWebGeometry, cosmicWebSignature } from './cosmicWebGeometry.ts';

export type { ObservatoryScale, SceneHypothesis, SceneProject } from './sceneModel.ts';

export interface SceneEvents {
  quasars: Array<{ domain: string; label: string; href: string }>;
  agn: Array<{ domain: string; count: number; label: string; href: string }>;
  grbs: Array<{ domain: string; label: string; href: string }>;
}
export type ScenePage = 'agora' | 'universo' | 'ciclo' | 'roadmaps' | 'roadmap' | 'evidencia' | 'entidade' | 'saude';
export interface DomainSpot { id: string; label: string; at: [number, number, number] }

const FIXED_DOMAIN_SPOTS: Record<string, [number, number, number]> = {
  SCIENCE: [-6.5, 1.5, -2], ENGINEERING: [6, -1, 3], OLYMPUS: [1.5, 5, 7],
};
const DOMAIN_LABELS: Record<string, string> = {
  NEXO: 'NEXO', SCIENCE: 'Ciência', ENGINEERING: 'Engenharia', OLYMPUS: 'Olympus',
  PHILOSOPHY: 'Filosofia', FILOSOFIA: 'Filosofia', MATHEMATICS: 'Matemática', BIOLOGY: 'Biologia',
  PHYSICS: 'Física', ECONOMICS: 'Economia', HISTORY: 'História', PSYCHOLOGY: 'Psicologia',
  LINGUISTICS: 'Linguística', MEDICINE: 'Medicina',
};

/** Stable domain reference points; never creates regions without a published entity. */
export function layoutDomains(ids: string[]): DomainSpot[] {
  return [...new Set(ids.map(normDomain))].sort().map(id => {
    const at = FIXED_DOMAIN_SPOTS[id] || (() => {
      const offset = stableSceneOffset('domain:' + id, 9.5);
      return [offset.x, offset.y, offset.z] as [number, number, number];
    })();
    return { id, label: DOMAIN_LABELS[id] || id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, ' '), at };
  });
}

export type Quality = 'high' | 'medium' | 'low';
export function detectQuality(): Quality {
  try {
    const forced = localStorage.getItem('nexo.quality');
    if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  } catch { /* storage may be unavailable */ }
  if (window.matchMedia('(max-width: 760px)').matches || (navigator.hardwareConcurrency || 8) < 4) return 'low';
  return 'medium';
}

const DENSITY: Record<Quality, number> = { high: 1.7, medium: 1.1, low: 0.66 };
const MARKER_TINT: Record<SceneEntity['kind'], string> = {
  region: '#19485a', project: '#28738d', hypothesis: '#51a8c1', test: '#8ed8e8',
};
const STATUS_LABEL: Record<TestEntity['verdict'], string> = {
  CONFIRMED: 'Confirmado', REFUTED: 'Refutado', REVIEW: 'Em revisão', PROVISIONAL: 'Resultado provisório',
  READY: 'Na fila', RUNNING: 'Em processamento', CHECKPOINTED: 'Execução salva', BLOCKED: 'Bloqueado',
  REJECTED: 'Rejeitado pelo critério', DISCARDED: 'Descartado',
};

const POINT_VERTEX = `
attribute float size; attribute vec3 tint; attribute float heat; attribute float execution;
uniform float time; uniform float pixelRatio;
varying vec3 vTint; varying float vAlpha; varying float vCore;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  float running = execution > 0.5 ? 1.0 + 0.22 * sin(time * 3.1) : 1.0;
  float px = size * (1.0 + heat * 0.52) * running * pixelRatio * (20.0 / max(0.4, -mv.z));
  gl_PointSize = clamp(px, 2.0 * pixelRatio, 46.0 * pixelRatio);
  vTint = tint * (0.72 + heat * 0.62 + execution * 0.12);
  vAlpha = clamp(0.56 + heat * 0.36 + execution * 0.08, 0.38, 1.0);
  vCore = execution;
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FRAGMENT = `
 varying vec3 vTint; varying float vAlpha; varying float vCore;
 void main(){
   vec2 c = gl_PointCoord - 0.5; float d = length(c);
   float halo = exp(-d * d * 15.0) * (1.0 - smoothstep(0.33, 0.5, d));
   float core = 1.0 - smoothstep(0.015, 0.12, d);
   float a = (halo * 0.56 + core * (0.32 + vCore * 0.28)) * vAlpha;
   if (a < 0.006) discard;
   gl_FragColor = vec4(vTint * (0.76 + halo * 0.42 + core * 0.24), a);
   #include <colorspace_fragment>
 }`;

const COSMIC_MOTE_VERTEX = `
attribute float size; attribute vec3 tint; attribute float opacity; attribute vec3 axis; attribute float aspect;
uniform float pixelRatio;
varying vec3 vTint; varying float vOpacity; varying float vDepth; varying vec2 vAxis; varying float vAspect;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.0, -mv.z);
  vec3 viewAxis = (modelViewMatrix * vec4(axis, 0.0)).xyz;
  vec2 screenAxis = viewAxis.xy;
  vAxis = length(screenAxis) > 0.0001 ? normalize(screenAxis) : vec2(1.0, 0.0);
  vAspect = max(1.0, aspect);
  gl_PointSize = clamp(size * vAspect * pixelRatio * (13.0 / max(1.0, depth)), 1.0 * pixelRatio, 44.0 * pixelRatio);
  vTint = tint;
  vOpacity = opacity;
  vDepth = 1.0 - smoothstep(30.0, 105.0, depth) * 0.52;
  gl_Position = projectionMatrix * mv;
}`;
const COSMIC_MOTE_FRAGMENT = `
varying vec3 vTint; varying float vOpacity; varying float vDepth; varying vec2 vAxis; varying float vAspect;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  vec2 acrossAxis = vec2(-vAxis.y, vAxis.x);
  float along = dot(p, vAxis) * 2.0;
  float across = dot(p, acrossAxis) * 2.0 * vAspect;
  float veil = exp(-along * along * 1.7 - across * across * 10.0);
  float fiber = exp(-along * along * 5.5 - across * across * 40.0);
  float filamentCore = exp(-along * along * 18.0 - across * across * 110.0);
  float alpha = (veil * 0.12 + fiber * 0.58 + filamentCore * 0.52) * vOpacity * vDepth;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(vTint * (0.82 + filamentCore * 0.78), alpha);
  #include <colorspace_fragment>
}`;

interface PointLayer { kind: SceneEntity['kind']; points: Points; entities: SceneEntity[]; geometry: BufferGeometry }
interface SceneRuntime {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  material: ShaderMaterial;
  cosmicMaterial: ShaderMaterial;
  layers: PointLayer[];
  dependencyLines: LineSegments | null;
  membershipLines: LineSegments | null;
  cosmicLines: LineSegments | null;
  cosmicPoints: Points | null;
  cosmicSignature: string;
  reducedMotion: boolean;
  frame: number;
  visible: boolean;
  contextLost: boolean;
  layout: ObservatoryLayout;
  tests: TestEntity[];
  scale: ObservatoryScale;
  render: () => void;
  schedule: () => void;
  setScale: (scale: ObservatoryScale, focusKey?: string | null) => void;
  focus: (ids: string[]) => void;
  orbit: (azimuth: number, elevation: number) => void;
  reset: () => void;
  update: (layout: ObservatoryLayout, tests: TestEntity[], scale: ObservatoryScale, focused: string[], hot: string[], sourceCurrent: boolean, theme: 'dark' | 'light') => void;
  onHit: (entity: SceneEntity | null) => void;
}

function geometryForEntities(entities: SceneEntity[], quality: Quality, focused: Set<string>, hot: Set<string>, sourceCurrent: boolean): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  const heats: number[] = [];
  const executions: number[] = [];
  const dense = DENSITY[quality];
  const focusIsActive = focused.size > 0;
  for (const entity of entities) {
    const p = entity.position;
    positions.push(p.x, p.y, p.z);
    const running = entity.kind === 'test' && entity.test?.status === 'RUNNING' && sourceCurrent ? 1 : 0;
    const isHot = entity.kind === 'test' && entity.test !== undefined && isRecentSceneResult(entity.test, hot, sourceCurrent);
    const isFocused = focused.has(entity.id) || focused.has(entity.key);
    const base = new Color(MARKER_TINT[entity.kind]);
    if (focusIsActive && !isFocused) base.multiplyScalar(0.28);
    if (isHot) base.lerp(new Color('#d8fbff'), 0.66);
    if (isFocused) base.lerp(new Color('#e7fcff'), 0.70);
    colors.push(base.r, base.g, base.b);
    const baseSize = entity.kind === 'region' ? 24 : entity.kind === 'project' ? 19 : entity.kind === 'hypothesis' ? 13 : 8;
    sizes.push(baseSize * dense * (isHot || isFocused ? 1.28 : 1));
    heats.push(isHot || isFocused ? 1 : 0);
    executions.push(running);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('tint', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('size', new BufferAttribute(new Float32Array(sizes), 1));
  geometry.setAttribute('heat', new BufferAttribute(new Float32Array(heats), 1));
  geometry.setAttribute('execution', new BufferAttribute(new Float32Array(executions), 1));
  return geometry;
}

function positionVector(position: ScenePosition): Vector3 {
  return new Vector3(position.x, position.y, position.z);
}

function dependencyGeometry(layout: ObservatoryLayout, tests: TestEntity[], scale: ObservatoryScale, sourceCurrent: boolean): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const links = dependenciesAtScale(layout, tests, scale, sourceCurrent);
  const colorStart = new Color('#14546b');
  const colorEnd = new Color('#53c5dd');
  for (const link of links) {
    const source = layout.entityByKey.get(link.sourceKey);
    const target = layout.entityByKey.get(link.targetKey);
    if (!source || !target) continue;
    const a = positionVector(source.position);
    const b = positionVector(target.position);
    const direction = b.clone().sub(a);
    const span = direction.length();
    if (span < 0.08) continue;
    direction.normalize();
    const reference = Math.abs(direction.y) < 0.86 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const perpendicular = direction.clone().cross(reference).normalize();
    const bend = Math.min(0.9, span * 0.08) * ((hashAngle(link.id) % 2) ? 1 : -1);
    const control = a.clone().add(b).multiplyScalar(0.5).addScaledVector(perpendicular, bend);
    const pointAt = (t: number) => {
      const u = 1 - t;
      return a.clone().multiplyScalar(u * u).addScaledVector(control, 2 * u * t).addScaledVector(b, t * t);
    };
    const segments = 20;
    for (let segment = 0; segment < segments; segment += 1) {
      const start = pointAt(segment / segments);
      const end = pointAt((segment + 1) / segments);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      const brightness = link.attenuated ? 0.20 : link.activeExecution ? 1 : 0.68;
      const c1 = colorStart.clone().lerp(colorEnd, (segment / segments) * brightness);
      const c2 = colorStart.clone().lerp(colorEnd, ((segment + 1) / segments) * brightness);
      colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }
    // Direction is explicit: a small arrowhead points to the dependent record.
    const tip = pointAt(0.82);
    const tangent = pointAt(0.88).sub(pointAt(0.76)).normalize();
    const side = new Vector3(-tangent.y, tangent.x, tangent.z * 0.25).normalize();
    const back = tip.clone().addScaledVector(tangent, -Math.min(0.42, span * 0.12));
    const wing = Math.min(0.22, span * 0.065);
    for (const wingSign of [-1, 1]) {
      const base = back.clone().addScaledVector(side, wing * wingSign);
      positions.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
      const arrowEnd = link.attenuated ? colorStart.clone().lerp(colorEnd, 0.22) : colorEnd;
      colors.push(colorStart.r, colorStart.g, colorStart.b, arrowEnd.r, arrowEnd.g, arrowEnd.b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

function membershipGeometry(layout: ObservatoryLayout, scale: ObservatoryScale): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  if (scale !== 'overview') for (const link of layout.memberships) {
    const source = layout.entityByKey.get(link.sourceKey);
    const target = layout.entityByKey.get(link.targetKey);
    if (!source || !target) continue;
    const expected = scale === 'research'
      ? ['project', 'region'].includes(source.kind) && target.kind === 'hypothesis'
      : source.kind === 'hypothesis' && target.kind === 'test'
        || ['project', 'region'].includes(source.kind) && target.kind === 'test';
    if (!expected) continue;
    const a = positionVector(source.position), b = positionVector(target.position);
    const distance = a.distanceTo(b);
    const steps = 16;
    const dark = new Color('#124252'), light = new Color('#286c7d');
    for (let step = 0; step < steps; step += 1) {
      if (step % 2 === 1) continue;
      const start = a.clone().lerp(b, step / steps);
      const end = a.clone().lerp(b, (step + 1) / steps);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      colors.push(dark.r, dark.g, dark.b, light.r, light.g, light.b);
    }
    if (distance < 0.01) continue;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

function hashAngle(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function focusCenter(layout: ObservatoryLayout, ids: string[], scale: ObservatoryScale): Vector3 | null {
  const positions: Vector3[] = [];
  const keys = new Set<string>();
  for (const id of ids) {
    const key = layout.keyByTestId.get(id.replace(/^(?:test:)/i, ''));
    const test = key ? layout.entityByKey.get(key) : null;
    if (!test) continue;
    const aggregateKey = scale === 'operational' ? test.key
      : scale === 'research' ? layout.hypothesisForTest.get(test.id) || layout.projectForTest.get(test.id)
        : layout.projectForTest.get(test.id);
    if (!aggregateKey || keys.has(aggregateKey)) continue;
    keys.add(aggregateKey);
    const entity = layout.entityByKey.get(aggregateKey);
    if (entity) positions.push(positionVector(entity.position));
  }
  if (!positions.length) return null;
  return positions.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / positions.length);
}

function defaultScaleForPage(page: ScenePage): ObservatoryScale {
  if (page === 'entidade') return 'operational';
  if (page === 'roadmap' || page === 'roadmaps' || page === 'ciclo' || page === 'evidencia') return 'research';
  return 'overview';
}

function fitFactor(camera: PerspectiveCamera): number {
  return camera.aspect < 1 ? 1 / Math.max(0.55, camera.aspect) : 1;
}

function scaleLabels(layout: ObservatoryLayout, scale: ObservatoryScale, focusIds: string[], hotIds: string[]): SceneEntity[] {
  const projects = layout.entities.filter(entity => entity.kind === 'project');
  const regions = layout.entities.filter(entity => entity.kind === 'region');
  if (scale === 'overview') return [...regions, ...projects];
  const hypotheses = layout.entities.filter(entity => entity.kind === 'hypothesis');
  if (scale === 'research') {
    const important = new Set([...focusIds, ...hotIds].map(id => layout.hypothesisForTest.get(id.replace(/^(?:test:)/i, ''))).filter(Boolean));
    const chosen = hypotheses.length <= 48 ? hypotheses : hypotheses.filter(entity => important.has(entity.key)).slice(0, 48);
    return [...regions, ...projects, ...chosen];
  }
  const focusedTests = new Set(focusIds.map(id => id.replace(/^(?:test:)/i, '')));
  const hotTests = new Set(hotIds);
  const testLabels = layout.entities.filter(entity => entity.kind === 'test' && (focusedTests.has(entity.id) || hotTests.has(entity.id))).slice(0, 16);
  return [...regions, ...projects, ...hypotheses.filter(entity => importantHypothesis(layout, entity, focusIds, hotIds)).slice(0, 32), ...testLabels];
}

function importantHypothesis(layout: ObservatoryLayout, entity: SceneEntity, focusIds: string[], hotIds: string[]): boolean {
  const ids = [...focusIds, ...hotIds].map(id => id.replace(/^(?:test:)/i, ''));
  return ids.some(id => layout.hypothesisForTest.get(id) === entity.key);
}

export function ObservatoryScene({
  tests, page, focusIds = [], onPick, onAvailability, theme, events, explore = false, hot = [], sourceCurrent = false,
  projects = [], hypotheses = [], scale, onScaleChange, onProjectSelect,
}: {
  sourceCurrent?: boolean;
  hot?: string[];
  explore?: boolean;
  events?: SceneEvents;
  tests: TestEntity[];
  projects?: SceneProject[];
  hypotheses?: SceneHypothesis[];
  page: ScenePage;
  focusIds?: string[];
  scale?: ObservatoryScale;
  onScaleChange?: (scale: ObservatoryScale) => void;
  onProjectSelect?: (id: string | null) => void;
  onPick: (id: string) => void;
  onAvailability?: (available: boolean) => void;
  theme: 'dark' | 'light';
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const api = useRef<SceneApi | null>(null);
  const [sceneScale, setSceneScale] = useState<ObservatoryScale>(scale || defaultScaleForPage(page));
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const dataRef = useRef({ tests, projects, hypotheses, focusIds, hot, sourceCurrent, theme, page, explore, events, scale, onPick, onAvailability, onScaleChange, onProjectSelect });
  dataRef.current = { tests, projects, hypotheses, focusIds, hot, sourceCurrent, theme, page, explore, events, scale, onPick, onAvailability, onScaleChange, onProjectSelect };
  const layout = useMemo(() => buildObservatoryLayout(tests, projects, hypotheses), [tests, projects, hypotheses]);
  const focusKey = useMemo(() => [...focusIds].sort().join('|'), [focusIds]);
  const hotKey = useMemo(() => [...hot].sort().join('|'), [hot]);
  const labelEntities = useMemo(() => scaleLabels(layout, sceneScale, focusIds, hot), [layout, sceneScale, focusKey, hotKey]);

  useEffect(() => {
    const hostElement = host.current;
    if (!hostElement) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
    } catch {
      hostElement.dataset.fallback = 'true';
      dataRef.current.onAvailability?.(false);
      return;
    }
    delete hostElement.dataset.fallback;
    const quality = detectQuality();
    hostElement.dataset.quality = quality;
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.65 : quality === 'medium' ? 1.25 : 1);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(dataRef.current.theme === 'dark' ? 0x03080d : 0xf7fbfc, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    hostElement.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(48, 1, 0.1, 360);
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, pixelRatio: { value: dpr } },
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const cosmicMaterial = new ShaderMaterial({
      uniforms: { pixelRatio: { value: dpr } },
      vertexShader: COSMIC_MOTE_VERTEX,
      fragmentShader: COSMIC_MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: dataRef.current.theme === 'dark' ? AdditiveBlending : NormalBlending,
    });
    const runtime: SceneRuntime = {
      renderer, scene, camera, material, cosmicMaterial, layers: [], dependencyLines: null, membershipLines: null,
      cosmicLines: null, cosmicPoints: null, cosmicSignature: '', reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      frame: 0, visible: document.visibilityState === 'visible', contextLost: false,
      layout, tests: [...tests], scale: scale || defaultScaleForPage(page),
      render: () => {}, schedule: () => {}, setScale: () => {}, focus: () => {}, orbit: () => {}, reset: () => {}, update: () => {}, onHit: () => {},
    };

    let cam = { dist: SCALE_DISTANCE[runtime.scale], elev: 0.48, az: 0.72 };
    let target = { dist: SCALE_DISTANCE[runtime.scale], elev: 0.48, az: 0.72, look: new Vector3() };
    let zoom = 1;
    let commandedScale: ObservatoryScale | null = null;
    const pan = new Vector3();
    const look = new Vector3();
    const pointerRay = new Raycaster();
    pointerRay.params.Points = { threshold: 0.46 };
    const ndc = new Vector2();
    const canvas = renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean; pan: boolean } | null = null;
    let pinch: { distance: number; x: number; y: number } | null = null;
    let lastFrame = performance.now();
    let resizeObserver: ResizeObserver;
    let composer: EffectComposer | null = null;
    let composedTheme: 'dark' | 'light' = dataRef.current.theme;
    const disposeComposer = () => {
      if (!composer) return;
      composer.passes.forEach(pass => pass.dispose?.());
      composer.dispose();
      composer = null;
    };
    const buildComposer = (nextTheme: 'dark' | 'light') => {
      disposeComposer();
      composedTheme = nextTheme;
      const supportsHalfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
      if (quality === 'low' || nextTheme !== 'dark' || !supportsHalfFloat) return;
      try {
        const targetBuffer = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
        composer = new EffectComposer(renderer, targetBuffer);
        composer.setPixelRatio(dpr);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new Vector2(1, 1), quality === 'high' ? 0.42 : 0.32, 0.28, 0.76));
        composer.addPass(new OutputPass());
      } catch {
        disposeComposer();
      }
    };
    buildComposer(dataRef.current.theme);

    const activeExecution = () => !runtime.reducedMotion && runtime.tests.some(test => test.status === 'RUNNING') && dataRef.current.sourceCurrent;
    const projectCamera = () => {
      const viewportFit = fitFactor(camera);
      const distance = cam.dist * viewportFit * zoom;
      const elevation = cam.elev;
      camera.position.set(
        look.x + Math.cos(cam.az) * Math.cos(elevation) * distance,
        look.y + Math.sin(elevation) * distance,
        look.z + Math.sin(cam.az) * Math.cos(elevation) * distance,
      );
      camera.lookAt(look);
    };
    const render = () => {
      projectCamera();
      if (!runtime.contextLost) {
        if (composer) composer.render(); else renderer.render(scene, camera);
        if (runtime.cosmicPoints) hostElement.dataset.cosmicRendered = 'true';
      }
    };
    const positionLabels = () => {
      const labelRoot = labels.current;
      if (!labelRoot) return;
      const rect = canvas.getBoundingClientRect();
      labelRoot.querySelectorAll<HTMLElement>('[data-scene-node]').forEach(element => {
        const entity = runtime.layout.entityByKey.get(element.dataset.sceneNode || '');
        if (!entity) {
          element.style.opacity = '0';
          element.style.pointerEvents = 'none';
          element.tabIndex = -1;
          element.setAttribute('aria-hidden', 'true');
          return;
        }
        const projected = positionVector(entity.position).project(camera);
        const x = (projected.x * 0.5 + 0.5) * rect.width;
        const y = (-projected.y * 0.5 + 0.5) * rect.height;
        const offscreen = projected.z > 1 || Math.abs(projected.x) > 1.08 || Math.abs(projected.y) > 1.08;
        element.style.opacity = offscreen ? '0' : '1';
        element.style.pointerEvents = offscreen ? 'none' : 'auto';
        if (offscreen) {
          element.tabIndex = -1;
          element.setAttribute('aria-hidden', 'true');
        } else {
          element.removeAttribute('aria-hidden');
          if (element instanceof HTMLButtonElement) element.tabIndex = 0;
        }
        if (!offscreen) element.style.transform = 'translate(' + Math.round(x + 9) + 'px,' + Math.round(y - 10) + 'px)';
      });
    };
    const updateScale = (notify: boolean) => {
      if (commandedScale) {
        if (Math.abs(cam.dist - target.dist) > 0.02) return;
        commandedScale = null;
      }
      const next = scaleForDistance(cam.dist * zoom);
      if (next === runtime.scale) return;
      if (next === 'overview') {
        target.look.set(0, 0, 0);
        pan.set(0, 0, 0);
        setSelectedProject(null);
        dataRef.current.onProjectSelect?.(null);
      }
      runtime.scale = next;
      hostElement.dataset.scale = next;
      setSceneScale(next);
      if (notify) dataRef.current.onScaleChange?.(next);
      runtime.update(runtime.layout, runtime.tests, next, dataRef.current.focusIds, dataRef.current.hot, dataRef.current.sourceCurrent, dataRef.current.theme);
    };
    const schedule = () => {
      if (runtime.frame || !runtime.visible || runtime.contextLost) return;
      runtime.frame = requestAnimationFrame(frame);
    };
    const frame = (now: number) => {
      runtime.frame = 0;
      if (!runtime.visible || runtime.contextLost) return;
      const dt = Math.min(0.06, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      const k = runtime.reducedMotion ? 1 : 1 - Math.exp(-dt / 0.16);
      const targetLook = target.look.clone().add(pan);
      cam.dist += (target.dist - cam.dist) * k;
      cam.elev += (target.elev - cam.elev) * k;
      cam.az += (target.az - cam.az) * k;
      look.lerp(targetLook, k);
      const moving = Math.abs(cam.dist - target.dist) > 0.012
        || Math.abs(cam.elev - target.elev) > 0.0008
        || Math.abs(cam.az - target.az) > 0.0008
        || look.distanceTo(targetLook) > 0.001;
      if (!runtime.reducedMotion) material.uniforms.time.value += dt;
      render();
      positionLabels();
      updateScale(true);
      if (moving || activeExecution()) schedule();
    };
    runtime.render = () => { render(); positionLabels(); };
    runtime.schedule = schedule;
    runtime.setScale = (nextScale, focusKey = null) => {
      const currentData = dataRef.current;
      target.dist = SCALE_DISTANCE[nextScale];
      commandedScale = nextScale;
      zoom = 1;
      if (nextScale === 'overview') {
        target.look.set(0, 0, 0);
        pan.set(0, 0, 0);
        setSelectedProject(null);
        currentData.onProjectSelect?.(null);
      }
      if (focusKey) {
        const entity = runtime.layout.entityByKey.get(focusKey);
        if (entity) target.look.copy(positionVector(entity.position));
      }
      if (runtime.reducedMotion) {
        cam.dist = target.dist;
        look.copy(target.look).add(pan);
      }
      runtime.scale = nextScale;
      hostElement.dataset.scale = nextScale;
      setSceneScale(nextScale);
      if (currentData.scale !== nextScale) currentData.onScaleChange?.(nextScale);
      runtime.update(runtime.layout, runtime.tests, nextScale, currentData.focusIds, currentData.hot, currentData.sourceCurrent, currentData.theme);
      schedule();
    };
    runtime.focus = ids => {
      const center = focusCenter(runtime.layout, ids.map(id => id.replace(/^(?:test:)/i, '')), runtime.scale);
      if (!center) return;
      target.look.copy(center);
      if (runtime.reducedMotion) look.copy(center).add(pan);
      schedule();
    };
    runtime.update = (nextLayout, nextTests, nextScale, focusedIds, hotIds, sourceIsCurrent, nextTheme) => {
      const focused = new Set(focusedIds.map(id => id.replace(/^(?:test:)/i, '')));
      const hot = new Set(hotIds.map(id => id.replace(/^(?:test:)/i, '')));
      const initial = nextLayout.entities;
      const cosmicBlending = nextTheme === 'dark' ? AdditiveBlending : NormalBlending;
      if (runtime.cosmicMaterial.blending !== cosmicBlending) {
        runtime.cosmicMaterial.blending = cosmicBlending;
        runtime.cosmicMaterial.needsUpdate = true;
      }
      if (composedTheme !== nextTheme) {
        renderer.setClearColor(nextTheme === 'dark' ? 0x03080d : 0xf7fbfc, 0);
        buildComposer(nextTheme);
      }
      if (runtime.cosmicLines) {
        const lineMaterial = runtime.cosmicLines.material as LineBasicMaterial;
        lineMaterial.opacity = nextTheme === 'dark' ? 0.26 : 0.18;
        const lineBlending = nextTheme === 'dark' ? AdditiveBlending : NormalBlending;
        if (lineMaterial.blending !== lineBlending) {
          lineMaterial.blending = lineBlending;
          lineMaterial.needsUpdate = true;
        }
      }
      const nextCosmicSignature = cosmicWebSignature(nextLayout);
      if (nextCosmicSignature !== runtime.cosmicSignature) {
        hostElement.dataset.cosmicRendered = 'false';
        hostElement.dataset.cosmicFilaments = '0';
        hostElement.dataset.cosmicParticles = '0';
        if (runtime.cosmicLines) {
          scene.remove(runtime.cosmicLines);
          runtime.cosmicLines.geometry.dispose();
          (runtime.cosmicLines.material as LineBasicMaterial).dispose();
          runtime.cosmicLines = null;
        }
        if (runtime.cosmicPoints) {
          scene.remove(runtime.cosmicPoints);
          runtime.cosmicPoints.geometry.dispose();
          runtime.cosmicPoints = null;
        }
        const web = buildCosmicWebGeometry(nextLayout, quality);
        const lineCount = web.filaments.getAttribute('position')?.count || 0;
        if (lineCount > 0) {
          const cosmicLineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: nextTheme === 'dark' ? 0.18 : 0.12, depthWrite: false, blending: nextTheme === 'dark' ? AdditiveBlending : NormalBlending });
          runtime.cosmicLines = new LineSegments(web.filaments, cosmicLineMaterial);
          runtime.cosmicLines.name = 'static-cosmic-density';
          runtime.cosmicLines.renderOrder = -2;
          scene.add(runtime.cosmicLines);
        } else web.filaments.dispose();
        if (web.particleCount > 0) {
          runtime.cosmicPoints = new Points(web.particles, cosmicMaterial);
          runtime.cosmicPoints.name = 'static-cosmic-dust';
          runtime.cosmicPoints.renderOrder = -1;
          scene.add(runtime.cosmicPoints);
        } else web.particles.dispose();
        runtime.cosmicSignature = nextCosmicSignature;
        hostElement.dataset.cosmicParticles = String(web.particleCount);
        hostElement.dataset.cosmicFilaments = String(web.connections.length);
      }
      const entitiesByKind: SceneEntity[][] = [
        initial.filter(entity => entity.kind === 'region'),
        initial.filter(entity => entity.kind === 'project'),
        initial.filter(entity => entity.kind === 'hypothesis'),
        initial.filter(entity => entity.kind === 'test'),
      ];
      for (const layer of runtime.layers) {
        scene.remove(layer.points);
        layer.geometry.dispose();
      }
      runtime.layers = entitiesByKind.map((entities, index) => {
        const kind = (['region', 'project', 'hypothesis', 'test'] as const)[index]!;
        const geometry = geometryForEntities(entities, quality, focused, hot, sourceIsCurrent);
        const points = new Points(geometry, material);
        points.name = kind;
        points.visible = kind === 'region' || kind === 'project' || (kind === 'hypothesis' && nextScale !== 'overview') || kind === 'test' && nextScale === 'operational';
        scene.add(points);
        return { kind, points, entities, geometry };
      });
      if (runtime.dependencyLines) {
        scene.remove(runtime.dependencyLines);
        runtime.dependencyLines.geometry.dispose();
        (runtime.dependencyLines.material as LineBasicMaterial).dispose();
        runtime.dependencyLines = null;
      }
      if (runtime.membershipLines) {
        scene.remove(runtime.membershipLines);
        runtime.membershipLines.geometry.dispose();
        (runtime.membershipLines.material as LineBasicMaterial).dispose();
        runtime.membershipLines = null;
      }
      const membershipLineGeometry = membershipGeometry(nextLayout, nextScale);
      if ((membershipLineGeometry.getAttribute('position')?.count || 0) > 0) {
        const membershipLineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: nextTheme === 'dark' ? 0.18 : 0.12, depthWrite: false, blending: nextTheme === 'dark' ? AdditiveBlending : NormalBlending });
        runtime.membershipLines = new LineSegments(membershipLineGeometry, membershipLineMaterial);
        runtime.membershipLines.name = 'published-membership';
        scene.add(runtime.membershipLines);
      } else membershipLineGeometry.dispose();
      const lineGeometry = dependencyGeometry(nextLayout, nextTests, nextScale, sourceIsCurrent);
      if ((lineGeometry.getAttribute('position')?.count || 0) > 0) {
        const lineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: nextTheme === 'dark' ? 0.66 : 0.58, depthWrite: false, blending: nextTheme === 'dark' ? AdditiveBlending : NormalBlending });
        runtime.dependencyLines = new LineSegments(lineGeometry, lineMaterial);
        runtime.dependencyLines.name = 'published-dependencies';
        scene.add(runtime.dependencyLines);
      } else lineGeometry.dispose();
      runtime.layout = nextLayout;
      runtime.tests = [...nextTests];
      runtime.scale = nextScale;
      hostElement.dataset.projectCount = String(nextLayout.projectCount);
      hostElement.dataset.hypothesisCount = String(nextLayout.hypothesisCount);
      hostElement.dataset.testCount = String(nextLayout.testCount);
      hostElement.dataset.dependencyCount = String(nextLayout.dependencies.length);
      hostElement.dataset.activeExecutions = String(sourceIsCurrent ? nextTests.filter(test => test.status === 'RUNNING').length : 0);
      hostElement.dataset.recentResults = String(sourceIsCurrent ? hot.size : 0);
      for (const layer of runtime.layers) {
        const active = layer.kind === 'region' || layer.kind === 'project' || (layer.kind === 'hypothesis' && nextScale !== 'overview') || layer.kind === 'test' && nextScale === 'operational';
        layer.points.visible = active;
      }
      hostElement.dataset.scale = nextScale;
      runtime.render();
      runtime.schedule();
    };
    runtime.onHit = entity => {
      const tooltip = tip.current;
      if (!tooltip) return;
      tooltip.replaceChildren();
      if (!entity) { tooltip.style.opacity = '0'; return; }
      const title = document.createElement('b'); title.textContent = entity.label;
      const detail = document.createElement('i');
      detail.textContent = entity.kind === 'test' && entity.test ? STATUS_LABEL[entity.test.verdict]
        : entity.kind === 'hypothesis' ? 'Hipótese publicada'
          : entity.kind === 'region' ? 'Região sem projeto atribuído' : 'Projeto publicado';
      tooltip.append(title, detail);
      tooltip.style.opacity = '1';
    };
    runtime.orbit = (azimuth, elevation) => {
      target.az += azimuth;
      target.elev = Math.max(-1.28, Math.min(1.28, target.elev + elevation));
      schedule();
    };
    runtime.reset = () => {
      pan.set(0, 0, 0);
      zoom = 1;
      target.look.set(0, 0, 0);
      target.az = 0.72;
      target.elev = 0.48;
      runtime.setScale('overview');
    };
    const setScale = (nextScale: ObservatoryScale, focusKey: string | null = null) => runtime.setScale(nextScale, focusKey);
    const currentInitialScale = dataRef.current.scale || defaultScaleForPage(dataRef.current.page);
    runtime.scale = currentInitialScale;
    cam.dist = target.dist = SCALE_DISTANCE[currentInitialScale];
    hostElement.dataset.scale = currentInitialScale;
    runtime.update(layout, tests, currentInitialScale, focusIds, hot, sourceCurrent, theme);
    dataRef.current.onAvailability?.(true);

    const resize = () => {
      const width = Math.max(1, hostElement.clientWidth || window.innerWidth);
      const height = Math.max(1, hostElement.clientHeight || window.innerHeight);
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      schedule();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    const hitAt = (event: PointerEvent): SceneEntity | null => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      pointerRay.setFromCamera(ndc, camera);
      const visibleLayers = runtime.layers.filter(layer => layer.points.visible).map(layer => layer.points);
      const hit = pointerRay.intersectObjects(visibleLayers, false)[0];
      if (hit?.index === undefined) return null;
      const layer = runtime.layers.find(item => item.points === hit.object);
      return layer?.entities[hit.index] || null;
    };
    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const pair = [...pointers.values()];
        pinch = { distance: Math.hypot(pair[0]!.x - pair[1]!.x, pair[0]!.y - pair[1]!.y), x: (pair[0]!.x + pair[1]!.x) / 2, y: (pair[0]!.y + pair[1]!.y) / 2 };
        drag = null;
        return;
      }
      drag = { x: event.clientX, y: event.clientY, moved: false, pan: event.button === 2 || event.shiftKey };
      if (dataRef.current.explore) canvas.setPointerCapture?.(event.pointerId);
    };
    const panBy = (dx: number, dy: number) => {
      const basisRight = new Vector3(), basisUp = new Vector3(), basisForward = new Vector3();
      camera.matrixWorld.extractBasis(basisRight, basisUp, basisForward);
      const amount = cam.dist * fitFactor(camera) * 0.0018;
      pan.addScaledVector(basisRight, -dx * amount).addScaledVector(basisUp, dy * amount);
    };
    const move = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size === 2) {
        const pair = [...pointers.values()];
        const distance = Math.hypot(pair[0]!.x - pair[1]!.x, pair[0]!.y - pair[1]!.y);
        const x = (pair[0]!.x + pair[1]!.x) / 2, y = (pair[0]!.y + pair[1]!.y) / 2;
        if (pinch.distance > 0 && distance > 0) zoom = Math.max(0.3, Math.min(2.6, zoom * pinch.distance / distance));
        panBy(x - pinch.x, y - pinch.y);
        pinch = { distance, x, y };
        schedule();
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.pan) panBy(dx, dy);
      else { target.az += dx * 0.005; target.elev = Math.max(-1.28, Math.min(1.28, target.elev + dy * 0.004)); }
      drag.x = event.clientX; drag.y = event.clientY;
      schedule();
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      const was = drag; drag = null;
      if (!was || was.moved || event.button !== 0) return;
      const entity = hitAt(event);
      if (!entity) return;
      runtime.onHit(entity);
      if (entity.kind === 'test') dataRef.current.onPick(entity.id);
      else if (entity.kind === 'hypothesis') dataRef.current.onPick(entity.id);
      else if (entity.kind === 'project') {
        setSelectedProject(entity.id);
        dataRef.current.onProjectSelect?.(entity.id);
        setScale('research', entity.key);
      } else if (entity.kind === 'region') {
        setSelectedProject(entity.id);
        dataRef.current.onProjectSelect?.(entity.id);
        setScale('research', entity.key);
      }
    };
    let lastHover = 0;
    const hover = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || drag || pinch) return;
      const now = performance.now();
      if (now - lastHover < 45) return;
      lastHover = now;
      const entity = hitAt(event);
      runtime.onHit(entity);
      canvas.style.cursor = entity ? 'pointer' : '';
      const tooltip = tip.current;
      if (tooltip && entity) {
        const rect = hostElement.getBoundingClientRect();
        tooltip.style.transform = 'translate(' + Math.round(event.clientX - rect.left + 12) + 'px,' + Math.round(event.clientY - rect.top + 12) + 'px)';
      }
    };
    const leave = () => { runtime.onHit(null); canvas.style.cursor = ''; };
    const wheel = (event: WheelEvent) => {
      if (!dataRef.current.explore && !event.ctrlKey) return;
      event.preventDefault();
      zoom = Math.max(0.3, Math.min(2.6, zoom * Math.exp(event.deltaY * 0.0011)));
      schedule();
    };
    const setScaleFromKey = (next: ObservatoryScale) => setScale(next);
    const doubleClick = () => { pan.set(0, 0, 0); zoom = 1; setScaleFromKey('overview'); target.look.set(0, 0, 0); schedule(); };
    const noMenu = (event: Event) => { if (dataRef.current.explore) event.preventDefault(); };
    const contextLost = (event: Event) => { event.preventDefault(); runtime.contextLost = true; hostElement.dataset.fallback = 'context-lost'; hostElement.dataset.cosmicRendered = 'false'; dataRef.current.onAvailability?.(false); if (runtime.frame) cancelAnimationFrame(runtime.frame); runtime.frame = 0; };
    const contextRestored = () => { runtime.contextLost = false; delete hostElement.dataset.fallback; dataRef.current.onAvailability?.(true); schedule(); };
    const visibility = () => { runtime.visible = document.visibilityState === 'visible'; if (!runtime.visible && runtime.frame) { cancelAnimationFrame(runtime.frame); runtime.frame = 0; } else schedule(); };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = (event: MediaQueryListEvent) => { runtime.reducedMotion = event.matches; if (event.matches) material.uniforms.time.value = 0; schedule(); };
    reducedMotion.addEventListener?.('change', motionChanged);
    const apiSetScale = setScale;
    const apiFocus = (ids: string[]) => runtime.focus(ids);
    const reset = () => runtime.reset();
    api.current = { setScale: apiSetScale, focus: apiFocus, reset };

    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', doubleClick);
    canvas.addEventListener('contextmenu', noMenu);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    document.addEventListener('visibilitychange', visibility);

    runtimeRef.current = runtime;
    runtime.schedule();
    return () => {
      if (runtime.frame) cancelAnimationFrame(runtime.frame);
      resizeObserver.disconnect();
      reducedMotion.removeEventListener?.('change', motionChanged);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointermove', hover);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('dblclick', doubleClick);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      document.removeEventListener('visibilitychange', visibility);
      for (const layer of runtime.layers) layer.geometry.dispose();
      runtime.dependencyLines?.geometry.dispose();
      (runtime.dependencyLines?.material as LineBasicMaterial | undefined)?.dispose();
      runtime.membershipLines?.geometry.dispose();
      (runtime.membershipLines?.material as LineBasicMaterial | undefined)?.dispose();
      runtime.cosmicLines?.geometry.dispose();
      (runtime.cosmicLines?.material as LineBasicMaterial | undefined)?.dispose();
      runtime.cosmicPoints?.geometry.dispose();
      disposeComposer();
      material.dispose();
      cosmicMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      runtimeRef.current = null;
      api.current = null;
    };
    // The runtime is mounted once. Data updates are applied by the separate update effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const initialScale = scale || defaultScaleForPage(page);
    if (!runtime) { setSceneScale(initialScale); return; }
    runtime.update(layout, tests, runtime.scale, focusIds, hot, sourceCurrent, theme);
    runtime.focus(focusIds);
  }, [layout, tests, focusKey, hotKey, sourceCurrent, theme]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) { if (scale) setSceneScale(scale); return; }
    if (scale && runtime.scale !== scale) runtime.setScale(scale);
  }, [scale]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || scale) return;
    const next = defaultScaleForPage(page);
    if (runtime.scale !== next) runtime.setScale(next);
  }, [page, scale]);

  const sceneLabels = labelEntities;
  const projectMap = new Map(layout.entities.filter(entity => entity.kind === 'project' || entity.kind === 'region').map(entity => [entity.id, entity]));
  const selectProject = (entity: SceneEntity) => {
    setSelectedProject(entity.id);
    dataRef.current.onProjectSelect?.(entity.id);
    runtimeRef.current?.setScale('research', entity.key);
  };
  const setScale = (next: ObservatoryScale) => runtimeRef.current?.setScale(next);
  const resetView = () => api.current?.reset();

  return <div ref={host} className={'obs-scene obs-scene--' + theme} data-scene-model="cosmic-web" data-scale={sceneScale}
    data-project-count={layout.projectCount} data-hypothesis-count={layout.hypothesisCount} data-test-count={layout.testCount} data-dependency-count={layout.dependencies.length}>
    <nav className="obs-crumb" aria-label="Escala da teia">
      <button type="button" onClick={resetView} aria-current={sceneScale === 'overview' ? 'location' : undefined}>Visão geral</button>
      {selectedProject && projectMap.has(selectedProject) && <><i aria-hidden="true">›</i><span aria-current="location">{projectMap.get(selectedProject)!.label}</span>
        <em>{projectMap.get(selectedProject)!.kind === 'region'
          ? tests.filter(test => !test.roadmapId && !test.campaignId && normDomain(test.domain) === selectedProject).length
          : tests.filter(test => test.roadmapId === selectedProject || test.campaignId === selectedProject).length} testes</em></>}
      <small aria-live="polite">{sceneScale === 'overview' ? 'sistema' : sceneScale === 'research' ? 'projetos e hipóteses' : 'evidências e execuções'}</small>
    </nav>
    <div className="obs-camera-controls" role="group" aria-label="Câmera da teia; arraste para orbitar e mais ou menos para mudar escala" tabIndex={0}
      onKeyDown={event => {
        const commands: Record<string, () => void> = {
          ArrowLeft: () => runtimeRef.current?.orbit(-0.12, 0), ArrowRight: () => runtimeRef.current?.orbit(0.12, 0),
          ArrowUp: () => runtimeRef.current?.orbit(0, -0.1), ArrowDown: () => runtimeRef.current?.orbit(0, 0.1),
          '+': () => setScale(sceneScale === 'overview' ? 'research' : 'operational'), '=': () => setScale(sceneScale === 'overview' ? 'research' : 'operational'),
          '-': () => setScale(sceneScale === 'operational' ? 'research' : 'overview'), Home: resetView,
        };
        const command = commands[event.key];
        if (command) { event.preventDefault(); command(); }
      }}>
      <button type="button" aria-label="Aproximar uma escala" onClick={() => setScale(sceneScale === 'overview' ? 'research' : 'operational')}>+</button>
      <button type="button" aria-label="Afastar uma escala" onClick={() => setScale(sceneScale === 'operational' ? 'research' : 'overview')}>−</button>
      <button type="button" aria-label="Recentrar câmera" onClick={resetView}>Centro</button>
    </div>
    <div ref={tip} className="obs-tip" role="tooltip" />
    <div ref={labels} className="obs-scene-labels">
      {sceneLabels.map(entity => entity.kind === 'project' || entity.kind === 'region'
        ? <button type="button" key={entity.key} data-scene-node={entity.key} data-project={entity.id} data-region={entity.kind === 'region' ? entity.id : undefined}
          className={selectedProject === entity.id ? 'on' : undefined} onClick={() => selectProject(entity)} title={'Abrir projeto ' + entity.label}>{entity.label}</button>
        : entity.kind === 'test'
          ? <button type="button" key={entity.key} data-scene-node={entity.key} data-testid={entity.id}
            onClick={() => onPick(entity.id)} title={'Abrir evidência ' + entity.label}>{entity.label}</button>
          : <span key={entity.key} data-scene-node={entity.key} data-hypothesis={entity.id} title={entity.label}>{entity.label}</span>)}
    </div>
  </div>;
}

// Camera controls are held in the renderer; these commands stay stable across scene updates.
type SceneApi = { setScale: (scale: ObservatoryScale, focusKey?: string | null) => void; focus: (ids: string[]) => void; reset: () => void };
