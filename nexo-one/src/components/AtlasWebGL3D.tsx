import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import {
  Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry,
} from 'three';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import '../styles/atlas3d.css';

const DOMAIN_COLOR: Record<string, string> = {
  NEXO: '#79f2d0',
  SCIENCE: '#44a8ff',
  ENGINEERING: '#71dfa0',
  OLYMPUS: '#bd8cff',
  ARTIFACT: '#f2b654',
};

const ALERT_COLOR = '#ff6b72';
const LINK_COLOR = '#68829b';
const STRUCTURAL_LINK_COLOR = '#90a9bf';

type GraphNodeView = PlacedNode3D & { fx?: number; fy?: number; fz?: number };
type GraphLinkView = GraphEdge & { source: string; target: string };
type GraphRef = ForceGraphMethods<GraphNodeView, GraphLinkView>;

type ForceWithStrength = {
  strength?: (value: number | ((item: GraphNodeView | GraphLinkView) => number)) => unknown;
  distance?: (value: number | ((item: GraphLinkView) => number)) => unknown;
  distanceMax?: (value: number) => unknown;
};

function isClusterNode(node: PlacedNode3D): boolean {
  return node.id.startsWith('atlas.cluster.');
}

function isStructuralEdge(edge: GraphEdge): boolean {
  return edge.id.startsWith('atlas.root.edge.') || edge.id.startsWith('atlas.cluster.edge.');
}

function colorFor(node: PlacedNode3D): string {
  return DOMAIN_COLOR[node.domain] ?? '#8fb2d0';
}

