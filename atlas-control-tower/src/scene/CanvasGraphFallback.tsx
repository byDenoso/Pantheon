import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { AtlasEdge, PositionedNode } from './types';

type Props = {
  nodes: PositionedNode[];
  edges: AtlasEdge[];
  labelIds: Set<string>;
  focusId: string;
  selectedId?: string | null;
  onNodeClick: (node: PositionedNode) => void;
  reducedMotion: boolean;
  compact: boolean;
};

type Pointer = { x: number; y: number };
type Runtime = {
  current: Map<string, Vector3>;
  target: Map<string, Vector3>;
  scale: number;
  panX: number;
  panY: number;
  pointer: Pointer | null;
  moved: boolean;
};

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

function radiusFor(node: PositionedNode, selected: boolean) {
  const type = String(node.type || '').toUpperCase();
  const base = type === 'ROOT' ? 31 : type === 'SYSTEM' ? 25 : type === 'DOMAIN' ? 21 : type === 'CAMPAIGN' ? 15 : 11;
  return base + (selected ? 4 : 0);
}

function colorFor(node: PositionedNode) {
  const type = String(node.type || '').toUpperCase();
  if (type === 'RESULT' || type === 'EVIDENCE') return '#69deb0';
  if (type === 'TEST') return '#ffc65d';
  if (type === 'CLAIM') return '#b68cff';
  return '#48bfff';
}

