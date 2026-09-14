import { useEffect, useRef, useState } from 'react';
import {
  buildSceneLayout, applyParallax, hitTest, nodeRadius, clampZoom, zoomStep,
  rotationFromDrag, tiltFromDrag, rotationFromKey, tiltFromKey, panFromDrag,
  type OrbitalPosition
} from './orbital-2_5d-layout';
import { placeSpatialLabels } from './canvas-label-layout.mjs';
import { deriveGraphNavigation } from './navigation-contract.mjs';
import type { GraphProjection } from './types';

type Props = {
  projection: GraphProjection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenNode: (id: string) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
};

type ThemePalette = {
  focus: string;
  domain: string;
  campaign: string;
  transversal: string;
  edge: string;
  grid: string;
  label: string;
};

type PaintedNode = OrbitalPosition & {
  label: string;
  type: string;
  priority: number;
};

type LabelCandidate = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  forced: boolean;
  font: string;
  depthAlpha: number;
};

const DRAG_CLICK_THRESHOLD = 4;
const TERMINAL_STYLE_TYPES = new Set(['CAMPAIGN', 'ACTION']);

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return reduced;
}

function readThemePalette(): ThemePalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    focus: read('--graph-focus', '#55dfff'),
    domain: read('--graph-node-domain', '#4fb8ff'),
    campaign: read('--graph-node', '#6aa8ff'),
    transversal: read('--graph-node-claim', '#d782ff'),
    edge: read('--graph-edge', '#3b789f'),
    grid: read('--graph-grid', '#173346'),
    label: read('--graph-label', '#eefaff')
  };
}

function isTerminalStyle(type: string): boolean {
  return TERMINAL_STYLE_TYPES.has(type.toUpperCase());
}

function colorFor(type: string, palette: ThemePalette): string {
  const upper = type.toUpperCase();
  if (isTerminalStyle(upper)) return palette.campaign;
  if (upper === 'DERIVED_NAVIGATION_GROUP') return palette.transversal;
  return palette.domain;
}

function nodePriority(node: { id: string; type: string }, focusId: string | null, selectedId: string | null): number {
  if (node.id === focusId) return 100;
  if (node.id === selectedId) return 95;
  const type = node.type.toUpperCase();
  if (type === 'SYSTEM') return 88;
  if (type === 'DOMAIN' || type === 'PROGRAM') return 78;
  if (type === 'CAMPAIGN') return 58;
  return 45;
}

function labelBudget(width: number, zoom: number, count: number): number {
  const mobileBase = width < 720 ? 7 : width < 1050 ? 12 : 20;
  const zoomBoost = zoom > 1.45 ? 9 : zoom > 1.05 ? 4 : zoom < 0.75 ? -4 : 0;
  return Math.max(3, Math.min(count, mobileBase + zoomBoost));
}

/**
 * One spatial renderer, implemented on Canvas 2D. Depth is expressed by orbital
 * projection, z-sensitive scale/opacity, paint order, curved edges and label LOD.
 * The camera remains fully interactive (orbit, tilt, pan and zoom) without a second
 * WebGL product path.
 */
