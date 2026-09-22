import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AtlasMetroModel, AtlasMetroNode } from './atlasAdapter.ts';
import { atlasPathTo, visibleAtlasIds } from './atlasAdapter.ts';

type ViewMode = '2d' | '3d';

type Props = {
  model: AtlasMetroModel;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  showBeams: boolean;
  viewMode: ViewMode;
  fitNonce: number;
  onActivate: (id: string) => void;
  onReady?: () => void;
};

type G6Graph = {
  setData: (data: unknown) => void;
  render: () => Promise<void>;
  fitView: (...args: any[]) => Promise<void> | void;
  focusElement?: (...args: any[]) => Promise<void> | void;
  getElementState: (id: string) => string[];
  setElementState: (...args: any[]) => Promise<void> | void;
  on: (event: string, callback: (event: any) => void) => void;
  resize?: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    G6?: { Graph: new (options: any) => G6Graph };
  }
}

const DOMAIN_COLOR: Record<string, string> = {
  NEXO: '#7c3aed',
  SCIENCE: '#00c2ff',
  OLYMPUS: '#f97316',
};

const TYPE_COLOR: Record<string, string> = {
  hub: '#f8fafc',
  subdomain: '#cbd5e1',
  DOMAIN: '#f8fafc',
  CAMPAIGN: '#a78bfa',
  ACTION: '#f59e0b',
  EFFECT: '#22c55e',
  CLAIM: '#38bdf8',
  TEST: '#e879f9',
  MEMORY: '#60a5fa',
  CAPABILITY: '#2dd4bf',
  PROVIDER: '#84cc16',
  PROJECTION: '#94a3b8',
  SIDE_QUEST: '#fb7185',
  FILAMENT: '#c084fc',
};

