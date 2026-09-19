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
  LineBasicMaterial,
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
import {
  PRIMARY_GALAXY_DOMAINS,
  galaxyArmPoint,
  type Point3,
} from '../viewmodels/graph3d.ts';
import type { Canvas25DViewState, CanvasGraph25DHandle } from './CanvasGraph25D.tsx';
import './GalaxyThree3D.css';

const TAU = Math.PI * 2;
const DEFAULT_CAMERA = new Vector3(0, 22, 268);
const MACRO_CAMERA = new Vector3(0, 20, 340);
const DEFAULT_TARGET = new Vector3(0, 0, 0);

function paletteForTheme(theme: 'dark' | 'light') {
  return theme === 'light'
    ? { accent: new Color('#f47a20'), strong: new Color('#a94808') }
    : { accent: new Color('#8bd3ff'), strong: new Color('#eef8ff') };
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

function signaturePoint(t: number): Point3 {
  const clamped = Math.max(0, Math.min(1, t));
  const angle = -1.82 + clamped * TAU * 1.08;
  const radial = 14 + 118 * Math.pow(clamped, 0.92);
  return {
    x: Math.cos(angle) * radial,
    y: Math.sin(angle) * radial * 0.74,
    z: Math.sin(angle * 1.55) * (2.5 + clamped * 5.5),
  };
}

function armTangent(domain: (typeof PRIMARY_GALAXY_DOMAINS)[number], t: number): number {
  const a = galaxyArmPoint(domain, Math.max(0, t - 0.006));
  const b = galaxyArmPoint(domain, Math.min(1, t + 0.006));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function signatureTangent(t: number): number {
  const a = signaturePoint(Math.max(0, t - 0.006));
  const b = signaturePoint(Math.min(1, t + 0.006));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function writeParticle(
  positions: Float32Array,
  sizes: Float32Array,
  brightness: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  size: number,
  light: number,
) {
  const p = index * 3;
  positions[p] = x;
  positions[p + 1] = y;
  positions[p + 2] = z;
  sizes[index] = size;
  brightness[index] = light;
}

function buildGalaxyGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const random = rng(hash32(`nexo-galaxy:${index}`));
    const lane = random();

    if (lane < 0.12) {
      const radius = Math.pow(random(), 1.72) * 34;
      const angle = random() * TAU + radius * 0.075;
      const coreTightness = Math.max(0.18, 1 - radius / 42);
      writeParticle(
        positions,
        sizes,
        brightness,
        index,
        Math.cos(angle) * radius + gaussian(random) * 1.8,
        Math.sin(angle) * radius * 0.72 + gaussian(random) * 1.35,
        gaussian(random) * (1.8 + 4.2 * (1 - coreTightness)),
        1.25 + random() * 2.7,
        0.62 + random() * 0.30,
      );
      continue;
    }

    if (lane < 0.47) {
      const t = Math.pow(random(), 0.88);
      const center = signaturePoint(t);
      const tangent = signatureTangent(t);
      const normal = tangent + Math.PI / 2;
      const width = 2.2 + t * 10.8;
      const cross = gaussian(random) * width;
      const along = gaussian(random) * width * 0.2;
      writeParticle(
        positions,
        sizes,
        brightness,
        index,
        center.x + Math.cos(normal) * cross + Math.cos(tangent) * along,
        center.y + Math.sin(normal) * cross * 0.76 + Math.sin(tangent) * along * 0.76,
        center.z + gaussian(random) * (1.5 + t * 5.6),
        0.78 + random() * (2.05 + (1 - t) * 1.05),
        0.28 + random() * 0.52,
      );
      continue;
    }

    if (lane < 0.93) {
      const domain = PRIMARY_GALAXY_DOMAINS[Math.floor(random() * PRIMARY_GALAXY_DOMAINS.length)]!;
      const t = Math.pow(random(), 0.86);
      const center = galaxyArmPoint(domain, t);
      const tangent = armTangent(domain, t);
      const normal = tangent + Math.PI / 2;
      const width = 2.8 + t * 13.5;
      const cross = gaussian(random) * width;
      const along = gaussian(random) * width * 0.28;
      writeParticle(
        positions,
        sizes,
        brightness,
        index,
        center.x + Math.cos(normal) * cross + Math.cos(tangent) * along,
        center.y + Math.sin(normal) * cross * 0.76 + Math.sin(tangent) * along * 0.76,
        center.z + gaussian(random) * (1.8 + t * 6.2),
        0.68 + random() * 2.15,
        0.24 + random() * 0.50,
      );
      continue;
    }

    const angle = random() * TAU;
    const radius = 42 + Math.pow(random(), 0.55) * 128;
    writeParticle(
      positions,
      sizes,
      brightness,
      index,
      Math.cos(angle) * radius + gaussian(random) * 6,
      Math.sin(angle) * radius * 0.76 + gaussian(random) * 5,
      gaussian(random) * 18,
      0.55 + random() * 1.2,
      0.08 + random() * 0.2,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const galaxyVertexShader = `
attribute float aSize;
attribute float aBrightness;
uniform float uTime;
uniform float uPixelRatio;
varying float vBrightness;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.9 + 0.1 * sin(uTime * 0.55 + position.x * 0.055 + position.y * 0.037);
  float perspective = 250.0 / max(22.0, -mv.z);
  gl_PointSize = clamp(aSize * uPixelRatio * perspective * twinkle, 0.7, 10.0);
  gl_Position = projectionMatrix * mv;
  vBrightness = aBrightness;
}
`;

const galaxyFragmentShader = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vBrightness;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float halo = smoothstep(0.5, 0.18, d);
  vec3 color = mix(uColorA, uColorB, clamp(vBrightness, 0.0, 1.0));
  float alpha = (halo * 0.36 + core * 0.60) * (0.18 + vBrightness * 0.64) * uOpacity;
  gl_FragColor = vec4(color, alpha);
}
`;

function nodeSize(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 13 : 9.5;
  if (node.id.startsWith('atlas.cluster.')) return 7.2;
  if (node.type === 'CAPABILITY') return 5.2;
  if (node.type === 'PROVIDER') return 5;
  if (node.type === 'TEST') return 4.5;
  return 3.8;
}

function nodeIntensity(node: PlacedNode3D, selectedId: string | null): number {
  if (node.id === selectedId) return 1;
  const state = String(node.state ?? '').toUpperCase();
  if (/RUNNING|ACTIVE|IN_PROGRESS|AWAITING_HUMAN/.test(state)) return 0.94;
  if (/BLOCKED|FAILED|CONFLICT/.test(state)) return 0.76;
  if (node.type === 'DOMAIN') return 0.88;
  return 0.64;
}

function buildNodeGeometry(nodes: PlacedNode3D[], selectedId: string | null): BufferGeometry {
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const brightness = new Float32Array(nodes.length);
  nodes.forEach((node, index) => {
    const p = index * 3;
    positions[p] = node.x;
    positions[p + 1] = node.y;
    positions[p + 2] = node.z;
    sizes[index] = nodeSize(node);
    brightness[index] = nodeIntensity(node, selectedId);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function buildRelationSegments(
  nodes: PlacedNode3D[],
  edges: GraphEdge[],
  selectedId: string | null,
): { normal: BufferGeometry; selected: BufferGeometry } {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const normal: number[] = [];
  const selected: number[] = [];

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a);
    const normal2 = new Vector3(-direction.y, direction.x, 0).normalize();
    mid.addScaledVector(normal2, Math.min(11, direction.length() * 0.08));
    mid.z += Math.min(8, direction.length() * 0.045);
    const curve = new QuadraticBezierCurve3(a, mid, b);
    const points = curve.getPoints(8);
    const target = edge.from === selectedId || edge.to === selectedId ? selected : normal;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index]!;
      const p1 = points[index + 1]!;
      target.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }

  const normalGeometry = new BufferGeometry();
  normalGeometry.setAttribute('position', new Float32BufferAttribute(normal, 3));
  const selectedGeometry = new BufferGeometry();
  selectedGeometry.setAttribute('position', new Float32BufferAttribute(selected, 3));
  return { normal: normalGeometry, selected: selectedGeometry };
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
  ariaLabel = 'Galáxia tridimensional do NEXO ONE',
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
    const homeCamera = isMacro ? MACRO_CAMERA : DEFAULT_CAMERA;
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

      const camera = new PerspectiveCamera(isMobile ? 50 : 44, size.width / size.height, 0.1, 1200);
      camera.position.copy(isMacro ? MACRO_CAMERA : DEFAULT_CAMERA);
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(DEFAULT_TARGET);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.enablePan = true;
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
      const particleCount = isMacro ? (isMobile ? 4200 : 11000) : (isMobile ? 26000 : 68000);
      const galaxyGeometry = buildGalaxyGeometry(particleCount);
      const galaxyMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: isMacro ? (themeName === 'light' ? 0.24 : 0.32) : (themeName === 'light' ? 0.46 : 0.72) },
        },
        vertexShader: galaxyVertexShader,
        fragmentShader: galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const galaxy = new Points(galaxyGeometry, galaxyMaterial);
      scene.add(galaxy);

      const nodeGeometry = buildNodeGeometry(nodes, selectedId);
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
        color: palette.accent,
        transparent: true,
        opacity: isMacro ? (themeName === 'light' ? 0.48 : 0.58) : (isMobile ? 0.18 : 0.24),
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const selectedRelationMaterial = new LineBasicMaterial({
        color: palette.strong,
        transparent: true,
        opacity: 0.86,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const relationLines = new LineSegments(relationSegments.normal, relationMaterial);
      const selectedRelationLines = new LineSegments(relationSegments.selected, selectedRelationMaterial);
      scene.add(relationLines, selectedRelationLines);

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
        nodeGeometry.dispose();
        nodeMaterial.dispose();
        relationSegments.normal.dispose();
        relationSegments.selected.dispose();
        relationMaterial.dispose();
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
      data-renderer="three-procedural-galaxy"
      data-particle-profile={isMobile ? 'mobile' : 'desktop'}
      data-view-mode={viewMode}
      data-theme={themeName}
    >
      <div ref={mountRef} className="galaxy-three-mount" />
      <div className="galaxy-three-vignette" aria-hidden="true" />
      <div className="galaxy-three-labels" aria-hidden="true">
        {visibleLabels.map(node => (
          <span
            key={node.id}
            ref={element => {
              if (element) labelsRef.current.set(node.id, element);
              else labelsRef.current.delete(node.id);
            }}
            className={`galaxy-three-label${node.type === 'DOMAIN' ? ' domain' : ''}${node.id === selectedId ? ' selected' : ''}`}
            style={{ '--galaxy-label-intensity': node.id === selectedId ? 1 : 0.72 } as CSSProperties}
          >
            {node.type === 'DOMAIN' && node.domain === 'NEXO'
              ? <><strong>NEXO</strong><small>CORE</small></>
              : node.label}
          </span>
        ))}
      </div>
      <div className="galaxy-three-status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{nodes.length} nós · {edges.length} relações · GALAXY</span>
      </div>
      <div className="galaxy-three-controls" role="group" aria-label="Controles da galáxia 3D">
        <button type="button" onClick={reset}>NEXO</button>
        <button type="button" aria-label="Girar para a esquerda" onClick={() => controlsRef.current?.rotateLeft(0.28)}>←</button>
        <button type="button" aria-label="Girar para a direita" onClick={() => controlsRef.current?.rotateLeft(-0.28)}>→</button>
        <button type="button" aria-label="Aproximar" onClick={() => controlsRef.current?.dollyIn(1.18)}>+</button>
        <button type="button" aria-label="Afastar" onClick={() => controlsRef.current?.dollyOut(1.18)}>−</button>
      </div>
      <div className="galaxy-three-a11y-list" aria-label="Entidades da galáxia">
        {nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelect(node.id)}>{node.label}</button>
        ))}
      </div>
    </div>
  );
});
