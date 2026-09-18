import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { graphBounds3D } from '../viewmodels/graph3d.ts';
import '../styles/atlas3d.css';

const DOMAIN_COLOR: Record<string, string> = { NEXO: '#79f2d0', SCIENCE: '#44a8ff', ENGINEERING: '#71dfa0', OLYMPUS: '#bd8cff', ARTIFACT: '#f2b654' };
const ALERT_STATES = new Set(['BLOCKED', 'CONFLICT', 'MISSING_PROVIDER']);
const WARNING_STATES = new Set(['DEGRADED', 'STALE', 'STALE_DECLARATION', 'UNVERIFIED', 'UNKNOWN']);
const PRIORITY: Record<string, number> = { DOMAIN: 100, PROVIDER: 82, CAPABILITY: 60, ACTION: 56, CLAIM: 54, TEST: 46, PROJECTION: 42, FILAMENT: 40, MEMORY: 38, EFFECT: 36, SIDE_QUEST: 34 };
const MIN_ZOOM = .62;
const MAX_ZOOM = 3.4;
const TAU = Math.PI * 2;

type ScreenNode = { node: PlacedNode3D; x: number; y: number; depth: number; radius: number; alpha: number };
type Hitbox = { id: string; x: number; y: number; radius: number };
type Runtime = { reset: () => void; focus: (id: string | null, center?: boolean) => void };

function wrapAngle(value: number): number { return ((value % TAU) + TAU) % TAU; }

function nodeColor(node: PlacedNode3D): string {
  if (ALERT_STATES.has(node.state)) return '#ff6b72';
  if (WARNING_STATES.has(node.state)) return '#f2b654';
  return DOMAIN_COLOR[node.domain] ?? '#8fb2d0';
}
function alphaColor(color: string, alpha: number): string {
  const value = color.replace('#', '');
  const rgb = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
  return `rgba(${rgb.join(',')},${Math.max(0, Math.min(1, alpha))})`;
}
function project(node: PlacedNode3D, center: { x: number; y: number; z: number }, scale: number, camera: { zoom: number; rotation: number; tilt: number }) {
  const dx = node.x - center.x, dy = node.y - center.y, dz = node.z - center.z;
  const cos = Math.cos(camera.rotation), sin = Math.sin(camera.rotation);
  const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
  const ct = Math.cos(camera.tilt), st = Math.sin(camera.tilt);
  return { x: rx * scale * camera.zoom, y: (dy * ct - rz * st) * scale * camera.zoom, depth: Math.max(0, Math.min(1, .5 + (dy * st + rz * ct) / 90)) };
}
function radiusFor(node: PlacedNode3D, depth: number, zoom: number): number {
  const base = node.type === 'DOMAIN' ? 18 : node.type === 'PROVIDER' ? 11 : node.type === 'CAPABILITY' ? 8 : 6.5;
  return Math.max(node.type === 'DOMAIN' ? 13 : 5, base * (.72 + depth * .42) * Math.min(1.16, Math.max(.86, zoom)));
}
function labelFor(node: PlacedNode3D): string { return node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label; }

