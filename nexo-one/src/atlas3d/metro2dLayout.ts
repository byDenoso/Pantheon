import type { AtlasMetroModel, AtlasMetroNode } from './atlasAdapter.ts';
import { atlasPathTo } from './atlasAdapter.ts';

export type MetroLabelPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface MetroLabelSpec {
  visible: boolean;
  placement: MetroLabelPlacement;
  offsetX: number;
  offsetY: number;
  maxWidth: number;
  fontSize: number;
  box: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface MetroLabelLayout {
  byId: Map<string, MetroLabelSpec>;
  visible: number;
  hidden: number;
  collisions: number;
  maxSiblings: number;
}

type Rect = { x1: number; y1: number; x2: number; y2: number };

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const radians = (degrees: number) => degrees * Math.PI / 180;

function rootFor(model: AtlasMetroModel, id: string): string {
  return atlasPathTo(model, id)[0]?.id || id;
}

export function metroNodeSize(node: AtlasMetroNode): number {
  const base = node.entityType === 'hub' ? 58 : node.entityType === 'subdomain' ? 30 : 20;
  return Math.round(base + Math.min(34, Math.sqrt(node.descendantCount + 1) * 6));
}

export function metroLabelFontSize(node: AtlasMetroNode): number {
  if (node.entityType === 'hub') return 13;
  if (node.entityType === 'subdomain') return 11;
  return 10;
}

function labelMaxWidth(node: AtlasMetroNode): number {
  if (node.entityType === 'hub') return 176;
  if (node.entityType === 'subdomain') return 154;
  return 138;
}

function estimateLabelWidth(node: AtlasMetroNode): number {
  const fontSize = metroLabelFontSize(node);
  const estimated = node.name.length * fontSize * .58 + 14;
  return clampValue(estimated, 42, labelMaxWidth(node));
}

function estimateLabelHeight(node: AtlasMetroNode): number {
  return metroLabelFontSize(node) + 9;
}

function intersects(a: Rect, b: Rect, padding = 0): boolean {
  return !(
    a.x2 + padding <= b.x1 ||
    a.x1 >= b.x2 + padding ||
    a.y2 + padding <= b.y1 ||
    a.y1 >= b.y2 + padding
  );
}

function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const height = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return width * height;
}

function candidateBox(
  position: [number, number],
  node: AtlasMetroNode,
  placement: MetroLabelPlacement,
  extraOffset: number,
): Rect {
  const [x, y] = position;
  const radius = metroNodeSize(node) / 2;
  const width = estimateLabelWidth(node);
  const height = estimateLabelHeight(node);
  const gap = node.entityType === 'hub' ? 10 : node.entityType === 'subdomain' ? 8 : 6;
  const distance = radius + gap + extraOffset;

  if (placement === 'top') {
    return { x1: x - width / 2, x2: x + width / 2, y1: y - distance - height, y2: y - distance };
  }
  if (placement === 'bottom') {
    return { x1: x - width / 2, x2: x + width / 2, y1: y + distance, y2: y + distance + height };
  }
  if (placement === 'left') {
    return { x1: x - distance - width, x2: x - distance, y1: y - height / 2, y2: y + height / 2 };
  }
  return { x1: x + distance, x2: x + distance + width, y1: y - height / 2, y2: y + height / 2 };
}