function linkColor(edge: GraphEdge): string {
  if (edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS') return ALERT_COLOR;
  if (edge.is_learning) return edge.learning_scope === 'INTER_DOMAIN' ? '#f4c468' : '#d99a4f';
  if (edge.kind === 'SUPPORTS') return '#51d7ef';
  if (isStructuralEdge(edge)) return STRUCTURAL_LINK_COLOR;
  return LINK_COLOR;
}

function nodeRadius(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 3.4 : 2.8;
  if (isClusterNode(node)) return 2.1;
  if (node.type === 'PROVIDER') return 1.55;
  if (node.type === 'CAPABILITY') return 1.28;
  return 1.02;
}

function nodeLabel(node: PlacedNode3D): string {
  const title = node.label.length > 64 ? `${node.label.slice(0, 63)}…` : node.label;
  return `<strong>${title}</strong><br/><small>${node.type} · ${node.domain}</small>`;
}

function strength(edge: GraphEdge): number {
  return Math.max(0.15, Math.min(1, Number(edge.weight ?? 0)));
}

function nodeObject(node: GraphNodeView, selectedId: string | null): Group {
  const color = new Color(colorFor(node));
  const radius = nodeRadius(node);
  const selected = node.id === selectedId;
  const major = node.type === 'DOMAIN' || isClusterNode(node);
  const group = new Group();

  const sphere = new Mesh(
    new SphereGeometry(radius, major ? 18 : 12, major ? 14 : 9),
    new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: major ? 0.34 : 0.12,
      metalness: 0.08,
      roughness: 0.34,
      transparent: true,
      opacity: node.state === 'BLOCKED' || node.state === 'CONFLICT' ? 0.78 : 0.96,
    }),
  );
  group.add(sphere);

  if (selected) {
    const ring = new Mesh(
      new TorusGeometry(radius * 1.7, 0.09, 8, 40),
      new MeshBasicMaterial({
        color: new Color('#f5fdff'),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI * 0.22;
    group.add(ring);
  }

  if (node.state === 'BLOCKED' || node.state === 'CONFLICT') {
    const alertRing = new Mesh(
      new TorusGeometry(radius * 1.5, 0.075, 8, 36),
      new MeshBasicMaterial({
        color: new Color(ALERT_COLOR),
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
      }),
    );
    group.add(alertRing);
  }

  return group;
}

function controlCall(graph: GraphRef | null | undefined, method: string, ...args: number[]) {
  const controls = graph?.controls() as Record<string, ((...values: number[]) => void) | undefined> | undefined;
  controls?.[method]?.(...args);
}

function zoomToGraph(graph: GraphRef | null | undefined, mobile: boolean, duration = 650) {
  graph?.zoomToFit(duration, mobile ? 34 : 52);
}

export function AtlasWebGL3D({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: PlacedNode3D[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphRef | undefined>(undefined);
  const previousGraphKey = useRef('');
  const labelRefs = useRef(new Map<string, HTMLSpanElement>());
  const [size, setSize] = useState({ width: 0, height: 0 });

  const graphData = useMemo(() => {
    const ids = new Set(nodes.map(node => node.id));
    const graphNodes: GraphNodeView[] = nodes.map(node => ({
      ...node,
      x: node.x * 0.16,
      y: node.y * 0.16,
      z: node.z * 0.16,
    }));
    const graphLinks: GraphLinkView[] = edges
      .filter(edge => ids.has(edge.from) && ids.has(edge.to))
      .map(edge => ({ ...edge, source: edge.from, target: edge.to }));
    return { nodes: graphNodes, links: graphLinks };
  }, [edges, nodes]);

  const graphKey = useMemo(
    () => `${graphData.nodes.map(node => node.id).join('|')}::${graphData.links.map(link => link.id).join('|')}`,
    [graphData.links, graphData.nodes],
  );

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

  const selectedNode = useMemo(
    () => graphData.nodes.find(node => node.id === selectedId) ?? null,
    [graphData.nodes, selectedId],
  );

  const visibleLabels = useMemo(
    () => graphData.nodes.filter(node =>
      node.type === 'DOMAIN' || isClusterNode(node) || node.id === selectedId
    ),
    [graphData.nodes, selectedId],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setSize({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const makeNode = useCallback(
    (node: GraphNodeView) => nodeObject(node, selectedId),
    [selectedId],
  );

  const onNodeClick = useCallback(
    (node: GraphNodeView) => onSelect(String(node.id)),
    [onSelect],
  );

  const onBackgroundClick = useCallback(() => onSelect(null), [onSelect]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return undefined;

    const charge = graph.d3Force('charge') as ForceWithStrength | undefined;
    charge?.strength?.(isMobile ? -48 : -66);
    charge?.distanceMax?.(260);

    const link = graph.d3Force('link') as ForceWithStrength | undefined;
    link?.distance?.((item: GraphNodeView | GraphLinkView) => {
      const edge = item as GraphLinkView;
      if (isStructuralEdge(edge)) return 26;
      if (edge.is_learning) return 42;
      return 34;
    });
    link?.strength?.((item: GraphNodeView | GraphLinkView) => {
      const edge = item as GraphLinkView;
      if (isStructuralEdge(edge)) return 0.54;
      if (edge.is_learning) return 0.14;
      return 0.24;
    });

    graph.cameraPosition(
      { x: 0, y: 4, z: isMobile ? 118 : 132 },
      { x: 0, y: 0, z: 0 },
      0,
    );
    graph.d3ReheatSimulation();

    const firstFit = window.setTimeout(() => {
      zoomToGraph(graph, isMobile, 420);
    }, 140);

    const settledFit = window.setTimeout(() => {
      zoomToGraph(graph, isMobile, 720);
      previousGraphKey.current = graphKey;
    }, previousGraphKey.current === graphKey ? 720 : 1450);

    return () => {
      window.clearTimeout(firstFit);
      window.clearTimeout(settledFit);
    };
  }, [graphKey, isMobile, size.height, size.width]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !selectedNode) return;

    const timer = window.setTimeout(() => {
      const x = Number(selectedNode.x ?? 0);
      const y = Number(selectedNode.y ?? 0);
      const z = Number(selectedNode.z ?? 0);
      const distance = isMobile ? 28 : 34;
      const length = Math.hypot(x, y, z) || 1;

      graph.cameraPosition({
        x: x + (x / length) * distance,
        y: y + (y / length) * distance,
        z: z + (z / length) * distance,
      }, { x, y, z }, 650);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isMobile, selectedNode]);

  useEffect(() => {
    let frame = 0;

    const updateLabels = () => {
      const graph = graphRef.current;
      if (graph) {
        for (const node of visibleLabels) {
          const label = labelRefs.current.get(node.id);
          if (!label) continue;

          const x = Number(node.x ?? 0);
          const y = Number(node.y ?? 0);
          const z = Number(node.z ?? 0);
          const position = graph.graph2ScreenCoords(x, y, z);

          label.style.transform =
            `translate(-50%, -50%) translate(${position.x}px, ${position.y + nodeRadius(node) * 14}px)`;
        }
      }

      frame = window.requestAnimationFrame(updateLabels);
    };

    frame = window.requestAnimationFrame(updateLabels);
    return () => window.cancelAnimationFrame(frame);
  }, [visibleLabels]);

  const resetCamera = () => zoomToGraph(graphRef.current, isMobile, 550);

  const rotate = (horizontal: number, vertical = 0) => {
    const graph = graphRef.current;
    controlCall(graph, 'rotateLeft', horizontal);
    controlCall(graph, 'rotateUp', vertical);
  };

  const zoom = (scale: number) => {
    controlCall(graphRef.current, scale > 1 ? 'dollyIn' : 'dollyOut', Math.abs(scale));
  };

  return (
    <div
      ref={hostRef}
      className="atlas3d-shell atlas-webgl-shell atlas-force-shell atlas-force-organic"
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
          backgroundColor="#020711"
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
          nodeResolution={12}
          linkColor={edge => linkColor(edge as GraphLinkView)}
          linkWidth={edge => {
            const value = edge as GraphLinkView;
            if (value.kind === 'CONTRADICTS' || value.kind === 'BLOCKS') return 0.24;
            if (value.is_learning) return 0.19 + strength(value) * 0.08;
            if (isStructuralEdge(value)) return 0.17;
            return 0.08 + strength(value) * 0.05;
          }}
          linkOpacity={0.44}
          linkCurvature={edge => (edge as GraphLinkView).is_learning ? 0.18 : 0}
          linkDirectionalParticles={0}
          onNodeClick={onNodeClick}
          onBackgroundClick={onBackgroundClick}
          warmupTicks={54}
          cooldownTicks={180}
          cooldownTime={4200}
          d3VelocityDecay={0.28}
          rendererConfig={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        />
      </div>

      <div className="atlas3d-a11y-list" aria-label="Nós do grafo 3D">
        {graphData.nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelect(String(node.id))}>
            {node.label}
          </button>
        ))}
      </div>

      <div className="atlas-webgl-labels" aria-hidden="true">
        {visibleLabels.map(node => (
          <span
            key={node.id}
            ref={element => {
              if (element) labelRefs.current.set(node.id, element);
              else labelRefs.current.delete(node.id);
            }}
            className={`atlas-webgl-label${node.type === 'DOMAIN' ? ' domain' : ''}${isClusterNode(node) ? ' cluster' : ''}${node.id === selectedId ? ' selected' : ''}`}
            style={{ '--label-color': colorFor(node) } as CSSProperties}
          >
            {node.label.length > 36 ? `${node.label.slice(0, 35)}…` : node.label}
          </span>
        ))}
      </div>

      <div className="atlas3d-selection" aria-live="polite">
        {selectedId
          ? `ATLAS 3D · selecionado: ${selectedNode?.label ?? selectedId}`
          : isMobile
            ? `ATLAS 3D · ${graphData.nodes.length} nós · ${graphData.links.length} relações · toque em um domínio para abrir`
            : `ATLAS 3D · ${graphData.nodes.length} nós · ${graphData.links.length} relações · arraste para orbitar · scroll para zoom`}
      </div>

      <div className="atlas3d-controls atlas3d-mobile-nav" role="group" aria-label="Controles do grafo">
        <button type="button" aria-label="Enquadrar grafo" onClick={resetCamera}>Enquadrar</button>
        <button type="button" aria-label="Girar mapa para a esquerda" onClick={() => rotate(0.34)}>←</button>
        <button type="button" aria-label="Girar mapa para a direita" onClick={() => rotate(-0.34)}>→</button>
        <button type="button" aria-label="Aproximar mapa" onClick={() => zoom(1.18)}>+</button>
        <button type="button" aria-label="Afastar mapa" onClick={() => zoom(0.84)}>−</button>
      </div>
    </div>
  );
}
