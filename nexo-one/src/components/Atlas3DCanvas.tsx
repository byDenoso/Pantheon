import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D, Point3 } from '../viewmodels/graph3d.ts';
import { graphBounds3D } from '../viewmodels/graph3d.ts';
import '../styles/atlas3d.css';

const DOMAIN_COLOR = {
  NEXO: '#79f2d0',
  SCIENCE: '#44a8ff',
  ENGINEERING: '#71dfa0',
  OLYMPUS: '#bd8cff',
  ARTIFACT: '#f2b654',
} as const;

const ALERT_STATES = new Set(['BLOCKED', 'CONFLICT', 'MISSING_PROVIDER']);
const WARNING_STATES = new Set(['DEGRADED', 'STALE', 'STALE_DECLARATION', 'UNVERIFIED', 'UNKNOWN']);

type Runtime = {
  scene: Scene;
  camera: ArcRotateCamera;
  meshes: Map<string, Mesh>;
  edgeMeshes: Map<string, Mesh>;
  nodes: Map<string, PlacedNode3D>;
  edges: GraphEdge[];
  reset: () => void;
  focus: (id: string | null, fly?: boolean) => void;
};

function nodeColor(node: PlacedNode3D): Color3 {
  if (ALERT_STATES.has(node.state)) return Color3.FromHexString('#ff6b72');
  if (WARNING_STATES.has(node.state)) return Color3.FromHexString('#f2b654');
  return Color3.FromHexString(DOMAIN_COLOR[node.domain]);
}

function point(node: Point3): Vector3 {
  return new Vector3(node.x, node.y, node.z);
}

function neighboursOf(id: string | null, edges: GraphEdge[]): Set<string> {
  if (!id) return new Set();
  const set = new Set<string>([id]);
  for (const edge of edges) {
    if (edge.from === id) set.add(edge.to);
    if (edge.to === id) set.add(edge.from);
  }
  return set;
}

function makeLabel(scene: Scene, node: PlacedNode3D): Mesh {
  const width = Math.min(8, Math.max(3.8, node.label.length * 0.25));
  const plane = MeshBuilder.CreatePlane(`label:${node.id}`, { width, height: 1.15 }, scene);
  const texture = new DynamicTexture(`label-texture:${node.id}`, { width: 768, height: 160 }, scene, true);
  texture.hasAlpha = true;
  texture.drawText(
    node.label.length > 32 ? `${node.label.slice(0, 31)}…` : node.label,
    null,
    105,
    '600 44px Inter, Arial, sans-serif',
    '#edf8ff',
    'transparent',
    true,
    true,
  );
  const material = new StandardMaterial(`label-material:${node.id}`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.position = new Vector3(node.x, node.y + node.radius + 1.1, node.z);
  plane.isPickable = false;
  return plane;
}

function addOrbit(scene: Scene, radius: number, tilt: number, color: Color3): void {
  const points: Vector3[] = [];
  for (let i = 0; i <= 128; i += 1) {
    const angle = (i / 128) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z0 = Math.sin(angle) * radius;
    points.push(new Vector3(x, z0 * Math.sin(tilt), z0 * Math.cos(tilt)));
  }
  const ring = MeshBuilder.CreateLines(`orbit:${radius}:${tilt}`, { points }, scene);
  ring.color = color;
  ring.alpha = 0.12;
  ring.isPickable = false;
}

function flyCamera(scene: Scene, camera: ArcRotateCamera, target: Vector3, radius: number, immediate = false): void {
  if (immediate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    camera.setTarget(target);
    camera.radius = radius;
    return;
  }
  const startTarget = camera.target.clone();
  const startRadius = camera.radius;
  const started = performance.now();
  const duration = 520;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const raw = Math.min(1, (performance.now() - started) / duration);
    const eased = 1 - Math.pow(1 - raw, 3);
    camera.setTarget(Vector3.Lerp(startTarget, target, eased));
    camera.radius = startRadius + (radius - startRadius) * eased;
    if (raw >= 1) scene.onBeforeRenderObservable.remove(observer);
  });
}