export function Canvas25DGraph({ projection, selectedId, onSelect, onOpenNode, zoom = 1, onZoomChange }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);
  const hitboxesRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const orbitRef = useRef({ rotation: 0, tilt: 0.55 });
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ mode: 'orbit' | 'pan'; pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastFocusRef.current !== projection.focusId) {
      lastFocusRef.current = projection.focusId;
      orbitRef.current = { rotation: 0, tilt: 0.55 };
      panRef.current = { x: 0, y: 0 };
    }
  }, [projection.focusId]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const navigation = deriveGraphNavigation(projection.nodes, projection.edges);
    let width = host.clientWidth;
    let height = host.clientHeight;

    const draw = () => {
      const palette = readThemePalette();
      const centerNode = projection.nodes.find(node => node.id === projection.focusId) || projection.nodes[0];
      const satellites = projection.nodes.filter(node => node.id !== centerNode?.id);
      ctx.clearRect(0, 0, width, height);
      if (!centerNode) return;

      const orbit = orbitRef.current;
      const radius = Math.max(110, Math.min(width * 0.31, height * 0.35));
      const scene = buildSceneLayout(centerNode.id, satellites.map(node => node.id), radius, orbit);
      const pointer = reducedMotion ? { x: 0, y: 0 } : pointerRef.current;
      const positioned: PaintedNode[] = [
        { ...scene.center, angle: 0, label: String(centerNode.label || centerNode.id), type: String(centerNode.type || ''), priority: nodePriority(centerNode, projection.focusId, selectedId) },
        ...scene.satellites.map(pos => {
          const eased = applyParallax(pos, pointer, 0.045);
          const node = satellites.find(candidate => candidate.id === pos.id)!;
          return { ...eased, label: String(node?.label || pos.id), type: String(node?.type || ''), priority: nodePriority(node, projection.focusId, selectedId) };
        })
      ];
      const drawOrder = [...positioned.slice(1).sort((a, b) => a.z - b.z), positioned[0]];

      ctx.save();
      ctx.translate(width / 2 + panRef.current.x, height / 2 + panRef.current.y);
      ctx.scale(zoom, zoom);

      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * orbit.tilt, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const pos of positioned.slice(1)) {
        const depth01 = Math.max(0, Math.min(1, pos.z));
        const selectedEndpoint = pos.id === selectedId || centerNode.id === selectedId;
        const edgeAlpha = selectedEndpoint ? 0.78 : 0.13 + depth01 * 0.28;
        const bend = ((pos.angle > Math.PI ? -1 : 1) * radius * 0.08) + pos.z * 8;
        ctx.save();
        ctx.globalAlpha = edgeAlpha;
        ctx.strokeStyle = palette.edge;
        ctx.lineWidth = selectedEndpoint ? 1.8 : 0.8 + depth01 * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(pos.x * 0.48 - pos.y * 0.08, pos.y * 0.48 + bend, pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
      }

      const hitboxes: Array<{ id: string; x: number; y: number; radius: number }> = [];
      const labelCandidates: LabelCandidate[] = [];
      for (const pos of drawOrder) {
        const isCenter = pos.id === centerNode.id;
        const selected = pos.id === selectedId;
        const depth01 = isCenter ? 1 : Math.max(0, Math.min(1, pos.z));
        const depthScale = isCenter ? 1 : 0.62 + depth01 * 0.48;
        const depthAlpha = isCenter ? 1 : 0.48 + depth01 * 0.5;
        const kind = isCenter ? 'center' : isTerminalStyle(pos.type) ? 'campaign' : 'domain';
        const r = nodeRadius(kind, selected) * depthScale;
        const color = isCenter ? palette.focus : colorFor(pos.type, palette);

        ctx.save();
        ctx.globalAlpha = depthAlpha;
        const glowRadius = r * (isCenter ? 2.05 : selected ? 1.9 : 1.5);
        const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowRadius);
        glow.addColorStop(0, `${color}58`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = palette.label;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();

        const font = isCenter ? '600 13px system-ui, sans-serif' : depth01 > 0.72 ? '600 11px system-ui, sans-serif' : '500 10.5px system-ui, sans-serif';
        ctx.font = font;
        const textWidth = Math.ceil(ctx.measureText(pos.label).width);
        labelCandidates.push({
          id: pos.id,
          label: pos.label,
          x: pos.x,
          y: pos.y + r + (isCenter ? 17 : 13),
          width: Math.min(Math.max(textWidth + 12, 48), 220),
          height: isCenter ? 22 : 18,
          priority: pos.priority + Math.round(depth01 * 10),
          forced: isCenter || selected,
          font,
          depthAlpha
        });

        hitboxes.push({
          id: pos.id,
          x: pos.x * zoom + width / 2 + panRef.current.x,
          y: pos.y * zoom + height / 2 + panRef.current.y,
          radius: Math.max(12, r * zoom)
        });
      }

      const maxOrdinary = labelBudget(width, zoom, satellites.length);
      const visibleLabels = placeSpatialLabels(labelCandidates, { padding: width < 720 ? 6 : 8, maxOrdinary });
      for (const label of visibleLabels) {
        ctx.save();
        ctx.globalAlpha = label.forced ? 1 : label.depthAlpha;
        ctx.font = label.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.label;
        ctx.fillText(label.label, label.x, label.y, Math.max(80, label.width - 4));
        ctx.restore();
      }

      hitboxesRef.current = hitboxes;
      ctx.restore();
    };

    const requestDraw = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(draw);
    };

    const resize = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        const dx = event.clientX - drag.lastX;
        const dy = event.clientY - drag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_CLICK_THRESHOLD) drag.moved = true;
        if (drag.mode === 'orbit') orbitRef.current = { rotation: rotationFromDrag(orbitRef.current.rotation, dx), tilt: tiltFromDrag(orbitRef.current.tilt, dy) };
        else panRef.current = panFromDrag(panRef.current, dx, dy);
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
        requestDraw();
        return;
      }
      if (reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      requestDraw();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (pinchRef.current.size > 0) return;
      canvas.setPointerCapture(event.pointerId);
      dragRef.current = { mode: event.shiftKey ? 'pan' : 'orbit', pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: false };
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      canvas.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      if (drag.moved) return;
      const rect = canvas.getBoundingClientRect();
      const hitId = hitTest(hitboxesRef.current, event.clientX - rect.left, event.clientY - rect.top);
      if (!hitId) { onSelect(null); return; }
      const navigationState = navigation.get(hitId);
      if (hitId !== projection.focusId && navigationState?.expandable === true) onOpenNode(hitId);
      else onSelect(hitId);
    };

    const onTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2) dragRef.current = null;
    };

    const onTouchPointerMove = (event: PointerEvent) => {
      if (!pinchRef.current.has(event.pointerId)) return;
      const previous = new Map(pinchRef.current);
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size !== 2 || !onZoomChange) return;
      const points = Array.from(pinchRef.current.values());
      const previousPoints = Array.from(previous.values());
      if (previousPoints.length !== 2) return;
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const previousDistance = Math.hypot(previousPoints[0].x - previousPoints[1].x, previousPoints[0].y - previousPoints[1].y);
      if (previousDistance > 0) onZoomChange(clampZoom(zoom * (distance / previousDistance)));
    };

    const onTouchPointerUp = (event: PointerEvent) => { pinchRef.current.delete(event.pointerId); };
    const onWheel = (event: WheelEvent) => {
      if (!onZoomChange) return;
      event.preventDefault();
      onZoomChange(zoomStep(zoom, event.deltaY < 0 ? 1 : -1, 0.12));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const panStep = event.shiftKey ? 24 : 0;
      if (event.key === 'ArrowLeft' && panStep) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, -panStep, 0); requestDraw(); return; }
      if (event.key === 'ArrowRight' && panStep) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, panStep, 0); requestDraw(); return; }
      if (event.key === 'ArrowUp' && panStep) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, 0, -panStep); requestDraw(); return; }
      if (event.key === 'ArrowDown' && panStep) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, 0, panStep); requestDraw(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); orbitRef.current = { ...orbitRef.current, rotation: rotationFromKey(orbitRef.current.rotation, -1) }; requestDraw(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); orbitRef.current = { ...orbitRef.current, rotation: rotationFromKey(orbitRef.current.rotation, 1) }; requestDraw(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); orbitRef.current = { ...orbitRef.current, tilt: tiltFromKey(orbitRef.current.tilt, 1) }; requestDraw(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); orbitRef.current = { ...orbitRef.current, tilt: tiltFromKey(orbitRef.current.tilt, -1) }; requestDraw(); return; }
      if ((event.key === '+' || event.key === '=') && onZoomChange) { event.preventDefault(); onZoomChange(zoomStep(zoom, 1)); return; }
      if ((event.key === '-' || event.key === '_') && onZoomChange) { event.preventDefault(); onZoomChange(zoomStep(zoom, -1)); return; }
      if (event.key === '0' || event.key === 'Home') {
        event.preventDefault();
        orbitRef.current = { rotation: 0, tilt: 0.55 };
        panRef.current = { x: 0, y: 0 };
        requestDraw();
      }
    };

    const onThemeChange = () => draw();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerdown', onTouchPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointermove', onTouchPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerup', onTouchPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointercancel', onTouchPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    window.addEventListener('atlas:theme-change', onThemeChange);
    resize();

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerdown', onTouchPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointermove', onTouchPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerup', onTouchPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointercancel', onTouchPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('atlas:theme-change', onThemeChange);
      cancelAnimationFrame(frameRef.current);
    };
  }, [projection, selectedId, onSelect, onOpenNode, onZoomChange, reducedMotion, zoom]);

  return <div ref={hostRef} className="canvas-25d-graph-host" style={{ width: '100%', height: '100%', position: 'relative' }}>
    <canvas
      ref={canvasRef}
      role="application"
      tabIndex={0}
      aria-label="Mapa espacial 2.5D. Arraste para orbitar, Shift+arraste para deslocar, roda ou pinça para zoom, setas para orbitar, Shift+setas para deslocar, +/- para zoom e 0 para redefinir a câmera."
      style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' }}
    />
  </div>;
}
