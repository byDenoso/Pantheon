import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
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
type EdgeCurve = { edge: GraphEdge; points: Vector3[]; control: Vector3; color: Color3; line: import('@babylonjs/core/Meshes/mesh').Mesh; fibers: import('@babylonjs/core/Meshes/mesh').Mesh[]; core: import('@babylonjs/core/Meshes/mesh').Mesh };
type NeuralPulse = { mesh: import('@babylonjs/core/Meshes/mesh').Mesh; curve: EdgeCurve; u: number; speed: number };

function colorFor(node: PlacedNode3D): Color3 { return Color3.FromHexString(DOMAIN_COLOR[node.domain] ?? '#8fb2d0'); }
function edgeColor(edge: GraphEdge): Color3 {
  if (edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS') return Color3.FromHexString(ALERT_COLOR);
  if (edge.is_learning) return Color3.FromHexString(edge.learning_scope === 'INTER_DOMAIN' ? '#f4c468' : '#d99a4f');
  if (edge.kind === 'SUPPORTS') return Color3.FromHexString('#51d7ef');
  return Color3.FromHexString('#3a8fd0');
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

function starValue(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function curveFor(from: Vector3, to: Vector3, edge: GraphEdge): { points: Vector3[]; control: Vector3 } {
  // Quadratic Bézier axon: the perpendicular control point keeps relations organic.
  const delta = to.subtract(from);
  const length = Math.max(1, delta.length());
  let normal = Vector3.Cross(delta, new Vector3(0, 1, 0));
  if (normal.lengthSquared() < 0.001) normal = Vector3.Cross(delta, new Vector3(1, 0, 0));
  normal.normalize();
  const bend = Math.min(18, length * (edge.is_learning ? .2 : .13));
  const control = from.add(to).scale(.5).add(normal.scale(bend));
  const points = Array.from({ length: 12 }, (_, index) => {
    const u = index / 11;
    return from.scale((1 - u) * (1 - u)).add(control.scale(2 * (1 - u) * u)).add(to.scale(u * u));
  });
  return { points, control };
}

function curvePoint(curve: EdgeCurve, u: number): Vector3 {
  const from = curve.points[0];
  const to = curve.points[curve.points.length - 1];
  const clamped = Math.max(0, Math.min(1, u));
  return from.scale((1 - clamped) * (1 - clamped))
    .add(curve.control.scale(2 * (1 - clamped) * clamped))
    .add(to.scale(clamped * clamped));
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
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    // Keep the desktop world generously spaced, then fit that same semantic
    // graph into a portrait viewport without changing backend topology.
    const worldScale = mobile ? .52 : 1;
    const nodeScale = mobile ? 1.22 : 1;
    const renderNodes = nodes.map(node => ({
      ...node,
      x: node.x * worldScale,
      y: node.y * worldScale,
      z: node.z * worldScale,
    }));
    let engine: Engine;
    try { engine = new Engine(canvas, true, { antialias: true, stencil: true, preserveDrawingBuffer: false }); }
    catch { setFailed('WebGL indisponível neste navegador.'); return undefined; }
    const scene = new Scene(engine);
    scene.clearColor = new Color4(.003, .018, .03, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = mobile ? .0011 : .0018;
    scene.fogColor = new Color3(.003, .018, .03);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    const bounds = graphBounds3D(renderNodes);
    const target = new Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    const cameraDistance = Math.max(mobile ? 118 : 132, bounds.radius * (mobile ? 1.92 : 2.15));
    const camera = new ArcRotateCamera('atlas-camera', -Math.PI / 2, 1.14, cameraDistance, target, scene);
    camera.fov = mobile ? .72 : .8;
    camera.lowerBetaLimit = .16; camera.upperBetaLimit = Math.PI - .16;
    camera.wheelDeltaPercentage = .035; camera.pinchDeltaPercentage = .035; camera.panningSensibility = 190;
    camera.attachControl(canvas, true);
    const hemisphere = new HemisphericLight('atlas-hemisphere', new Vector3(0, 1, 0), scene);
    hemisphere.intensity = .22; hemisphere.diffuse = new Color3(.47, .67, .9); hemisphere.groundColor = new Color3(.01, .03, .06);
    const keyLight = new PointLight('atlas-key', new Vector3(-34, 42, -28), scene);
    keyLight.intensity = 1.1; keyLight.diffuse = new Color3(.73, .88, 1);
    const pipeline = new DefaultRenderingPipeline('atlas-post', true, scene, [camera]);
    pipeline.bloomEnabled = true; pipeline.bloomThreshold = .92; pipeline.bloomWeight = .16; pipeline.bloomKernel = 24; pipeline.fxaaEnabled = true;
    if (!mobile) {
      pipeline.depthOfFieldEnabled = true;
      pipeline.depthOfField.focusDistance = cameraDistance * .62;
      pipeline.depthOfField.fStop = 3.6;
      pipeline.depthOfField.lensSize = 42;
    }

    const meshById = new Map<string, import('@babylonjs/core/Meshes/mesh').Mesh>();
    const materialByColor = new Map<string, StandardMaterial>();
    const materialFor = (color: Color3) => {
      const key = color.toHexString(); const existing = materialByColor.get(key); if (existing) return existing;
      const material = new StandardMaterial(`atlas-material-${key.slice(1)}`, scene);
      material.diffuseColor = color.scale(.48); material.emissiveColor = color.scale(.28);
      material.specularColor = new Color3(.38, .48, .58); material.specularPower = 72; material.roughness = .18;
      materialByColor.set(key, material); return material;
    };
    const translucentMaterialByKey = new Map<string, StandardMaterial>();
    const translucentMaterialFor = (color: Color3, alpha: number) => {
      const key = `${color.toHexString()}-${alpha.toFixed(3)}`; const existing = translucentMaterialByKey.get(key); if (existing) return existing;
      const material = new StandardMaterial(`atlas-translucent-${key.replace('#', '').replace('.', '_')}`, scene);
      material.diffuseColor = color.scale(.35); material.emissiveColor = color.scale(.8); material.alpha = alpha;
      material.specularColor = color; material.specularPower = 64; material.backFaceCulling = false;
      translucentMaterialByKey.set(key, material); return material;
    };
    const nucleusMaterialByColor = new Map<string, PBRMaterial>();
    const nucleusMaterialFor = (color: Color3) => {
      const key = color.toHexString(); const existing = nucleusMaterialByColor.get(key); if (existing) return existing;
      const material = new PBRMaterial(`atlas-nucleus-${key.slice(1)}`, scene);
      material.albedoColor = color.scale(.42); material.metallic = .34; material.roughness = .2;
      material.emissiveColor = color.scale(.5); material.emissiveIntensity = .7; material.environmentIntensity = .3;
      nucleusMaterialByColor.set(key, material); return material;
    };
    const starMaterial = new StandardMaterial('atlas-star-material', scene);
    starMaterial.diffuseColor = new Color3(.13, .36, .54);
    starMaterial.emissiveColor = new Color3(.12, .38, .68);
    starMaterial.alpha = .52;
    const starMeshes: import('@babylonjs/core/Meshes/mesh').Mesh[] = [];
    const starSpread = Math.max(110, bounds.radius * 2.8);
    for (let index = 0; index < 150; index += 1) {
      const star = MeshBuilder.CreateSphere(`atlas-star-${index}`, {
        segments: 6, diameter: .06 + starValue(index, 4) * .18,
      }, scene);
      star.position = new Vector3(
        bounds.center.x + (starValue(index, 1) - .5) * starSpread,
        bounds.center.y + (starValue(index, 2) - .5) * starSpread,
        bounds.center.z + (starValue(index, 3) - .5) * starSpread,
      );
      star.material = starMaterial; star.isPickable = false; starMeshes.push(star);
    }
    for (const node of renderNodes) {
      const nodeColor = colorFor(node);
      const mesh = MeshBuilder.CreateSphere(`atlas-node-${node.id}`, { segments: 20, diameter: radiusFor(node) * 2 * nodeScale }, scene);
      mesh.position = new Vector3(node.x, node.y, node.z); mesh.material = node.type === 'DOMAIN' ? nucleusMaterialFor(nodeColor) : materialFor(nodeColor);
      mesh.isPickable = true; mesh.metadata = { nodeId: node.id }; meshById.set(node.id, mesh);
      if (node.type === 'DOMAIN' || node.id === selectedRef.current) {
        const ring = MeshBuilder.CreateTorus(`atlas-ring-${node.id}`, { diameter: radiusFor(node) * 2.65 * nodeScale, thickness: .08 * nodeScale, tessellation: 28 }, scene);
        ring.position.copyFrom(mesh.position); ring.rotation.x = Math.PI / 2; ring.material = materialFor(nodeColor); ring.isPickable = false;
        if (node.type === 'DOMAIN') {
          const halo = MeshBuilder.CreateSphere(`atlas-halo-${node.id}`, { segments: 16, diameter: radiusFor(node) * 3.6 * nodeScale }, scene);
          halo.position.copyFrom(mesh.position); halo.material = translucentMaterialFor(nodeColor, .07); halo.isPickable = false;
        }
      }
      if (node.state === 'BLOCKED' || node.state === 'CONFLICT') {
        const alertRing = MeshBuilder.CreateTorus(`atlas-alert-${node.id}`, { diameter: radiusFor(node) * 3.05 * nodeScale, thickness: .055 * nodeScale, tessellation: 24 }, scene);
        alertRing.position.copyFrom(mesh.position); alertRing.material = materialFor(Color3.FromHexString(ALERT_COLOR)); alertRing.isPickable = false;
      }
    }
    const edgeCurves: EdgeCurve[] = [];
    for (const edge of edges) {
      const from = meshById.get(edge.from), to = meshById.get(edge.to); if (!from || !to) continue;
      const color = edgeColor(edge); const geometry = curveFor(from.position, to.position, edge);
      const line = MeshBuilder.CreateLines(`atlas-edge-${edge.id}`, {
        points: geometry.points, colors: geometry.points.map(() => new Color4(color.r, color.g, color.b, 1)),
      }, scene);
      const strength = Math.max(0, Math.min(1, Number(edge.weight ?? 0)));
      const fiberCount = Math.max(3, Math.min(7, 3 + Math.round(strength * 4)));
      const delta = to.position.subtract(from.position).normalize();
      let normal = Vector3.Cross(delta, new Vector3(0, 1, 0));
      if (normal.lengthSquared() < .001) normal = Vector3.Cross(delta, new Vector3(1, 0, 0));
      normal.normalize();
      const binormal = Vector3.Cross(delta, normal).normalize();
      const fibers = Array.from({ length: fiberCount }, (_, fiberIndex) => {
        const phase = (fiberIndex - (fiberCount - 1) / 2) / Math.max(1, fiberCount - 1);
        const path = geometry.points.map((point, pointIndex) => point
          .add(normal.scale(phase * (.12 + strength * .18)))
          .add(binormal.scale(Math.sin(pointIndex * .75 + fiberIndex) * (.05 + strength * .08))));
        const fiber = MeshBuilder.CreateLines(`atlas-fiber-${edge.id}-${fiberIndex}`, { points: path }, scene);
        fiber.color = color; fiber.alpha = edge.blocked ? .08 : (edge.is_learning ? .34 + strength * .2 : .16 + strength * .24); fiber.isPickable = false;
        return fiber;
      });
      const core = MeshBuilder.CreateTube(`atlas-axon-${edge.id}`, { path: geometry.points, radius: .018 + strength * .055, tessellation: 5, cap: 0 }, scene);
      core.material = translucentMaterialFor(color, edge.blocked ? .08 : (edge.is_learning ? .25 + strength * .16 : .12 + strength * .14)); core.isPickable = false;
      line.color = color; line.alpha = edge.is_learning ? .18 + strength * .14 : edge.blocked ? .08 : .1 + strength * .1; line.isPickable = false;
      edgeCurves.push({ edge, points: geometry.points, control: geometry.control, color, line, fibers, core });
    }
    const pulseMaterialByColor = new Map<string, StandardMaterial>();
    const pulseMaterialFor = (color: Color3) => {
      const key = color.toHexString(); const existing = pulseMaterialByColor.get(key); if (existing) return existing;
      const material = new StandardMaterial(`atlas-pulse-${key.slice(1)}`, scene);
      material.diffuseColor = color; material.emissiveColor = color.scale(.9); material.specularColor = color;
      pulseMaterialByColor.set(key, material); return material;
    };
    const activeCurves = edgeCurves.filter(({ edge }) => edge.is_learning || edge.kind === 'BLOCKS' || edge.kind === 'SUPPORTS').slice(0, 24);
    const pulses: NeuralPulse[] = activeCurves.flatMap((curve, index) => [0, .47].map((offset, pulseIndex) => {
      const mesh = MeshBuilder.CreateSphere(`atlas-pulse-${curve.edge.id}-${pulseIndex}`, { segments: 10, diameter: mobile ? .95 : .68 }, scene);
      const u = (index * .17 + offset) % 1;
      mesh.material = pulseMaterialFor(curve.color); mesh.isPickable = false; mesh.position.copyFrom(curvePoint(curve, u));
      return { mesh, curve, u, speed: curve.edge.is_learning ? .0003 + pulseIndex * .00002 : .0002 + pulseIndex * .000015 };
    }));
    const labelEntries = renderNodes.map(node => {
      const label = document.createElement('span'); label.className = 'atlas-webgl-label'; label.textContent = labelFor(node); label.dataset.nodeId = node.id;
      label.style.setProperty('--label-color', DOMAIN_COLOR[node.domain] ?? '#dbeeff'); labelsHost.appendChild(label); return { node, label };
    });
    const pickNodeAtPointer = (): string | null => {
      const picked = scene.pick(scene.pointerX, scene.pointerY, mesh => typeof mesh.metadata?.nodeId === 'string');
      const pickedId = picked?.pickedMesh?.metadata?.nodeId;
      if (picked?.hit && typeof pickedId === 'string') return pickedId;
      // Give small satellites a forgiving touch target without changing their
      // visual radius: nearest projected node within a 22px screen envelope.
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transform = scene.getTransformMatrix();
      let nearest: { id: string; distance: number } | null = null;
      for (const node of renderNodes) {
        const mesh = meshById.get(node.id); if (!mesh) continue;
        const projected = Vector3.Project(mesh.position, Matrix.IdentityReadOnly, transform, viewport);
        const distance = Math.hypot(projected.x - scene.pointerX, projected.y - scene.pointerY);
        if (distance <= 22 && (!nearest || distance < nearest.distance)) nearest = { id: node.id, distance };
      }
      return nearest?.id ?? null;
    };
    const learningIds = new Set(edges.filter(edge => edge.is_learning).flatMap(edge => [edge.from, edge.to]));
    const updateLabels = () => {
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transform = scene.getTransformMatrix(); const selected = selectedRef.current;
      const visible = labelEntries.filter(item => item.node.type === 'DOMAIN' || item.node.type === 'PROVIDER' || item.node.id === selected || learningIds.has(item.node.id));
      const ranked = visible.sort((a, b) => (PRIORITY[b.node.type] ?? 30) - (PRIORITY[a.node.type] ?? 30));
      const labelLimit = engine.getRenderWidth() < 460 ? 12 : engine.getRenderWidth() < 720 ? 16 : 30;
      const allowed = new Set(ranked.slice(0, labelLimit).map(item => item.node.id));
      for (const item of labelEntries) {
        const mesh = meshById.get(item.node.id); if (!mesh || !allowed.has(item.node.id)) { item.label.hidden = true; continue; }
        const projected = Vector3.Project(mesh.position, Matrix.IdentityReadOnly, transform, viewport);
        item.label.hidden = projected.z < 0 || projected.z > 1;
        item.label.style.transform = `translate(-50%, -50%) translate(${projected.x}px, ${projected.y}px)`;
        item.label.classList.toggle('selected', item.node.id === selected);
      }
    };
    const renderObserver = scene.onBeforeRenderObservable.add(updateLabels);
    const pulseObserver = scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(34, engine.getDeltaTime());
      for (const pulse of pulses) {
        pulse.u = (pulse.u + delta * pulse.speed) % 1;
        pulse.mesh.position.copyFrom(curvePoint(pulse.curve, pulse.u));
      }
      const now = performance.now() * .001;
      starMeshes.forEach((star, index) => { star.visibility = .42 + .28 * (0.5 + 0.5 * Math.sin(now * (.45 + index * .013) + index)); });
    });
    const pointerObserver = scene.onPointerObservable.add(pointerInfo => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK && pointerInfo.type !== PointerEventTypes.POINTERDOWN) return;
      const nodeId = pickNodeAtPointer(); if (nodeId) onSelectRef.current(nodeId);
    });
    const reset = () => { camera.alpha = -Math.PI / 2; camera.beta = 1.14; camera.radius = cameraDistance; camera.setTarget(target); };
    const focus = (id: string | null, center = false) => { const mesh = id ? meshById.get(id) : undefined; if (mesh && center) camera.setTarget(mesh.position); };
    runtimeRef.current = { reset, focus };
    const containWheel = (event: WheelEvent) => event.preventDefault();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') camera.alpha -= .16; else if (event.key === 'ArrowRight') camera.alpha += .16;
      else if (event.key === 'ArrowUp') camera.beta = Math.max(.16, camera.beta - .12); else if (event.key === 'ArrowDown') camera.beta = Math.min(Math.PI - .16, camera.beta + .12);
      else if (event.key === '+' || event.key === '=') camera.radius *= .82; else if (event.key === '-' || event.key === '_') camera.radius *= 1.18;
      else if (event.key === '0' || event.key === 'Home') reset(); else return;
      event.preventDefault();
    };
    canvas.addEventListener('keydown', keydown); canvas.addEventListener('wheel', containWheel, { passive: false }); engine.runRenderLoop(() => scene.render());
    const resize = () => engine.resize(); const observer = new ResizeObserver(resize); observer.observe(host); resize(); setFailed('');
    return () => {
      observer.disconnect(); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('wheel', containWheel); scene.onBeforeRenderObservable.remove(renderObserver); scene.onBeforeRenderObservable.remove(pulseObserver); scene.onPointerObservable.remove(pointerObserver);
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
