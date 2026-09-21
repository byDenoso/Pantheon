import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GraphEdge } from '../contracts/system.ts';
import type { Canvas25DViewState, CanvasGraph25DHandle } from './CanvasGraph25D.tsx';
import {
  LAYERED_LAYERS,
  neighborhoodOf,
  type LayeredEdge,
  type LayeredGraph,
  type LayeredNode,
} from '../viewmodels/layeredGraph.ts';
import './LayeredGraphRenderer.css';

const WIDTH = 1180;
const HEIGHT = 760;
const LEFT = 150;
const RIGHT = 1120;
const TOP = 88;
const LAYER_GAP = 132;

const DOMAIN_CLASS: Record<string, string> = {
  SCIENCE: 'science',
  ENGINEERING: 'engineering',
  OLYMPUS: 'olympus',
  NEXO: 'nexo',
  ARTIFACT: 'artifact',
};

function layerY(z: number): number {
  return TOP + (LAYERED_LAYERS.length - 1 - z) * LAYER_GAP;
}

function project(node: LayeredNode): { x: number; y: number } {
  const spread = 1.42;
  const depthSkew = node.z * 16;
  return {
    x: (WIDTH / 2) + node.x * spread + depthSkew,
    y: layerY(node.z) + node.y * 0.72 - depthSkew * 0.2,
  };
}

function planePoints(z: number): string {
  const y = layerY(z);
  const inset = z * 8;
  return [
    [LEFT + inset, y - 40],
    [RIGHT - inset, y - 40],
    [RIGHT - 60 - inset, y + 42],
    [LEFT + 60 + inset, y + 42],
  ].map(pair => pair.join(',')).join(' ');
}

function edgeClass(edge: LayeredEdge): string {
  if (edge.kind === 'BLOCKS' || edge.kind === 'CONTRADICTS' || edge.blocked) return 'blocked';
  if (edge.is_learning) return 'learning';
  if (edge.kind === 'SUPPORTS') return 'support';
  if (edge.crossLayer) return 'cross';
  return 'structural';
}