function statusColor(status: string): string {
  const value = status.toUpperCase();
  if (/CONFLICT|FAILED|BLOCKED|REJECTED|MISSING/.test(value)) return '#ef4444';
  if (/WATCH|AGING|STALE|DEGRADED|UNKNOWN|UNVERIFIED|INCONCLUSIVE/.test(value)) return '#f59e0b';
  if (/LIVE|PASS|ACTIVE|RUNNING|APPLIED|PROMOTED|ELIGIBLE|SUCCEEDED/.test(value)) return '#22c55e';
  return '#94a3b8';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const radians = (degrees: number) => degrees * Math.PI / 180;

function rootFor(model: AtlasMetroModel, id: string): string {
  return atlasPathTo(model, id)[0]?.id || id;
}

export function metroLayoutPositions(
  model: AtlasMetroModel,
  ids: string[],
  width: number,
  height: number,
): Map<string, [number, number]> {
  const w = Math.max(720, width || 900);
  const h = Math.max(560, height || 700);
  const anchorsByDomain: Record<string, [number, number]> = {
    NEXO: [w * 0.23, h * 0.52],
    SCIENCE: [w * 0.55, h * 0.33],
    OLYMPUS: [w * 0.77, h * 0.69],
  };
  const firstAngles: Record<string, number[]> = {
    NEXO: [-135, -90, -45, 0, 45, 90, 135, 180],
    SCIENCE: [-180, -135, -90, -45, 0, 45, 90, 135],
    OLYMPUS: [-180, -135, -90, -45, 0, 45, 90, 135],
  };
  const visible = new Set(ids);
  const positions = new Map<string, [number, number]>();

  for (const rootId of model.roots) {
    const root = model.nodeMap.get(rootId);
    if (!root) continue;
    positions.set(rootId, anchorsByDomain[root.domain]);
  }

  for (const rootId of model.roots) {
    const root = model.nodeMap.get(rootId);
    if (!root) continue;
    const direct = (model.childrenMap.get(rootId) || []).filter(id => visible.has(id));
    const anchor = anchorsByDomain[root.domain];
    direct.forEach((id, index) => {
      const angles = firstAngles[root.domain];
      const angle = angles[index % angles.length]!;
      const ring = 136 + (index % 2) * 18 + Math.floor(index / angles.length) * 34;
      positions.set(id, [
        anchor[0] + Math.cos(radians(angle)) * ring,
        anchor[1] + Math.sin(radians(angle)) * ring,
      ]);
    });
  }

  const deeper = ids
    .map(id => ({ id, depth: model.nodeMap.get(id)?.depth || 0 }))
    .filter(item => item.depth >= 2)
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  for (const { id, depth } of deeper) {
    const node = model.nodeMap.get(id);
    if (!node?.parentId) continue;
    const parentPosition = positions.get(node.parentId);
    if (!parentPosition) continue;
    const siblings = (model.childrenMap.get(node.parentId) || []).filter(candidate => visible.has(candidate));
    const index = Math.max(0, siblings.indexOf(id));
    const offsets = siblings.length <= 1
      ? [0]
      : siblings.length === 2
        ? [-22.5, 22.5]
        : [-45, 0, 45, 90, -90, 135, -135, 180];
    const rootId = rootFor(model, node.parentId);
    const root = model.nodeMap.get(rootId);
    const anchor = root ? anchorsByDomain[root.domain] : [w / 2, h / 2] as [number, number];
    const baseAngle = Math.round(
      (Math.atan2(parentPosition[1] - anchor[1], parentPosition[0] - anchor[0]) * 180 / Math.PI) / 45,
    ) * 45;
    const angle = baseAngle + offsets[index % offsets.length]!;
    const distance = 78 + Math.min(30, depth * 8) + Math.floor(index / offsets.length) * 18;
    positions.set(id, [
      clamp(parentPosition[0] + Math.cos(radians(angle)) * distance, 58, w - 58),
      clamp(parentPosition[1] + Math.sin(radians(angle)) * distance, 72, h - 58),
    ]);
  }

  return positions;
}

function nodeSize(node: AtlasMetroNode): number {
  const base = node.entityType === 'hub' ? 58 : node.entityType === 'subdomain' ? 30 : 20;
  return Math.round(base + Math.min(34, Math.sqrt(node.descendantCount + 1) * 6));
}

function tooltipHtml(node: AtlasMetroNode | undefined, expanded: ReadonlySet<string>): string {
  if (!node) return '';
  const domain = DOMAIN_COLOR[node.domain] || '#94a3b8';
  const status = statusColor(node.status);
  const expandable = node.childCount > 0
    ? `${node.childCount} filhos · ${expanded.has(node.id) ? 'expandido' : 'fechado'}`
    : 'folha';
  return `
    <div style="min-width:235px;padding:10px 11px;background:#09111f;border:1px solid #24324a;border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.35);color:#dbe7f5;font:12px/1.4 Inter,system-ui,sans-serif">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
        <span style="width:8px;height:8px;border-radius:999px;background:${domain};box-shadow:0 0 10px ${domain}"></span>
        <strong style="font-size:13px">${escapeHtml(node.name)}</strong>
      </div>
      <div style="color:#8ea0b8;margin-bottom:7px">${escapeHtml(node.summary)}</div>
      <div style="display:flex;gap:9px;color:#70829b;font-size:10px">
        <span>${escapeHtml(node.entityType)}</span>
        <span style="color:${status}">${escapeHtml(node.status)}</span>
        <span>${expandable}</span>
      </div>
    </div>`;
}

function buildG6Data(
  model: AtlasMetroModel,
  expanded: ReadonlySet<string>,
  showBeams: boolean,
  width: number,
  height: number,
) {
  const ids = visibleAtlasIds(model, expanded);
  const visible = new Set(ids);
  const positions = metroLayoutPositions(model, ids, width, height);

  const nodes = ids.map(id => {
    const node = model.nodeMap.get(id)!;
    const position = positions.get(id) || [width / 2, height / 2];
    return {
      id,
      type: 'donut',
      data: {
        ...node,
        expanded: expanded.has(id),
      },
      style: { x: position[0], y: position[1] },
    };
  });

  const hierarchyEdges = ids.flatMap(id => {
    const node = model.nodeMap.get(id);
    if (!node?.parentId || !visible.has(node.parentId)) return [];
    return [{
      id: `hierarchy:${node.parentId}:${id}`,
      source: node.parentId,
      target: id,
      type: 'line',
      data: { kind: 'hierarchy', domain: node.domain },
    }];
  });

  const bridgeEdges = showBeams
    ? model.crossLinks
      .filter(link => visible.has(link.source) && visible.has(link.target))
      .map(link => ({
        id: link.id,
        source: link.source,
        target: link.target,
        type: 'cubic',
        data: { kind: 'bridge', label: link.label, weight: link.weight, aggregated: link.aggregated },
      }))
    : [];

  return { nodes, edges: [...hierarchyEdges, ...bridgeEdges] };
}

function applyG6Selection(graph: G6Graph | null, model: AtlasMetroModel, expanded: ReadonlySet<string>, selectedId: string | null) {
  if (!graph) return;
  const visible = visibleAtlasIds(model, expanded);
  const states: Record<string, string[]> = {};
  for (const id of visible) states[id] = id === selectedId ? ['selected'] : [];
  void graph.setElementState(states, false);
}

function Metro2DView({
  model,
  expanded,
  selectedId,
  showBeams,
  fitNonce,
  onActivate,
  onReady,
}: Omit<Props, 'viewMode'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const modelRef = useRef(model);
  const expandedRef = useRef(expanded);
  const selectedRef = useRef(selectedId);
  const activateRef = useRef(onActivate);
  const showBeamsRef = useRef(showBeams);
  const lastFitNonce = useRef(-1);

  modelRef.current = model;
  expandedRef.current = expanded;
  selectedRef.current = selectedId;
  activateRef.current = onActivate;
  showBeamsRef.current = showBeams;

  useEffect(() => {
    const container = containerRef.current;
    const Graph = window.G6?.Graph;
    if (!container || !Graph) {
      if (container) {
        container.dataset.g6Ready = 'false';
        container.innerHTML = '<div class="atlas-render-error">G6 não carregou. O Atlas mantém os dados, mas o renderer 2D ficou indisponível.</div>';
      }
      return;
    }

    const graph = new Graph({
      container,
      theme: 'dark',
      data: { nodes: [], edges: [] },
      padding: [74, 60, 62, 60],
      zoomRange: [0.42, 2.7],
      behaviors: ['drag-canvas', 'zoom-canvas'],
      node: {
        type: 'donut',
        style: {
          size: (datum: any) => nodeSize(datum.data),
          donuts: (datum: any) => [Math.max(8, Math.min(92, datum.data.mix || 50)), 100 - Math.max(8, Math.min(92, datum.data.mix || 50))],
          donutPalette: (datum: any) => [
            TYPE_COLOR[String(datum.data.entityType)] || '#94a3b8',
            DOMAIN_COLOR[String(datum.data.domain)] || '#64748b',
          ],
          innerR: (datum: any) => datum.data.entityType === 'hub' ? '58%' : '63%',
          fill: 'transparent',
          stroke: (datum: any) => statusColor(String(datum.data.status || '')),
          lineWidth: (datum: any) => datum.data.entityType === 'hub' ? 3.6 : datum.data.entityType === 'subdomain' ? 2.5 : 2,
          shadowColor: (datum: any) => DOMAIN_COLOR[String(datum.data.domain)] || '#64748b',
          shadowBlur: (datum: any) => datum.data.entityType === 'hub' ? 20 : 8,
          labelText: (datum: any) => datum.data.name,
          labelPlacement: 'bottom',
          labelFill: '#d6e2f1',
          labelFontSize: (datum: any) => datum.data.entityType === 'hub' ? 13 : datum.data.entityType === 'subdomain' ? 11 : 9.5,
          labelFontWeight: (datum: any) => datum.data.entityType === 'hub' ? 800 : 650,
          labelBackground: true,
          labelBackgroundFill: 'rgba(7,11,20,.84)',
          labelBackgroundRadius: 5,
          labelPadding: [2, 5],
          cursor: 'pointer',
        },
        state: {
          hover: {
            lineWidth: 4,
            halo: true,
            haloStroke: '#e2e8f0',
            haloStrokeOpacity: .24,
            haloLineWidth: 8,
          },
          selected: {
            lineWidth: 4,
            halo: true,
            haloStroke: '#ffffff',
            haloStrokeOpacity: .30,
            haloLineWidth: 10,
          },
        },
      },
      edge: {
        style: {
          stroke: (datum: any) => datum.data?.kind === 'bridge'
            ? '#91a4bd'
            : (DOMAIN_COLOR[String(datum.data?.domain)] || '#475569'),
          lineWidth: (datum: any) => datum.data?.kind === 'bridge' ? 1.05 : 2.25,
          opacity: (datum: any) => datum.data?.kind === 'bridge' ? .20 : .43,
          lineDash: (datum: any) => datum.data?.kind === 'bridge' ? [5, 6] : [],
          endArrow: false,
        },
      },
      plugins: [
        {
          type: 'tooltip',
          trigger: 'hover',
          enable: (event: any) => event.targetType === 'node',
          getContent: (_event: any, items: any[]) => {
            const id = items?.[0]?.id || items?.[0]?.data?.id;
            return tooltipHtml(modelRef.current.nodeMap.get(id), expandedRef.current);
          },
          offset: [12, 12],
        },
        {
          key: 'minimap',
          type: 'minimap',
          size: [176, 108],
        },
      ],
    });

    graphRef.current = graph;

    graph.on('node:pointerenter', event => {
      const id = event.target?.id;
      if (!id) return;
      const current = graph.getElementState(id) || [];
      void graph.setElementState(id, [...new Set([...current, 'hover'])], false);
    });

    graph.on('node:pointerleave', event => {
      const id = event.target?.id;
      if (!id) return;
      const current = (graph.getElementState(id) || []).filter(state => state !== 'hover');
      void graph.setElementState(id, current, false);
    });

    graph.on('node:click', event => {
      const id = event.target?.id;
      if (id && modelRef.current.nodeMap.has(id)) activateRef.current(id);
    });

    const refresh = async (fit: boolean) => {
      const rect = container.getBoundingClientRect();
      graph.setData(buildG6Data(
        modelRef.current,
        expandedRef.current,
        showBeamsRef.current,
        rect.width,
        rect.height,
      ));
      await graph.render();
      applyG6Selection(graph, modelRef.current, expandedRef.current, selectedRef.current);
      container.dataset.g6Ready = 'true';
      onReady?.();
      if (fit) await graph.fitView({ when: 'always', direction: 'both' }, { duration: 320, easing: 'ease-out' });
    };

    void refresh(true);

    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        graph.resize?.();
        void refresh(false);
      });
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      graph.destroy?.();
      graphRef.current = null;
    };
  }, []);

  const expansionKey = useMemo(() => [...expanded].sort().join('|'), [expanded]);

  useEffect(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    if (!graph || !container) return;
    const rect = container.getBoundingClientRect();
    graph.setData(buildG6Data(model, expanded, showBeams, rect.width, rect.height));
    void graph.render().then(async () => {
      applyG6Selection(graph, model, expanded, selectedId);
      container.dataset.g6Ready = 'true';
      if (lastFitNonce.current !== fitNonce) {
        lastFitNonce.current = fitNonce;
        await graph.fitView({ when: 'always', direction: 'both' }, { duration: 300, easing: 'ease-out' });
      }
    });
  }, [model.revision, expansionKey, showBeams, fitNonce]);

  useEffect(() => {
    applyG6Selection(graphRef.current, model, expanded, selectedId);
  }, [selectedId, model.revision, expansionKey]);

  return <div ref={containerRef} id="atlas-metro-g6" className="atlas-metro-surface" data-testid="atlas-metro-2d" />;
}

