import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  NormalBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GridHelper,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  QuadraticBezierCurve3,
  Raycaster,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import type { Canvas25DViewState, CanvasGraph25DHandle } from './CanvasGraph25D.tsx';
import './GalaxyThree3D.css';

const TAU = Math.PI * 2;
const DEFAULT_CAMERA = new Vector3(0, 16, 286);
const MACRO_CAMERA = new Vector3(0, 12, 360);
const MOBILE_MACRO_CAMERA = new Vector3(0, 2, 236);
const DEFAULT_TARGET = new Vector3(0, 0, 0);

function paletteForTheme(theme: 'dark' | 'light') {
  return theme === 'light'
    ? { accent: new Color('#f47a20'), strong: new Color('#a94808') }
    : { accent: new Color('#7fddba'), strong: new Color('#eefcf7') };
}

const DARK_DOMAIN_COLORS: Partial<Record<PlacedNode3D['domain'], string>> = {
  NEXO: '#dcecff',
  ENGINEERING: '#7fddba',
  SCIENCE: '#78a9ff',
  OLYMPUS: '#b08cff',
  ARTIFACT: '#e7b763',
};
const LIGHT_DOMAIN_COLORS: Partial<Record<PlacedNode3D['domain'], string>> = {
  NEXO: '#344a5f',
  ENGINEERING: '#2f8a69',
  SCIENCE: '#416fae',
  OLYMPUS: '#7256a8',
  ARTIFACT: '#a86819',
};

function domainColor(domain: PlacedNode3D['domain'], theme: 'dark' | 'light'): Color {
  const map = theme === 'light' ? LIGHT_DOMAIN_COLORS : DARK_DOMAIN_COLORS;
  return new Color(map[domain] ?? (theme === 'light' ? '#59636d' : '#a7b2bc'));
}

