import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphEdge, Domain } from '../contracts/system.ts';
import type { GalaxySnapshot } from '../contracts/galaxy.ts';
import type { PlacedNode3D, Point3 } from '../viewmodels/graph3d.ts';
import { domainAnchor } from '../viewmodels/graph3d.ts';
import type { CanvasGraph25DHandle, Canvas25DViewState } from './CanvasGraph25D.tsx';
import './ThreeGalaxy.css';

const CORE = '#f4fdff';
const CYAN = '#79e7ff';
const DIM = '#5ea9c8';
const WORLD_SCALE = 0.72;

type Props = {
  nodes: PlacedNode3D[];
  edges: GraphEdge[];
  snapshot: GalaxySnapshot;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  controllerRef?: Ref<CanvasGraph25DHandle>;
  onUnavailable?: () => void;
};

type LabelState = {
  domain: Domain;
  position: THREE.Vector3;
  entityId: string | null;
};

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  entityMesh: THREE.InstancedMesh;
  entityIds: string[];
  entityPositionById: Map<string, THREE.Vector3>;
  labelStates: LabelState[];
  disposables: Array<{ dispose: () => void }>;
  raf: number;
  resizeObserver: ResizeObserver;
  animationRaf: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hash32(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number) {
  return (random() + random() + random() + random() + random() + random() - 3) / 3;
}

function armPhase(domain: Domain) {
  if (domain === 'SCIENCE') return -0.52;
  if (domain === 'ENGINEERING') return 1.57;
  if (domain === 'OLYMPUS') return 3.66;
  return 0;
}

function createRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(220,248,255,.98)');
  gradient.addColorStop(0.35, 'rgba(121,231,255,.48)');
  gradient.addColorStop(0.72, 'rgba(62,153,220,.11)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGalaxyParticles(snapshot: GalaxySnapshot, mobile: boolean, reducedMotion: boolean) {
  const entityCounts = new Map<Domain, number>();
  for (const entity of snapshot.entities) {
    entityCounts.set(entity.domain, (entityCounts.get(entity.domain) ?? 0) + 1);
  }

  const total = mobile ? 24000 : 68000;
  const signatureCount = Math.floor(total * 0.2);
  const armBudget = total - signatureCount;
  const primaryDomains: Domain[] = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'];
  const weights = primaryDomains.map(domain => Math.max(8, entityCounts.get(domain) ?? 0));
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const alphas = new Float32Array(total);
  const phases = new Float32Array(total);
  const colors = new Float32Array(total * 3);

  let cursor = 0;
  const write = (
    index: number,
    x: number,
    y: number,
    z: number,
    size: number,
    alpha: number,
    colorMix: number,
    phase: number,
  ) => {
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    sizes[index] = size;
    alphas[index] = alpha;
    phases[index] = phase;

    const cold = new THREE.Color(CYAN);
    const warm = new THREE.Color(CORE);
    cold.lerp(warm, colorMix);
    colors[index * 3] = cold.r;
    colors[index * 3 + 1] = cold.g;
    colors[index * 3 + 2] = cold.b;
  };

  primaryDomains.forEach((domain, domainIndex) => {
    const count = domainIndex === primaryDomains.length - 1
      ? armBudget - cursor
      : Math.floor(armBudget * (weights[domainIndex] / weightTotal));
    const random = seeded(hash32(`galaxy:${snapshot.fingerprint}:${domain}`));
    const phase = armPhase(domain);

    for (let local = 0; local < count; local += 1) {
      const t = Math.pow(random(), 0.92);
      const radius = 18 + t * 128;
      const theta = phase + 0.2 + t * 4.15 + Math.sin(t * 10.5 + domainIndex) * 0.06;
      const spread = 2.2 + radius * 0.052;
      const tangential = gaussian(random) * spread;
      const radialNoise = gaussian(random) * spread * 0.7;
      const x = Math.cos(theta) * (radius + radialNoise) - Math.sin(theta) * tangential;
      const y = (Math.sin(theta) * (radius + radialNoise) + Math.cos(theta) * tangential) * 0.78;
      const z = gaussian(random) * (2.2 + t * 7.2) + Math.sin(theta * 1.7) * 1.5;
      const bright = random();
      write(
        cursor,
        x,
        y,
        z,
        bright > 0.985 ? 3.1 : bright > 0.91 ? 1.85 : 0.8 + random() * 0.8,
        0.2 + Math.pow(bright, 2.2) * 0.82,
        clamp(0.18 + bright * 0.82, 0, 1),
        random() * Math.PI * 2,
      );
      cursor += 1;
    }
  });

  const signatureRandom = seeded(hash32(`signature:${snapshot.fingerprint}`));
  for (let local = 0; local < signatureCount; local += 1) {
    const u = local / Math.max(1, signatureCount - 1);
    let radius: number;
    let theta: number;
    if (u < 0.69) {
      const loop = u / 0.69;
      theta = -0.34 + loop * Math.PI * 2;
      radius = 57 + Math.sin(loop * Math.PI * 3) * 3;
    } else {
      const tail = (u - 0.69) / 0.31;
      theta = 0.25 + tail * Math.PI * 2.15;
      radius = 57 - tail * 39;
    }
    const spread = 3.2 + (1 - u) * 2.3;
    const r = radius + gaussian(signatureRandom) * spread;
    const x = Math.cos(theta) * r + gaussian(signatureRandom) * 1.4;
    const y = Math.sin(theta) * r * 0.82 + 6 + gaussian(signatureRandom) * 1.2;
    const z = gaussian(signatureRandom) * 3.6;
    const bright = signatureRandom();
    write(
      cursor,
      x,
      y,
      z,
      bright > 0.975 ? 3.4 : 0.9 + signatureRandom() * 1.3,
      0.16 + bright * 0.72,
      clamp(0.42 + bright * 0.58, 0, 1),
      signatureRandom() * Math.PI * 2,
    );
    cursor += 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, mobile ? 1.45 : 1.8) },
      uTime: { value: 0 },
      uReducedMotion: { value: reducedMotion ? 1 : 0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aPhase;
      attribute vec3 aColor;
      varying float vAlpha;
      varying float vPhase;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = clamp(250.0 / max(60.0, -mvPosition.z), 0.55, 2.7);
        gl_PointSize = aSize * uPixelRatio * perspective;
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = aAlpha;
        vPhase = aPhase;
        vColor = aColor;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vPhase;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uReducedMotion;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float twinkle = mix(0.82 + 0.18 * sin(uTime * 1.25 + vPhase), 1.0, uReducedMotion);
        float alpha = vAlpha * core * core * twinkle;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { geometry, material, points: new THREE.Points(geometry, material) };
}