/** Canvas 2D renderer with orbital projection, depth cues, curved relations and readable label LOD. */
export function AtlasCanvas25D({ nodes, edges, selectedId, onSelect }: { nodes: PlacedNode3D[]; edges: GraphEdge[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null), canvasRef = useRef<HTMLCanvasElement | null>(null), tooltipRef = useRef<HTMLDivElement | null>(null), runtimeRef = useRef<Runtime | null>(null), selectedRef = useRef(selectedId), onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState('');
  selectedRef.current = selectedId; onSelectRef.current = onSelect;
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    if (!host || !canvas || !nodes.length) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setFailed('Canvas 2D indisponível neste navegador.'); return undefined; }
    setFailed('');
    const bounds = graphBounds3D(nodes), center = bounds.center, map = new Map(nodes.map(node => [node.id, node]));
    const camera = { rotation: 0, tilt: .58, zoom: 1, panX: 0, panY: 0 };
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { id: number; mode: 'orbit' | 'pan'; x: number; y: number; moved: boolean } | null = null;
    let width = host.clientWidth, height = host.clientHeight, scale = 1, frame = 0, pulse = 0;
    let hitboxes: Hitbox[] = [], screen = new Map<string, ScreenNode>();
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const neighbours = (id: string | null) => { const result = new Set<string>(); if (!id) return result; result.add(id); edges.forEach(edge => { if (edge.from === id) result.add(edge.to); if (edge.to === id) result.add(edge.from); }); return result; };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      scale = Math.max(.8, Math.min(width / Math.max(56, bounds.radius * 2.35), height / Math.max(54, bounds.radius * 1.85)));
      const projected = nodes.map(node => { const p = project(node, center, scale, camera); const radius = radiusFor(node, p.depth, camera.zoom); return { node, x: p.x + width / 2 + camera.panX, y: p.y + height / 2 + camera.panY, depth: p.depth, radius, alpha: node.id === selectedRef.current ? 1 : .48 + p.depth * .52 }; });
      screen = new Map(projected.map(item => [item.node.id, item]));
      const related = neighbours(selectedRef.current);
      const bg = ctx.createRadialGradient(width * .5, height * .45, 0, width * .5, height * .45, Math.max(width, height) * .7); bg.addColorStop(0, 'rgba(19,65,92,.38)'); bg.addColorStop(1, 'rgba(3,10,18,0)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.translate(width / 2 + camera.panX, height / 2 + camera.panY); ctx.strokeStyle = 'rgba(132,190,224,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, Math.min(width * .37, bounds.radius * scale * camera.zoom), Math.min(height * .27, bounds.radius * scale * camera.zoom * Math.max(.22, Math.abs(Math.sin(camera.tilt)))), 0, 0, TAU); ctx.stroke(); ctx.restore();
      for (const edge of [...edges].sort((a, b) => Number(a.weight ?? 0) - Number(b.weight ?? 0))) {
        const from = screen.get(edge.from), to = screen.get(edge.to); if (!from || !to) continue;
        const isLearning = edge.is_learning, critical = edge.kind === 'CONTRADICTS' || edge.kind === 'BLOCKS', isRelated = !selectedRef.current || (related.has(edge.from) && related.has(edge.to));
        const stroke = critical ? '#ff6b72' : isLearning ? (edge.learning_scope === 'INTER_DOMAIN' ? '#bd8cff' : '#44d9ff') : '#537b9e';
        ctx.save(); ctx.globalAlpha = !isRelated ? .05 : edge.blocked ? .2 : critical ? .78 : isLearning ? .72 : .24 + Math.min(.4, Number(edge.weight ?? 0) * .25); ctx.strokeStyle = stroke; ctx.lineWidth = (isLearning ? 1.6 : .8) + Math.min(2.2, Number(edge.weight ?? 0) * .7); if (edge.blocked) ctx.setLineDash([4, 5]); const bend = ((from.x + to.x) / 2 - width / 2) * .13; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo((from.x + to.x) / 2 + bend, (from.y + to.y) / 2 - bend * .32, to.x, to.y); ctx.stroke(); ctx.restore();
      }
      hitboxes = [];
      for (const item of [...projected].sort((a, b) => a.depth - b.depth)) {
        const isRelated = !selectedRef.current || related.has(item.node.id), selected = item.node.id === selectedRef.current, color = nodeColor(item.node);
        ctx.save(); ctx.globalAlpha = isRelated ? item.alpha : .12; const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.radius * (selected ? 3 : 2)); glow.addColorStop(0, alphaColor(color, selected ? .72 : .42)); glow.addColorStop(1, alphaColor(color, 0)); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(item.x, item.y, item.radius * (selected ? 3 : 2), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(5,16,28,.55)'; ctx.beginPath(); ctx.arc(item.x, item.y, item.radius * .46, 0, Math.PI * 2); ctx.fill(); if (selected) { ctx.globalAlpha = 1; ctx.strokeStyle = '#f3fcff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(item.x, item.y, item.radius + 4, 0, Math.PI * 2); ctx.stroke(); } if (item.node.state === 'BLOCKED' || item.node.state === 'CONFLICT') { ctx.strokeStyle = '#ffb0b4'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(item.x - item.radius * .55, item.y - item.radius * .55); ctx.lineTo(item.x + item.radius * .55, item.y + item.radius * .55); ctx.stroke(); } ctx.restore(); hitboxes.push({ id: item.node.id, x: item.x, y: item.y, radius: Math.max(14, item.radius + 7) });
      }
      // Learning edges terminate on an explicit connection port so the filament
      // remains visibly attached even when the node's dark core covers its center.
      for (const edge of edges.filter(item => item.is_learning)) {
        const from = screen.get(edge.from), to = screen.get(edge.to); if (!from || !to) continue;
        const color = edge.learning_scope === 'INTER_DOMAIN' ? '#bd8cff' : '#44d9ff';
        ctx.save(); ctx.globalAlpha = .92; ctx.strokeStyle = color; ctx.lineWidth = 1.15;
        for (const endpoint of [from, to]) {
          ctx.beginPath(); ctx.arc(endpoint.x, endpoint.y, endpoint.radius + 1.8, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#f5fbff'; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(endpoint.x, endpoint.y, 1.35, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      const learningEndpoints = new Set(edges.filter(edge => edge.is_learning).flatMap(edge => [edge.from, edge.to]));
      const candidates = [...projected].filter(item => item.node.type === 'DOMAIN' || item.node.type === 'PROVIDER' || item.node.id === selectedRef.current || (learningEndpoints.has(item.node.id) && camera.zoom > 1.02) || (camera.zoom > 1.42 && item.node.type === 'ACTION')).sort((a, b) => (PRIORITY[b.node.type] ?? 30) + b.depth * 10 - ((PRIORITY[a.node.type] ?? 30) + a.depth * 10));
      const labels: Array<{ x: number; y: number; w: number; h: number }> = [], maxLabels = width < 720 ? (camera.zoom > 1.5 ? 16 : 10) : camera.zoom > 1.3 ? 28 : 18;
      for (const item of candidates) { if (labels.length >= maxLabels) break; const text = learningEndpoints.has(item.node.id) && item.node.type === 'MEMORY' ? item.node.domain : labelFor(item.node); ctx.font = item.node.type === 'DOMAIN' ? '700 13px system-ui, sans-serif' : learningEndpoints.has(item.node.id) ? '700 10px system-ui, sans-serif' : '600 11px system-ui, sans-serif'; const w = Math.min(230, Math.max(52, ctx.measureText(text).width + 12)), x = item.x, y = item.y + item.radius + 15, box = { x: x - w / 2, y: y - 9, w, h: 18 }; if (labels.some(other => Math.abs(other.x + other.w / 2 - x) < (other.w + w) * .43 && Math.abs(other.y + other.h / 2 - y) < 22) && item.node.id !== selectedRef.current) continue; labels.push(box); ctx.save(); ctx.globalAlpha = item.node.id === selectedRef.current ? 1 : .78 + item.depth * .22; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = learningEndpoints.has(item.node.id) ? '#dcb8ff' : '#eaf7ff'; ctx.fillText(text, x, y, w - 6); ctx.restore(); }
      if (!reducedMotion && edges.some(edge => edge.is_learning && !edge.blocked)) { pulse = (pulse + .0035) % 1; for (const edge of edges.filter(edge => edge.is_learning && !edge.blocked)) { const from = screen.get(edge.from), to = screen.get(edge.to); if (!from || !to) continue; const t = (pulse + Number(edge.weight ?? 0) * .17) % 1, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t; ctx.save(); ctx.fillStyle = edge.learning_scope === 'INTER_DOMAIN' ? '#d6a7ff' : '#7cecff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } frame = requestAnimationFrame(draw); }
    };
    const requestDraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const resize = () => { width = host.clientWidth; height = host.clientHeight; const ratio = Math.min(globalThis.devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio)); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); requestDraw(); };
    const hit = (x: number, y: number) => [...hitboxes].reverse().find(item => Math.hypot(x - item.x, y - item.y) <= item.radius)?.id ?? null;
    const onPointerDown = (event: PointerEvent) => { if (event.button !== undefined && event.button !== 0) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size > 1) { drag = null; return; } canvas.setPointerCapture(event.pointerId); drag = { id: event.pointerId, mode: event.shiftKey ? 'pan' : 'orbit', x: event.clientX, y: event.clientY, moved: false }; };
    const onPointerMove = (event: PointerEvent) => { const previous = pointers.get(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size >= 2 && previous) { const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]; if (other) { const beforeDistance = Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y)), afterDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y); camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * Math.pow(afterDistance / beforeDistance, 1.35))); requestDraw(); } return; } if (drag && drag.id === event.pointerId) { const dx = event.clientX - drag.x, dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (drag.mode === 'pan') { camera.panX += dx; camera.panY += dy; } else { camera.rotation = wrapAngle(camera.rotation + dx * .008); camera.tilt = wrapAngle(camera.tilt - dy * .008); } drag.x = event.clientX; drag.y = event.clientY; requestDraw(); return; } const rect = canvas.getBoundingClientRect(), nodeId = hit(event.clientX - rect.left, event.clientY - rect.top), tooltip = tooltipRef.current; canvas.style.cursor = nodeId ? 'pointer' : 'grab'; if (tooltip && nodeId) { tooltip.textContent = map.get(nodeId)?.label ?? nodeId; tooltip.style.transform = `translate(${event.clientX - rect.left + 12}px, ${event.clientY - rect.top + 12}px)`; tooltip.dataset.visible = 'true'; } else if (tooltip) tooltip.dataset.visible = 'false'; };
    const onPointerUp = (event: PointerEvent) => { pointers.delete(event.pointerId); if (drag?.id === event.pointerId) { const moved = drag.moved; drag = null; if (!moved) { const rect = canvas.getBoundingClientRect(), id = hit(event.clientX - rect.left, event.clientY - rect.top); if (id) onSelectRef.current(id); } } };
    const onWheel = (event: WheelEvent) => { event.preventDefault(); camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * (event.deltaY < 0 ? 1.16 : .86))); requestDraw(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'ArrowLeft') camera.rotation = wrapAngle(camera.rotation - .12); else if (event.key === 'ArrowRight') camera.rotation = wrapAngle(camera.rotation + .12); else if (event.key === 'ArrowUp') camera.tilt = wrapAngle(camera.tilt + .12); else if (event.key === 'ArrowDown') camera.tilt = wrapAngle(camera.tilt - .12); else if (event.key === '+' || event.key === '=') camera.zoom = Math.min(MAX_ZOOM, camera.zoom * 1.25); else if (event.key === '-' || event.key === '_') camera.zoom = Math.max(MIN_ZOOM, camera.zoom * .8); else if (event.key === '0' || event.key === 'Home') { camera.rotation = 0; camera.tilt = .58; camera.zoom = 1; camera.panX = 0; camera.panY = 0; } else return; event.preventDefault(); requestDraw(); };
    const centerOn = (id: string | null) => { const node = id ? map.get(id) : null; if (!node) return; const p = project(node, center, scale, camera); camera.panX -= p.x; camera.panY -= p.y; requestDraw(); };
    runtimeRef.current = { reset: () => { camera.rotation = 0; camera.tilt = .58; camera.zoom = 1; camera.panX = 0; camera.panY = 0; requestDraw(); }, focus: (id, shouldCenter = false) => { if (shouldCenter) centerOn(id); requestDraw(); } };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('pointercancel', onPointerUp); canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('keydown', onKeyDown);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); runtimeRef.current = null; canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('pointercancel', onPointerUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('keydown', onKeyDown); };
  }, [nodes, edges]);
  useEffect(() => { runtimeRef.current?.focus(selectedId); }, [selectedId]);
  const key = (keyName: string) => canvasRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: keyName }));
  return <div ref={hostRef} className="atlas3d-shell" data-testid="atlas-3d-shell" data-renderer="canvas-25d"><div className="atlas3d-haze" aria-hidden="true" /><canvas ref={canvasRef} className="atlas3d-canvas" data-testid="atlas-3d-canvas" tabIndex={0} role="application" aria-label="Mapa Canvas 2,5D navegável do NEXO. Arraste para orbitar, Shift+arraste para deslocar, pinça ou roda para zoom e toque nos nós para inspecionar." /><div ref={tooltipRef} className="atlas3d-tooltip" data-visible="false" aria-hidden="true" /><div className="atlas3d-mobile-nav" aria-label="Navegação tátil do mapa 2,5D"><button type="button" aria-label="Girar mapa para a esquerda" onClick={() => key('ArrowLeft')}>←</button><button type="button" aria-label="Inclinar mapa para cima" onClick={() => key('ArrowUp')}>↑</button><button type="button" aria-label="Inclinar mapa para baixo" onClick={() => key('ArrowDown')}>↓</button><button type="button" aria-label="Girar mapa para a direita" onClick={() => key('ArrowRight')}>→</button><button type="button" aria-label="Aproximar mapa" onClick={() => key('+')}>＋</button><button type="button" aria-label="Afastar mapa" onClick={() => key('-')}>−</button></div><div className="atlas3d-controls" aria-label="Controles do mapa 2,5D"><button type="button" onClick={() => runtimeRef.current?.reset()} title="Restaurar visão geral">Visão geral</button><button type="button" disabled={!selectedId} onClick={() => runtimeRef.current?.focus(selectedId, true)} title="Centralizar seleção">Focar</button><span>arraste · pinça · toque no nó</span></div>{failed && <div className="atlas3d-fallback" role="alert">Renderização Canvas 2,5D indisponível: {failed}</div>}<div className="atlas3d-a11y-list" aria-label="Entidades do mapa 2,5D">{nodes.map(node => <button type="button" key={node.id} onClick={() => onSelect(node.id)}>{node.label}</button>)}</div><span className="atlas3d-depth" aria-hidden="true">2.5D</span>{selectedId && byId.has(selectedId) && <span className="atlas3d-selection" aria-live="polite">Foco: {byId.get(selectedId)?.label}</span>}</div>;
}
