import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from './graph3d.ts';

export interface Viewport25D {
  width: number;
  height: number;
  panX: number;
  panY: number;
  zoom: number;
}

export interface ProjectedNode25D extends PlacedNode3D {
  screenX: number;
  screenY: number;
  screenRadius: number;
  depth: number;
  depthScale: number;
  alpha: number;
}

export interface Bounds25D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minDepth: number;
  maxDepth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function projectedWorldPoint(node: PlacedNode3D): { x: number; y: number } {
  return {
    x: node.x + node.z * 0.16,
    y: node.y - node.z * 0.085,
  };
}

export function graphBounds25D(nodes: PlacedNode3D[]): Bounds25D {
  if (!nodes.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1, minDepth: -1, maxDepth: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minDepth = Infinity;
  let maxDepth = -Infinity;
  for (const node of nodes) {
    const point = projectedWorldPoint(node);
    minX = Math.min(minX, point.x - node.radius);
    maxX = Math.max(maxX, point.x + node.radius);
    minY = Math.min(minY, point.y - node.radius);
    maxY = Math.max(maxY, point.y + node.radius);
    minDepth = Math.min(minDepth, node.z);
    maxDepth = Math.max(maxDepth, node.z);
  }
  return { minX, maxX, minY, maxY, minDepth, maxDepth };
}

export function projectNode25D(
  node: PlacedNode3D,
  bounds: Bounds25D,
  viewport: Viewport25D,
): ProjectedNode25D {
  const world = projectedWorldPoint(node);
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const padding = Math.min(76, Math.max(26, Math.min(viewport.width, viewport.height) * 0.08));
  const fitScale = Math.min(
    Math.max(1, viewport.width - padding * 2) / spanX,
    Math.max(1, viewport.height - padding * 2) / spanY,
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const depthSpan = Math.max(1, bounds.maxDepth - bounds.minDepth);
  const depth = (node.z - bounds.minDepth) / depthSpan;
  const depthScale = Math.max(0.82, Math.min(1.18, 0.86 + depth * 0.28));
  const scale = fitScale * viewport.zoom;
  const screenX = viewport.width / 2 + (world.x - centerX) * scale + viewport.panX + node.z * 0.22 * viewport.zoom;
  const screenY = viewport.height / 2 + (world.y - centerY) * scale + viewport.panY - node.z * 0.09 * viewport.zoom;
  const baseRadius = node.type === 'DOMAIN' ? Math.min(23, 11 + node.radius * 4.5) : Math.min(13, 4.4 + node.radius * 5.2);
  const screenRadius = clamp(baseRadius * depthScale * Math.sqrt(viewport.zoom), 3.8, node.type === 'DOMAIN' ? 26 : 15);
  return {
    ...node,
    screenX,
    screenY,
    screenRadius,
    depth,
    depthScale,
    alpha: 0.62 + depth * 0.38,
  };
}

export function projectGraph25D(nodes: PlacedNode3D[], viewport: Viewport25D): ProjectedNode25D[] {
  const bounds = graphBounds25D(nodes);
  return nodes
    .map(node => projectNode25D(node, bounds, viewport))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

export function neighboursOf25D(id: string | null, edges: GraphEdge[]): Set<string> {
  if (!id) return new Set();
  const neighbours = new Set<string>([id]);
  for (const edge of edges) {
    if (edge.from === id) neighbours.add(edge.to);
    if (edge.to === id) neighbours.add(edge.from);
  }
  return neighbours;
}