function stateClass(value: unknown): string {
  return String(value ?? 'UNKNOWN').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const DOMAIN_WORLD_META: Partial<Record<PlacedNode3D['domain'], { glyph: string; caption: string }>> = {
  NEXO: { glyph: 'N', caption: 'KNOWLEDGE ATLAS' },
  SCIENCE: { glyph: '△', caption: 'PESQUISA · DADOS · DESCOBERTAS' },
  ENGINEERING: { glyph: '⚙', caption: 'SISTEMAS · CONSTRUÇÃO · AUTOMAÇÃO' },
  OLYMPUS: { glyph: '◇', caption: 'ESTRATÉGIA · PESSOAS · PERFORMANCE' },
  ARTIFACT: { glyph: '⬡', caption: 'PRODUTOS · IDEIAS · IMPLEMENTAÇÃO' },
};

function domainWorldMeta(domain: PlacedNode3D['domain']) {
  return DOMAIN_WORLD_META[domain] ?? { glyph: '•', caption: 'DOMÍNIO NEXO' };
}

type Props = {
  nodes: PlacedNode3D[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFailure?: () => void;
  className?: string;
  ariaLabel?: string;
  viewMode?: 'macro' | 'detail';
};

type Tween = {
  startAt: number;
  duration: number;
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
};

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u = Math.max(1e-6, random());
  const v = Math.max(1e-6, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function writeParticle(
  positions: Float32Array, sizes: Float32Array, brightness: Float32Array, colors: Float32Array, index: number,
  x: number, y: number, z: number, size: number, light: number, color: Color,
) {
  const p = index * 3;
  positions[p] = x; positions[p + 1] = y; positions[p + 2] = z;
  sizes[index] = size; brightness[index] = light;
  color.toArray(colors, p);
}

function buildFieldGeometry(
  nodes: PlacedNode3D[], count: number, isMacro: boolean, theme: 'dark' | 'light',
): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const domains = nodes.filter(node => node.type === 'DOMAIN');
  const clusters = nodes.filter(node => node.id.startsWith('atlas.cluster.'));
  const detailCenters = nodes.filter(node => node.type !== 'FILAMENT').slice(0, Math.min(nodes.length, 24));
  const centers = isMacro
    ? domains
    : clusters.length > 0
      ? [...domains, ...clusters]
      : detailCenters.length > 0
        ? detailCenters
        : domains;
  const ambient = new Color(theme === 'light' ? '#a7a19a' : '#35404a');

  for (let index = 0; index < count; index += 1) {
    const random = rng(hash32('nexo-field:' + index));
    if (!centers.length || random() < (isMacro ? 0.08 : 0.05)) {
      const angle = random() * TAU;
      const radius = 66 + Math.sqrt(random()) * (isMacro ? 116 : 82);
      writeParticle(
        positions, sizes, brightness, colors, index,
        Math.cos(angle) * radius, Math.sin(angle) * radius * 0.56,
        (random() - 0.5) * (isMacro ? 10 : 8),
        0.42 + random() * 0.54, 0.06 + random() * 0.10, ambient,
      );
      continue;
    }

    const center = centers[index % centers.length]!;
    const angle = random() * TAU;
    const radial = 4.5 + Math.sqrt(random()) * (isMacro ? 16 : 10.5);
    const x = center.x + Math.cos(angle) * radial + gaussian(random) * 0.72;
    const y = center.y + Math.sin(angle) * radial * 0.64 + gaussian(random) * 0.62;
    const z = center.z + gaussian(random) * (isMacro ? 2.4 : 1.9);
    writeParticle(
      positions, sizes, brightness, colors, index, x, y, z,
      0.72 + random() * 1.10, 0.20 + random() * 0.48, domainColor(center.domain, theme),
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
function buildFieldRingSegments(nodes: PlacedNode3D[], isMacro: boolean): BufferGeometry {
  const vertices: number[] = [];
  for (const node of nodes.filter(candidate => candidate.type === 'DOMAIN')) {
    const radii = node.domain === 'NEXO' ? [isMacro ? 30 : 24] : [isMacro ? 16 : 13];
    for (const radius of radii) {
      const segments = 64;
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * TAU;
        const a1 = ((i + 1) / segments) * TAU;
        vertices.push(node.x + Math.cos(a0) * radius, node.y + Math.sin(a0) * radius * 0.62, node.z - 1.5, node.x + Math.cos(a1) * radius, node.y + Math.sin(a1) * radius * 0.62, node.z - 1.5);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}
const galaxyVertexShader = `
attribute float aSize;
attribute float aBrightness;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying float vBrightness;
varying vec3 vColor;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.985 + 0.015 * sin(uTime * 0.45 + position.x * 0.055 + position.y * 0.037);
  float perspective = 250.0 / max(22.0, -mv.z);
  gl_PointSize = clamp(aSize * uPixelRatio * perspective * twinkle, 0.7, 10.0);
  gl_Position = projectionMatrix * mv;
  vBrightness = aBrightness;
  vColor = aColor;
}
`;

const galaxyFragmentShader = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vBrightness;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float halo = smoothstep(0.5, 0.18, d);
  vec3 color = mix(vColor, uColorB, clamp(vBrightness * 0.16, 0.0, 0.16));
  float alpha = (halo * 0.36 + core * 0.60) * (0.18 + vBrightness * 0.64) * uOpacity;
  gl_FragColor = vec4(color, alpha);
}
`;

function nodeSize(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 14.5 : 11.2;
  if (node.type === 'CAMPAIGN') return 9.4;
  if (node.id.startsWith('atlas.cluster.')) return 8.2;
  if (node.type === 'CAPABILITY' || node.type === 'PROVIDER') return 5.8;
  if (node.type === 'TEST') return 5.0;
  if (node.type === 'ACTION' || node.type === 'CLAIM') return 4.7;
  if (node.type === 'PROJECTION') return 4.3;
  return 3.7;
}

function nodeIntensity(node: PlacedNode3D, selectedId: string | null): number {
  if (node.id === selectedId) return 1;
  const state = String(node.state ?? '').toUpperCase();
  if (/RUNNING|ACTIVE|IN_PROGRESS|AWAITING_HUMAN/.test(state)) return 0.94;
  if (/BLOCKED|FAILED|CONFLICT/.test(state)) return 0.76;
  if (node.type === 'DOMAIN') return 0.88;
  return 0.64;
}

function buildNodeGeometry(
  nodes: PlacedNode3D[], selectedId: string | null, theme: 'dark' | 'light',
): BufferGeometry {
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const brightness = new Float32Array(nodes.length);
  const colors = new Float32Array(nodes.length * 3);
  const selected = selectedId ? nodes.find(node => node.id === selectedId) : null;

  nodes.forEach((node, index) => {
    const p = index * 3;
    positions[p] = node.x;
    positions[p + 1] = node.y;
    positions[p + 2] = node.z;
    sizes[index] = nodeSize(node);
    const focusFactor = selected && node.id !== selected.id
      ? node.domain === selected.domain ? 0.56 : 0.20
      : 1;
    brightness[index] = nodeIntensity(node, selectedId) * focusFactor;
    domainColor(node.domain, theme).toArray(colors, p);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
function buildRelationSegments(
  nodes: PlacedNode3D[],
  edges: GraphEdge[],
  selectedId: string | null,
): { structural: BufferGeometry; dependency: BufferGeometry; blocked: BufferGeometry; selected: BufferGeometry } {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const structural: number[] = [];
  const dependency: number[] = [];
  const blocked: number[] = [];
  const selected: number[] = [];
  const dependencyKinds = new Set(['DEPENDS_ON', 'ROUTES_TO', 'VERIFIES']);

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a);
    const normal2 = new Vector3(-direction.y, direction.x, 0).normalize();
    mid.addScaledVector(normal2, Math.min(8, direction.length() * 0.06));
    mid.z += Math.min(4, direction.length() * 0.025);
    const curve = new QuadraticBezierCurve3(a, mid, b);
    const points = curve.getPoints(10);

    const isSelected = edge.from === selectedId || edge.to === selectedId;
    const isBlocked = edge.blocked || edge.kind === 'BLOCKS' || edge.kind === 'CONTRADICTS';
    const target = isSelected
      ? selected
      : isBlocked
        ? blocked
        : dependencyKinds.has(edge.kind)
          ? dependency
          : structural;

    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index]!;
      const p1 = points[index + 1]!;
      target.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }

  const geometryOf = (values: number[]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    return geometry;
  };
  return {
    structural: geometryOf(structural),
    dependency: geometryOf(dependency),
    blocked: geometryOf(blocked),
    selected: geometryOf(selected),
  };
}
function isMajor(node: PlacedNode3D, selectedId: string | null): boolean {
  return node.type === 'DOMAIN' || node.id.startsWith('atlas.cluster.') || node.id === selectedId;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function compatibleView(camera: PerspectiveCamera, target: Vector3): Canvas25DViewState {
  const offset = camera.position.clone().sub(target);
  const distance = Math.max(1, offset.length());
  return {
    yaw: Math.atan2(offset.x, offset.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, offset.y / distance))),
    zoom: 248 / distance,
    target: { x: target.x, y: target.y, z: target.z },
  };
}

export const GalaxyThree3D = forwardRef<CanvasGraph25DHandle, Props>(function GalaxyThree3D({
  nodes,
  edges,
  selectedId,
  onSelect,
  onFailure,
  className = '',
  ariaLabel = 'Campo topológico tridimensional do NEXO ONE',
  viewMode = 'detail',
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const nodePointsRef = useRef<Points | null>(null);
  const labelsRef = useRef(new Map<string, HTMLSpanElement>());
  const tweenRef = useRef<Tween | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const [themeName, setThemeName] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );

  const isMacro = viewMode === 'macro';
  const isMobile = size.width < 760;
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setThemeName(root.dataset.theme === 'light' ? 'light' : 'dark');
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const visibleLabels = useMemo(
    () => nodes.filter(node => isMajor(node, selectedId)).slice(0, isMobile ? 12 : 28),
    [isMobile, nodes, selectedId],
  );

  const flyToPoint = (point: { x: number; y: number; z: number }, distance: number, duration = 720) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = new Vector3(point.x, point.y, point.z);
    const fromTarget = controls.target.clone();
    const direction = camera.position.clone().sub(fromTarget);
    if (direction.lengthSq() < 0.001) direction.set(0, 0.12, 1);
    direction.normalize();
    const toPosition = target.clone().addScaledVector(direction, distance);
    toPosition.y += distance * 0.045;
    tweenRef.current = {
      startAt: performance.now(),
      duration: reducedMotion ? 0 : duration,
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget,
      toTarget: target,
    };
  };

  const focusNode = (id: string, distance = 34): boolean => {
    const node = nodeMap.get(id);
    if (!node) return false;
    flyToPoint(node, distance);
    return true;
  };

  const reset = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const homeCamera = isMacro ? (isMobile ? MOBILE_MACRO_CAMERA : MACRO_CAMERA) : DEFAULT_CAMERA;
    tweenRef.current = {
      startAt: performance.now(),
      duration: reducedMotion ? 0 : 760,
      fromPosition: camera.position.clone(),
      toPosition: homeCamera.clone(),
      fromTarget: controls.target.clone(),
      toTarget: DEFAULT_TARGET.clone(),
    };
  };

  useImperativeHandle(ref, () => ({
    reset,
    focusNode: (id, zoom = 2.15) => focusNode(id, Math.max(18, 74 / Math.max(0.7, zoom))),
    focusDomain: id => focusNode(id, isMobile ? 68 : 76),
    focusSubdomain: id => focusNode(id, isMobile ? 44 : 50),
    focusEntity: id => focusNode(id, isMobile ? 28 : 34),
    focusPoint: (point, zoom = 2) => flyToPoint(point, Math.max(18, 74 / Math.max(0.7, zoom))),
    getView: () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return { yaw: 0, pitch: 0, zoom: 1, target: { x: 0, y: 0, z: 0 } };
      }
      return compatibleView(camera, controls.target);
    },
  }), [isMacro, isMobile, nodeMap, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setSize({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || failed) return;

    let renderer: WebGLRenderer | null = null;
    let composer: EffectComposer | null = null;
    let frame = 0;
    let disposed = false;

    try {
      renderer = new WebGLRenderer({
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = themeName === 'light' ? 0.92 : (isMobile ? 0.96 : 1.0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.45 : 1.9));
      renderer.setSize(size.width, size.height, false);
      renderer.domElement.className = 'galaxy-three-canvas';
      renderer.domElement.setAttribute('aria-label', ariaLabel);
      renderer.domElement.tabIndex = 0;
      mount.replaceChildren(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new Scene();
      sceneRef.current = scene;

      const camera = new PerspectiveCamera(isMobile ? 35 : 40, size.width / size.height, 0.1, 1200);
      camera.position.copy(isMacro ? (isMobile ? MOBILE_MACRO_CAMERA : MACRO_CAMERA) : DEFAULT_CAMERA);
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(DEFAULT_TARGET);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.enablePan = true;
      controls.enableRotate = !(isMobile && isMacro);
      controls.screenSpacePanning = true;
      controls.rotateSpeed = 0.52;
      controls.zoomSpeed = 0.82;
      controls.panSpeed = 0.58;
      controls.minDistance = 12;
      controls.maxDistance = 360;
      controls.minPolarAngle = 0.18;
      controls.maxPolarAngle = Math.PI - 0.18;
      controlsRef.current = controls;

      const palette = paletteForTheme(themeName);
      const particleCount = isMacro ? (isMobile ? 180 : 760) : (isMobile ? 520 : 1800);
      const galaxyGeometry = buildFieldGeometry(nodes, particleCount, isMacro, themeName);
      const galaxyMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: isMacro ? (themeName === 'light' ? 0.20 : 0.24) : (themeName === 'light' ? 0.38 : 0.52) },
        },
        vertexShader: galaxyVertexShader,
        fragmentShader: galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const galaxy = new Points(galaxyGeometry, galaxyMaterial);
      scene.add(galaxy);

      const ringGeometry = buildFieldRingSegments(nodes, isMacro);
      const ringMaterial = new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: themeName === 'light' ? 0.07 : (isMacro ? 0.09 : 0.06), blending: themeName === 'light' ? NormalBlending : AdditiveBlending, depthWrite: false });
      const ringLines = new LineSegments(ringGeometry, ringMaterial);
      scene.add(ringLines);

      const grid = new GridHelper(isMacro ? 430 : 300, isMacro ? 30 : 22, palette.accent, palette.accent);
      grid.position.set(0, isMacro ? -94 : -74, -24);
      const gridMaterial = grid.material as LineBasicMaterial;
      gridMaterial.transparent = true; gridMaterial.opacity = themeName === 'light' ? 0.055 : 0.075; gridMaterial.depthWrite = false;
      grid.visible = !isMacro && !isMobile;
      scene.add(grid);

      const nodeGeometry = buildNodeGeometry(nodes, selectedId, themeName);
      const nodeMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: 1.0 },
        },
        vertexShader: galaxyVertexShader,
        fragmentShader: galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const nodePoints = new Points(nodeGeometry, nodeMaterial);
      nodePointsRef.current = nodePoints;
      scene.add(nodePoints);

      const relationSegments = buildRelationSegments(nodes, edges, selectedId);
      const relationMaterial = new LineBasicMaterial({
        color: themeName === 'light' ? '#7d858d' : '#65727d',
        transparent: true,
        opacity: selectedId ? 0.08 : (isMacro ? 0.34 : 0.18),
        blending: NormalBlending,
        depthWrite: false,
      });
      const dependencyMaterial = new LineDashedMaterial({
        color: themeName === 'light' ? '#5d7488' : '#8ca3b5',
        transparent: true,
        opacity: selectedId ? 0.12 : 0.34,
        dashSize: 2.1,
        gapSize: 1.5,
        depthWrite: false,
      });
      const blockedRelationMaterial = new LineBasicMaterial({
        color: '#df747d',
        transparent: true,
        opacity: selectedId ? 0.18 : 0.58,
        depthWrite: false,
      });
      const selectedRelationMaterial = new LineBasicMaterial({
        color: palette.strong,
        transparent: true,
        opacity: 0.92,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const relationLines = new LineSegments(relationSegments.structural, relationMaterial);
      const dependencyLines = new LineSegments(relationSegments.dependency, dependencyMaterial);
      dependencyLines.computeLineDistances();
      const blockedRelationLines = new LineSegments(relationSegments.blocked, blockedRelationMaterial);
      const selectedRelationLines = new LineSegments(relationSegments.selected, selectedRelationMaterial);
      scene.add(relationLines, dependencyLines, blockedRelationLines, selectedRelationLines);

      if (!isMobile && !isMacro && themeName === 'dark') {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.34, 0.32, 0.34);
        bloom.threshold = 0.30;
        bloom.strength = 0.34;
        bloom.radius = 0.32;
        composer.addPass(bloom);
      }

      const raycaster = new Raycaster();
      raycaster.params.Points = { threshold: isMobile ? 6.5 : 5.2 };
      const pointer = new Vector2();

      const pick = (clientX: number, clientY: number) => {
        const rect = renderer!.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(nodePoints, false);
        const first = hits.find(hit => Number.isInteger(hit.index));
        if (first?.index != null && nodes[first.index]) onSelect(nodes[first.index]!.id);
        else onSelect(null);
      };

      const onPointerDown = (event: PointerEvent) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY };
      };
      const onPointerUp = (event: PointerEvent) => {
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!start) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5) {
          pick(event.clientX, event.clientY);
        }
      };
      const onDoubleClick = (event: MouseEvent) => {
        pick(event.clientX, event.clientY);
        const rect = renderer!.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(nodePoints, false)[0];
        if (hit?.index != null && nodes[hit.index]) focusNode(nodes[hit.index]!.id, isMobile ? 28 : 34);
      };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('dblclick', onDoubleClick);

      const updateLabels = () => {
        const width = size.width;
        const height = size.height;
        for (const node of visibleLabels) {
          const label = labelsRef.current.get(node.id);
          if (!label) continue;
          const projected = new Vector3(node.x, node.y, node.z).project(camera);
          const visible = projected.z > -1 && projected.z < 1;
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          label.style.opacity = visible ? '1' : '0';
          label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y + (node.type === 'DOMAIN' ? 22 : 15)}px)`;
        }
      };

      const animate = (now: number) => {
        if (disposed) return;
        const tween = tweenRef.current;
        if (tween) {
          const raw = tween.duration <= 0 ? 1 : Math.min(1, (now - tween.startAt) / tween.duration);
          const t = easeOutCubic(raw);
          camera.position.lerpVectors(tween.fromPosition, tween.toPosition, t);
          controls.target.lerpVectors(tween.fromTarget, tween.toTarget, t);
          if (raw >= 1) tweenRef.current = null;
        }
        controls.update();
        galaxyMaterial.uniforms.uTime!.value = now * 0.001;
        nodeMaterial.uniforms.uTime!.value = now * 0.001;
        updateLabels();
        if (composer) composer.render();
        else renderer!.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer?.domElement.removeEventListener('pointerup', onPointerUp);
        renderer?.domElement.removeEventListener('dblclick', onDoubleClick);
        controls.dispose();
        galaxyGeometry.dispose();
        galaxyMaterial.dispose();
        ringGeometry.dispose();
        ringMaterial.dispose();
        grid.geometry.dispose();
        gridMaterial.dispose();
        nodeGeometry.dispose();
        nodeMaterial.dispose();
        relationSegments.structural.dispose();
        relationSegments.dependency.dispose();
        relationSegments.blocked.dispose();
        relationSegments.selected.dispose();
        relationMaterial.dispose();
        dependencyMaterial.dispose();
        blockedRelationMaterial.dispose();
        selectedRelationMaterial.dispose();
        composer?.dispose();
        renderer?.dispose();
        rendererRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
        sceneRef.current = null;
        nodePointsRef.current = null;
        mount.replaceChildren();
      };
    } catch {
      renderer?.dispose();
      rendererRef.current = null;
      setFailed(true);
      onFailure?.();
      return;
    }
  }, [ariaLabel, edges, failed, isMacro, isMobile, nodes, onFailure, onSelect, reducedMotion, selectedId, size.height, size.width, themeName, visibleLabels]);

  return (
    <div
      ref={hostRef}
      className={`galaxy-three-root ${className}`}
      data-renderer="three-nexo-field"
      data-particle-profile={isMobile ? 'mobile' : 'desktop'}
      data-view-mode={viewMode}
      data-theme={themeName}
    >
      <div ref={mountRef} className="galaxy-three-mount" />
      <div className="galaxy-three-vignette" aria-hidden="true" />
      {!isMacro && <div className="nexo-field-heading" aria-hidden="true"><strong>NEXO FIELD</strong><span>DOMÍNIOS · CONEXÕES · INTELIGÊNCIA EM CONTEXTO</span></div>}
      {isMacro && (
        <>
          <div className="atlas-world-heading" aria-hidden="true">
            <strong>NEXO ATLAS</strong>
            <span>CONHECIMENTO SEM FRONTEIRAS · INTELIGÊNCIA EM CONTEXTO</span>
          </div>
          <div className="atlas-domain-worlds" role="group" aria-label="Domínios do NEXO Atlas">
            {nodes.filter(node => node.type === 'DOMAIN').map(node => {
              const meta = domainWorldMeta(node.domain);
              const count = node.member_count ?? 0;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={'atlas-domain-world domain-' + node.domain.toLowerCase()}
                  data-domain={node.domain}
                  onClick={() => onSelect(node.id)}
                  aria-label={node.domain === 'NEXO'
                    ? 'Voltar ao núcleo NEXO'
                    : 'Abrir domínio ' + node.label + ', ' + count + ' entidades'
                >
                  <span className="atlas-world-orb" aria-hidden="true">
                    <i className="atlas-world-ring ring-a" />
                    <i className="atlas-world-ring ring-b" />
                    <i className="atlas-world-satellite sat-a" />
                    <i className="atlas-world-satellite sat-b" />
                    <i className="atlas-world-satellite sat-c" />
                    <b>{meta.glyph}</b>
                  </span>
                  <span className="atlas-world-copy">
                    <strong>{node.domain === 'NEXO' ? 'NEXO CORE' : node.label}</strong>
                    <small>{node.domain === 'NEXO' ? meta.caption : count + ' ENTIDADES'}</small>
                    {node.domain !== 'NEXO' && <em>{meta.caption}</em>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="atlas-world-summary" aria-hidden="true">
            <span><b>{nodes.filter(node => node.type === 'DOMAIN' && node.domain !== 'NEXO').length}</b> domínios</span>
            <span><b>{nodes.filter(node => node.type === 'DOMAIN').reduce((sum, node) => sum + (node.member_count ?? 0), 0)}</b> entidades</span>
            <span className="live"><i /> sincronizado</span>
          </div>
        </>
      )}
      <div className="galaxy-three-labels" aria-hidden="true">
        {visibleLabels.map(node => (
          <span
            key={node.id}
            ref={element => {
              if (element) labelsRef.current.set(node.id, element);
              else labelsRef.current.delete(node.id);
            }}
            className={`galaxy-three-label${node.type === 'DOMAIN' ? ' domain' : ''}${node.type === 'CAMPAIGN' ? ' campaign' : ''}${node.id.startsWith('atlas.cluster.') ? ' cluster' : ''}${node.id === selectedId ? ' selected' : ''}`}
            data-domain={node.domain}
            data-state={stateClass(node.state)}
            style={{ '--galaxy-label-intensity': node.id === selectedId ? 1 : 0.72 } as CSSProperties}
          >
            <i className="node-status" aria-hidden="true" />
            <span className="node-label-copy">
              <strong>{node.type === 'DOMAIN' && node.domain === 'NEXO' ? 'NEXO' : node.label}</strong>
              {(node.type === 'DOMAIN' || node.type === 'CAMPAIGN' || node.id.startsWith('atlas.cluster.') || node.id === selectedId) && (
                <small>
                  {node.type === 'DOMAIN'
                    ? (node.domain === 'NEXO' ? 'CORE' : (node.member_count ?? 0) + ' ENTIDADES')
                    : node.type === 'CAMPAIGN'
                      ? (node.member_count ?? 0) + ' ITENS'
                      : node.type}
                </small>
              )}
            </span>
          </span>
        ))}
      </div>
      <div className="galaxy-three-status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{nodes.length} nós · {edges.length} relações · FIELD</span>
      </div>
      <div className={`galaxy-three-controls${isMacro ? ' macro-hidden' : ''}`} role="group" aria-label="Controles do NEXO FIELD">
        <button type="button" onClick={reset}>NEXO</button>
        <button type="button" aria-label="Girar para a esquerda" onClick={() => controlsRef.current?.rotateLeft(0.28)}>←</button>
        <button type="button" aria-label="Girar para a direita" onClick={() => controlsRef.current?.rotateLeft(-0.28)}>→</button>
        <button type="button" aria-label="Aproximar" onClick={() => controlsRef.current?.dollyIn(1.18)}>+</button>
        <button type="button" aria-label="Afastar" onClick={() => controlsRef.current?.dollyOut(1.18)}>−</button>
      </div>
      <div className="galaxy-three-a11y-list" aria-label="Entidades do NEXO FIELD">
        {nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelect(node.id)}>{node.label}</button>
        ))}
      </div>
    </div>
  );
});
