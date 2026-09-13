import { useEffect, useRef, useState } from 'react';
import { buildSceneLayout, applyParallax, hitTest, nodeRadius, type OrbitalPosition } from './orbital-2_5d-layout';
import type { GraphProjection } from './types';

type Props = {
  projection: GraphProjection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenNode: (id: string) => void;
};

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

function colorFor(type: string, palette: ThemePalette): string {
  const upper = type.toUpperCase();
  if (upper === 'CAMPAIGN') return palette.campaign;
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
export function Canvas25DGraph({ projection, selectedId, onSelect, onOpenNode }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);
  const hitboxesRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);

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

      const radius = Math.min(width, height) * 0.36;
      const scene = buildSceneLayout(centerNode.id, satellites.map(node => node.id), radius);
      const pointer = reducedMotion ? { x: 0, y: 0 } : pointerRef.current;
      const positioned: Array<OrbitalPosition & { label: string; type: string }> = [
        { ...scene.center, angle: 0, label: String(centerNode.label || centerNode.id), type: String(centerNode.type || '') },
        ...scene.satellites.map(pos => {
          const eased = applyParallax(pos, pointer);
          const node = satellites.find(candidate => candidate.id === pos.id);
          return { ...eased, label: String(node?.label || pos.id), type: String(node?.type || '') };
        })
      ];

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // Orbit ring (structural, not decorative -- shows where satellites live).
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.55, 0, 0, Math.PI * 2);
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
      for (const [index, pos] of positioned.entries()) {
        const isCenter = index === 0;
        const kind = isCenter ? 'center' : pos.type.toUpperCase() === 'CAMPAIGN' ? 'campaign' : 'domain';
        const selected = pos.id === selectedId;
        const r = nodeRadius(kind, selected);
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

        hitboxes.push({ id: pos.id, x: pos.x + width / 2, y: pos.y + height / 2, radius: r });
      }
      hitboxesRef.current = hitboxes;
      ctx.restore();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(draw);
    };

    const onClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const hitId = hitTest(hitboxesRef.current, px, py);
      if (!hitId) {
        onSelect(null);
        return;
      }
      const node = projection.nodes.find(candidate => candidate.id === hitId);
      if (node && String(node.type || '').toUpperCase() === 'DOMAIN' && hitId !== projection.focusId) onOpenNode(hitId);
      else onSelect(hitId);
    };

    const onThemeChange = () => draw();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    window.addEventListener('atlas:theme-change', onThemeChange);
    resize();

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('atlas:theme-change', onThemeChange);
      cancelAnimationFrame(frameRef.current);
    };
  }, [projection, selectedId, onSelect, onOpenNode, reducedMotion]);

  return (
    <div ref={hostRef} className="canvas-25d-graph-host" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* position:absolute removes the canvas from normal flow -- without it, the
          canvas's own pixel-buffer size (set imperatively below) feeds back into the
          host's measured clientHeight via layout, which fed back into the next
          resize() call and grew the container without bound (reproduced: host grew
          to 18000+px before this fix). */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Mapa orbital 2.5D de domínios e campanhas"
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
