import { useEffect, useRef, useState } from 'react';
import {
  buildSceneLayout, applyParallax, hitTest, nodeRadius, clampZoom, zoomStep,
  rotationFromDrag, tiltFromDrag, rotationFromKey, tiltFromKey, panFromDrag,
  type OrbitalPosition
} from './orbital-2_5d-layout';
import type { GraphProjection } from './types';

type Props = {
  projection: GraphProjection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenNode: (id: string) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
};

const DRAG_CLICK_THRESHOLD = 4; // px -- below this, a pointerup is treated as a click, not a drag

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

type ThemePalette = {
  focus: string;
  domain: string;
  campaign: string;
  transversal: string;
  edge: string;
  grid: string;
  label: string;
};

/**
 * Reads the live theme tokens (premium-theme.css, already themed per data-theme) via
 * getComputedStyle instead of hardcoding colors -- this is what makes the canvas
 * render legibly under every preset (light/dark/classic/deep-space/high-contrast)
 * instead of assuming a dark background, which produced unreadable near-white labels
 * on the light "Clássico" default.
 */
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

// PROGRAM (Engineering/Olympus) and ACTION (Operations) are the real structural
// types those systems publish where Science has DOMAIN/CAMPAIGN. They fill the same
// two visual roles -- PROGRAM as a drill-in cluster like DOMAIN, ACTION as a terminal
// leaf like CAMPAIGN -- without being relabeled or given fabricated data.
const TERMINAL_TYPES = new Set(['CAMPAIGN', 'ACTION']);

function isTerminalType(type: string): boolean {
  return TERMINAL_TYPES.has(type.toUpperCase());
}

function colorFor(type: string, palette: ThemePalette): string {
  const upper = type.toUpperCase();
  if (isTerminalType(upper)) return palette.campaign;
  if (upper === 'DERIVED_NAVIGATION_GROUP') return palette.transversal;
  return palette.domain;
}

/**
 * Canvas 2.5D renderer: plain HTML5 Canvas 2D, no WebGL/Three.js/Pixi. "2.5D" comes
 * from depth cues on a flat canvas -- a z-scaled parallax drift on pointer move, size/
 * glow falloff by depth -- not a real 3D scene graph. Draws exactly the locked map
 * contract's two rendered levels: the focused node at center, its direct DOMAIN/
 * CAMPAIGN satellites on one ring. Respects prefers-reduced-motion by disabling the
 * parallax response entirely (static layout, not just a slower one).
 */