export function Atlas3DCanvas(
  { nodes, edges, selectedId, onSelect }:
  { nodes: PlacedNode3D[]; edges: GraphEdge[]; selectedId: string | null; onSelect: (id: string) => void },
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState('');
  onSelectRef.current = onSelect;

  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  const orbit = (delta: number) => {
    const camera = runtimeRef.current?.camera;
    if (camera) camera.alpha += delta;
  };
  const tilt = (delta: number) => {
    const camera = runtimeRef.current?.camera;
    if (!camera) return;
    camera.beta = Math.max(0.22, Math.min(Math.PI - 0.22, camera.beta + delta));
  };
  const zoom = (factor: number) => {
    const camera = runtimeRef.current?.camera;
    if (!camera) return;
    const lower = camera.lowerRadiusLimit ?? 4;
    const upper = camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
    camera.radius = Math.max(lower, Math.min(upper, camera.radius * factor));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return undefined;
    setFailed('');
    let engine: Engine | null = null;
    let scene: Scene | null = null;
    let resize: (() => void) | null = null;

    try {
      engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true);
      scene = new Scene(engine);
      scene.clearColor = new Color4(0, 0, 0, 0);
      scene.skipPointerMovePicking = false;

      const bounds = graphBounds3D(nodes);
      const center = point(bounds.center);
      const camera = new ArcRotateCamera('atlas-camera', -Math.PI / 2.3, Math.PI / 2.55, bounds.radius * 2.25, center, scene);
      camera.attachControl(canvas, false);
      camera.lowerRadiusLimit = 4;
      camera.upperRadiusLimit = Math.max(80, bounds.radius * 5);
      camera.wheelPrecision = 22;
      camera.pinchPrecision = 120;
      camera.panningSensibility = 95;
      camera.inertia = 0.72;

      const light = new HemisphericLight('atlas-light', new Vector3(0.2, 1, 0.15), scene);
      light.intensity = 0.82;
      const glow = new GlowLayer('atlas-glow', scene, { blurKernelSize: 48 });
      glow.intensity = 0.58;

      const neutral = Color3.FromHexString('#6e8eb5');
      addOrbit(scene, 17.5, 0.08, neutral);
      addOrbit(scene, 18.8, 0.72, neutral);
      addOrbit(scene, 20.3, -0.62, neutral);

      const meshes = new Map<string, Mesh>();
      const labels = new Map<string, Mesh>();
      const nodeMap = new Map(nodes.map(node => [node.id, node]));

      for (const node of nodes) {
        const segments = node.type === 'DOMAIN' ? 32 : node.type === 'PROVIDER' ? 20 : 14;
        const sphere = MeshBuilder.CreateSphere(`node:${node.id}`, { diameter: node.radius * 2, segments }, scene);
        sphere.position = point(node);
        sphere.metadata = { nodeId: node.id };
        sphere.isPickable = true;

        const color = nodeColor(node);
        const material = new StandardMaterial(`material:${node.id}`, scene);
        material.diffuseColor = color.scale(node.type === 'DOMAIN' ? 0.42 : 0.26);
        material.emissiveColor = color.scale(node.type === 'DOMAIN' ? 0.8 : 0.58);
        material.specularColor = color.scale(0.72);
        material.alpha = node.type === 'DOMAIN' ? 1 : 0.94;
        sphere.material = material;
        meshes.set(node.id, sphere);

        if (node.type === 'DOMAIN' || node.type === 'PROVIDER') labels.set(node.id, makeLabel(scene, node));
      }

      const edgeMeshes = new Map<string, Mesh>();
      for (const edge of edges) {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) continue;
        const line = MeshBuilder.CreateLines(`edge:${edge.id}`, { points: [point(from), point(to)] }, scene);
        const critical = edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS';
        line.color = critical ? Color3.FromHexString('#ff746f') : Color3.FromHexString('#57718f');
        line.alpha = critical ? 0.62 : Math.min(0.42, 0.13 + edge.weight * 0.24);
        line.isPickable = false;
        edgeMeshes.set(edge.id, line);
      }

      let transientLabel: Mesh | null = null;
      const initialTarget = center.clone();
      const initialRadius = camera.radius;

      const focus = (id: string | null, fly = false) => {
        const neighbours = neighboursOf(id, edges);
        for (const [nodeId, mesh] of meshes) {
          const related = !id || neighbours.has(nodeId);
          mesh.visibility = related ? 1 : 0.16;
          mesh.scaling.setAll(nodeId === id ? 1.38 : 1);
          mesh.renderOutline = nodeId === id;
          if (nodeId === id) {
            mesh.outlineColor = Color3.FromHexString('#f4fbff');
            mesh.outlineWidth = 0.08;
          }
        }
        for (const [edgeId, mesh] of edgeMeshes) {
          const edge = edges.find(item => item.id === edgeId);
          if (!edge) continue;
          const related = !id || (neighbours.has(edge.from) && neighbours.has(edge.to));
          mesh.visibility = related ? 1 : 0.08;
        }
        for (const [nodeId, labelMesh] of labels) labelMesh.visibility = !id || neighbours.has(nodeId) ? 1 : 0.12;

        if (transientLabel) { transientLabel.dispose(false, true); transientLabel = null; }
        const selected = id ? nodeMap.get(id) : null;
        if (selected && selected.type !== 'DOMAIN' && selected.type !== 'PROVIDER') transientLabel = makeLabel(scene!, selected);
        if (fly && selected) flyCamera(scene!, camera, point(selected), selected.type === 'DOMAIN' ? 13 : 9);
      };

      const reset = () => flyCamera(scene!, camera, initialTarget, initialRadius);
      runtimeRef.current = { scene, camera, meshes, edgeMeshes, nodes: nodeMap, edges, reset, focus };

      scene.onPointerObservable.add(info => {
        const picked = info.pickInfo?.pickedMesh;
        const nodeId = picked?.metadata?.nodeId as string | undefined;
        if (info.type === PointerEventTypes.POINTERMOVE) {
          canvas.style.cursor = nodeId ? 'pointer' : 'grab';
          const tooltip = tooltipRef.current;
          if (tooltip) {
            if (nodeId) {
              const node = nodeMap.get(nodeId);
              const event = info.event as PointerEvent;
              const rect = canvas.getBoundingClientRect();
              tooltip.textContent = node?.label ?? nodeId;
              tooltip.style.transform = `translate(${event.clientX - rect.left + 14}px, ${event.clientY - rect.top + 14}px)`;
              tooltip.dataset.visible = 'true';
            } else {
              tooltip.dataset.visible = 'false';
            }
          }
        }
        if (info.type === PointerEventTypes.POINTERPICK && nodeId) onSelectRef.current(nodeId);
        if (info.type === PointerEventTypes.POINTERDOUBLETAP && nodeId) {
          const node = nodeMap.get(nodeId);
          if (node) flyCamera(scene!, camera, point(node), node.type === 'DOMAIN' ? 13 : 8);
        }
      });

      engine.runRenderLoop(() => scene?.render());
      resize = () => engine?.resize();
      window.addEventListener('resize', resize);
      focus(selectedId, false);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'WebGL indisponível.');
    }

    return () => {
      if (resize) window.removeEventListener('resize', resize);
      runtimeRef.current = null;
      scene?.dispose();
      engine?.dispose();
    };
  }, [nodes, edges]);

  useEffect(() => {
    runtimeRef.current?.focus(selectedId, !!selectedId);
  }, [selectedId]);

  return (
    <div className="atlas3d-shell" data-testid="atlas-3d-shell">
      <div className="atlas3d-haze" aria-hidden="true" />
      <canvas ref={canvasRef} className="atlas3d-canvas" data-testid="atlas-3d-canvas"
        aria-label="Mapa 3D navegável do NEXO. Arraste para orbitar, faça pinça para zoom ou use os controles de navegação e selecione nós para inspecionar." />
      <div ref={tooltipRef} className="atlas3d-tooltip" data-visible="false" aria-hidden="true" />
      <div className="atlas3d-mobile-nav" aria-label="Navegação tátil do mapa 3D">
        <button type="button" aria-label="Girar mapa para a esquerda" onClick={() => orbit(-0.22)}>←</button>
        <button type="button" aria-label="Inclinar mapa para cima" onClick={() => tilt(-0.16)}>↑</button>
        <button type="button" aria-label="Inclinar mapa para baixo" onClick={() => tilt(0.16)}>↓</button>
        <button type="button" aria-label="Girar mapa para a direita" onClick={() => orbit(0.22)}>→</button>
        <button type="button" aria-label="Aproximar mapa" onClick={() => zoom(0.82)}>＋</button>
        <button type="button" aria-label="Afastar mapa" onClick={() => zoom(1.22)}>−</button>
      </div>
      <div className="atlas3d-controls" aria-label="Controles do mapa 3D">
        <button type="button" onClick={() => runtimeRef.current?.reset()} title="Restaurar visão geral">Visão geral</button>
        <button type="button" disabled={!selectedId} onClick={() => runtimeRef.current?.focus(selectedId, true)} title="Centralizar seleção">Focar</button>
        <span>arraste · pinça · toque no nó</span>
      </div>
      {failed && <div className="atlas3d-fallback" role="alert">Renderização 3D indisponível: {failed}</div>}
      <div className="atlas3d-a11y-list" aria-label="Entidades do mapa 3D">
        {nodes.map(node => <button type="button" key={node.id} onClick={() => onSelect(node.id)}>{node.label}</button>)}
      </div>
      <span className="atlas3d-depth" aria-hidden="true">3D</span>
      {selectedId && byId.has(selectedId) && <span className="atlas3d-selection" aria-live="polite">Foco: {byId.get(selectedId)?.label}</span>}
    </div>
  );
}