function createStarfield(mobile: boolean) {
  const count = mobile ? 1700 : 4200;
  const positions = new Float32Array(count * 3);
  const random = seeded(0x6e65786f);
  for (let i = 0; i < count; i += 1) {
    const radius = 190 + random() * 360;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x9ccfe5,
    size: mobile ? 0.75 : 0.9,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { geometry, material, points: new THREE.Points(geometry, material) };
}

function scaled(position: Point3 | { x: number; y: number; z: number }) {
  return new THREE.Vector3(position.x * WORLD_SCALE, position.y * WORLD_SCALE, position.z * WORLD_SCALE);
}

function createEntityMesh(
  nodes: PlacedNode3D[],
  snapshot: GalaxySnapshot,
) {
  const positionBySnapshotId = new Map(snapshot.entities.map(entity => [entity.id, scaled(entity.layout.position)]));
  const ids = nodes.map(node => node.id);
  const geometry = new THREE.IcosahedronGeometry(0.82, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, nodes.length));
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const positionById = new Map<string, THREE.Vector3>();

  nodes.forEach((node, index) => {
    const position = positionBySnapshotId.get(node.id) ?? scaled(node);
    positionById.set(node.id, position.clone());
    const state = String(node.state ?? '').toUpperCase();
    const size = node.type === 'DOMAIN'
      ? node.domain === 'NEXO' ? 3.1 : 2.25
      : node.id.startsWith('atlas.cluster.') ? 1.55
      : node.type === 'CAPABILITY' ? 1.15
      : 0.82;
    const opacityScale = /ARCHIVED|REJECTED|STALE/.test(state) ? 0.55 : /BLOCKED|FAILED|CONFLICT/.test(state) ? 0.72 : 1;
    matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(size, size, size));
    mesh.setMatrixAt(index, matrix);
    color.set(CYAN).lerp(new THREE.Color(CORE), node.type === 'DOMAIN' ? 0.82 : 0.22 + opacityScale * 0.18);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh, ids, positionById, geometry, material };
}

