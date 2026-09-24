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
import { domainHex } from '../viewmodels/domainPalette.ts';
// @ts-ignore -- shared plain-JS geometry module (server + browser)
import { armPoint as morphArmPoint, barEnd, morphologyFrom } from '../viewmodels/galaxy-morphology.mjs';
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


function domainColor(domain: PlacedNode3D['domain'], theme: 'dark' | 'light'): Color {
  return new Color(domainHex(domain, theme));
}

function stateClass(value: unknown): string {
  return String(value ?? 'UNKNOWN').toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
  /** Data-driven galaxy shape from the published snapshot. */
  morphology?: GalaxyMorphology | null;
  /** Glow multiplier (0.5 soft … 1.2 strong). */
  glow?: number;
  /** Astrophysical events (world coordinates, already scaled like the nodes). */
  events?: GalaxyEvent[];
};

const NO_EVENTS: GalaxyEvent[] = [];

export type GalaxyEvent = {
  id: string;
  kind: 'SUPERNOVA' | 'NOVA' | 'AGN' | 'HII' | 'REMNANT' | 'FLARE';
  label: string;
  domain?: string;
  entity?: string;
  x: number; y: number; z: number;
  intensity: number;
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

// ── Procedural spiral galaxy (decoration only) ─────────────────────────────
// Same barred-spiral geometry as the server galaxy compiler (galaxy-v1.mjs),
// scaled like layoutFromGalaxy, so data nodes sit inside the arms they belong to.
// Half the original footprint: the galaxy reads small and whole.
const G_SCALE = 0.36;

export type GalaxyMorphology = {
  stage?: number; stage_label?: string;
  bulge: { radius: number; bar: number; bar_strength?: number; tint: string };
  arms: Record<string, { phase: number; turns: number; pitch: number; width: number; mass: number; segments: number; tint: string; parent?: string; branch_at?: number; mode?: 'branch' | 'bridge' | 'satellite'; bridge_to?: string; orbit_phase?: number; satellite_radius?: number }>;
};
// Used only until the published snapshot arrives; same rules, typical counts.
const DEFAULT_MORPHOLOGY = morphologyFrom({
  counts: { SCIENCE: { entities: 120, subdomains: 12 }, OLYMPUS: { entities: 20, subdomains: 2 }, ENGINEERING: { entities: 10, subdomains: 2 } },
  core: 45,
}) as unknown as GalaxyMorphology;

function spiralPoint(morph: GalaxyMorphology, arm: string, t: number) {
  const p = morphArmPoint(morph, arm, t) as { x: number; y: number };
  return { x: p.x * G_SCALE, y: p.y * G_SCALE };
}

const STAR_WHITE = new Color('#dfe9ff');
const STAR_BLUE = new Color('#9cc3ff');
const STAR_WARM = new Color('#ffd7a8');
const STAR_CORE = new Color('#fff1d6');
const HII_PINK = new Color('#ff8fb0');
const DUST_RED = new Color('#c9785a');

function buildSpiralGalaxy(count: number, morph: GalaxyMorphology): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const arms = Object.keys(morph.arms);
  // Star budget per arm follows mass, but a main arm never gets less than
  // 77% of the heaviest one, so arms read as a balanced pair.
  const heaviest = Math.max(0.3, ...arms.map(key => morph.arms[key].mass));
  const armWeight = (key: string) => Math.max(morph.arms[key].mode || morph.arms[key].parent ? 0.3 : heaviest / 1.3, morph.arms[key].mass);
  // No bar before the mature stage: a round, bright nucleus.
  const barStrength = Math.max(0, Math.min(1, Number(morph.bulge.bar_strength ?? 1)));
  const totalMass = arms.reduce((sum, key) => sum + armWeight(key), 0) || 1;
  const tints = Object.fromEntries(arms.map(key => [key, new Color(morph.arms[key].tint)]));
  const coreTint = new Color(morph.bulge.tint);
  const bulgeRadius = morph.bulge.radius * G_SCALE * 1.6;
  const tmp = new Color();
  for (let i = 0; i < count; i += 1) {
    const r = rng(hash32('nexo-spiral:' + i));
    const kind = r();
    let x: number; let y: number; let z: number; let size: number; let light: number;
    if (kind < 0.16) {
      // Bulge + bar: dense warm core stretched along the bar axis.
      const rad = Math.abs(gaussian(r)) * bulgeRadius;
      const a = r() * TAU;
      const haze = r() < 0.12;
      if (r() < 0.6 * barStrength) {
        // The bar (stage 5 only): bright, straight, running exactly to the arm roots.
        const half = barEnd(morph) * G_SCALE;
        const along = (r() * 2 - 1) * half;
        x = along; y = gaussian(r) * bulgeRadius * 0.32 * (1 - 0.45 * Math.abs(along) / half); z = gaussian(r) * 1.4;
      } else {
        x = Math.cos(a) * rad * (1.1 - 0.1 * (1 - barStrength)); y = Math.sin(a) * rad * (0.8 + 0.15 * (1 - barStrength)); z = gaussian(r) * 2.2;
      }
      // Soft haze makes the bar read as one glowing body, like NGC 1300.
      size = haze ? 8 + r() * 8 : 0.9 + r() * 1.8; light = haze ? 0.04 + r() * 0.05 : 0.55 + r() * 0.45;
      tmp.copy(STAR_CORE).lerp(STAR_WARM, r() * 0.5).lerp(coreTint, 0.35);
    } else if (kind < 0.80) {
      // Arm stars, star-forming knots and dust lanes.
      let pick = r() * totalMass; let arm = arms[0] ?? 'SCIENCE';
      for (const key of arms) { pick -= armWeight(key); if (pick <= 0) { arm = key; break; } }
      const spec = morph.arms[arm];
      // Fragmentation: stars clump around one knot per subdomain.
      // Half the stars fill the arm continuously from the nucleus outward, so
      // there are no gaps; the rest clump around one knot per subdomain.
      const segment = Math.floor(r() * Math.max(1, spec.segments));
      let t = r() < 0.5 ? r() * 1.02 : (segment + 0.5 + gaussian(r) * 0.35) / Math.max(1, spec.segments);
      // Resample instead of clamping: clamped stars pile up on one line (streaks).
      if (t < 0 || t > 1.04) t = r() * 1.04;
      const p = spiralPoint(morph, arm, Math.max(0, t));
      const q = spiralPoint(morph, arm, Math.max(0, t) + 0.01);
      const tx = q.x - p.x; const ty = q.y - p.y; const len = Math.hypot(tx, ty) || 1;
      const width = spec.width * G_SCALE * (0.35 + t * 0.9);
      const across = gaussian(r) * width * 0.3;
      x = p.x + (-ty / len) * across; y = p.y + (tx / len) * across; z = gaussian(r) * (1 + t * 1.6);
      const knot = r() < 0.07;
      const haze = !knot && r() < 0.06;
      size = knot ? 2.2 + r() * 2.6 : haze ? 6 + r() * 6 : 0.6 + r() * 1.4;
      light = knot ? 0.9 : haze ? 0.03 + r() * 0.04 : 0.25 + r() * 0.55;
      const c = r();
      // Each arm keeps the natural star mix but leans to its domain's tone.
      tmp.copy(c < 0.62 ? STAR_WHITE : c < 0.86 ? STAR_BLUE : c < 0.95 ? HII_PINK : DUST_RED).lerp(tints[arm], 0.4);
      if (knot && r() < 0.5) tmp.copy(HII_PINK).lerp(STAR_WHITE, 0.35);
    } else if (kind < 0.95) {
      // Inter-arm disk: faint exponential glow.
      const rad = -Math.log(Math.max(1e-6, r())) * 17;
      const a = r() * TAU;
      x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = gaussian(r) * 3;
      size = 0.5 + r() * 0.8; light = 0.12 + r() * 0.22;
      tmp.copy(STAR_WHITE).lerp(STAR_WARM, r() * 0.5);
    } else {
      // Field stars far outside the disk.
      const a = r() * TAU; const b = Math.acos(2 * r() - 1); const rad = 220 + r() * 260;
      x = Math.sin(b) * Math.cos(a) * rad; y = Math.sin(b) * Math.sin(a) * rad; z = Math.cos(b) * rad;
      size = 0.5 + r() * 1.1; light = 0.2 + r() * 0.5;
      tmp.copy(r() < 0.8 ? STAR_WHITE : STAR_WARM);
    }
    writeParticle(positions, sizes, brightness, colors, i, x, y, z, size, light, tmp);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const spiralVertexShader = `
attribute float aSize;
attribute float aBrightness;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying float vBrightness;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.9 + 0.1 * sin(uTime * 1.3 + position.x * 0.31 + position.y * 0.17);
  float perspective = 720.0 / max(18.0, -mv.z);
  gl_PointSize = clamp(aSize * uPixelRatio * perspective * (aBrightness > 0.85 ? twinkle : 1.0), 1.2, 34.0);
  gl_Position = projectionMatrix * mv;
  vBrightness = aBrightness;
  vColor = aColor;
}
`;

const spiralFragmentShader = `
uniform float uOpacity;
varying float vBrightness;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = exp(-d * d * 22.0);
  float spikeX = max(0.0, 1.0 - abs(uv.y) * 30.0) * smoothstep(0.5, 0.0, abs(uv.x));
  float spikeY = max(0.0, 1.0 - abs(uv.x) * 30.0) * smoothstep(0.5, 0.0, abs(uv.y));
  float spike = vBrightness > 0.85 ? spikeX + spikeY : 0.0;
  float alpha = (glow + spike * 0.35) * (0.25 + vBrightness * 0.75) * uOpacity;
  gl_FragColor = vec4(vColor * (0.8 + vBrightness * 0.6), alpha);
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
      ? node.domain === selected.domain ? 0.72 : 0.34
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
): { structural: BufferGeometry; dependency: BufferGeometry; blocked: BufferGeometry; learning: BufferGeometry; selected: BufferGeometry } {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const structural: number[] = [];
  const dependency: number[] = [];
  const blocked: number[] = [];
  const learning: number[] = [];
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
      : edge.is_learning
        ? learning
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
    learning: geometryOf(learning),
    selected: geometryOf(selected),
  };
}
function isMajor(node: PlacedNode3D, selectedId: string | null): boolean {
  return node.type === 'DOMAIN' || node.type === 'CAMPAIGN' || node.id.startsWith('atlas.cluster.') || node.id === selectedId;
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
  morphology = null,
  glow = 0.425,
  events = NO_EVENTS,
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const nodePointsRef = useRef<Points | null>(null);
  const labelsRef = useRef(new Map<string, HTMLSpanElement>());
  const eventsRef = useRef(new Map<string, HTMLSpanElement>());
  const tweenRef = useRef<Tween | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const [pageTheme, setThemeName] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  // The galaxy is a night sky in both site themes (like the Início hero): additive
  // starlight is invisible on a white page, so the spiral always renders dark.
  const themeName: 'dark' | 'light' = morphology ? 'dark' : pageTheme;

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
  const visibleLabels = useMemo(() => {
    const local = new Set<string>();
    if (selectedId) {
      local.add(selectedId);
      for (const edge of edges) {
        if (edge.from === selectedId) local.add(edge.to);
        if (edge.to === selectedId) local.add(edge.from);
      }
    }
    return nodes
      .filter(node => isMajor(node, selectedId) || local.has(node.id))
      .slice(0, isMobile ? 18 : 42);
  }, [edges, isMobile, nodes, selectedId]);

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
      controls.enableRotate = true;
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
      const spiral = themeName === 'dark';
      const particleCount = spiral
        ? (isMobile ? 5000 : 16000)
        : isMacro ? (isMobile ? 90 : 320) : (isMobile ? 240 : 900);
      const galaxyGeometry = spiral ? buildSpiralGalaxy(particleCount, morphology ?? DEFAULT_MORPHOLOGY) : buildFieldGeometry(nodes, particleCount, isMacro, themeName);
      const galaxyMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: spiral ? 1.25 * glow : isMacro ? (themeName === 'light' ? 0.20 : 0.24) : (themeName === 'light' ? 0.38 : 0.52) },
        },
        vertexShader: spiral ? spiralVertexShader : galaxyVertexShader,
        fragmentShader: spiral ? spiralFragmentShader : galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const galaxy = new Points(galaxyGeometry, galaxyMaterial);
      scene.add(galaxy);

      const ringGeometry = buildFieldRingSegments(nodes, isMacro);
      const ringMaterial = new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: themeName === 'light' ? 0.05 : (isMacro ? 0.06 : 0.04), blending: NormalBlending, depthWrite: false });
      const ringLines = new LineSegments(ringGeometry, ringMaterial);
      ringLines.visible = !spiral;
      scene.add(ringLines);

      const grid = new GridHelper(isMacro ? 430 : 300, isMacro ? 30 : 22, palette.accent, palette.accent);
      grid.position.set(0, isMacro ? -94 : -74, -24);
      const gridMaterial = grid.material as LineBasicMaterial;
      gridMaterial.transparent = true; gridMaterial.opacity = themeName === 'light' ? 0.055 : 0.075; gridMaterial.depthWrite = false;
      grid.visible = !isMobile && !spiral;
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
        opacity: selectedId ? 0.16 : (isMacro ? 0.48 : 0.30),
        blending: NormalBlending,
        depthWrite: false,
      });
      const dependencyMaterial = new LineDashedMaterial({
        color: themeName === 'light' ? '#5d7488' : '#8ca3b5',
        transparent: true,
        opacity: selectedId ? 0.22 : 0.46,
        dashSize: 2.1,
        gapSize: 1.5,
        depthWrite: false,
      });
      const learningRelationMaterial = new LineDashedMaterial({
        color: themeName === 'light' ? '#8b4fb8' : '#c889ff',
        transparent: true,
        opacity: selectedId ? 0.42 : 0.72,
        dashSize: 3.2,
        gapSize: 1.1,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const blockedRelationMaterial = new LineBasicMaterial({
        color: '#df747d',
        transparent: true,
        opacity: selectedId ? 0.34 : 0.62,
        depthWrite: false,
      });
      const selectedRelationMaterial = new LineBasicMaterial({
        color: palette.strong,
        transparent: true,
        opacity: 0.98,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const relationLines = new LineSegments(relationSegments.structural, relationMaterial);
      const dependencyLines = new LineSegments(relationSegments.dependency, dependencyMaterial);
      dependencyLines.computeLineDistances();
      const learningRelationLines = new LineSegments(relationSegments.learning, learningRelationMaterial);
      learningRelationLines.computeLineDistances();
      const blockedRelationLines = new LineSegments(relationSegments.blocked, blockedRelationMaterial);
      const selectedRelationLines = new LineSegments(relationSegments.selected, selectedRelationMaterial);
      scene.add(relationLines, dependencyLines, learningRelationLines, blockedRelationLines, selectedRelationLines);

      if (!isMobile && themeName === 'dark') {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.9 * glow, 0.55, 0.12);
        bloom.threshold = 0.12;
        bloom.strength = 0.9 * glow;
        bloom.radius = 0.55;
        composer.addPass(bloom);
      }

      const projected = new Vector3();
      const pickIndex = (clientX: number, clientY: number): number | null => {
        const rect = renderer!.domElement.getBoundingClientRect();
        const hitRadius = isMobile ? 28 : 16;
        let bestIndex: number | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]!;
          projected.set(node.x, node.y, node.z).project(camera);
          if (projected.z <= -1 || projected.z >= 1) continue;
          const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
          const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
          const distance = Math.hypot(clientX - x, clientY - y);
          if (distance > hitRadius) continue;
          // Favor the visually closest node when several points overlap.
          const score = distance + Math.max(0, projected.z + 1) * 2.5;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }
        return bestIndex;
      };

      const pick = (clientX: number, clientY: number, focus = false) => {
        const index = pickIndex(clientX, clientY);
        if (index == null || !nodes[index]) {
          onSelect(null);
          return;
        }
        const id = nodes[index]!.id;
        onSelect(id);
        if (focus) focusNode(id, isMobile ? 28 : 34);
      };

      const onPointerDown = (event: PointerEvent) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY };
      };
      const onPointerUp = (event: PointerEvent) => {
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!start) return;
        const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        const tapTolerance = isMobile ? 16 : 7;
        if (travel <= tapTolerance) pick(event.clientX, event.clientY);
      };
      const onPointerCancel = () => {
        pointerDownRef.current = null;
      };
      const onDoubleClick = (event: MouseEvent) => {
        pick(event.clientX, event.clientY, true);
      };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerCancel);
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
        for (const event of events) {
          const marker = eventsRef.current.get(event.id);
          if (!marker) continue;
          const projected = new Vector3(event.x, event.y, event.z).project(camera);
          const visible = projected.z > -1 && projected.z < 1;
          marker.style.opacity = visible ? '1' : '0';
          marker.style.transform = `translate(-50%, -50%) translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px)`;
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
        renderer?.domElement.removeEventListener('pointercancel', onPointerCancel);
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
        relationSegments.learning.dispose();
        relationSegments.selected.dispose();
        relationMaterial.dispose();
        dependencyMaterial.dispose();
        blockedRelationMaterial.dispose();
        learningRelationMaterial.dispose();
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
  }, [ariaLabel, edges, events, failed, glow, isMacro, isMobile, morphology, nodes, onFailure, onSelect, reducedMotion, selectedId, size.height, size.width, themeName, visibleLabels]);

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
      {isMacro && <div className="nexo-field-heading" aria-hidden="true"><strong>NEXO FIELD</strong><span>DOMÍNIOS · CONEXÕES · INTELIGÊNCIA EM CONTEXTO</span></div>}
      <div className="galaxy-events" aria-hidden="true">
        {events.map(event => (
          <span
            key={event.id}
            ref={element => { if (element) eventsRef.current.set(event.id, element); else eventsRef.current.delete(event.id); }}
            className="galaxy-event"
            data-kind={event.kind}
            title={event.label}
            style={{ '--event-intensity': event.intensity } as CSSProperties}
          ><i /></span>
        ))}
      </div>
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
                    ? (node.member_count ?? 0) + ' ENTIDADES'
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
      <div className="galaxy-three-controls" role="group" aria-label="Controles do NEXO FIELD">
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