export function CanvasGraphFallback({ nodes, edges, labelIds, focusId, selectedId, onNodeClick, reducedMotion, compact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const labelsRef = useRef(labelIds);
  const runtimeRef = useRef<Runtime>({ current: new Map(), target: new Map(), scale: 1, panX: 0, panY: 0, pointer: null, moved: false });
  const selectedRef = useRef(selectedId);
  const focusRef = useRef(focusId);
  const callbackRef = useRef(onNodeClick);

  nodesRef.current = nodes;
  edgesRef.current = edges;
  labelsRef.current = labelIds;
  selectedRef.current = selectedId;
  focusRef.current = focusId;
  callbackRef.current = onNodeClick;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const runtime = runtimeRef.current;
    let frame = 0;
    let disposed = false;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = host.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(420, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const project = (node: PositionedNode) => {
      const point = runtime.current.get(node.id) || new Vector3(...node.position);
      const unit = Math.min(width, height) / (compact ? 18.5 : 16.5) * runtime.scale;
      const depth = 1 + point.z * 0.055;
      return {
        x: width / 2 + runtime.panX + point.x * unit * depth,
        y: height / 2 + runtime.panY + point.y * unit * 0.72 * depth,
        radius: radiusFor(node, node.id === selectedRef.current || node.id === focusRef.current) * Math.max(0.78, depth)
      };
    };

    const draw = () => {
      if (disposed) return;
      context.clearRect(0, 0, width, height);
      const visibleNodes = nodesRef.current;
      const visibleIds = new Set(visibleNodes.map(node => node.id));
      const points = new Map(visibleNodes.map(node => [node.id, project(node)]));

      context.save();
      context.translate(width / 2 + runtime.panX, height / 2 + runtime.panY);
      context.scale(runtime.scale, runtime.scale);
      context.strokeStyle = 'rgba(72,191,255,.11)';
      context.lineWidth = 1;
      [4.4, 5.5, 6.5].forEach(radius => {
        context.beginPath();
        context.ellipse(0, 0, radius * Math.min(width, height) / 16.5, radius * Math.min(width, height) / 16.5 * 0.72, 0, 0, Math.PI * 2);
        context.stroke();
      });
      context.restore();

      for (const edge of edgesRef.current) {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        const from = points.get(edge.source);
        const to = points.get(edge.target);
        if (!from || !to) continue;
        const related = !selectedRef.current || edge.source === selectedRef.current || edge.target === selectedRef.current;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.setLineDash(String(edge.type || '').toUpperCase() === 'RELATED' ? [3, 5] : []);
        context.strokeStyle = related ? 'rgba(77,190,255,.42)' : 'rgba(77,190,255,.09)';
        context.lineWidth = related ? 1.4 : 1;
        context.stroke();
        context.setLineDash([]);
      }

      for (const node of visibleNodes) {
        const point = points.get(node.id);
        if (!point) continue;
        const color = colorFor(node);
        const active = node.id === selectedRef.current || node.id === focusRef.current;
        const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, point.radius * (active ? 2.8 : 2.2));
        gradient.addColorStop(0, `${color}cc`);
        gradient.addColorStop(0.42, `${color}40`);
        gradient.addColorStop(1, `${color}00`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(point.x, point.y, point.radius * (active ? 2.8 : 2.2), 0, Math.PI * 2);
        context.fill();
        context.fillStyle = color;
        context.globalAlpha = active ? 1 : 0.86;
        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = active ? '#e5fbff' : 'rgba(206,245,255,.76)';
        context.lineWidth = active ? 2 : 1;
        context.stroke();

        if (!labelsRef.current.has(node.id)) continue;
        context.font = `${active ? 600 : 500} ${active ? 14 : 11}px system-ui, sans-serif`;
        context.textBaseline = 'middle';
        context.fillStyle = '#ecf9ff';
        context.fillText(String(node.label || node.id), point.x + point.radius + 7, point.y - 4);
        context.font = '700 8px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.fillStyle = active ? '#8ee6ff' : 'rgba(151,208,232,.75)';
        context.fillText(`${String(node.type || 'ENTITY')} · ${String(node.status || 'UNKNOWN')}`, point.x + point.radius + 7, point.y + 10);
      }
    };

    const tick = () => {
      const currentNodes = nodesRef.current;
      const ids = new Set(currentNodes.map(node => node.id));
      let moving = false;
      for (const node of currentNodes) {
        let current = runtime.current.get(node.id);
        if (!current) {
          current = runtime.current.size ? new Vector3(0, 0, 0) : new Vector3(...node.position);
          runtime.current.set(node.id, current);
          moving = true;
        }
        const target = new Vector3(...node.position);
        runtime.target.set(node.id, target);
        if (reducedMotion) current.copy(target);
        else {
          current.lerp(target, 0.075);
          moving ||= current.distanceTo(target) > 0.02;
        }
      }
      for (const id of runtime.current.keys()) if (!ids.has(id)) runtime.current.delete(id);
      draw();
      if (!disposed) frame = requestAnimationFrame(tick);
      if (!moving && reducedMotion) cancelAnimationFrame(frame);
    };

    const findNode = (x: number, y: number) => {
      let nearest: PositionedNode | undefined;
      let distance = Number.POSITIVE_INFINITY;
      for (const node of nodesRef.current) {
        const point = project(node);
        const next = Math.hypot(x - point.x, y - point.y);
        if (next <= point.radius + 12 && next < distance) { nearest = node; distance = next; }
      }
      return nearest;
    };
    const pointFromEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => { runtime.pointer = pointFromEvent(event); runtime.moved = false; canvas.setPointerCapture?.(event.pointerId); };
    const move = (event: PointerEvent) => {
      if (!runtime.pointer) return;
      const next = pointFromEvent(event);
      const dx = next.x - runtime.pointer.x;
      const dy = next.y - runtime.pointer.y;
      if (Math.hypot(dx, dy) > 3) runtime.moved = true;
      if (runtime.moved) { runtime.panX += dx; runtime.panY += dy; }
      runtime.pointer = next;
    };
    const up = (event: PointerEvent) => {
      const point = pointFromEvent(event);
      if (!runtime.moved) { const node = findNode(point.x, point.y); if (node) callbackRef.current(node); }
      runtime.pointer = null;
    };
    const wheel = (event: WheelEvent) => { event.preventDefault(); runtime.scale = Math.max(0.62, Math.min(1.8, runtime.scale * Math.exp(-event.deltaY * 0.0012))); };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [compact, reducedMotion]);

  return <div ref={hostRef} className="atlas-canvas-fallback" data-renderer="canvas-2d" role="img" aria-label="Mapa de conhecimento em Canvas 2.5D">
    <canvas ref={canvasRef} aria-hidden="true" />
    <span className="atlas-canvas-fallback-badge">CANVAS 2.5D · FALLBACK</span>
  </div>;
}