function pathFor(edge: LayeredEdge, byId: Map<string, LayeredNode>): string | null {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;
  const a = project(from);
  const b = project(to);
  if (!edge.crossLayer) {
    const mx = (a.x + b.x) / 2;
    const my = Math.min(a.y, b.y) - 18;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  const c1y = a.y + (b.y - a.y) * 0.38;
  const c2y = a.y + (b.y - a.y) * 0.62;
  return `M ${a.x} ${a.y} C ${a.x} ${c1y} ${b.x} ${c2y} ${b.x} ${b.y}`;
}

export const LayeredGraphRenderer = forwardRef<CanvasGraph25DHandle, {
  graph: LayeredGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sourceRevision: string;
  sourceFingerprint: string;
}>(function LayeredGraphRenderer({
  graph,
  selectedId,
  onSelect,
  sourceRevision,
  sourceFingerprint,
}, ref) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const neighborhood = useMemo(() => neighborhoodOf(graph, selectedId), [graph, selectedId]);

  const focus = (id: string, nextZoom = 1.2): boolean => {
    const node = byId.get(id);
    if (!node) return false;
    const p = project(node);
    setZoom(nextZoom);
    setPan({ x: WIDTH / 2 - p.x, y: HEIGHT / 2 - p.y });
    return true;
  };

  useImperativeHandle(ref, () => ({
    reset: () => { setZoom(1); setPan({ x: 0, y: 0 }); },
    focusNode: (id, nextZoom = 1.2) => focus(id, nextZoom),
    focusDomain: id => focus(id, 1.08),
    focusSubdomain: id => focus(id, 1.14),
    focusEntity: id => focus(id, 1.28),
    focusPoint: (point, nextZoom = 1.1) => {
      setZoom(nextZoom);
      setPan({ x: -point.x, y: -point.y });
    },
    getView: (): Canvas25DViewState => ({
      yaw: 0,
      pitch: -0.36,
      zoom,
      target: { x: -pan.x, y: -pan.y, z: 0 },
    }),
  }), [byId, pan.x, pan.y, zoom]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    setPan({
      x: active.panX + (event.clientX - active.x) / zoom,
      y: active.panY + (event.clientY - active.y) / zoom,
    });
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointer.current?.id === event.pointerId) pointer.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const visibleLabels = graph.nodes.length < 70 || zoom >= 1.14;

  return (
    <section
      className="layered-graph-shell"
      data-testid="atlas-layered-graph"
      data-renderer="layered-tower-projection"
      data-source-revision={sourceRevision}
      data-source-fingerprint={sourceFingerprint}
      aria-label="Grafo em camadas do NEXO Atlas sincronizado com a projeção da Tower"
    >
      <div className="layered-graph-head">
        <div>
          <strong>Grafo em Camadas</strong>
          <span>contexto → capacidade → execução → impacto</span>
        </div>
        <div className="tower-sync" title={sourceFingerprint}>
          <i aria-hidden="true" />
          TOWER · {sourceRevision.slice(0, 18)}
        </div>
      </div>

      <div className="layered-graph-controls" role="group" aria-label="Controles do grafo em camadas">
        <button type="button" onClick={() => setZoom(value => Math.min(1.8, value + .12))}>+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(.62, value - .12))}>−</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
      </div>

      <svg
        className="layered-graph-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${graph.nodes.length} entidades em cinco camadas semânticas`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={event => {
          event.preventDefault();
          const delta = event.deltaY > 0 ? -.08 : .08;
          setZoom(value => Math.max(.62, Math.min(1.8, value + delta)));
        }}
      >
        <defs>
          <filter id="layered-node-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {LAYERED_LAYERS.map(layer => (
            <g key={layer.id} className={`layer-plane layer-${layer.id.toLowerCase()}`}>
              <polygon points={planePoints(layer.z)} />
              <text x="36" y={layerY(layer.z) - 4} className="layer-index">{layer.index + 1}</text>
              <text x="72" y={layerY(layer.z) - 10} className="layer-title">{layer.title}</text>
              <text x="72" y={layerY(layer.z) + 10} className="layer-subtitle">{layer.subtitle}</text>
            </g>
          ))}

          <g className="layered-edges">
            {graph.edges.map(edge => {
              const d = pathFor(edge, byId);
              if (!d) return null;
              const muted = selectedId && !neighborhood.has(edge.from) && !neighborhood.has(edge.to);
              const selected = selectedId && (edge.from === selectedId || edge.to === selectedId);
              return <path
                key={edge.id}
                d={d}
                className={`layered-edge ${edgeClass(edge)}${muted ? ' muted' : ''}${selected ? ' selected' : ''}`}
              />;
            })}
          </g>

          <g className="layered-nodes">
            {graph.nodes.map(node => {
              const p = project(node);
              const domain = DOMAIN_CLASS[node.domain] ?? 'artifact';
              const selected = node.id === selectedId;
              const muted = selectedId && !neighborhood.has(node.id);
              const major = node.type === 'DOMAIN' || node.type === 'CAMPAIGN' || node.type === 'CAPABILITY' || node.type === 'TEST';
              const state = String(node.state).toLowerCase().replace(/[^a-z0-9]+/g, '-');
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className={`layered-node domain-${domain} state-${state}${selected ? ' selected' : ''}${muted ? ' muted' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.label}, ${node.type}, ${node.domain}, ${node.state}`}
                  onClick={event => { event.stopPropagation(); onSelect(node.id); }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); }
                  }}
                >
                  <circle className="node-halo" r={node.size + (selected ? 8 : 4)} />
                  <circle className="node-core" r={node.size} filter={selected ? 'url(#layered-node-glow)' : undefined} />
                  {(selected || major || visibleLabels) && (
                    <text className="node-label" x={node.size + 7} y="4">{node.label}</text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <footer className="layered-graph-footer">
        <span><b>{graph.nodes.length}</b> entidades</span>
        <span><b>{graph.edges.length}</b> relações</span>
        <span><b>{LAYERED_LAYERS.length}</b> camadas</span>
        <span className="layered-flow-mark">fluxo: domínio → insight</span>
      </footer>
    </section>
  );
});
