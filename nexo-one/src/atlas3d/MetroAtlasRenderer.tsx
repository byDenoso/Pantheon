import {
  useEffect,
  useMemo,
  useRef
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AtlasMetroModel, AtlasMetroNode } from './atlasAdapter.ts';
import { visibleAtlasIds } from './atlasAdapter.ts';
import { projectVisualCrossLinks } from './learningVisuals.ts';
import {
  buildMetroScreenLabelLayout,
  metroLayoutPositions,
  metroNodeSize,
} from './metro2dLayout.ts';

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
  getZoom: () => number;
  getViewportByCanvas: (point: [number, number]) => [number, number];
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

const LEARNING_PALETTE: Record<string, string[]> = {
  SCIENTIFIC_LEARNING_PIPELINE: ['#f59e0b', '#f6ad1b', '#e8910a', '#f3b64d'],
  PROCEDURAL: ['#fbbf24', '#f7c948', '#eab308', '#ffd166'],
  SEMANTIC: ['#fb923c', '#f97316', '#d97706', '#fdba74'],
};

function learningColor(kind: string | null | undefined, theme?: string | null): string {
  const palette = LEARNING_PALETTE[kind || ''] || LEARNING_PALETTE.SCIENTIFIC_LEARNING_PIPELINE;
  const seed = hashNumber(theme || kind || 'learning');
  return palette[seed % palette.length]!;
}

function learningDash(kind: string | null | undefined): number[] {
  if (kind === 'SCIENTIFIC_LEARNING_PIPELINE') return [2, 4];
  if (kind === 'PROCEDURAL') return [7, 4];
  if (kind === 'SEMANTIC') return [10, 5];
  return [2, 4];
}

function learningWidth(kind: string | null | undefined): number {
  if (kind === 'SCIENTIFIC_LEARNING_PIPELINE') return 2.15;
  if (kind === 'PROCEDURAL') return 1.7;
  if (kind === 'SEMANTIC') return 1.9;
  return 1.8;
}

function isAtlasReadback(): boolean {
  return typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('readback') === '1';
}

function isCompactRenderer(container: HTMLElement): boolean {
  return container.clientWidth <= 640
    || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true);
}

function setRendererError(container: HTMLElement, code: string, message: string): void {
  container.dataset.rendererError = code;
  container.dataset.g6Ready = container.dataset.g6Ready || 'false';
  container.dataset.threeReady = container.dataset.threeReady || 'false';
  let error = container.querySelector<HTMLElement>('.atlas-render-error');
  if (!error) {
    error = document.createElement('div');
    error.className = 'atlas-render-error';
    container.appendChild(error);
  }
  error.dataset.errorCode = code;
  error.textContent = message;
}

function clearRendererError(container: HTMLElement): void {
  delete container.dataset.rendererError;
  container.querySelector('.atlas-render-error')?.remove();
}