type ThreeRuntime = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  content: THREE.Group | null;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  interactive: THREE.Object3D[];
  nodeGroups: Map<string, THREE.Group>;
  worldPositions: Map<string, THREE.Vector3>;
  hoveredId: string | null;
  pointerDown: { x: number; y: number; button: number } | null;
  frame: number;
  hasFit: boolean;
};

function disposeThreeObject(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = (mesh as any).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      item.map?.dispose?.();
      item.dispose?.();
    }
  });
}

function createLabelSprite(text: string, domainColor: string, isHub: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(7,11,20,.90)';
  context.strokeStyle = domainColor;
  context.lineWidth = isHub ? 5 : 3;
  context.beginPath();
  context.roundRect(8, 18, 496, 92, 22);
  context.fill();
  context.stroke();
  context.fillStyle = '#e5edf8';
  context.font = `${isHub ? 800 : 650} ${isHub ? 34 : 29}px Inter, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  context.fillText(label, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  sprite.scale.set(isHub ? 118 : 90, isHub ? 30 : 23, 1);
  return sprite;
}

function nodeRadius3D(node: AtlasMetroNode): number {
  const base = node.entityType === 'hub' ? 20 : node.entityType === 'subdomain' ? 11 : 7;
  return base + Math.min(10, Math.sqrt(node.descendantCount + 1) * 1.4);
}

function threePositions(
  model: AtlasMetroModel,
  ids: string[],
  width: number,
  height: number,
): Map<string, THREE.Vector3> {
  const metro = metroLayoutPositions(model, ids, width, height);
  const domainBaseZ: Record<string, number> = { NEXO: -155, SCIENCE: 0, OLYMPUS: 155 };
  const scale = .72;
  const out = new Map<string, THREE.Vector3>();
  for (const id of ids) {
    const node = model.nodeMap.get(id);
    const position = metro.get(id);
    if (!node || !position) continue;
    out.set(id, new THREE.Vector3(
      (position[0] - width / 2) * scale,
      -(position[1] - height / 2) * scale,
      domainBaseZ[node.domain] + node.depth * 52,
    ));
  }
  return out;
}

function applyThreeSelection(runtime: ThreeRuntime, selectedId: string | null) {
  runtime.nodeGroups.forEach((group, id) => {
    const selection = group.userData.selectionRing as THREE.Object3D | undefined;
    if (selection) selection.visible = id === selectedId;
    const sphere = group.userData.sphere as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | undefined;
    if (!sphere) return;
    const base = Number(sphere.userData.baseEmissive || .24);
    sphere.material.emissiveIntensity = id === runtime.hoveredId ? .88 : id === selectedId ? Math.max(.72, base) : base;
  });
}

function fitThree(runtime: ThreeRuntime, animated = true) {
  if (!runtime.worldPositions.size) return;
  const box = new THREE.Box3();
  runtime.worldPositions.forEach(position => box.expandByPoint(position));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(160, size.length() * .58);
  const fov = THREE.MathUtils.degToRad(runtime.camera.fov);
  const distance = Math.max(420, radius / Math.tan(fov / 2) * .92);
  const direction = new THREE.Vector3(.82, .54, 1.15).normalize();
  const destination = center.clone().add(direction.multiplyScalar(distance));

  if (!animated) {
    runtime.camera.position.copy(destination);
    runtime.controls.target.copy(center);
    runtime.controls.update();
    return;
  }

  const fromPosition = runtime.camera.position.clone();
  const fromTarget = runtime.controls.target.clone();
  const start = performance.now();
  const duration = 360;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    runtime.camera.position.lerpVectors(fromPosition, destination, eased);
    runtime.controls.target.lerpVectors(fromTarget, center, eased);
    runtime.controls.update();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function rebuildThree(
  runtime: ThreeRuntime,
  container: HTMLElement,
  model: AtlasMetroModel,
  expanded: ReadonlySet<string>,
  selectedId: string | null,
  showBeams: boolean,
) {
  if (runtime.content) {
    runtime.scene.remove(runtime.content);
    disposeThreeObject(runtime.content);
  }
  runtime.interactive = [];
  runtime.nodeGroups.clear();
  runtime.worldPositions.clear();
  runtime.hoveredId = null;

  const ids = visibleAtlasIds(model, expanded);
  const visible = new Set(ids);
  const positions = threePositions(model, ids, Math.max(720, container.clientWidth), Math.max(560, container.clientHeight));
  runtime.worldPositions = positions;

  const content = new THREE.Group();
  runtime.content = content;
  runtime.scene.add(content);

  for (const rootId of model.roots) {
    const root = model.nodeMap.get(rootId);
    if (!root) continue;
    const z = ({ NEXO: -155, SCIENCE: 0, OLYMPUS: 155 } as Record<string, number>)[root.domain];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(82, 84, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(DOMAIN_COLOR[root.domain]),
        transparent: true,
        opacity: .06,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.position.set(0, 0, z);
    content.add(ring);
  }

  for (const id of ids) {
    const node = model.nodeMap.get(id);
    if (!node?.parentId || !visible.has(node.parentId)) continue;
    const source = positions.get(node.parentId);
    const target = positions.get(id);
    if (!source || !target) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(DOMAIN_COLOR[node.domain]),
        transparent: true,
        opacity: .42,
        depthWrite: false,
      }),
    );
    content.add(line);
  }

  if (showBeams) {
    for (const link of model.crossLinks) {
      if (!visible.has(link.source) || !visible.has(link.target)) continue;
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) continue;
      const midpoint = source.clone().add(target).multiplyScalar(.5);
      const span = source.distanceTo(target);
      midpoint.z += Math.min(120, 34 + span * .16);
      midpoint.y += Math.min(55, span * .07);
      const curve = new THREE.QuadraticBezierCurve3(source, midpoint, target);
      content.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(38)),
        new THREE.LineBasicMaterial({ color: 0x91a4bd, transparent: true, opacity: .20, depthWrite: false }),
      ));
    }
  }

  for (const id of ids) {
    const node = model.nodeMap.get(id)!;
    const position = positions.get(id);
    if (!position) continue;
    const radius = nodeRadius3D(node);
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData.nodeId = id;

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(TYPE_COLOR[String(node.entityType)] || '#94a3b8'),
      emissive: new THREE.Color(DOMAIN_COLOR[node.domain]),
      emissiveIntensity: node.entityType === 'hub' ? .48 : .24,
      roughness: .42,
      metalness: .12,
    });
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, node.entityType === 'hub' ? 36 : 24, node.entityType === 'hub' ? 24 : 16),
      sphereMaterial,
    );
    sphere.userData = { nodeId: id, baseEmissive: sphereMaterial.emissiveIntensity };
    group.add(sphere);
    runtime.interactive.push(sphere);

    const domainRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.30, Math.max(1, radius * .085), 10, 42),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(DOMAIN_COLOR[node.domain]), transparent: true, opacity: .92, depthWrite: false }),
    );
    domainRing.rotation.x = Math.PI / 2;
    group.add(domainRing);

    const stateRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.54, Math.max(.65, radius * .045), 8, 42),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(statusColor(node.status)), transparent: true, opacity: .72, depthWrite: false }),
    );
    stateRing.rotation.x = Math.PI / 2;
    group.add(stateRing);

    const selectionRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.82, Math.max(.8, radius * .055), 8, 44),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .78, depthWrite: false }),
    );
    selectionRing.rotation.x = Math.PI / 2;
    selectionRing.visible = id === selectedId;
    group.add(selectionRing);

    const label = createLabelSprite(node.name, DOMAIN_COLOR[node.domain], node.entityType === 'hub');
    label.position.set(0, radius + (node.entityType === 'hub' ? 28 : 20), 0);
    group.add(label);

    group.userData.sphere = sphere;
    group.userData.selectionRing = selectionRing;
    content.add(group);
    runtime.nodeGroups.set(id, group);
  }

  applyThreeSelection(runtime, selectedId);
}

function hitThreeNode(runtime: ThreeRuntime, event: PointerEvent): string | null {
  const rect = runtime.renderer.domElement.getBoundingClientRect();
  runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
  const hit = runtime.raycaster.intersectObjects(runtime.interactive, false)[0];
  return (hit?.object?.userData?.nodeId as string | undefined) || null;
}

function MetroThreeView({
  model,
  expanded,
  selectedId,
  showBeams,
  fitNonce,
  onActivate,
}: Omit<Props, 'viewMode' | 'onReady'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ThreeRuntime | null>(null);
  const modelRef = useRef(model);
  const expandedRef = useRef(expanded);
  const selectedRef = useRef(selectedId);
  const activateRef = useRef(onActivate);
  const lastFitNonce = useRef(-1);

  modelRef.current = model;
  expandedRef.current = expanded;
  selectedRef.current = selectedId;
  activateRef.current = onActivate;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b14, .00075);
    const camera = new THREE.PerspectiveCamera(46, 1, 1, 5000);
    camera.position.set(520, 360, 780);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x070b14, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.rotateSpeed = .72;
    controls.panSpeed = .82;
    controls.zoomSpeed = .85;
    controls.zoomToCursor = true;
    controls.minDistance = 95;
    controls.maxDistance = 2400;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

    scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x111827, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(400, 650, 500);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ee7ff, .7);
    rim.position.set(-520, -180, -360);
    scene.add(rim);

    const runtime: ThreeRuntime = {
      scene, camera, renderer, controls,
      content: null,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      interactive: [],
      nodeGroups: new Map(),
      worldPositions: new Map(),
      hoveredId: null,
      pointerDown: null,
      frame: 0,
      hasFit: false,
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();

    const observer = new ResizeObserver(() => {
      resize();
      rebuildThree(runtime, container, modelRef.current, expandedRef.current, selectedRef.current, showBeams);
    });
    observer.observe(container);

    const tooltip = tooltipRef.current;
    renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

    const onPointerDown = (event: PointerEvent) => {
      runtime.pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
    };
    const onPointerMove = (event: PointerEvent) => {
      const id = hitThreeNode(runtime, event);
      runtime.hoveredId = id;
      applyThreeSelection(runtime, selectedRef.current);
      if (!tooltip) return;
      if (!id) {
        tooltip.style.display = 'none';
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      tooltip.innerHTML = tooltipHtml(modelRef.current.nodeMap.get(id), expandedRef.current);
      tooltip.style.display = 'block';
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left}px`;
      tooltip.style.top = `${event.clientY - rect.top}px`;
      renderer.domElement.style.cursor = 'pointer';
    };
    const onPointerLeave = () => {
      runtime.hoveredId = null;
      applyThreeSelection(runtime, selectedRef.current);
      if (tooltip) tooltip.style.display = 'none';
    };
    const onPointerUp = (event: PointerEvent) => {
      const down = runtime.pointerDown;
      runtime.pointerDown = null;
      if (!down || down.button !== 0 || event.button !== 0) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
      const id = hitThreeNode(runtime, event);
      if (id && modelRef.current.nodeMap.has(id)) activateRef.current(id);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const animate = () => {
      runtime.frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(runtime.frame);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      if (runtime.content) disposeThreeObject(runtime.content);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  const expansionKey = useMemo(() => [...expanded].sort().join('|'), [expanded]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const container = containerRef.current;
    if (!runtime || !container) return;
    rebuildThree(runtime, container, model, expanded, selectedId, showBeams);
    if (!runtime.hasFit || lastFitNonce.current !== fitNonce) {
      runtime.hasFit = true;
      lastFitNonce.current = fitNonce;
      fitThree(runtime, runtime.hasFit);
    }
  }, [model.revision, expansionKey, showBeams, fitNonce]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime) applyThreeSelection(runtime, selectedId);
  }, [selectedId]);

  return (
    <div ref={containerRef} className="atlas-three-surface" data-testid="atlas-metro-3d">
      <div ref={tooltipRef} className="atlas-three-tooltip" />
    </div>
  );
}

export function MetroAtlasRenderer(props: Props) {
  return (
    <div className="atlas-renderer" data-mode={props.viewMode}>
      <div className={`atlas-render-layer ${props.viewMode === '2d' ? 'active' : 'inactive'}`} aria-hidden={props.viewMode !== '2d'}>
        <Metro2DView {...props} />
      </div>
      <div className={`atlas-render-layer ${props.viewMode === '3d' ? 'active' : 'inactive'}`} aria-hidden={props.viewMode !== '3d'}>
        <MetroThreeView {...props} />
      </div>
    </div>
  );
}
