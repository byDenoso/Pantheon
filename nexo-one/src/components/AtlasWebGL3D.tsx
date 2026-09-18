import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import {
  Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Color,
} from 'three';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import '../styles/atlas3d.css';

const DOMAIN_COLOR: Record<string, string> = {
  NEXO: '#79f2d0', SCIENCE: '#44a8ff', ENGINEERING: '#71dfa0', OLYMPUS: '#bd8cff', ARTIFACT: '#f2b654',
};
const ALERT_COLOR = '#ff6b72';

type GraphNodeView = PlacedNode3D & { fx: number; fy: number; fz: number };
type GraphLinkView = GraphEdge & { source: string; target: string };
type GraphRef = ForceGraphMethods<GraphNodeView, GraphLinkView>;

function isClusterNode(node: PlacedNode3D): boolean { return node.id.startsWith('atlas.cluster.'); }
function colorFor(node: PlacedNode3D): string { return DOMAIN_COLOR[node.domain] ?? '#8fb2d0'; }
function isStructuralEdge(edge: GraphEdge): boolean { return edge.id.startsWith('atlas.root.edge.') || edge.id.startsWith('atlas.cluster.edge.'); }
function linkColor(edge: GraphEdge): string {
  if (isStructuralEdge(edge)) return '#79f2d0';
  if (edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS') return ALERT_COLOR;
  if (edge.is_learning) return edge.learning_scope === 'INTER_DOMAIN' ? '#f4c468' : '#d99a4f';
  if (edge.kind === 'SUPPORTS') return '#51d7ef';
  return '#69baf2';
}
function nodeRadius(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 5.4 : 4.2;
  if (isClusterNode(node)) return 3.1;
  if (node.type === 'PROVIDER') return 2.55;
  if (node.type === 'CAPABILITY') return 2.05;
  return 1.45;
}
function nodeLabel(node: PlacedNode3D): string {
  const title = node.label.length > 52 ? `${node.label.slice(0, 51)}…` : node.label;
  return `<strong>${title}</strong><br/><small>${node.type} · ${node.domain}</small>`;
}
function strength(edge: GraphEdge): number {
  return Math.max(0.15, Math.min(1, Number(edge.weight ?? 0)));
}

function nodeObject(node: GraphNodeView, selectedId: string | null): Group {
  const color = new Color(colorFor(node));
  const radius = nodeRadius(node);
  const group = new Group();
  const material = new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: node.type === 'DOMAIN' ? 0.55 : isClusterNode(node) ? 0.32 : 0.14,
    metalness: 0.18,
    roughness: 0.24,
    transparent: true,
    opacity: node.state === 'BLOCKED' || node.state === 'CONFLICT' ? 0.82 : 1,
  });
  const sphere = new Mesh(new SphereGeometry(radius, 20, 14), material);
  group.add(sphere);

  if (node.type === 'DOMAIN' || isClusterNode(node) || node.id === selectedId) {
    const ring = new Mesh(new TorusGeometry(radius * 1.34, node.id === selectedId ? 0.16 : 0.11, 8, 40), new MeshBasicMaterial({
      color, transparent: true, opacity: node.id === selectedId ? 0.92 : 0.58,
    }));
    group.add(ring);
  }
  if (node.state === 'BLOCKED' || node.state === 'CONFLICT') {
    const alertRing = new Mesh(new TorusGeometry(radius * 1.58, 0.09, 8, 40), new MeshBasicMaterial({
      color: new Color(ALERT_COLOR), transparent: true, opacity: 0.82,
    }));
    group.add(alertRing);
  }
  return group;
}

function controlCall(graph: GraphRef | null | undefined, method: string, ...args: number[]) {
  const controls = graph?.controls() as Record<string, ((...values: number[]) => void) | undefined> | undefined;
  controls?.[method]?.(...args);
}

function fitCamera(graph: GraphRef | null | undefined, nodes: GraphNodeView[], mobile: boolean, transitionMs = 500) {
  if (!graph || !nodes.length) return;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of nodes) {
    min.x = Math.min(min.x, node.x); min.y = Math.min(min.y, node.y); min.z = Math.min(min.z, node.z);
    max.x = Math.max(max.x, node.x); max.y = Math.max(max.y, node.y); max.z = Math.max(max.z, node.z);
  }
  const target = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const radius = Math.max(1, ...nodes.map(node => Math.hypot(node.x - target.x, node.y - target.y, node.z - target.z) + nodeRadius(node)));
  const distance = Math.max(mobile ? 72 : 86, radius * (mobile ? 2.55 : 2.25));
  graph.cameraPosition({ x: target.x, y: target.y + distance * 0.08, z: target.z + distance }, target, transitionMs);
}