function createG6Graph(
  Graph: new (options: any) => G6Graph,
  options: any,
): G6Graph | null {
  try {
    return new Graph(options);
  } catch (error) {
    const container = options.container as HTMLElement;
    setRendererError(
      container,
      'G6_INIT_FAILED',
      `O renderer 2D não conseguiu iniciar neste dispositivo. ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function stampG6Metrics(container: HTMLElement, data: { nodes: any[]; edges: any[] }): void {
  container.dataset.g6NodeCount = String(data.nodes.length);
  const learningEdges = data.edges.filter((edge: any) => edge.data?.isLearning);
  container.dataset.g6LearningEdges = String(learningEdges.length);
  container.dataset.g6LearningRecords = String(new Set(
    learningEdges.flatMap((edge: any) =>
      Array.isArray(edge.data?.visualRefs) && edge.data.visualRefs.length
        ? edge.data.visualRefs
        : [edge.data?.learningRef || edge.id]
    ),
  ).size);
  container.dataset.g6LearningRelations = String(
    learningEdges.reduce((sum: number, edge: any) => sum + Math.max(1, Number(edge.data?.visualCount || 1)), 0),
  );
  container.dataset.g6ScientificLearningEdges = String(
    data.edges.filter((edge: any) => edge.data?.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE').length,
  );
  container.dataset.g6ProceduralLearningEdges = String(
    data.edges.filter((edge: any) => edge.data?.learningKind === 'PROCEDURAL').length,
  );
  container.dataset.g6SemanticLearningEdges = String(
    data.edges.filter((edge: any) => edge.data?.learningKind === 'SEMANTIC').length,
  );
  container.dataset.g6PeerLearningEdges = String(
    data.edges.filter((edge: any) =>
      edge.data?.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
      && /^PEER-DETECTION-GROUP-/i.test(String(edge.data?.learningRef || ''))
    ).length,
  );
  container.dataset.g6SubdomainLearningEdges = String(
    data.edges.filter((edge: any) =>
      edge.data?.isLearning
      && (/SUBDOMAIN$/.test(String(edge.data?.sourceAnchor || ''))
        || /SUBDOMAIN$/.test(String(edge.data?.targetAnchor || '')))
    ).length,
  );
  container.dataset.g6PeerSubdomainEdges = String(
    data.edges.filter((edge: any) =>
      edge.data?.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
      && /SUBDOMAIN$/.test(String(edge.data?.targetAnchor || ''))
    ).length,
  );
  container.dataset.g6HubLearningEdges = String(
    data.edges.filter((edge: any) =>
      edge.data?.isLearning
      && (edge.data?.sourceAnchor === 'DOMAIN_HUB' || edge.data?.targetAnchor === 'DOMAIN_HUB')
    ).length,
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
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
  compact = false,
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
      data: { kind: 'hierarchy', domain: node.domain, isLearning: false },
    }];
  });

  const bridgeEdges = showBeams
    ? projectVisualCrossLinks(model.crossLinks, visible)
      .map(link => ({
        id: link.id,
        source: link.source,
        target: link.target,
        type: 'cubic',
        data: {
          kind: 'bridge',
          label: link.label,
          weight: link.weight,
          aggregated: link.aggregated,
          isLearning: link.isLearning,
          learningScope: link.learningScope,
          learningRef: link.learningRef,
          learningKind: link.learningKind,
          learningGroup: link.learningGroup,
          learningTheme: link.learningTheme,
          learningBasis: link.learningBasis,
          sourceAnchor: link.sourceAnchor,
          targetAnchor: link.targetAnchor,
          bundleIndex: link.bundleIndex,
          bundleCount: link.bundleCount,
          visualCount: link.visualCount,
          visualRefs: link.visualRefs,
        },
      }))
    : [];

  return {
    nodes,
    edges: [...hierarchyEdges, ...bridgeEdges],
    positions,
  };
}

function applyG6Selection(graph: G6Graph | null, model: AtlasMetroModel, expanded: ReadonlySet<string>, selectedId: string | null) {
  if (!graph) return;
  const visible = visibleAtlasIds(model, expanded);
  const states: Record<string, string[]> = {};
  for (const id of visible) states[id] = id === selectedId ? ['selected'] : [];
  void graph.setElementState(states, false);
}

function countDomLabelCollisions(layer: HTMLElement): number {
  const labels = [...layer.querySelectorAll<HTMLElement>('.atlas-screen-label')];
  let collisions = 0;
  for (let left = 0; left < labels.length; left += 1) {
    const a = labels[left]!.getBoundingClientRect();
    for (let right = left + 1; right < labels.length; right += 1) {
      const b = labels[right]!.getBoundingClientRect();
      const separated = a.right + 1 <= b.left
        || a.left >= b.right + 1
        || a.bottom + 1 <= b.top
        || a.top >= b.bottom + 1;
      if (!separated) collisions += 1;
    }
  }
  return collisions;
}

function renderScreenLabels(
  graph: G6Graph,
  container: HTMLElement,
  labelLayer: HTMLElement,
  leaderLayer: SVGSVGElement,
  model: AtlasMetroModel,
  expanded: ReadonlySet<string>,
  selectedId: string | null,
  hoveredId: string | null,
) {
  const rect = container.getBoundingClientRect();
  const ids = visibleAtlasIds(model, expanded);
  const canvasPositions = metroLayoutPositions(model, ids, rect.width, rect.height);
  const screenPositions = new Map<string, [number, number]>();

  for (const id of ids) {
    const position = canvasPositions.get(id);
    if (!position) continue;
    const viewport = graph.getViewportByCanvas(position);
    screenPositions.set(id, [viewport[0], viewport[1]]);
  }

  const zoom = graph.getZoom();
  const layout = buildMetroScreenLabelLayout(
    model,
    ids,
    screenPositions,
    rect.width,
    rect.height,
    zoom,
    selectedId,
    hoveredId,
  );

  leaderLayer.innerHTML = [...layout.byId.values()]
    .filter(spec => spec.visible && spec.leader)
    .map(spec => {
      const node = model.nodeMap.get(spec.id);
      const color = DOMAIN_COLOR[node?.domain || ''] || '#64748b';
      const leader = spec.leader!;
      return `<line x1="${leader.x1.toFixed(1)}" y1="${leader.y1.toFixed(1)}" x2="${leader.x2.toFixed(1)}" y2="${leader.y2.toFixed(1)}" stroke="${color}" stroke-opacity=".42" stroke-width="1" vector-effect="non-scaling-stroke" />`;
    })
    .join('');

  const renderedLabels = [...layout.byId.values()]
    .filter(spec => spec.visible)
    .map(spec => {
      const node = model.nodeMap.get(spec.id)!;
      const color = DOMAIN_COLOR[node.domain] || '#64748b';
      const stateClass = spec.id === selectedId ? ' selected' : spec.id === hoveredId ? ' hovered' : '';
      const typeClass = node.entityType === 'hub' ? ' hub' : node.entityType === 'subdomain' ? ' subdomain' : ' leaf';
      return `<div class="atlas-screen-label${stateClass}${typeClass}" data-node-id="${escapeHtml(spec.id)}" style="left:${spec.left.toFixed(1)}px;top:${spec.top.toFixed(1)}px;width:${spec.width.toFixed(1)}px;height:${spec.height.toFixed(1)}px;--label-domain:${color};font-size:${spec.fontSize}px"><span>${escapeHtml(node.name)}</span></div>`;
    })
    .join('');
  const densityNote = layout.hidden > 0
    ? `<div class="atlas-label-density-note" data-hidden-labels="${layout.hidden}">+${layout.hidden} nomes sob demanda · aproxime para revelar</div>`
    : '';
  labelLayer.innerHTML = renderedLabels + densityNote;

  container.dataset.g6LabelVisible = String(layout.visible);
  container.dataset.g6LabelHidden = String(layout.hidden);
  container.dataset.g6LabelCollisions = String(layout.collisions);
  container.dataset.g6MaxSiblings = String(layout.maxSiblings);
  container.dataset.g6LabelZoom = zoom.toFixed(3);
  container.dataset.g6LabelPolicy = 'viewport-adaptive-v2';

  if (isAtlasReadback()) {
    // CI dump-dom can snapshot immediately after virtual time expires; publish
    // diagnostic attributes synchronously so the production gate sees the same
    // DOM that was just laid out.
    container.dataset.g6LabelDomCollisions = String(countDomLabelCollisions(labelLayer));
    container.dataset.g6LabelUiOverlaps = String(layout.uiZoneViolations);
  } else {
    container.dataset.g6LabelDomCollisions = 'runtime-skip';
    container.dataset.g6LabelUiOverlaps = String(layout.uiZoneViolations);
  }
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
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const leaderLayerRef = useRef<SVGSVGElement | null>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const modelRef = useRef(model);
  const expandedRef = useRef(expanded);
  const selectedRef = useRef(selectedId);
  const hoveredRef = useRef<string | null>(null);
  const activateRef = useRef(onActivate);
  const showBeamsRef = useRef(showBeams);
  const lastFitNonce = useRef(-1);
  const lastFocusKey = useRef('');
  const onReadyRef = useRef(onReady);
  const renderLabelsRef = useRef<() => void>(() => {});

  modelRef.current = model;
  expandedRef.current = expanded;
  selectedRef.current = selectedId;
  activateRef.current = onActivate;
  showBeamsRef.current = showBeams;
  onReadyRef.current = onReady;

  useEffect(() => {
    const surface = surfaceRef.current;
    const container = containerRef.current;
    const labelLayer = labelLayerRef.current;
    const leaderLayer = leaderLayerRef.current;
    const Graph = window.G6?.Graph;
    if (!surface || !container || !labelLayer || !leaderLayer || !Graph) {
      if (container) {
        container.dataset.g6Ready = 'false';
        setRendererError(container, 'G6_MISSING', 'G6 não carregou. O Atlas mantém os dados, mas o renderer 2D ficou indisponível.');
      }
      return;
    }

    const initialRect = surface.getBoundingClientRect();
    container.dataset.g6ViewportWidth = Math.round(initialRect.width).toString();
    container.dataset.g6ViewportHeight = Math.round(initialRect.height).toString();
    if (initialRect.width < 2 || initialRect.height < 2) {
      container.dataset.g6Ready = 'false';
      setRendererError(container, 'G6_ZERO_VIEWPORT', 'O Atlas recebeu uma área de desenho inválida. Reoriente a tela ou recarregue a página.');
      return;
    }

    const compact = isCompactRenderer(container);
    container.dataset.g6Profile = compact ? 'compact-touch' : 'desktop';
    const graph = createG6Graph(Graph, {
      container,
      theme: 'dark',
      data: { nodes: [], edges: [] },
      padding: compact ? [142, 22, 50, 22] : [86, 76, 76, 76],
      zoomRange: [0.30, 3.2],
      animation: {
        duration: compact ? 160 : 280,
        easing: 'ease-in-out',
      },
      behaviors: ['drag-canvas', 'zoom-canvas'],
      node: {
        type: 'donut',
        animation: {
          enter: 'fade',
          update: 'translate',
          exit: 'fade',
        },
        style: {
          size: (datum: any) => metroNodeSize(datum.data),
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
          labelText: '',
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
        animation: {
          enter: 'fade',
          exit: 'fade',
        },
        style: {
          stroke: (datum: any) => datum.data?.isLearning
            ? learningColor(datum.data?.learningKind, datum.data?.learningTheme)
            : datum.data?.kind === 'bridge'
              ? '#91a4bd'
              : (DOMAIN_COLOR[String(datum.data?.domain)] || '#475569'),
          lineWidth: (datum: any) => datum.data?.isLearning
            ? learningWidth(datum.data?.learningKind) + Math.min(2.1, Math.log2(Math.max(1, Number(datum.data?.visualCount || 1))) * .55)
            : datum.data?.kind === 'bridge' ? 1.05 : 2.25,
          opacity: (datum: any) => datum.data?.isLearning
            ? (datum.data?.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE' ? .82 : .68)
            : datum.data?.kind === 'bridge' ? .20 : .43,
          lineDash: (datum: any) => datum.data?.isLearning
            ? learningDash(datum.data?.learningKind)
            : datum.data?.kind === 'bridge' ? [5, 6] : [],
          shadowColor: (datum: any) => datum.data?.isLearning
            ? learningColor(datum.data?.learningKind, datum.data?.learningTheme)
            : 'transparent',
          shadowBlur: (datum: any) => datum.data?.isLearning
            ? (datum.data?.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE' ? 11 : 7)
            : 0,
          curveOffset: (datum: any) => {
            if (!datum.data?.isLearning) return 20;
            const count = Math.max(1, Number(datum.data?.bundleCount || 1));
            const index = Number(datum.data?.bundleIndex || 0);
            const centered = index - (count - 1) / 2;
            return centered * 18;
          },
          curvePosition: .5,
          endArrow: false,
        },
      },
      plugins: compact ? [] : [
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
    if (!graph) return;
    clearRendererError(container);

    graphRef.current = graph;

    const scheduleLabels = () => {
      cancelAnimationFrame((scheduleLabels as any).frame || 0);
      (scheduleLabels as any).frame = requestAnimationFrame(() => {
        renderScreenLabels(
          graph,
          container,
          labelLayer,
          leaderLayer,
          modelRef.current,
          expandedRef.current,
          selectedRef.current,
          hoveredRef.current,
        );
      });
    };
    renderLabelsRef.current = scheduleLabels;

    graph.on('node:pointerenter', event => {
      const id = event.target?.id;
      if (!id) return;
      hoveredRef.current = id;
      const current = graph.getElementState(id) || [];
      void graph.setElementState(id, [...new Set([...current, 'hover'])], false);
      scheduleLabels();
    });

    graph.on('node:pointerleave', event => {
      const id = event.target?.id;
      if (!id) return;
      hoveredRef.current = null;
      const current = (graph.getElementState(id) || []).filter(state => state !== 'hover');
      void graph.setElementState(id, current, false);
      scheduleLabels();
    });

    graph.on('node:click', event => {
      const id = event.target?.id;
      if (id && modelRef.current.nodeMap.has(id)) activateRef.current(id);
    });

    graph.on('aftertransform', scheduleLabels);
    graph.on('afterrender', scheduleLabels);

    const refresh = async (fit: boolean) => {
      const rect = container.getBoundingClientRect();
      const data = buildG6Data(
        modelRef.current,
        expandedRef.current,
        showBeamsRef.current,
        rect.width,
        rect.height,
        compact,
      );
      graph.setData({ nodes: data.nodes, edges: data.edges });
      stampG6Metrics(container, data);
      container.dataset.g6ViewportWidth = Math.round(rect.width).toString();
      container.dataset.g6ViewportHeight = Math.round(rect.height).toString();

      try {
        const renderTask = graph.render();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (container.querySelector('canvas')) {
          container.dataset.g6Ready = 'true';
          clearRendererError(container);
          onReady?.();
        }
        await renderTask;
        applyG6Selection(graph, modelRef.current, expandedRef.current, selectedRef.current);
        if (fit) {
          await graph.fitView(
            { when: 'always', direction: 'both' },
            { duration: compact ? 180 : 320, easing: 'ease-out' },
          );
        }
        scheduleLabels();
      } catch (error) {
        container.dataset.g6Ready = 'false';
        setRendererError(
          container,
          'G6_RENDER_FAILED',
          `O renderer 2D falhou ao desenhar. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    let frame = 0;
    let lastWidth = Math.round(surface.clientWidth);
    let lastHeight = Math.round(surface.clientHeight);
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(surface.clientWidth);
        const height = Math.round(surface.clientHeight);
        if (Math.abs(width - lastWidth) < 4 && Math.abs(height - lastHeight) < 4) return;
        lastWidth = width;
        lastHeight = height;
        graph.resize?.();
        void refresh(false);
      });
    });
    void refresh(true).then(() => resizeObserver.observe(surface));

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      graph.destroy?.();
      graphRef.current = null;
      renderLabelsRef.current = () => {};
    };
  }, []);

  const expansionKey = useMemo(() => [...expanded].sort().join('|'), [expanded]);

  useEffect(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    if (!graph || !container) return;
    const rect = container.getBoundingClientRect();
    const compact = isCompactRenderer(container);
    const data = buildG6Data(model, expanded, showBeams, rect.width, rect.height, compact);
    graph.setData({ nodes: data.nodes, edges: data.edges });
    stampG6Metrics(container, data);
    container.dataset.g6ViewportWidth = Math.round(rect.width).toString();
    container.dataset.g6ViewportHeight = Math.round(rect.height).toString();

    void graph.render().then(async () => {
      applyG6Selection(graph, model, expanded, selectedId);
      container.dataset.g6Ready = container.querySelector('canvas') ? 'true' : 'false';
      if (container.dataset.g6Ready === 'true') {
        clearRendererError(container);
        onReady?.();
      }

      await graph.fitView(
        { when: 'overflow', direction: 'both' },
        { duration: isCompactRenderer(container) ? 160 : 280, easing: 'ease-in-out' },
      );
      renderLabelsRef.current();
    }).catch(error => {
      container.dataset.g6Ready = 'false';
      setRendererError(
        container,
        'G6_UPDATE_FAILED',
        `O renderer 2D falhou durante a atualização. ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, [model.revision, expansionKey, showBeams]);

  useEffect(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    if (!graph || !container || lastFitNonce.current === fitNonce) return;
    lastFitNonce.current = fitNonce;
    void Promise.resolve(graph.fitView(
      { when: 'always', direction: 'both' },
      { duration: isCompactRenderer(container) ? 160 : 280, easing: 'ease-in-out' },
    )).then(() => renderLabelsRef.current());
  }, [fitNonce]);

  useEffect(() => {
    applyG6Selection(graphRef.current, model, expanded, selectedId);
    renderLabelsRef.current();
  }, [selectedId, model.revision, expansionKey]);

  return (
    <div ref={surfaceRef} className="atlas-metro-surface" data-testid="atlas-metro-2d">
      <div ref={containerRef} id="atlas-metro-g6" className="atlas-g6-canvas" />
      <svg ref={leaderLayerRef} className="atlas-label-leaders" aria-hidden="true" />
      <div ref={labelLayerRef} className="atlas-label-overlay" aria-hidden="true" />
    </div>
  );
}

type SynapsePulse = {
  particle: THREE.Group;
  curve: THREE.Curve<THREE.Vector3>;
  phase: number;
  speed: number;
};

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
  pulses: SynapsePulse[];
};

function disposeThreeObject(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = (mesh as any).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
      if (item.map && item.map.userData?.atlasSharedTexture !== true) item.map.dispose?.();
      item.dispose?.();
    }
  });
}

function hashNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createOrganicGeometry(radius: number, seedKey: string, detail = 3): THREE.IcosahedronGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const seed = (hashNumber(seedKey) % 10000) / 1000;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const waveA = Math.sin(normal.x * 7.1 + normal.y * 4.7 + seed);
    const waveB = Math.cos(normal.z * 8.3 - normal.x * 3.9 + seed * .73);
    const waveC = Math.sin((normal.x + normal.y - normal.z) * 5.2 + seed * 1.31);
    const scale = 1 + waveA * .032 + waveB * .024 + waveC * .018;
    vertex.multiplyScalar(scale);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

let sharedGlowTexture: THREE.CanvasTexture | null = null;

function getSharedGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture) return sharedGlowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,.88)');
  gradient.addColorStop(.20, 'rgba(255,255,255,.54)');
  gradient.addColorStop(.48, 'rgba(255,255,255,.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  sharedGlowTexture = new THREE.CanvasTexture(canvas);
  sharedGlowTexture.colorSpace = THREE.SRGBColorSpace;
  sharedGlowTexture.minFilter = THREE.LinearFilter;
  sharedGlowTexture.userData.atlasSharedTexture = true;
  return sharedGlowTexture;
}

function createGlowSprite(colorValue: string | number, diameter: number, opacity: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: getSharedGlowTexture(),
    color: new THREE.Color(colorValue),
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(diameter, diameter, 1);
  return sprite;
}

function synapseCurve(
  source: THREE.Vector3,
  target: THREE.Vector3,
  key: string,
  bridge: boolean,
  learning = false,
  bundleIndex = 0,
  bundleCount = 1,
): THREE.QuadraticBezierCurve3 {
  const midpoint = source.clone().add(target).multiplyScalar(.5);
  const direction = target.clone().sub(source);
  const span = Math.max(1, direction.length());
  direction.normalize();

  const reference = Math.abs(direction.y) < .88
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const perpendicular = direction.clone().cross(reference).normalize();
  const secondary = direction.clone().cross(perpendicular).normalize();
  const seed = hashNumber(key);
  const sign = seed % 2 === 0 ? 1 : -1;

  if (learning && bundleCount > 1) {
    const centered = bundleIndex - (bundleCount - 1) / 2;
    const fan = centered / Math.max(1, (bundleCount - 1) / 2);
    const lateral = Math.min(210, Math.max(64, span * .22));
    const twist = Math.min(145, Math.max(38, span * .13));
    midpoint.addScaledVector(perpendicular, lateral * fan);
    midpoint.addScaledVector(secondary, twist * Math.sin((bundleIndex + 1) * 1.37));
    midpoint.y += ((seed % 7) - 3) * 3.2;
  } else {
    const bend = Math.min(bridge ? 78 : 38, span * (bridge ? .16 : .09));
    const vertical = ((seed % 9) - 4) * (bridge ? 3.2 : 1.7);
    midpoint.addScaledVector(perpendicular, bend * sign);
    midpoint.y += vertical;
    if (bridge) midpoint.addScaledVector(secondary, Math.min(104, 28 + span * .09) * (seed % 3 === 0 ? -1 : 1));
  }

  return new THREE.QuadraticBezierCurve3(source, midpoint, target);
}

function addSynapse(
  runtime: ThreeRuntime,
  content: THREE.Group,
  source: THREE.Vector3,
  target: THREE.Vector3,
  colorValue: string | number,
  key: string,
  bridge: boolean,
  strength = 1,
  learning = false,
  bundleIndex = 0,
  bundleCount = 1,
  compact = false,
) {
  const curve = synapseCurve(source, target, key, bridge, learning, bundleIndex, bundleCount);
  const span = source.distanceTo(target);
  const segments = compact
    ? Math.max(12, Math.min(30, Math.round(span / 11)))
    : Math.max(18, Math.min(52, Math.round(span / 7)));
  const radialSegments = compact ? 4 : 5;
  const color = new THREE.Color(colorValue);
  const coreRadius = (learning ? .46 : bridge ? .34 : .48) * Math.max(.72, Math.min(1.45, strength));
  const glowRadius = coreRadius * (learning ? 4.8 : 3.2);

  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, glowRadius, radialSegments, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: learning ? (compact ? .16 : .20) : bridge ? (compact ? .075 : .055) : (compact ? .11 : .085),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.renderOrder = 2;
  content.add(glow);

  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, coreRadius, radialSegments, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: learning ? (compact ? .68 : .76) : bridge ? (compact ? .36 : .28) : (compact ? .54 : .44),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  core.renderOrder = 3;
  content.add(core);

  const particle = new THREE.Group();
  const pulseCore = new THREE.Mesh(
    new THREE.SphereGeometry(learning ? 1.8 : bridge ? 1.15 : 1.45, compact ? 8 : 10, compact ? 6 : 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: learning && compact ? .72 : .92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  particle.add(pulseCore);
  const pulseGlow = createGlowSprite(
    colorValue,
    learning ? 18 : bridge ? 10 : 12,
    learning ? (compact ? .66 : .74) : bridge ? (compact ? .44 : .34) : (compact ? .56 : .46),
  );
  pulseGlow.material.depthTest = false;
  particle.add(pulseGlow);

  const seed = hashNumber(key);
  const phase = (seed % 1000) / 1000;
  particle.position.copy(curve.getPointAt(phase));
  content.add(particle);
  runtime.pulses.push({
    particle,
    curve,
    phase,
    speed: learning
      ? .000072 + (seed % 7) * .000005
      : bridge ? .000022 + (seed % 7) * .000002 : .000034 + (seed % 9) * .0000025,
  });
}

function updateSynapsePulses(runtime: ThreeRuntime, now: number) {
  for (const pulse of runtime.pulses) {
    const t = (pulse.phase + now * pulse.speed) % 1;
    pulse.particle.position.copy(pulse.curve.getPointAt(t));
    const breathe = .84 + Math.sin((t + pulse.phase) * Math.PI * 2) * .16;
    pulse.particle.scale.setScalar(breathe);
  }
}

function createLabelSprite(text: string, domainColor: string, isHub: boolean, compact = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 256 : 512;
  canvas.height = compact ? 64 : 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgba(7,11,20,.90)';
  context.strokeStyle = domainColor;
  context.lineWidth = (isHub ? 5 : 3) * (compact ? .5 : 1);
  const unit = compact ? .5 : 1;
  context.beginPath();
  context.roundRect(8 * unit, 18 * unit, 496 * unit, 92 * unit, 22 * unit);
  context.fill();
  context.stroke();
  context.fillStyle = '#e5edf8';
  context.font = `${isHub ? 800 : 650} ${(isHub ? 34 : 29) * unit}px Inter, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  context.fillText(label, 256 * unit, 64 * unit);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  const compactScale = compact ? 1.18 : 1;
  sprite.scale.set(
    (isHub ? 118 : 90) * compactScale,
    (isHub ? 30 : 23) * compactScale,
    1,
  );
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
  const visible = new Set(ids);
  const domainBaseZ: Record<string, number> = { NEXO: -520, SCIENCE: 0, OLYMPUS: 520 };
  const depthStep = 150;
  const scale = .72;
  const out = new Map<string, THREE.Vector3>();

  for (const id of ids) {
    const node = model.nodeMap.get(id);
    const position = metro.get(id);
    if (!node || !position) continue;

    let siblingZ = 0;
    if (node.parentId) {
      const siblings = (model.childrenMap.get(node.parentId) || []).filter(siblingId => visible.has(siblingId));
      const siblingIndex = siblings.indexOf(id);
      if (siblingIndex >= 0 && siblings.length > 1) {
        const normalized = (siblingIndex / (siblings.length - 1)) * 2 - 1;
        const siblingSpan = 48 + Math.min(280, (siblings.length - 1) * 18);
        const parentPosition = metro.get(node.parentId);
        const angle = parentPosition
          ? Math.atan2(position[1] - parentPosition[1], position[0] - parentPosition[0])
          : 0;
        const phase = ((hashNumber(id) % 1000) / 1000) * Math.PI * 2;
        siblingZ = normalized * siblingSpan
          + Math.sin(angle * 1.7 + phase) * Math.min(92, siblingSpan * .36);
      }
    }

    out.set(id, new THREE.Vector3(
      (position[0] - width / 2) * scale,
      -(position[1] - height / 2) * scale,
      domainBaseZ[node.domain] + node.depth * depthStep + siblingZ,
    ));
  }
  return out;
}

function threeDepthMetrics(model: AtlasMetroModel, ids: string[], positions: Map<string, THREE.Vector3>) {
  const values = [...positions.values()].map(position => position.z);
  const zSpan = values.length ? Math.max(...values) - Math.min(...values) : 0;
  let maxSameLevelSpan = 0;
  const groups = new Map<string, number[]>();

  for (const id of ids) {
    const node = model.nodeMap.get(id);
    const position = positions.get(id);
    if (!node || !position) continue;
    const key = `${node.domain}|${node.parentId || 'ROOT'}|${node.depth}`;
    const bucket = groups.get(key) || [];
    bucket.push(position.z);
    groups.set(key, bucket);
  }

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    maxSameLevelSpan = Math.max(maxSameLevelSpan, Math.max(...bucket) - Math.min(...bucket));
  }

  return { zSpan, maxSameLevelSpan };
}

function threeFocusIds(
  model: AtlasMetroModel,
  expanded: ReadonlySet<string>,
  selectedId: string | null,
): string[] {
  const visible = new Set(visibleAtlasIds(model, expanded));
  if (!selectedId || !visible.has(selectedId)) return [...visible];

  const selected = model.nodeMap.get(selectedId);
  if (!selected) return [...visible];

  const focus = new Set<string>([selectedId]);
  const children = (model.childrenMap.get(selectedId) || []).filter(id => visible.has(id));
  if (children.length) {
    children.forEach(id => focus.add(id));
  } else if (selected.parentId && visible.has(selected.parentId)) {
    focus.add(selected.parentId);
  }

  const seed = new Set(focus);
  for (const link of model.crossLinks) {
    if (!link.isLearning) continue;
    if (seed.has(link.source) && visible.has(link.target)) focus.add(link.target);
    if (seed.has(link.target) && visible.has(link.source)) focus.add(link.source);
  }

  return [...focus];
}

function applyThreeSelection(runtime: ThreeRuntime, selectedId: string | null) {
  runtime.nodeGroups.forEach((group, id) => {
    const selected = id === selectedId;
    const hovered = id === runtime.hoveredId;
    const selectionGlow = group.userData.selectionGlow as THREE.Sprite | undefined;
    const neuronGlow = group.userData.neuronGlow as THREE.Sprite | undefined;
    const core = group.userData.core as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;

    if (selectionGlow) {
      selectionGlow.visible = selected;
      const selectionMaterial = selectionGlow.material as THREE.SpriteMaterial;
      selectionMaterial.opacity = selected ? .64 : 0;
    }

    if (neuronGlow) {
      const glowMaterial = neuronGlow.material as THREE.SpriteMaterial;
      const baseOpacity = Number(neuronGlow.userData.baseOpacity || .48);
      glowMaterial.opacity = hovered ? Math.min(.92, baseOpacity + .28) : selected ? Math.min(.86, baseOpacity + .18) : baseOpacity;
      const baseScale = Number(neuronGlow.userData.baseScale || neuronGlow.scale.x);
      const factor = hovered ? 1.18 : selected ? 1.11 : 1;
      neuronGlow.scale.set(baseScale * factor, baseScale * factor, 1);
    }

    if (core) {
      const base = Number(core.userData.baseEmissive || .34);
      core.material.emissiveIntensity = hovered ? Math.max(.92, base + .42) : selected ? Math.max(.76, base + .26) : base;
    }
  });
}

function threeFitInsets(runtime: ThreeRuntime) {
  const canvas = runtime.renderer.domElement;
  const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
  const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
  const container = canvas.parentElement as HTMLElement | null;
  const compact = container ? isCompactRenderer(container) : width <= 640;
  return compact
    ? { width, height, top: 154, right: 12, bottom: 64, left: 12, compact }
    : { width, height, top: 118, right: 24, bottom: 62, left: 24, compact };
}

function fitThree(
  runtime: ThreeRuntime,
  animated = true,
  focusIds: readonly string[] | null = null,
  scope: 'selection' | 'all' = focusIds?.length ? 'selection' : 'all',
) {
  if (!runtime.worldPositions.size) return;

  const fitPositions = (focusIds || [])
    .map(id => runtime.worldPositions.get(id))
    .filter((position): position is THREE.Vector3 => Boolean(position));
  const positions = fitPositions.length ? fitPositions : [...runtime.worldPositions.values()];
  const box = new THREE.Box3();
  positions.forEach(position => box.expandByPoint(position));
  const center = box.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(.82, .54, 1.15).normalize();
  const forward = direction.clone().multiplyScalar(-1);
  const right = forward.clone().cross(runtime.camera.up).normalize();
  const cameraUp = right.clone().cross(forward).normalize();

  let horizontalExtent = 0;
  let verticalExtent = 0;
  let depthExtent = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        horizontalExtent = Math.max(horizontalExtent, Math.abs(offset.dot(right)));
        verticalExtent = Math.max(verticalExtent, Math.abs(offset.dot(cameraUp)));
        depthExtent = Math.max(depthExtent, Math.abs(offset.dot(direction)));
      }
    }
  }

  const { width, height, top, right: insetRight, bottom, left, compact } = threeFitInsets(runtime);
  const usableWidth = Math.max(80, width - left - insetRight);
  const usableHeight = Math.max(120, height - top - bottom);
  const widthFraction = Math.max(.24, usableWidth / width);
  const heightFraction = Math.max(.24, usableHeight / height);
  const fov = THREE.MathUtils.degToRad(runtime.camera.fov);
  const tanVertical = Math.tan(fov / 2);
  const tanHorizontal = tanVertical * Math.max(.35, runtime.camera.aspect);
  const padding = compact ? 34 : 48;

  horizontalExtent += padding;
  verticalExtent += padding * .72;
  depthExtent += padding * .18;

  // Fit against the plane actually seen by the camera. The previous implementation
  // used the full 3D diagonal; once Z became meaningful that pushed the camera far
  // away and made mobile look like a tiny graph floating in an empty viewport.
  const requiredForWidth = horizontalExtent / Math.max(.001, tanHorizontal * widthFraction);
  const requiredForHeight = verticalExtent / Math.max(.001, tanVertical * heightFraction);
  const fitPlaneDistance = Math.max(requiredForWidth, requiredForHeight);
  const distance = Math.max(
    compact ? 330 : 410,
    depthExtent + fitPlaneDistance * (compact ? 1.06 : 1.10),
  );

  const availableAtClosest = Math.max(1, distance - depthExtent);
  const coverage = Math.min(2,
    Math.max(
      horizontalExtent / Math.max(1, availableAtClosest * tanHorizontal * widthFraction),
      verticalExtent / Math.max(1, availableAtClosest * tanVertical * heightFraction),
    ),
  );

  const screenOffsetPx = (top - bottom) / 2;
  const worldPerPixel = (2 * distance * tanVertical) / height;
  const target = center.clone().addScaledVector(cameraUp, screenOffsetPx * worldPerPixel);
  const destination = target.clone().add(direction.clone().multiplyScalar(distance));

  const container = runtime.renderer.domElement.parentElement as HTMLElement | null;
  if (container) {
    container.dataset.threeFitPolicy = 'selection-safe-area-v5';
    container.dataset.threeFitScope = scope;
    container.dataset.threeFitNodeCount = String(positions.length);
    container.dataset.threeFitDistance = distance.toFixed(1);
    container.dataset.threeFitCoverage = coverage.toFixed(2);
    container.dataset.threeFitTopInset = String(top);
    container.dataset.threeFitBottomInset = String(bottom);
  }

  if (!animated) {
    runtime.camera.position.copy(destination);
    runtime.controls.target.copy(target);
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
    runtime.controls.target.lerpVectors(fromTarget, target, eased);
    runtime.controls.update();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderAndMeasureThree(runtime: ThreeRuntime, container: HTMLElement): number {
  runtime.controls.update();
  runtime.renderer.render(runtime.scene, runtime.camera);

  if (!isAtlasReadback()) {
    container.dataset.threePaintSamples = 'runtime-skip';
    container.dataset.threeReady = 'true';
    return 1;
  }

  const gl = runtime.renderer.getContext();
  const width = runtime.renderer.domElement.width;
  const height = runtime.renderer.domElement.height;
  if (!width || !height) {
    container.dataset.threePaintSamples = '0';
    container.dataset.threeReady = 'false';
    return 0;
  }

  // Clear alpha is zero; opaque geometry writes alpha. Sampling the rendered
  // framebuffer makes the production gate prove that 3D content was actually
  // painted, not merely that a WebGL canvas exists.
  const pixels = new Uint8Array(width * height * 4);
  gl.finish();
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let painted = 0;
  for (let offset = 3; offset < pixels.length; offset += 64) {
    if (pixels[offset] > 8) painted += 1;
  }
  container.dataset.threePaintSamples = String(painted);
  container.dataset.threeReady = painted > 20 ? 'true' : 'false';
  return painted;
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
  runtime.pulses = [];

  const ids = visibleAtlasIds(model, expanded);
  const visible = new Set(ids);
  const compact = isCompactRenderer(container);
  const showLeafLabels = !compact && ids.length <= 44;
  const positions = threePositions(model, ids, Math.max(720, container.clientWidth), Math.max(560, container.clientHeight));
  runtime.worldPositions = positions;
  const depthMetrics = threeDepthMetrics(model, ids, positions);
  container.dataset.threeZSpan = depthMetrics.zSpan.toFixed(1);
  container.dataset.threeSameLevelZSpan = depthMetrics.maxSameLevelSpan.toFixed(1);
  const selectedChildren = selectedId
    ? (model.childrenMap.get(selectedId) || []).filter(id => visible.has(id) && positions.has(id))
    : [];
  const selectedZ = selectedChildren.map(id => positions.get(id)!.z);
  const selectedSiblingZSpan = selectedZ.length > 1 ? Math.max(...selectedZ) - Math.min(...selectedZ) : 0;
  container.dataset.threeSelectedSiblingCount = String(selectedChildren.length);
  container.dataset.threeSelectedSiblingZSpan = selectedSiblingZSpan.toFixed(1);
  container.dataset.threeDepthPolicy = 'domain-depth-sibling-v3';

  const content = new THREE.Group();
  runtime.content = content;
  runtime.scene.add(content);

  for (const id of ids) {
    const node = model.nodeMap.get(id);
    if (!node?.parentId || !visible.has(node.parentId)) continue;
    const source = positions.get(node.parentId);
    const target = positions.get(id);
    if (!source || !target) continue;
    addSynapse(
      runtime,
      content,
      source,
      target,
      DOMAIN_COLOR[node.domain] || '#94a3b8',
      `hierarchy:${node.parentId}:${id}`,
      false,
      node.entityType === 'subdomain' ? 1.08 : .9,
      false,
      0,
      1,
      compact,
    );
  }

  const visualCrossLinks = showBeams
    ? projectVisualCrossLinks(model.crossLinks, visible)
    : [];

  if (showBeams) {
    for (const link of visualCrossLinks) {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) continue;
      const sourceNode = model.nodeMap.get(link.source);
      const targetNode = model.nodeMap.get(link.target);
      const sourceColor = new THREE.Color(DOMAIN_COLOR[sourceNode?.domain || ''] || '#91a4bd');
      const targetColor = new THREE.Color(DOMAIN_COLOR[targetNode?.domain || ''] || '#91a4bd');
      const mixed = sourceColor.clone().lerp(targetColor, .5);
      const color = link.isLearning ? new THREE.Color(learningColor(link.learningKind, link.learningTheme)) : mixed;
      addSynapse(
        runtime,
        content,
        source,
        target,
        color.getHex(),
        `bridge:${link.id}`,
        true,
        Math.max(.72, Math.min(link.isLearning ? 1.5 : 1.25, link.weight || 1)),
        link.isLearning,
        link.bundleIndex,
        link.bundleCount,
        compact,
      );
    }
  }

  const visibleLearning = model.crossLinks.filter(
    link => link.isLearning && visible.has(link.source) && visible.has(link.target),
  );
  const visualLearning = visualCrossLinks.filter(link => link.isLearning);
  container.dataset.threeLearningSynapses = String(visibleLearning.length);
  container.dataset.threeLearningVisualSynapses = String(visualLearning.length);
  container.dataset.threeLearningRecords = String(new Set(
    visualLearning.flatMap(link => link.visualRefs.length ? link.visualRefs : [link.learningRef || link.id]),
  ).size);
  container.dataset.threeLearningRelations = String(
    visualLearning.reduce((sum, link) => sum + Math.max(1, link.visualCount), 0),
  );
  container.dataset.threeScientificLearningSynapses = String(
    visibleLearning.filter(link => link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE').length,
  );
  container.dataset.threeProceduralLearningSynapses = String(
    visibleLearning.filter(link => link.learningKind === 'PROCEDURAL').length,
  );
  container.dataset.threeSemanticLearningSynapses = String(
    visibleLearning.filter(link => link.learningKind === 'SEMANTIC').length,
  );
  container.dataset.threePeerLearningSynapses = String(
    visibleLearning.filter(link =>
      link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
      && /^PEER-DETECTION-GROUP-/i.test(String(link.learningRef || ''))
    ).length,
  );
  container.dataset.threeSubdomainLearningSynapses = String(
    visibleLearning.filter(link =>
      /SUBDOMAIN$/.test(String(link.sourceAnchor || ''))
      || /SUBDOMAIN$/.test(String(link.targetAnchor || ''))
    ).length,
  );
  container.dataset.threePeerSubdomainSynapses = String(
    visibleLearning.filter(link =>
      link.learningKind === 'SCIENTIFIC_LEARNING_PIPELINE'
      && /SUBDOMAIN$/.test(String(link.targetAnchor || ''))
    ).length,
  );

  for (const id of ids) {
    const node = model.nodeMap.get(id)!;
    const position = positions.get(id);
    if (!position) continue;
    const radius = nodeRadius3D(node);
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData.nodeId = id;

    const domainColor = DOMAIN_COLOR[node.domain] || '#94a3b8';
    const typeColor = TYPE_COLOR[String(node.entityType)] || '#cbd5e1';
    const baseEmissive = (node.entityType === 'hub' ? .56 : node.entityType === 'subdomain' ? .42 : .32)
      + (compact ? .12 : .04);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(domainColor).lerp(new THREE.Color(typeColor), .20),
      emissive: new THREE.Color(domainColor),
      emissiveIntensity: baseEmissive,
      roughness: .64,
      metalness: .03,
    });
    const core = new THREE.Mesh(createOrganicGeometry(radius, id, compact ? 2 : 3), coreMaterial);
    core.userData = { nodeId: id, baseEmissive };
    const organicSeed = hashNumber(id);
    core.rotation.set(
      ((organicSeed >> 2) % 31) / 31,
      ((organicSeed >> 7) % 37) / 37,
      ((organicSeed >> 12) % 41) / 41,
    );
    group.add(core);
    runtime.interactive.push(core);

    const membrane = new THREE.Mesh(
      createOrganicGeometry(radius * 1.13, `${id}:membrane`, compact ? 2 : 3),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(domainColor),
        transparent: true,
        opacity: node.entityType === 'hub' ? .13 : .09,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    );
    group.add(membrane);

    const neuronGlow = createGlowSprite(
      domainColor,
      radius * (node.entityType === 'hub' ? 5.6 : 4.9),
      (node.entityType === 'hub' ? .56 : .44) + (compact ? .12 : .04),
    );
    neuronGlow.material.depthTest = false;
    neuronGlow.userData.baseOpacity = (neuronGlow.material as THREE.SpriteMaterial).opacity;
    neuronGlow.userData.baseScale = neuronGlow.scale.x;
    neuronGlow.renderOrder = 8;
    group.add(neuronGlow);

    const statusNucleus = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(1.4, radius * .18), compact ? 8 : 14, compact ? 6 : 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(statusColor(node.status)),
        transparent: true,
        opacity: .86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    statusNucleus.renderOrder = 9;
    group.add(statusNucleus);

    const selectionGlow = createGlowSprite('#ffffff', radius * 7.2, .64);
    selectionGlow.material.depthTest = false;
    selectionGlow.visible = id === selectedId;
    selectionGlow.renderOrder = 7;
    group.add(selectionGlow);

    if (showLeafLabels || node.entityType === 'hub' || node.entityType === 'subdomain' || id === selectedId) {
      const label = createLabelSprite(node.name, DOMAIN_COLOR[node.domain], node.entityType === 'hub', compact);
      label.position.set(0, radius + (node.entityType === 'hub' ? 28 : 20), 0);
      group.add(label);
    }

    group.userData.core = core;
    group.userData.neuronGlow = neuronGlow;
    group.userData.selectionGlow = selectionGlow;
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
  onReady,
}: Omit<Props, 'viewMode'>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ThreeRuntime | null>(null);
  const modelRef = useRef(model);
  const expandedRef = useRef(expanded);
  const selectedRef = useRef(selectedId);
  const activateRef = useRef(onActivate);
  const showBeamsRef = useRef(showBeams);
  const lastFitNonce = useRef(-1);
  const onReadyRef = useRef(onReady);

  modelRef.current = model;
  expandedRef.current = expanded;
  selectedRef.current = selectedId;
  activateRef.current = onActivate;
  showBeamsRef.current = showBeams;
  onReadyRef.current = onReady;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialRect = container.getBoundingClientRect();
    container.dataset.threeViewportWidth = Math.round(initialRect.width).toString();
    container.dataset.threeViewportHeight = Math.round(initialRect.height).toString();
    if (initialRect.width < 2 || initialRect.height < 2) {
      setRendererError(container, 'THREE_ZERO_VIEWPORT', 'O modo 3D recebeu uma área de desenho inválida.');
      return;
    }

    const compact = isCompactRenderer(container);
    container.dataset.threeProfile = compact ? 'compact-touch' : 'desktop';
    container.dataset.threeQuality = compact ? 'reduced-gpu' : 'full';
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b14, compact ? .00013 : .00017);
    const camera = new THREE.PerspectiveCamera(compact ? 50 : 46, 1, 1, 6000);
    camera.position.set(520, 360, 780);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !compact,
        alpha: true,
        powerPreference: compact ? 'default' : 'high-performance',
        preserveDrawingBuffer: isAtlasReadback(),
      });
    } catch (error) {
      setRendererError(
        container,
        'WEBGL_INIT_FAILED',
        `O modo 3D não conseguiu criar um contexto WebGL neste dispositivo. Use 2D Metro. ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.35 : 2));
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
    controls.maxDistance = compact ? 3600 : 5200;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

    scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x111827, compact ? 1.62 : 1.38));
    const key = new THREE.DirectionalLight(0xffffff, compact ? 1.72 : 1.52);
    key.position.set(400, 650, 500);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ee7ff, compact ? .92 : .78);
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
      pulses: [],
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      container.dataset.threeViewportWidth = Math.round(width).toString();
      container.dataset.threeViewportHeight = Math.round(height).toString();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    clearRendererError(container);

    let resizeFrame = 0;
    let lastWidth = Math.round(container.clientWidth);
    let lastHeight = Math.round(container.clientHeight);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = Math.round(container.clientWidth);
        const height = Math.round(container.clientHeight);
        const widthDelta = Math.abs(width - lastWidth);
        const heightDelta = Math.abs(height - lastHeight);
        if (widthDelta < 4 && heightDelta < 4) return;

        const orientationChanged = (width > height) !== (lastWidth > lastHeight);
        const majorLayoutChange = orientationChanged
          || widthDelta >= (compact ? 24 : 18)
          || heightDelta >= (compact ? 56 : 28);

        lastWidth = width;
        lastHeight = height;
        resize();

        if (majorLayoutChange) {
          rebuildThree(runtime, container, modelRef.current, expandedRef.current, selectedRef.current, showBeamsRef.current);
          container.dataset.threeNodeCount = String(visibleAtlasIds(modelRef.current, expandedRef.current).length);
          container.dataset.threeSynapseCount = String(runtime.pulses.length);
        }

        const focusIds = threeFocusIds(modelRef.current, expandedRef.current, selectedRef.current);
        fitThree(runtime, false, focusIds, 'selection');
        renderAndMeasureThree(runtime, container);
      });
    });
    observer.observe(container);

    const tooltip = tooltipRef.current;
    renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    const onContextLost = (event: Event) => {
      event.preventDefault();
      container.dataset.threeContext = 'lost';
      container.dataset.threeReady = 'false';
      setRendererError(container, 'WEBGL_CONTEXT_LOST', 'O contexto WebGL foi perdido. Volte para 2D Metro ou recarregue a página.');
    };
    const onContextRestored = () => {
      container.dataset.threeContext = 'restored';
      clearRendererError(container);
      resize();
      rebuildThree(runtime, container, modelRef.current, expandedRef.current, selectedRef.current, showBeamsRef.current);
      fitThree(
        runtime,
        false,
        threeFocusIds(modelRef.current, expandedRef.current, selectedRef.current),
        'selection',
      );
      renderAndMeasureThree(runtime, container);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

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

    let lastFrameAt = 0;
    const minimumFrameMs = compact ? 1000 / 36 : 0;
    const animate = (now: number) => {
      runtime.frame = requestAnimationFrame(animate);
      if (document.hidden) return;
      if (minimumFrameMs && now - lastFrameAt < minimumFrameMs) return;
      lastFrameAt = now;
      updateSynapsePulses(runtime, now);
      controls.update();
      renderer.render(scene, camera);
    };
    runtime.frame = requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(runtime.frame);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
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
    container.dataset.threeNodeCount = String(visibleAtlasIds(model, expanded).length);
    container.dataset.threeSynapseCount = String(runtime.pulses.length);

    const focusIds = threeFocusIds(model, expanded, selectedId);
    const focusKey = `${model.revision}|${expansionKey}|${selectedId || ''}`;
    if (!runtime.hasFit) {
      runtime.hasFit = true;
      fitThree(runtime, false, focusIds, 'selection');
      lastFocusKey.current = focusKey;
    } else if (lastFocusKey.current !== focusKey) {
      fitThree(runtime, true, focusIds, 'selection');
      lastFocusKey.current = focusKey;
    }

    const painted = renderAndMeasureThree(runtime, container);
    if (painted > 0 || !isAtlasReadback()) onReadyRef.current?.();
  }, [model.revision, expansionKey, showBeams]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || lastFitNonce.current === fitNonce) return;
    lastFitNonce.current = fitNonce;
    fitThree(runtime, true, null, 'all');
  }, [fitNonce]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyThreeSelection(runtime, selectedId);
    const focusKey = `${model.revision}|${expansionKey}|${selectedId || ''}`;
    if (lastFocusKey.current === focusKey) return;
    fitThree(runtime, true, threeFocusIds(model, expanded, selectedId), 'selection');
    lastFocusKey.current = focusKey;
  }, [selectedId, model.revision, expansionKey]);

  return (
    <div
      ref={containerRef}
      className="atlas-three-surface"
      data-testid="atlas-metro-3d"
      data-three-visual="neural-synapse"
    >
      <div ref={tooltipRef} className="atlas-three-tooltip" />
    </div>
  );
}

export function MetroAtlasRenderer(props: Props) {
  return (
    <div className="atlas-renderer" data-mode={props.viewMode}>
      {props.viewMode === '2d' ? (
        <div className="atlas-render-layer active" aria-hidden="false">
          <Metro2DView {...props} />
        </div>
      ) : (
        <div className="atlas-render-layer active" aria-hidden="false">
          <MetroThreeView {...props} />
        </div>
      )}
    </div>
  );
}
