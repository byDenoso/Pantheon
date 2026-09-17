import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphEdge, GraphNodeType } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { neighboursOf25D, projectGraph25D, type ProjectedNode25D, type Viewport25D } from '../viewmodels/graph25d.ts';
import '../styles/atlas25d.css';

const TYPE_COLOR: Record<GraphNodeType, string> = {
  DOMAIN: '#78f1cf',
  PROVIDER: '#4ea8ff',
  CAPABILITY: '#5bd89b',
  ACTION: '#f2b654',
  SIDE_QUEST: '#c898ff',
  EFFECT: '#76d7e8',
  PROJECTION: '#8093ad',
  CLAIM: '#e8c46a',
  FILAMENT: '#9fc3d7',
  TEST: '#76b9ff',
  MEMORY: '#b99cff',
};

const ALERT_STATES = new Set(['BLOCKED', 'CONFLICT', 'MISSING_PROVIDER']);
const WARNING_STATES = new Set(['DEGRADED', 'STALE', 'STALE_DECLARATION', 'UNVERIFIED', 'UNKNOWN']);

function stateColor(state: string): string {
  if (ALERT_STATES.has(state)) return '#ff6b72';
  if (WARNING_STATES.has(state)) return '#f2b654';
  return '#79f2d0';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function textLabel(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function edgeCurve(
  context: CanvasRenderingContext2D,
  from: ProjectedNode25D,
  to: ProjectedNode25D,
  bend: number,
): void {
  const midX = (from.screenX + to.screenX) / 2;
  const midY = (from.screenY + to.screenY) / 2;
  const dx = to.screenX - from.screenX;
  const dy = to.screenY - from.screenY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  context.beginPath();
  context.moveTo(from.screenX, from.screenY);
  context.quadraticCurveTo(midX + normalX * bend, midY + normalY * bend, to.screenX, to.screenY);
  context.stroke();
}

type CanvasSize = { width: number; height: number; dpr: number };
type Point = { x: number; y: number };
type PointerStart = Point & { at: number };

export function Atlas25DCanvas(
  { nodes, edges, selectedId, onSelect }:
  { nodes: PlacedNode3D[]; edges: GraphEdge[]; selectedId: string | null; onSelect: (id: string) => void },
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const viewportRef = useRef<Viewport25D>({ width: 1, height: 1, panX: 0, panY: 0, zoom: 1 });
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const pointersRef = useRef(new Map<number, Point>());
  const startsRef = useRef(new Map<number, PointerStart>());
  const lastPointerRef = useRef<Point | null>(null);
  const pinchRef = useRef<{ distance: number; center: Point } | null>(null);
  const lastTapRef = useRef<{ at: number; id: string } | null>(null);
  const [failed, setFailed] = useState('');

  onSelectRef.current = onSelect;
  selectedRef.current = selectedId;

  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  const project = () => projectGraph25D(nodes, viewportRef.current);

  const draw = () => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) {
      setFailed('Canvas 2D indisponível neste navegador.');
      return;
    }
    const { width, height, dpr } = sizeRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const projected = project();
    const projectedById = new Map(projected.map(node => [node.id, node]));
    const selected = selectedRef.current;
    const neighbours = neighboursOf25D(selected, edges);

    const domains = projected.filter(node => node.type === 'DOMAIN');
    for (const domain of domains) {
      const radius = clamp(72 * domain.depthScale * viewportRef.current.zoom, 52, 128);
      const gradient = context.createRadialGradient(domain.screenX, domain.screenY, 0, domain.screenX, domain.screenY, radius);
      gradient.addColorStop(0, 'rgba(55, 142, 166, 0.13)');
      gradient.addColorStop(0.52, 'rgba(31, 92, 126, 0.06)');
      gradient.addColorStop(1, 'rgba(12, 34, 56, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(domain.screenX, domain.screenY, radius, 0, Math.PI * 2);
      context.fill();
    }

    for (const edge of edges) {
      const from = projectedById.get(edge.from);
      const to = projectedById.get(edge.to);
      if (!from || !to) continue;
      const related = !selected || (neighbours.has(edge.from) && neighbours.has(edge.to));
      const critical = edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS';
      context.save();
      context.globalAlpha = related ? (critical ? 0.72 : clamp(0.14 + edge.weight * 0.32, 0.16, 0.5)) : 0.045;
      context.strokeStyle = critical ? '#ff746f' : '#6485a3';
      context.lineWidth = related && critical ? 1.8 : 1;
      const bend = ((edge.id.length % 7) - 3) * 2.4;
      edgeCurve(context, from, to, bend);
      context.restore();
    }

    for (const node of projected) {
      const related = !selected || neighbours.has(node.id);
      const isSelected = node.id === selected;
      const radius = node.screenRadius * (isSelected ? 1.15 : 1);
      context.save();
      context.globalAlpha = related ? node.alpha : 0.13;
      context.shadowColor = TYPE_COLOR[node.type];
      context.shadowBlur = isSelected ? 26 : node.type === 'DOMAIN' ? 18 : 9 * node.depthScale;
      context.shadowOffsetY = 3 + node.depth * 4;

      const fill = context.createRadialGradient(
        node.screenX - radius * 0.3,
        node.screenY - radius * 0.34,
        radius * 0.08,
        node.screenX,
        node.screenY,
        radius,
      );
      fill.addColorStop(0, '#f4ffff');
      fill.addColorStop(0.22, TYPE_COLOR[node.type]);
      fill.addColorStop(1, '#123049');
      context.fillStyle = fill;
      context.beginPath();
      context.arc(node.screenX, node.screenY, radius, 0, Math.PI * 2);
      context.fill();

      context.shadowBlur = 0;
      context.strokeStyle = stateColor(node.state);
      context.lineWidth = isSelected ? 3 : ALERT_STATES.has(node.state) || WARNING_STATES.has(node.state) ? 2 : 1;
      context.globalAlpha = related ? 0.96 : 0.14;
      context.stroke();

      if (isSelected) {
        context.strokeStyle = 'rgba(239, 250, 255, 0.86)';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(node.screenX, node.screenY, radius + 6, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    context.textBaseline = 'middle';
    context.textAlign = 'center';
    for (const node of projected) {
      const related = !selected || neighbours.has(node.id);
      if (!related) continue;
      const show = node.type === 'DOMAIN' || node.type === 'PROVIDER' || node.id === selected || (viewportRef.current.zoom > 1.58 && neighbours.has(node.id));
      if (!show) continue;
      const fontSize = node.type === 'DOMAIN' ? 12 : node.type === 'PROVIDER' ? 10 : 9;
      const y = node.screenY + node.screenRadius + fontSize + 3;
      context.save();
      context.font = `${node.type === 'DOMAIN' ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`;
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(3, 11, 19, 0.92)';
      context.strokeText(textLabel(node.label), node.screenX, y);
      context.fillStyle = node.id === selected ? '#ffffff' : 'rgba(225, 242, 250, 0.84)';
      context.fillText(textLabel(node.label), node.screenX, y);
      context.restore();
    }
  };

  const scheduleDraw = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(draw);
  };

  const hitTest = (point: Point): ProjectedNode25D | null => {
    const projected = project();
    for (let index = projected.length - 1; index >= 0; index -= 1) {
      const node = projected[index];
      if (Math.hypot(point.x - node.screenX, point.y - node.screenY) <= node.screenRadius + 7) return node;
    }
    return null;
  };

  const animateViewport = (target: Pick<Viewport25D, 'panX' | 'panY' | 'zoom'>) => {
    const start = { ...viewportRef.current };
    const started = performance.now();
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 360;
    const step = (now: number) => {
      const raw = duration === 0 ? 1 : clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      viewportRef.current.panX = start.panX + (target.panX - start.panX) * eased;
      viewportRef.current.panY = start.panY + (target.panY - start.panY) * eased;
      viewportRef.current.zoom = start.zoom + (target.zoom - start.zoom) * eased;
      scheduleDraw();
      if (raw < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const reset = () => animateViewport({ panX: 0, panY: 0, zoom: 1 });

  const focus = (id: string | null) => {
    if (!id || !byId.has(id)) return;
    const node = project().find(item => item.id === id);
    if (!node) return;
    const { width, height } = sizeRef.current;
    const current = viewportRef.current;
    const zoom = clamp(Math.max(current.zoom, node.type === 'DOMAIN' ? 1.34 : 1.65), 0.55, 3.4);
    const scaleRatio = zoom / current.zoom;
    animateViewport({
      zoom,
      panX: current.panX + (width / 2 - node.screenX) * scaleRatio,
      panY: current.panY + (height / 2 - node.screenY) * scaleRatio,
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) {
      setFailed('Canvas 2D indisponível neste navegador.');
      return undefined;
    }
    setFailed('');

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      sizeRef.current = { width, height, dpr };
      viewportRef.current.width = width;
      viewportRef.current.height = height;
      scheduleDraw();
    };

    const localPoint = (event: PointerEvent | WheelEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      const point = localPoint(event);
      pointersRef.current.set(event.pointerId, point);
      startsRef.current.set(event.pointerId, { ...point, at: performance.now() });
      canvas.setPointerCapture?.(event.pointerId);
      lastPointerRef.current = point;
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      }
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointersRef.current.has(event.pointerId)) {
        const hovered = hitTest(localPoint(event));
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
        return;
      }
      const point = localPoint(event);
      pointersRef.current.set(event.pointerId, point);
      if (pointersRef.current.size === 1 && lastPointerRef.current) {
        viewportRef.current.panX += point.x - lastPointerRef.current.x;
        viewportRef.current.panY += point.y - lastPointerRef.current.y;
        lastPointerRef.current = point;
        scheduleDraw();
      } else if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const previous = pinchRef.current;
        if (previous) {
          const oldZoom = viewportRef.current.zoom;
          const newZoom = clamp(oldZoom * (distance / previous.distance), 0.55, 3.4);
          const ratio = newZoom / oldZoom;
          const cx = sizeRef.current.width / 2;
          const cy = sizeRef.current.height / 2;
          viewportRef.current.panX = center.x - cx - (center.x - cx - viewportRef.current.panX) * ratio + (center.x - previous.center.x);
          viewportRef.current.panY = center.y - cy - (center.y - cy - viewportRef.current.panY) * ratio + (center.y - previous.center.y);
          viewportRef.current.zoom = newZoom;
          scheduleDraw();
        }
        pinchRef.current = { distance, center };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const point = localPoint(event);
      const start = startsRef.current.get(event.pointerId);
      const wasMultiTouch = pointersRef.current.size > 1;
      pointersRef.current.delete(event.pointerId);
      startsRef.current.delete(event.pointerId);
      pinchRef.current = null;
      lastPointerRef.current = pointersRef.current.size === 1 ? [...pointersRef.current.values()][0] : null;
      canvas.style.cursor = pointersRef.current.size ? 'grabbing' : 'grab';
      if (wasMultiTouch || !start) return;
      const isTap = Math.hypot(point.x - start.x, point.y - start.y) < 9 && performance.now() - start.at < 360;
      if (!isTap) return;
      const hit = hitTest(point);
      if (!hit) return;
      onSelectRef.current(hit.id);
      const lastTap = lastTapRef.current;
      const now = performance.now();
      if (lastTap && lastTap.id === hit.id && now - lastTap.at < 330) {
        focus(hit.id);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { at: now, id: hit.id };
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = localPoint(event);
      const oldZoom = viewportRef.current.zoom;
      const newZoom = clamp(oldZoom * Math.exp(-event.deltaY * 0.0011), 0.55, 3.4);
      const ratio = newZoom / oldZoom;
      const cx = sizeRef.current.width / 2;
      const cy = sizeRef.current.height / 2;
      viewportRef.current.panX = point.x - cx - (point.x - cx - viewportRef.current.panX) * ratio;
      viewportRef.current.panY = point.y - cy - (point.y - cy - viewportRef.current.panY) * ratio;
      viewportRef.current.zoom = newZoom;
      scheduleDraw();
    };

    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (hit) focus(hit.id);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    resize();

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [nodes, edges, byId]);

  useEffect(() => {
    scheduleDraw();
  }, [selectedId, nodes, edges]);

  return (
    <div className="atlas25d-shell" data-testid="atlas-25d-shell">
      <canvas
        ref={canvasRef}
        className="atlas25d-canvas"
        data-testid="atlas-25d-canvas"
        tabIndex={0}
        aria-label="Mapa estrutural 2,5D do NEXO. Arraste para mover, use pinça ou roda para zoom, toque em um nó para selecionar e toque duas vezes para focar."
      />
      <div className="atlas25d-depth" aria-hidden="true">2,5D</div>
      {selectedId && <div className="atlas25d-selection">{byId.get(selectedId)?.label ?? selectedId}</div>}
      <div className="atlas25d-controls" aria-label="Controles do mapa 2,5D">
        <button type="button" onClick={reset} title="Restaurar visão geral">Visão geral</button>
        <button type="button" disabled={!selectedId} onClick={() => focus(selectedId)} title="Centralizar seleção">Focar</button>
        <span>arraste · pinça · toque · duplo toque</span>
      </div>
      {failed && <div className="atlas25d-fallback" role="alert">{failed}</div>}
      <div className="atlas25d-a11y-list" aria-label="Entidades do mapa">
        {nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelectRef.current(node.id)} onDoubleClick={() => focus(node.id)}>
            {node.label} · {node.type} · {node.state}
          </button>
        ))}
      </div>
    </div>
  );
}