/** Three.js graph renderer. The Atlas projection owns topology and fixed positions; this component owns camera and WebGL interaction. */
export function AtlasWebGL3D({
  nodes, edges, selectedId, onSelect,
}: { nodes: PlacedNode3D[]; edges: GraphEdge[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphRef | undefined>(undefined);
  const previousGraphKey = useRef('');
  const labelRefs = useRef(new Map<string, HTMLSpanElement>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const graphData = useMemo(() => {
    const ids = new Set(nodes.map(node => node.id));
    const graphNodes: GraphNodeView[] = nodes.map(node => ({ ...node, fx: node.x, fy: node.y, fz: node.z }));
    const graphLinks: GraphLinkView[] = edges
      .filter(edge => ids.has(edge.from) && ids.has(edge.to))
      .map(edge => ({ ...edge, source: edge.from, target: edge.to }));
    return { nodes: graphNodes, links: graphLinks };
  }, [edges, nodes]);
  const graphNodesById = useMemo(() => new Map(graphData.nodes.map(node => [String(node.id), node])), [graphData.nodes]);
  const overlayLinks = useMemo(
    () => graphData.links.filter(link => {
      const source = graphNodesById.get(String(link.from));
      const target = graphNodesById.get(String(link.to));
      return source?.type === 'DOMAIN' && target?.type === 'DOMAIN';
    }),
    [graphData.links, graphNodesById],
  );
  const graphKey = useMemo(() => graphData.nodes.map(node => node.id).join('|'), [graphData.nodes]);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  const labelNodes = useMemo(
    () => graphData.nodes.filter(node => node.type === 'DOMAIN' || isClusterNode(node) || node.id === selectedId),
    [graphData.nodes, selectedId],
  );
  const linkMaterials = useMemo(() => new Map<string, MeshBasicMaterial>(), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setSize({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const makeNode = useCallback((node: GraphNodeView) => nodeObject(node, selectedId), [selectedId]);
  const onNodeClick = useCallback((node: GraphNodeView) => onSelect(String(node.id)), [onSelect]);
  const onBackgroundClick = useCallback(() => onSelect(null), [onSelect]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return undefined;
    graph.d3Force('link', null);
    graph.d3Force('charge', null);
    graph.d3Force('center', null);
    const timer = window.setTimeout(() => {
      if (previousGraphKey.current !== graphKey) {
        fitCamera(graph, graphData.nodes, isMobile, 550);
      } else if (selectedId) {
        const node = graphData.nodes.find(candidate => candidate.id === selectedId);
        if (node) {
          const distance = isMobile ? 34 : 42;
          const length = Math.hypot(node.x, node.y, node.z) || 1;
          graph.cameraPosition({
            x: node.x + (node.x / length) * distance,
            y: node.y + (node.y / length) * distance,
            z: node.z + (node.z / length) * distance,
          }, { x: node.x, y: node.y, z: node.z }, 650);
        }
      }
      previousGraphKey.current = graphKey;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [graphData.nodes, graphKey, isMobile, selectedId, size.height, size.width]);

  useEffect(() => {
    let frame = 0;
    const updateLabels = () => {
      const graph = graphRef.current;
      if (graph) {
        for (const node of labelNodes) {
          const label = labelRefs.current.get(node.id);
          if (!label) continue;
          const position = graph.graph2ScreenCoords(node.x, node.y, node.z);
          label.style.transform = `translate(-50%, -50%) translate(${position.x}px, ${position.y + nodeRadius(node) * 12}px)`;
          label.hidden = position.z < 0 || position.z > 1;
        }
        for (const edge of overlayLinks) {
          const path = labelRefs.current.get(`edge:${edge.id}`) as unknown as SVGPathElement | undefined;
          const source = graphNodesById.get(String(edge.from));
          const target = graphNodesById.get(String(edge.to));
          if (!path || !source || !target) continue;
          const start = graph.graph2ScreenCoords(source.x, source.y, source.z);
          const end = graph.graph2ScreenCoords(target.x, target.y, target.z);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const bend = Math.hypot(dx, dy) * (edge.is_learning ? 0.16 : 0.08);
          const controlX = (start.x + end.x) / 2 - dy * (bend / Math.max(1, Math.hypot(dx, dy)));
          const controlY = (start.y + end.y) / 2 + dx * (bend / Math.max(1, Math.hypot(dx, dy)));
          path.style.display = 'inline';
          path.setAttribute('d', `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`);
        }
      }
      frame = window.requestAnimationFrame(updateLabels);
    };
    frame = window.requestAnimationFrame(updateLabels);
    return () => window.cancelAnimationFrame(frame);
  }, [graphNodesById, labelNodes, overlayLinks]);

  const resetCamera = () => fitCamera(graphRef.current, graphData.nodes, isMobile, 500);
  const rotate = (horizontal: number, vertical = 0) => {
    const graph = graphRef.current;
    controlCall(graph, 'rotateLeft', horizontal);
    controlCall(graph, 'rotateUp', vertical);
  };
  const zoom = (scale: number) => controlCall(graphRef.current, scale > 1 ? 'dollyIn' : 'dollyOut', Math.abs(scale));

  return (
    <div
      ref={hostRef}
      className="atlas3d-shell atlas-webgl-shell atlas-force-shell"
      data-testid="atlas-3d-shell"
      data-renderer="three-force-graph-3d"
      onWheelCapture={event => event.preventDefault()}
    >
      <div className="atlas3d-haze" aria-hidden="true" />
      <div className="atlas-force-graph" data-testid="atlas-3d-canvas" aria-label="Grafo 3D do Atlas">
        <ForceGraph3D
          ref={graphRef}
          width={size.width || 1}
          height={size.height || 1}
          graphData={graphData}
        backgroundColor="#03111f"
        showNavInfo={false}
        controlType="orbit"
        enableNavigationControls
        enablePointerInteraction
        enableNodeDrag={false}
        nodeThreeObject={makeNode}
        nodeThreeObjectExtend={false}
        nodeLabel={nodeLabel}
        nodeVal={node => nodeRadius(node as GraphNodeView)}
        nodeOpacity={0.96}
        nodeResolution={18}
        linkColor={edge => linkColor(edge as GraphLinkView)}
        linkWidth={edge => {
          const value = edge as GraphLinkView;
          if (isStructuralEdge(value)) return 0.72 + strength(value) * 0.32;
          if (value.is_learning) return 0.9 + strength(value) * 0.36;
          return 0.14 + strength(value) * 0.14;
        }}
        linkOpacity={0.84}
        linkMaterial={edge => {
          const value = edge as GraphLinkView;
          const color = linkColor(value);
          const opacity = value.is_learning ? 0.98 : isStructuralEdge(value) ? 0.92 : 0.68;
          const key = `${color}:${opacity}`;
          let material = linkMaterials.get(key);
          if (!material) {
            material = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
            linkMaterials.set(key, material);
          }
          return material;
        }}
        linkCurvature={edge => (edge as GraphLinkView).is_learning ? 0.58 : 0.16}
        linkDirectionalParticles={edge => {
          const value = edge as GraphLinkView;
          return isStructuralEdge(value) || value.is_learning || value.kind === 'SUPPORTS' || value.kind === 'BLOCKS' ? 2 : 0;
        }}
        linkDirectionalParticleSpeed={edge => (edge as GraphLinkView).is_learning ? 0.006 : 0.003}
        linkDirectionalParticleWidth={edge => 0.9 + strength(edge as GraphLinkView) * 1.2}
        linkDirectionalParticleColor={edge => linkColor(edge as GraphLinkView)}
        onNodeClick={onNodeClick}
        onBackgroundClick={onBackgroundClick}
          warmupTicks={0}
        cooldownTicks={0}
        cooldownTime={0}
          rendererConfig={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        />
      </div>
      <svg className="atlas-webgl-links" viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} preserveAspectRatio="none"
        aria-hidden="true">
        {overlayLinks.map(edge => (
          <path key={edge.id} ref={element => {
            const key = `edge:${edge.id}`;
            if (element) labelRefs.current.set(key, element as unknown as HTMLSpanElement);
            else labelRefs.current.delete(key);
          }} className={`atlas-webgl-link${edge.is_learning ? ' learning' : ' structural'}`}
            stroke={linkColor(edge)} strokeWidth={edge.is_learning ? 3.6 : 2.8} />
        ))}
      </svg>
      <div className="atlas3d-a11y-list" aria-label="Nós do grafo 3D">
        {graphData.nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelect(String(node.id))}>
            {node.label}
          </button>
        ))}
      </div>
      <div className="atlas-webgl-labels" aria-hidden="true">
        {labelNodes.map(node => <span
          key={node.id}
          ref={element => { if (element) labelRefs.current.set(node.id, element); else labelRefs.current.delete(node.id); }}
          className={`atlas-webgl-label${node.id === selectedId ? ' selected' : ''}`}
          style={{ '--label-color': colorFor(node) } as CSSProperties}
        >{node.label.length > 38 ? `${node.label.slice(0, 37)}…` : node.label}</span>)}
      </div>
      <div className="atlas3d-selection" aria-live="polite">
        {selectedId ? 'Nó selecionado · clique no fundo para limpar' : 'Arraste para orbitar · pinça/scroll para zoom'}
      </div>
      <div className="atlas3d-controls atlas3d-mobile-nav" role="group" aria-label="Controles do grafo">
        <button type="button" aria-label="Resetar câmera" onClick={resetCamera}>Visão geral</button>
        <button type="button" aria-label="Girar mapa para a esquerda" onClick={() => rotate(0.34)}>←</button>
        <button type="button" aria-label="Girar mapa para a direita" onClick={() => rotate(-0.34)}>→</button>
        <button type="button" aria-label="Aproximar mapa" onClick={() => zoom(1.18)}>+</button>
        <button type="button" aria-label="Afastar mapa" onClick={() => zoom(1.18)}>−</button>
      </div>
    </div>
  );
}