function preferredPlacement(
  model: AtlasMetroModel,
  node: AtlasMetroNode,
  positions: Map<string, [number, number]>,
): MetroLabelPlacement {
  if (!node.parentId) return 'bottom';
  const current = positions.get(node.id);
  const parent = positions.get(node.parentId);
  if (!current || !parent) return 'bottom';
  const dx = current[0] - parent[0];
  const dy = current[1] - parent[1];
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function placementOrder(preferred: MetroLabelPlacement): MetroLabelPlacement[] {
  if (preferred === 'right') return ['right', 'top', 'bottom', 'left'];
  if (preferred === 'left') return ['left', 'top', 'bottom', 'right'];
  if (preferred === 'top') return ['top', 'right', 'left', 'bottom'];
  return ['bottom', 'right', 'left', 'top'];
}

function offsetFor(placement: MetroLabelPlacement, extra: number): { offsetX: number; offsetY: number } {
  if (placement === 'left') return { offsetX: -extra, offsetY: 0 };
  if (placement === 'right') return { offsetX: extra, offsetY: 0 };
  if (placement === 'top') return { offsetX: 0, offsetY: -extra };
  return { offsetX: 0, offsetY: extra };
}

function maxVisibleSiblingCount(model: AtlasMetroModel, visible: Set<string>): number {
  let maximum = 0;
  for (const children of model.childrenMap.values()) {
    maximum = Math.max(maximum, children.filter(id => visible.has(id)).length);
  }
  return maximum;
}

export function metroLayoutPositions(
  model: AtlasMetroModel,
  ids: string[],
  width: number,
  height: number,
): Map<string, [number, number]> {
  // Use a generous virtual canvas. G6 fitView handles the actual viewport.
  // This avoids the old failure mode where many children were clamped against
  // one screen edge and became a literal pile of nodes and labels.
  const w = Math.max(1200, width || 900);
  const h = Math.max(760, height || 700);
  const anchorsByDomain: Record<string, [number, number]> = {
    NEXO: [w * .18, h * .58],
    SCIENCE: [w * .55, h * .27],
    OLYMPUS: [w * .82, h * .70],
  };
  const startAngles: Record<string, number> = {
    NEXO: 145,
    SCIENCE: -150,
    OLYMPUS: 25,
  };

  const visible = new Set(ids);
  const positions = new Map<string, [number, number]>();

  for (const rootId of model.roots) {
    const root = model.nodeMap.get(rootId);
    if (!root) continue;
    positions.set(rootId, anchorsByDomain[root.domain]);
  }

  // First-level stations receive a full radial ring whose radius grows with
  // station count and label width. Small domains stay compact; dense ones open up.
  for (const rootId of model.roots) {
    const root = model.nodeMap.get(rootId);
    if (!root) continue;
    const direct = (model.childrenMap.get(rootId) || []).filter(id => visible.has(id));
    if (!direct.length) continue;

    const anchor = anchorsByDomain[root.domain];
    const maxLabel = Math.max(...direct.map(id => estimateLabelWidth(model.nodeMap.get(id)!)), 80);
    const minArc = clampValue(maxLabel * .62 + 48, 100, 180);
    const radiusByArc = minArc * direct.length / (Math.PI * 2);
    const radius = clampValue(Math.max(168, radiusByArc), 168, 350);
    const start = startAngles[root.domain] || -90;

    direct.forEach((id, index) => {
      const angle = start + index * (360 / direct.length);
      positions.set(id, [
        anchor[0] + Math.cos(radians(angle)) * radius,
        anchor[1] + Math.sin(radians(angle)) * radius,
      ]);
    });
  }

  // Lay out deeper siblings in outward-facing fans. Dense parents gain multiple
  // rings and larger radii instead of reusing the same eight cramped offsets.
  const parents = new Map<string, string[]>();
  for (const id of ids) {
    const node = model.nodeMap.get(id);
    if (!node?.parentId || node.depth < 2) continue;
    const siblings = parents.get(node.parentId) || [];
    siblings.push(id);
    parents.set(node.parentId, siblings);
  }

  const orderedParents = [...parents.entries()].sort((a, b) => {
    const depthA = model.nodeMap.get(a[0])?.depth || 0;
    const depthB = model.nodeMap.get(b[0])?.depth || 0;
    return depthA - depthB || a[0].localeCompare(b[0]);
  });

  for (const [parentId, siblings] of orderedParents) {
    const parentPosition = positions.get(parentId);
    const parent = model.nodeMap.get(parentId);
    if (!parentPosition || !parent) continue;

    const rootId = rootFor(model, parentId);
    const root = model.nodeMap.get(rootId);
    const rootAnchor = root ? anchorsByDomain[root.domain] : [w / 2, h / 2] as [number, number];
    const outwardAngle = Math.atan2(
      parentPosition[1] - rootAnchor[1],
      parentPosition[0] - rootAnchor[0],
    ) * 180 / Math.PI;

    const maxLabel = Math.max(...siblings.map(id => estimateLabelWidth(model.nodeMap.get(id)!)), 74);
    const total = siblings.length;
    const perRing = total <= 8 ? total : total <= 18 ? 9 : 10;
    let cursor = 0;
    let ringIndex = 0;

    while (cursor < total) {
      const ringCount = Math.min(perRing, total - cursor);
      const sweep = ringCount <= 3 ? 100 : ringCount <= 6 ? 170 : 230;
      const minArc = clampValue(maxLabel * .72 + 46, 96, 168);
      const radiusByArc = ringCount > 1
        ? minArc * (ringCount - 1) / radians(sweep)
        : 118;
      const radius = Math.max(124 + ringIndex * 112, radiusByArc);
      const start = outwardAngle - sweep / 2;

      for (let localIndex = 0; localIndex < ringCount; localIndex += 1) {
        const id = siblings[cursor + localIndex]!;
        const angle = ringCount === 1
          ? outwardAngle
          : start + localIndex * (sweep / (ringCount - 1));
        positions.set(id, [
          parentPosition[0] + Math.cos(radians(angle)) * radius,
          parentPosition[1] + Math.sin(radians(angle)) * radius,
        ]);
      }

      cursor += ringCount;
      ringIndex += 1;
    }
  }

  return positions;
}

export function buildMetroLabelLayout(
  model: AtlasMetroModel,
  ids: string[],
  positions: Map<string, [number, number]>,
  selectedId: string | null = null,
): MetroLabelLayout {
  const visibleSet = new Set(ids);
  const nodeRects = new Map<string, Rect>();

  for (const id of ids) {
    const node = model.nodeMap.get(id);
    const position = positions.get(id);
    if (!node || !position) continue;
    const radius = metroNodeSize(node) / 2 + 7;
    nodeRects.set(id, {
      x1: position[0] - radius,
      y1: position[1] - radius,
      x2: position[0] + radius,
      y2: position[1] + radius,
    });
  }

  const ordered = ids
    .map(id => model.nodeMap.get(id))
    .filter((node): node is AtlasMetroNode => Boolean(node))
    .sort((a, b) => {
      const priority = (node: AtlasMetroNode) =>
        node.id === selectedId ? -1 : node.entityType === 'hub' ? 0 : node.entityType === 'subdomain' ? 1 : 2;
      return priority(a) - priority(b)
        || b.childCount - a.childCount
        || b.relationCount - a.relationCount
        || a.name.localeCompare(b.name);
    });

  const occupied: Array<{ id: string; rect: Rect }> = [];
  const byId = new Map<string, MetroLabelSpec>();
  const distances = [0, 10, 22, 38, 58, 82];

  for (const node of ordered) {
    const position = positions.get(node.id);
    if (!position) continue;

    const preferred = preferredPlacement(model, node, positions);
    const placements = placementOrder(preferred);
    let chosen: { placement: MetroLabelPlacement; extra: number; rect: Rect } | null = null;
    let fallback: { placement: MetroLabelPlacement; extra: number; rect: Rect; score: number } | null = null;

    for (const extra of distances) {
      for (const placement of placements) {
        const rect = candidateBox(position, node, placement, extra);
        let blocked = false;
        let score = 0;

        for (const item of occupied) {
          if (intersects(rect, item.rect, 5)) {
            blocked = true;
            score += intersectionArea(rect, item.rect) + 120;
          }
        }

        for (const [otherId, nodeRect] of nodeRects) {
          if (otherId === node.id) continue;
          if (intersects(rect, nodeRect, 3)) {
            blocked = true;
            score += intersectionArea(rect, nodeRect) + 90;
          }
        }

        if (!blocked) {
          chosen = { placement, extra, rect };
          break;
        }
        if (!fallback || score < fallback.score) fallback = { placement, extra, rect, score };
      }
      if (chosen) break;
    }

    const mustShow = node.entityType === 'hub' || node.entityType === 'subdomain' || node.id === selectedId;
    const finalChoice = chosen || (mustShow && fallback ? fallback : null);

    if (!finalChoice) {
      byId.set(node.id, {
        visible: false,
        placement: preferred,
        offsetX: 0,
        offsetY: 0,
        maxWidth: labelMaxWidth(node),
        fontSize: metroLabelFontSize(node),
        box: null,
      });
      continue;
    }

    const offsets = offsetFor(finalChoice.placement, finalChoice.extra);
    occupied.push({ id: node.id, rect: finalChoice.rect });
    byId.set(node.id, {
      visible: true,
      placement: finalChoice.placement,
      offsetX: offsets.offsetX,
      offsetY: offsets.offsetY,
      maxWidth: labelMaxWidth(node),
      fontSize: metroLabelFontSize(node),
      box: finalChoice.rect,
    });
  }

  // Count actual label-label overlaps after placement. Production readback uses
  // this as a regression gate for dense expanded clusters.
  let collisions = 0;
  for (let left = 0; left < occupied.length; left += 1) {
    for (let right = left + 1; right < occupied.length; right += 1) {
      if (intersects(occupied[left]!.rect, occupied[right]!.rect, 2)) collisions += 1;
    }
  }

  return {
    byId,
    visible: [...byId.values()].filter(spec => spec.visible).length,
    hidden: [...byId.values()].filter(spec => !spec.visible).length,
    collisions,
    maxSiblings: maxVisibleSiblingCount(model, visibleSet),
  };
}
