import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { Scene } from '@babylonjs/core/scene';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { graphBounds3D } from '../viewmodels/graph3d.ts';
import '../styles/atlas3d.css';

const DOMAIN_COLOR: Record<string, string> = {
  NEXO: '#79f2d0', SCIENCE: '#44a8ff', ENGINEERING: '#71dfa0', OLYMPUS: '#bd8cff', ARTIFACT: '#f2b654',
};
const ALERT_COLOR = '#ff6b72';
const PRIORITY: Record<string, number> = {
  DOMAIN: 100, PROVIDER: 84, CAPABILITY: 64, ACTION: 56, CLAIM: 54, TEST: 46,
  PROJECTION: 42, FILAMENT: 40, MEMORY: 38, EFFECT: 36, SIDE_QUEST: 34,
};
type Runtime = { reset: () => void; focus: (id: string | null, center?: boolean) => void };

function colorFor(node: PlacedNode3D): Color3 { return Color3.FromHexString(DOMAIN_COLOR[node.domain] ?? '#8fb2d0'); }
function edgeColor(edge: GraphEdge): Color3 {
  if (edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS') return Color3.FromHexString(ALERT_COLOR);
  if (edge.is_learning) return Color3.FromHexString(edge.learning_scope === 'INTER_DOMAIN' ? '#bd8cff' : '#44d9ff');
  return Color3.FromHexString('#537b9e');
}
function radiusFor(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 2.9 : 2.35;
  if (node.type === 'PROVIDER') return 1.45;
  if (node.type === 'CAPABILITY') return 1.05;
  if (node.type === 'MEMORY' || node.type === 'FILAMENT') return .92;
  return .78;
}
function labelFor(node: PlacedNode3D): string {
  return node.label.length > 42 ? `${node.label.slice(0, 41)}…` : node.label;
}

/** Babylon WebGL graph: deterministic force relaxation, PBR-like spheres and a restrained bloom pass. */
export function AtlasWebGL3D({
  nodes, edges, selectedId, onSelect,
}: { nodes: PlacedNode3D[]; edges: GraphEdge[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState('');
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const labelsHost = labelsRef.current;
    if (!host || !canvas || !labelsHost || !nodes.length) return undefined;
    let engine: Engine;
    try { engine = new Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: false }); }
    catch { setFailed('WebGL indisponível neste navegador.'); return undefined; }
    const scene = new Scene(engine);
    scene.clearColor = new Color4(.011, .067, .122, 1);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    const bounds = graphBounds3D(nodes);
    const target = new Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    const camera = new ArcRotateCamera('atlas-camera', -Math.PI / 2, 1.14, Math.max(105, bounds.radius * 2.65), target, scene);
    camera.lowerBetaLimit = .16; camera.upperBetaLimit = Math.PI - .16;
    camera.wheelDeltaPercentage = .035; camera.pinchDeltaPercentage = .035; camera.panningSensibility = 190;
    camera.attachControl(canvas, true);
    const hemisphere = new HemisphericLight('atlas-hemisphere', new Vector3(0, 1, 0), scene);
    hemisphere.intensity = .22; hemisphere.diffuse = new Color3(.47, .67, .9); hemisphere.groundColor = new Color3(.01, .03, .06);
    const keyLight = new PointLight('atlas-key', new Vector3(-34, 42, -28), scene);
    keyLight.intensity = 1.1; keyLight.diffuse = new Color3(.73, .88, 1);
    const pipeline = new DefaultRenderingPipeline('atlas-post', true, scene, [camera]);
    pipeline.bloomEnabled = true; pipeline.bloomThreshold = .84; pipeline.bloomWeight = .13; pipeline.bloomKernel = 28; pipeline.fxaaEnabled = true;

    const meshById = new Map<string, import('@babylonjs/core/Meshes/mesh').Mesh>();
    const materialByColor = new Map<string, StandardMaterial>();
    const materialFor = (color: Color3) => {
      const key = color.toHexString(); const existing = materialByColor.get(key); if (existing) return existing;
      const material = new StandardMaterial(`atlas-material-${key.slice(1)}`, scene);
      material.diffuseColor = color.scale(.68); material.emissiveColor = color.scale(.34);
      material.specularColor = new Color3(.12, .16, .2); material.roughness = .22;
      materialByColor.set(key, material); return material;
    };
    for (const node of nodes) {
      const mesh = MeshBuilder.CreateSphere(`atlas-node-${node.id}`, { segments: 20, diameter: radiusFor(node) * 2 }, scene);
      mesh.position = new Vector3(node.x, node.y, node.z); mesh.material = materialFor(colorFor(node));
      mesh.isPickable = true; mesh.metadata = { nodeId: node.id }; meshById.set(node.id, mesh);
      if (node.type === 'DOMAIN' || node.id === selectedRef.current) {
        const ring = MeshBuilder.CreateTorus(`atlas-ring-${node.id}`, { diameter: radiusFor(node) * 2.65, thickness: .08, tessellation: 28 }, scene);
        ring.position.copyFrom(mesh.position); ring.rotation.x = Math.PI / 2; ring.material = materialFor(colorFor(node)); ring.isPickable = false;
      }
      if (node.state === 'BLOCKED' || node.state === 'CONFLICT') {
        const alertRing = MeshBuilder.CreateTorus(`atlas-alert-${node.id}`, { diameter: radiusFor(node) * 3.05, thickness: .055, tessellation: 24 }, scene);
        alertRing.position.copyFrom(mesh.position); alertRing.material = materialFor(Color3.FromHexString(ALERT_COLOR)); alertRing.isPickable = false;
      }
    }
    for (const edge of edges) {
      const from = meshById.get(edge.from), to = meshById.get(edge.to); if (!from || !to) continue;
      const color = edgeColor(edge); const line = MeshBuilder.CreateLines(`atlas-edge-${edge.id}`, {
        points: [from.position, to.position], colors: [new Color4(color.r, color.g, color.b, 1), new Color4(color.r, color.g, color.b, 1)],
      }, scene);
      line.color = color; line.alpha = edge.is_learning ? .48 : edge.blocked ? .12 : .2; line.isPickable = false;
    }
    const labelEntries = nodes.map(node => {
      const label = document.createElement('span'); label.className = 'atlas-webgl-label'; label.textContent = labelFor(node); label.dataset.nodeId = node.id;
      label.style.setProperty('--label-color', DOMAIN_COLOR[node.domain] ?? '#dbeeff'); labelsHost.appendChild(label); return { node, label };
    });
    const learningIds = new Set(edges.filter(edge => edge.is_learning).flatMap(edge => [edge.from, edge.to]));
    const updateLabels = () => {
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transform = scene.getTransformMatrix(); const selected = selectedRef.current;
      const visible = labelEntries.filter(item => item.node.type === 'DOMAIN' || item.node.type === 'PROVIDER' || item.node.id === selected || learningIds.has(item.node.id));
      const ranked = visible.sort((a, b) => (PRIORITY[b.node.type] ?? 30) - (PRIORITY[a.node.type] ?? 30));
      const allowed = new Set(ranked.slice(0, engine.getRenderWidth() < 720 ? 16 : 30).map(item => item.node.id));
      for (const item of labelEntries) {
        const mesh = meshById.get(item.node.id); if (!mesh || !allowed.has(item.node.id)) { item.label.hidden = true; continue; }
        const projected = Vector3.Project(mesh.position, Matrix.IdentityReadOnly, transform, viewport);
        item.label.hidden = projected.z < 0 || projected.z > 1;
        item.label.style.transform = `translate(-50%, -50%) translate(${projected.x}px, ${projected.y}px)`;
        item.label.classList.toggle('selected', item.node.id === selected);
      }
    };
    const renderObserver = scene.onBeforeRenderObservable.add(updateLabels);
    const pointerObserver = scene.onPointerObservable.add(pointerInfo => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const nodeId = pointerInfo.pickInfo?.pickedMesh?.metadata?.nodeId; if (typeof nodeId === 'string') onSelectRef.current(nodeId);
    });
    const reset = () => { camera.alpha = -Math.PI / 2; camera.beta = 1.14; camera.radius = Math.max(105, bounds.radius * 2.65); camera.setTarget(target); };
    const focus = (id: string | null, center = false) => { const mesh = id ? meshById.get(id) : undefined; if (mesh && center) camera.setTarget(mesh.position); };
    runtimeRef.current = { reset, focus };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') camera.alpha -= .16; else if (event.key === 'ArrowRight') camera.alpha += .16;
      else if (event.key === 'ArrowUp') camera.beta = Math.max(.16, camera.beta - .12); else if (event.key === 'ArrowDown') camera.beta = Math.min(Math.PI - .16, camera.beta + .12);
      else if (event.key === '+' || event.key === '=') camera.radius *= .82; else if (event.key === '-' || event.key === '_') camera.radius *= 1.18;
      else if (event.key === '0' || event.key === 'Home') reset(); else return;
      event.preventDefault();
    };
    canvas.addEventListener('keydown', keydown); engine.runRenderLoop(() => scene.render());
    const resize = () => engine.resize(); const observer = new ResizeObserver(resize); observer.observe(host); resize(); setFailed('');
    return () => {
      observer.disconnect(); canvas.removeEventListener('keydown', keydown); scene.onBeforeRenderObservable.remove(renderObserver); scene.onPointerObservable.remove(pointerObserver);
      runtimeRef.current = null; labelsHost.replaceChildren(); pipeline.dispose(); scene.dispose(); engine.dispose();
    };
  }, [nodes, edges]);

  const key = (keyName: string) => canvasRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: keyName }));
  return <div ref={hostRef} className="atlas3d-shell atlas-webgl-shell" data-testid="atlas-3d-shell" data-renderer="babylon-webgl-3d">
    <div className="atlas3d-haze" aria-hidden="true" /><canvas ref={canvasRef} className="atlas3d-canvas" data-testid="atlas-3d-canvas" tabIndex={0} role="application" aria-label="Mapa WebGL 3D navegável do NEXO. Arraste para orbitar, Shift+arraste para deslocar, pinça ou roda para zoom e toque nos nós para inspecionar." />
    <div ref={labelsRef} className="atlas-webgl-labels" aria-hidden="true" />
    <div className="atlas3d-tooltip" data-visible="false" aria-hidden="true" />
    <div className="atlas3d-mobile-nav" aria-label="Navegação tátil do mapa 3D"><button type="button" aria-label="Girar mapa para a esquerda" onClick={() => key('ArrowLeft')}>←</button><button type="button" aria-label="Inclinar mapa para cima" onClick={() => key('ArrowUp')}>↑</button><button type="button" aria-label="Inclinar mapa para baixo" onClick={() => key('ArrowDown')}>↓</button><button type="button" aria-label="Girar mapa para a direita" onClick={() => key('ArrowRight')}>→</button><button type="button" aria-label="Aproximar mapa" onClick={() => key('+')}>＋</button><button type="button" aria-label="Afastar mapa" onClick={() => key('-')}>−</button></div>
    <div className="atlas3d-controls" aria-label="Controles do mapa 3D"><button type="button" onClick={() => runtimeRef.current?.reset()} title="Restaurar visão geral">Visão geral</button><button type="button" disabled={!selectedId} onClick={() => runtimeRef.current?.focus(selectedId, true)} title="Centralizar seleção">Focar</button><span>arraste · pinça · toque no nó</span></div>
    {failed && <div className="atlas3d-fallback" role="alert">Renderização WebGL 3D indisponível: {failed}</div>}
    <div className="atlas3d-a11y-list" aria-label="Entidades do mapa 3D">{nodes.map(node => <button type="button" key={node.id} onClick={() => onSelect(node.id)}>{node.label}</button>)}</div><span className="atlas3d-depth" aria-hidden="true">3D</span>{selectedId && byId.has(selectedId) && <span className="atlas3d-selection" aria-live="polite">Foco: {byId.get(selectedId)?.label}</span>}
  </div>;
}