function buildPositionMap(snapshot: GalaxySnapshot, nodes: PlacedNode3D[]) {
  const map = new Map<string, THREE.Vector3>();
  for (const entity of snapshot.entities) map.set(entity.id, scaled(entity.layout.position));
  for (const subdomain of snapshot.subdomains) {
    const position = scaled(subdomain.layout.position);
    map.set(subdomain.id, position);
    map.set(`atlas.cluster.${subdomain.domain.toLowerCase()}.${subdomain.kind.toLowerCase()}`, position);
  }
  for (const node of nodes) {
    if (!map.has(node.id)) map.set(node.id, scaled(node));
  }
  return map;
}

function createRelationLines(snapshot: GalaxySnapshot, positions: Map<string, THREE.Vector3>, selectedId: string | null) {
  const selected = selectedId
    ? snapshot.relations.filter(relation => relation.from === selectedId || relation.to === selectedId)
    : [];
  const macro = [...snapshot.relations]
    .filter(relation => positions.has(relation.from) && positions.has(relation.to))
    .sort((a, b) => Number(b.derived) - Number(a.derived) || b.weight - a.weight)
    .slice(0, selectedId ? 75 : 58);
  const byId = new Map([...macro, ...selected].map(relation => [relation.id, relation]));
  const coords: number[] = [];
  for (const relation of byId.values()) {
    const from = positions.get(relation.from);
    const to = positions.get(relation.to);
    if (!from || !to) continue;
    coords.push(from.x, from.y, from.z, to.x, to.y, to.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(DIM),
    transparent: true,
    opacity: selectedId ? 0.27 : 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return { geometry, material, lines: new THREE.LineSegments(geometry, material) };
}

function createCoreSprites(texture: THREE.Texture | null) {
  const group = new THREE.Group();
  if (!texture) return { group, materials: [] as THREE.SpriteMaterial[] };
  const specs = [
    { scale: 46, opacity: 0.13 },
    { scale: 27, opacity: 0.28 },
    { scale: 13, opacity: 0.72 },
  ];
  const materials: THREE.SpriteMaterial[] = [];
  for (const spec of specs) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(CORE),
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(spec.scale, spec.scale, 1);
    group.add(sprite);
    materials.push(material);
  }
  return { group, materials };
}

function domainLabels(snapshot: GalaxySnapshot) {
  const domainEntity = new Map(
    snapshot.entities
      .filter(entity => entity.canonical_type === 'DOMAIN')
      .map(entity => [entity.domain, entity.id]),
  );
  return snapshot.domains
    .filter(domain => domain === 'NEXO' || domain === 'SCIENCE' || domain === 'ENGINEERING' || domain === 'OLYMPUS')
    .map(domain => ({
      domain,
      entityId: domainEntity.get(domain) ?? null,
      position: domain === 'NEXO' ? new THREE.Vector3(0, 0, 0) : scaled(domainAnchor(domain)),
    }));
}

function targetDistance(zoom = 1) {
  return clamp(215 / Math.max(0.5, zoom), 52, 300);
}

export const ThreeGalaxy = forwardRef<CanvasGraph25DHandle, Omit<Props, 'controllerRef'>>(function ThreeGalaxy({
  nodes,
  edges: _edges,
  snapshot,
  selectedId,
  onSelect,
  onUnavailable,
}, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const labelsRef = useRef(new Map<Domain, HTMLButtonElement>());
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const mobile = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
    [],
  );

  const focusPointInternal = (point: { x: number; y: number; z: number }, zoom = 2) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (runtime.animationRaf !== null) cancelAnimationFrame(runtime.animationRaf);

    const startTarget = runtime.controls.target.clone();
    const endTarget = new THREE.Vector3(point.x, point.y, point.z);
    const direction = runtime.camera.position.clone().sub(startTarget).normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.01) direction.set(0.1, 0.16, 1);
    const endCamera = endTarget.clone().add(direction.multiplyScalar(targetDistance(zoom)));
    const startCamera = runtime.camera.position.clone();
    const started = performance.now();
    const duration = reducedMotion ? 0 : 720;

    const tick = (now: number) => {
      const p = duration === 0 ? 1 : clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      runtime.controls.target.lerpVectors(startTarget, endTarget, eased);
      runtime.camera.position.lerpVectors(startCamera, endCamera, eased);
      runtime.controls.update();
      if (p < 1) runtime.animationRaf = requestAnimationFrame(tick);
      else runtime.animationRaf = null;
    };
    runtime.animationRaf = requestAnimationFrame(tick);
  };

  const reset = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const target = { x: 0, y: 0, z: 0 };
    const camera = mobile ? new THREE.Vector3(0, 18, 220) : new THREE.Vector3(0, 24, 215);
    if (runtime.animationRaf !== null) cancelAnimationFrame(runtime.animationRaf);
    const startTarget = runtime.controls.target.clone();
    const startCamera = runtime.camera.position.clone();
    const started = performance.now();
    const duration = reducedMotion ? 0 : 820;
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      runtime.controls.target.lerpVectors(startTarget, new THREE.Vector3(target.x, target.y, target.z), eased);
      runtime.camera.position.lerpVectors(startCamera, camera, eased);
      runtime.controls.update();
      if (p < 1) runtime.animationRaf = requestAnimationFrame(tick);
      else runtime.animationRaf = null;
    };
    runtime.animationRaf = requestAnimationFrame(tick);
  };

  const focusNode = (id: string, zoom = 2.15) => {
    const point = runtimeRef.current?.entityPositionById.get(id);
    if (!point) return false;
    focusPointInternal(point, zoom);
    return true;
  };

  useImperativeHandle(forwardedRef, () => ({
    reset,
    focusNode,
    focusDomain: id => focusNode(id, 1.5),
    focusSubdomain: id => focusNode(id, 1.9),
    focusEntity: id => focusNode(id, 2.35),
    focusPoint: (point, zoom) => focusPointInternal(scaled(point), zoom),
    getView: (): Canvas25DViewState => {
      const runtime = runtimeRef.current;
      if (!runtime) return { yaw: 0, pitch: 0, zoom: 1, target: { x: 0, y: 0, z: 0 } };
      const delta = runtime.camera.position.clone().sub(runtime.controls.target);
      return {
        yaw: Math.atan2(delta.x, delta.z),
        pitch: Math.atan2(delta.y, Math.hypot(delta.x, delta.z)),
        zoom: 215 / Math.max(1, delta.length()),
        target: {
          x: runtime.controls.target.x / WORLD_SCALE,
          y: runtime.controls.target.y / WORLD_SCALE,
          z: runtime.controls.target.z / WORLD_SCALE,
        },
      };
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !mobile,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch {
      onUnavailable?.();
      return undefined;
    }

    if (!renderer.capabilities.isWebGL2 && mobile) {
      renderer.dispose();
      onUnavailable?.();
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x01050b, mobile ? 0.0026 : 0.0019);

    const camera = new THREE.PerspectiveCamera(mobile ? 52 : 46, 1, 0.1, 1200);
    camera.position.set(0, mobile ? 18 : 24, mobile ? 220 : 215);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.45 : 1.8));
    renderer.setClearColor(0x01050b, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'three-galaxy-canvas';
    renderer.domElement.setAttribute('aria-label', 'Galáxia tridimensional do NEXO ONE');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 45;
    controls.maxDistance = 360;
    controls.rotateSpeed = mobile ? 0.55 : 0.42;
    controls.zoomSpeed = mobile ? 0.72 : 0.8;
    controls.panSpeed = 0.58;
    controls.target.set(0, 0, 0);

    const root = new THREE.Group();
    root.rotation.x = -0.08;
    root.rotation.z = -0.08;
    scene.add(root);

    const galaxy = createGalaxyParticles(snapshot, mobile, reducedMotion);
    root.add(galaxy.points);

    const stars = createStarfield(mobile);
    scene.add(stars.points);

    const texture = createRadialTexture();
    const core = createCoreSprites(texture);
    root.add(core.group);

    const positionMap = buildPositionMap(snapshot, nodes);
    const entities = createEntityMesh(nodes, snapshot);
    root.add(entities.mesh);
    for (const [id, position] of positionMap) {
      if (!entities.positionById.has(id)) entities.positionById.set(id, position.clone());
    }

    const relations = createRelationLines(snapshot, positionMap, selectedId);
    root.add(relations.lines);

    const selectedHaloMaterial = texture ? new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(CORE),
      transparent: true,
      opacity: selectedId ? 0.6 : 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }) : null;
    const selectedHalo = selectedHaloMaterial ? new THREE.Sprite(selectedHaloMaterial) : null;
    if (selectedHalo) {
      selectedHalo.scale.set(17, 17, 1);
      const selectedPosition = selectedId ? positionMap.get(selectedId) : null;
      if (selectedPosition) selectedHalo.position.copy(selectedPosition);
      root.add(selectedHalo);
    }

    const labelStates = domainLabels(snapshot);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };

    const pointerToNdc = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) return;
      pointerToNdc(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(entities.mesh, false);
      const instanceId = hits[0]?.instanceId;
      if (typeof instanceId === 'number') {
        const id = entities.ids[instanceId];
        if (id) onSelect(id);
      } else {
        onSelect(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const disposables: Array<{ dispose: () => void }> = [
      galaxy.geometry,
      galaxy.material,
      stars.geometry,
      stars.material,
      entities.geometry,
      entities.material,
      relations.geometry,
      relations.material,
      ...core.materials,
    ];
    if (texture) disposables.push(texture);
    if (selectedHaloMaterial) disposables.push(selectedHaloMaterial);

    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      controls,
      raycaster,
      pointer,
      entityMesh: entities.mesh,
      entityIds: entities.ids,
      entityPositionById: entities.positionById,
      labelStates,
      disposables,
      raf: 0,
      resizeObserver,
      animationRaf: null,
    };
    runtimeRef.current = runtime;

    const clock = new THREE.Clock();
    const projected = new THREE.Vector3();
    const frame = () => {
      const elapsed = clock.getElapsedTime();
      galaxy.material.uniforms.uTime.value = elapsed;
      controls.update();

      stars.points.rotation.z = reducedMotion ? 0 : elapsed * 0.0018;
      core.group.rotation.z = reducedMotion ? 0 : elapsed * 0.035;

      for (const state of labelStates) {
        const element = labelsRef.current.get(state.domain);
        if (!element) continue;
        projected.copy(state.position).applyEuler(root.rotation).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        const x = (projected.x * 0.5 + 0.5) * host.clientWidth;
        const y = (-projected.y * 0.5 + 0.5) * host.clientHeight;
        element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
        element.style.opacity = visible ? '1' : '0';
      }

      renderer.render(scene, camera);
      runtime.raf = requestAnimationFrame(frame);
    };
    runtime.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(runtime.raf);
      if (runtime.animationRaf !== null) cancelAnimationFrame(runtime.animationRaf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      for (const disposable of disposables) disposable.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [mobile, nodes, onSelect, onUnavailable, reducedMotion, selectedId, snapshot]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const position = selectedId ? runtime.entityPositionById.get(selectedId) : null;
    if (position) focusPointInternal(position, 2.25);
  }, [selectedId]);

  const labels = useMemo(() => domainLabels(snapshot), [snapshot]);

  return (
    <div ref={hostRef} className="three-galaxy-root" data-renderer="three-procedural-galaxy">
      <div className="three-galaxy-vignette" aria-hidden="true" />
      <div className="three-galaxy-status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{snapshot.stats.entities} entidades · {snapshot.stats.relations} relações · LIVE GALAXY</span>
      </div>

      <div className="three-galaxy-labels">
        {labels.map(labelState => (
          <button
            key={labelState.domain}
            ref={element => {
              if (element) labelsRef.current.set(labelState.domain, element);
              else labelsRef.current.delete(labelState.domain);
            }}
            type="button"
            className={`three-galaxy-domain-label domain-${labelState.domain.toLowerCase()}`}
            onClick={() => {
              if (labelState.domain === 'NEXO') {
                reset();
                onSelect(null);
              } else {
                focusPointInternal(labelState.position, 1.55);
                if (labelState.entityId) onSelect(labelState.entityId);
              }
            }}
          >
            <span>{labelState.domain}</span>
            {labelState.domain === 'NEXO' && <small>CORE</small>}
          </button>
        ))}
      </div>

      <div className="three-galaxy-controls" role="group" aria-label="Controles da galáxia">
        <button type="button" onClick={reset}>NEXO</button>
        <button type="button" aria-label="Aproximar" onClick={() => {
          const runtime = runtimeRef.current;
          if (!runtime) return;
          const direction = runtime.camera.position.clone().sub(runtime.controls.target).multiplyScalar(0.82);
          runtime.camera.position.copy(runtime.controls.target.clone().add(direction));
          runtime.controls.update();
        }}>+</button>
        <button type="button" aria-label="Afastar" onClick={() => {
          const runtime = runtimeRef.current;
          if (!runtime) return;
          const direction = runtime.camera.position.clone().sub(runtime.controls.target).multiplyScalar(1.18);
          runtime.camera.position.copy(runtime.controls.target.clone().add(direction));
          runtime.controls.update();
        }}>−</button>
      </div>
    </div>
  );
});