export function Canvas25DGraph({ projection, selectedId, onSelect, onOpenNode, zoom = 1, onZoomChange }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);
  const hitboxesRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  // Real drag-to-orbit state: horizontal drag spins azimuth (rotation), vertical
  // drag tilts the ellipse (simulated elevation) -- a genuine "navigate in 3D"
  // interaction on a plain 2D canvas, not a passive hover effect.
  const orbitRef = useRef({ rotation: 0, tilt: 0.55 });
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ mode: 'orbit' | 'pan'; pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastFocusRef = useRef<string | null>(null);

  useEffect(() => {
    // A new focus resets the camera to a clean default framing rather than keeping
    // whatever orbit/pan the user left on the previous subgraph.
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

    let width = host.clientWidth;
    let height = host.clientHeight;

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

    const draw = () => {
      const palette = readThemePalette();
      const centerNode = projection.nodes.find(node => node.id === projection.focusId) || projection.nodes[0];
      const satellites = projection.nodes.filter(node => node.id !== centerNode?.id);
      if (!centerNode) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      const orbit = orbitRef.current;
      // Leave a real label-safe margin around the orbit. The previous
      // min(width,height)*.36 framing pushed the outer labels outside the
      // viewport on the narrow app shell, making the graph feel cropped before
      // the user ever started navigating it.
      const radius = Math.min(width * 0.30, height * 0.34);
      const scene = buildSceneLayout(centerNode.id, satellites.map(node => node.id), radius, orbit);
      const pointer = reducedMotion ? { x: 0, y: 0 } : pointerRef.current;
      const positioned: Array<OrbitalPosition & { label: string; type: string }> = [
        { ...scene.center, angle: 0, label: String(centerNode.label || centerNode.id), type: String(centerNode.type || '') },
        ...scene.satellites.map(pos => {
          const eased = applyParallax(pos, pointer);
          const node = satellites.find(candidate => candidate.id === pos.id);
          return { ...eased, label: String(node?.label || pos.id), type: String(node?.type || '') };
        })
      ];
      // Paint distant satellites first and keep the focus node in front. This
      // makes z affect occlusion as well as parallax, so depth remains legible
      // when several nodes occupy a similar screen-space orbit.
      const drawOrder = [...positioned.slice(1).sort((a, b) => a.z - b.z), positioned[0]];

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + panRef.current.x, height / 2 + panRef.current.y);
      ctx.scale(zoom, zoom);

      // Orbit ring (structural, not decorative -- shows where satellites live).
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * orbit.tilt, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Connective lines, center -> each satellite.
      for (const pos of positioned.slice(1)) {
        ctx.strokeStyle = palette.edge;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const hitboxes: Array<{ id: string; x: number; y: number; radius: number }> = [];
      for (const pos of drawOrder) {
        const isCenter = pos.id === centerNode.id;
        const kind = isCenter ? 'center' : isTerminalType(pos.type) ? 'campaign' : 'domain';
        const selected = pos.id === selectedId;
        const depthScale = isCenter ? 1 : 0.82 + pos.z * 0.3;
        const r = nodeRadius(kind, selected) * depthScale;
        const color = isCenter ? palette.focus : colorFor(pos.type, palette);

        const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * (isCenter ? 2.4 : 1.8));
        glow.addColorStop(0, `${color}66`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * (isCenter ? 2.4 : 1.8), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = palette.label;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.fillStyle = palette.label;
        ctx.font = isCenter ? '600 13px system-ui, sans-serif' : '500 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pos.label, pos.x, pos.y + r + 14);

        hitboxes.push({
          id: pos.id,
          x: pos.x * zoom + width / 2 + panRef.current.x,
          y: pos.y * zoom + height / 2 + panRef.current.y,
          radius: r * zoom
        });
      }
      hitboxesRef.current = hitboxes;
      ctx.restore();
    };

    const requestDraw = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        const dx = event.clientX - drag.lastX;
        const dy = event.clientY - drag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_CLICK_THRESHOLD) drag.moved = true;
        if (drag.mode === 'orbit') {
          orbitRef.current = { rotation: rotationFromDrag(orbitRef.current.rotation, dx), tilt: tiltFromDrag(orbitRef.current.tilt, dy) };
        } else {
          panRef.current = panFromDrag(panRef.current, dx, dy);
        }
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

    // Real drag-to-orbit/pan: pointerdown starts tracking without yet deciding
    // click vs. drag (a click is just a drag that never crossed the threshold).
    // Plain drag orbits; holding Shift (or a two-finger touch, handled separately
    // below) pans instead -- matching the standard orbit-camera convention.
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (pinchRef.current.size > 0) return; // a pinch gesture is already in progress
      canvas.setPointerCapture(event.pointerId);
      dragRef.current = { mode: event.shiftKey ? 'pan' : 'orbit', pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: false };
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      canvas.releasePointerCapture(event.pointerId);
      dragRef.current = null;
      if (drag.moved) return; // a real drag, not a click -- selection stays as-is
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const hitId = hitTest(hitboxesRef.current, px, py);
      if (!hitId) {
        onSelect(null);
        return;
      }
      const node = projection.nodes.find(candidate => candidate.id === hitId);
      if (node && !isTerminalType(String(node.type || '')) && hitId !== projection.focusId) onOpenNode(hitId);
      else onSelect(hitId);
    };

    // Two-finger pinch-to-zoom, tracked independently of the single-pointer drag
    // above (touch also fires pointerdown/move/up per finger).
    const onTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2) {
        dragRef.current = null; // a second finger landed mid-drag: hand off to pinch
      }
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
      if (previousDistance <= 0) return;
      onZoomChange(clampZoom(zoom * (distance / previousDistance)));
    };

    const onTouchPointerUp = (event: PointerEvent) => {
      pinchRef.current.delete(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      if (!onZoomChange) return;
      event.preventDefault();
      const direction: 1 | -1 = event.deltaY < 0 ? 1 : -1;
      onZoomChange(zoomStep(zoom, direction, 0.12));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 24 : 0;
      if (event.key === 'ArrowLeft' && step) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, -step, 0); requestDraw(); return; }
      if (event.key === 'ArrowRight' && step) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, step, 0); requestDraw(); return; }
      if (event.key === 'ArrowUp' && step) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, 0, -step); requestDraw(); return; }
      if (event.key === 'ArrowDown' && step) { event.preventDefault(); panRef.current = panFromDrag(panRef.current, 0, step); requestDraw(); return; }
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

  return (
    <div ref={hostRef} className="canvas-25d-graph-host" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* position:absolute removes the canvas from normal flow -- without it, the
          canvas's own pixel-buffer size (set imperatively below) feeds back into the
          host's measured clientHeight via layout, which fed back into the next
          resize() call and grew the container without bound (reproduced: host grew
          to 18000+px before this fix). */}
      <canvas
        ref={canvasRef}
        role="application"
        tabIndex={0}
        aria-label="Mapa orbital 2.5D de domínios e campanhas. Arraste para orbitar, Shift+arraste para deslocar, roda ou pinça para zoom, setas para orbitar, Shift+setas para deslocar, +/- para zoom, 0 para redefinir a câmera."
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' }}
      />
    </div>
  );
}
