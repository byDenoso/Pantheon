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

export interface MetroScreenLeader {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MetroScreenLabelSpec {
  id: string;
  visible: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  maxWidth: number;
  placement: MetroLabelPlacement;
  leader: MetroScreenLeader | null;
}

export interface MetroScreenLabelLayout {
  byId: Map<string, MetroScreenLabelSpec>;
  visible: number;
  hidden: number;
  collisions: number;
  uiZoneViolations: number;
  maxSiblings: number;
  zoom: number;
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
    const perRing = total <= 8 ? total : total <= 18 ? 9 : total <= 32 ? 11 : 12;
    let cursor = 0;
    let ringIndex = 0;

    while (cursor < total) {
      const ringCount = Math.min(perRing, total - cursor);
      const sweep = total >= 36
        ? 318
        : ringCount <= 3 ? 100 : ringCount <= 6 ? 170 : 244;
      const minArc = clampValue(maxLabel * .72 + 46, 96, 176);
      const radiusByArc = ringCount > 1
        ? minArc * (ringCount - 1) / radians(sweep)
        : 118;
      const radialStep = total >= 36 ? 132 : 112;
      const radius = Math.max((total >= 36 ? 148 : 124) + ringIndex * radialStep, radiusByArc);
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


function densityCap(siblingCount: number, zoom: number): number {
  if (siblingCount <= 16) return siblingCount;
  if (zoom >= 1.55) return siblingCount;
  if (zoom >= 1.15) return Math.min(siblingCount, 36);
  if (zoom >= .82) return Math.min(siblingCount, 26);
  if (zoom >= .58) return Math.min(siblingCount, 19);
  return Math.min(siblingCount, 14);
}

function evenlySampledIndices(count: number, cap: number): Set<number> {
  if (cap >= count) return new Set(Array.from({ length: count }, (_, index) => index));
  const out = new Set<number>();
  for (let slot = 0; slot < cap; slot += 1) {
    out.add(Math.min(count - 1, Math.floor((slot + .5) * count / cap)));
  }
  return out;
}

function screenCandidateBox(
  position: [number, number],
  node: AtlasMetroNode,
  placement: MetroLabelPlacement,
  extraOffset: number,
  zoom: number,
): Rect {
  const [x, y] = position;
  const radius = Math.max(5, metroNodeSize(node) * zoom / 2);
  const width = estimateLabelWidth(node);
  const height = estimateLabelHeight(node) + 1;
  const gap = node.entityType === 'hub' ? 11 : node.entityType === 'subdomain' ? 9 : 7;
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

function rectWithinViewport(rect: Rect, width: number, height: number, padding = 7): boolean {
  return rect.x1 >= padding && rect.y1 >= padding && rect.x2 <= width - padding && rect.y2 <= height - padding;
}

function floatingLabelBox(
  position: [number, number],
  node: AtlasMetroNode,
  angleDegrees: number,
  distance: number,
): Rect {
  const width = estimateLabelWidth(node);
  const height = estimateLabelHeight(node) + 1;
  const angle = radians(angleDegrees);
  const centerX = position[0] + Math.cos(angle) * distance;
  const centerY = position[1] + Math.sin(angle) * distance;
  return {
    x1: centerX - width / 2,
    x2: centerX + width / 2,
    y1: centerY - height / 2,
    y2: centerY + height / 2,
  };
}

function atlasUiSafeZones(viewportWidth: number, viewportHeight: number): Rect[] {
  const compact = viewportWidth <= 640;
  const zones: Rect[] = [
    // Mobile has a two-row topbar plus domain strip; desktop uses the compact single-row chrome.
    { x1: 0, y1: 0, x2: viewportWidth, y2: compact ? 138 : 116 },
    // Legend and adaptive-density note live near the bottom edge.
    { x1: 0, y1: Math.max(0, viewportHeight - (compact ? 46 : 54)), x2: viewportWidth, y2: viewportHeight },
  ];
  if (!compact) {
    // Minimap is disabled on compact/coarse-pointer renderers to recover useful canvas area.
    zones.push({
      x1: Math.max(0, viewportWidth - 190),
      y1: Math.max(0, viewportHeight - 205),
      x2: viewportWidth,
      y2: Math.max(0, viewportHeight - 78),
    });
  }
  return zones;
}

function labelCollisionScore(
  rect: Rect,
  nodeId: string,
  occupied: Array<{ id: string; rect: Rect }>,
  nodeRects: Map<string, Rect>,
  viewportWidth: number,
  viewportHeight: number,
): number {
  let score = rectWithinViewport(rect, viewportWidth, viewportHeight) ? 0 : 2400;
  for (const safeZone of atlasUiSafeZones(viewportWidth, viewportHeight)) {
    if (intersects(rect, safeZone, 3)) {
      score += intersectionArea(rect, safeZone) + 5200;
    }
  }
  for (const item of occupied) {
    if (intersects(rect, item.rect, 4)) score += intersectionArea(rect, item.rect) + 900;
  }
  for (const [otherId, nodeRect] of nodeRects) {
    if (otherId === nodeId) continue;
    if (intersects(rect, nodeRect, 2)) score += intersectionArea(rect, nodeRect) + 420;
  }
  return score;
}

function leaderFor(
  position: [number, number],
  rect: Rect,
  node: AtlasMetroNode,
  zoom: number,
  extraOffset: number,
): MetroScreenLeader | null {
  if (extraOffset < 18) return null;
  const centerX = (rect.x1 + rect.x2) / 2;
  const centerY = (rect.y1 + rect.y2) / 2;
  const dx = centerX - position[0];
  const dy = centerY - position[1];
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const radius = Math.max(5, metroNodeSize(node) * zoom / 2) + 3;

  let x2 = centerX;
  let y2 = centerY;
  if (Math.abs(dx) > Math.abs(dy)) {
    x2 = dx > 0 ? rect.x1 : rect.x2;
  } else {
    y2 = dy > 0 ? rect.y1 : rect.y2;
  }

  return {
    x1: position[0] + ux * radius,
    y1: position[1] + uy * radius,
    x2,
    y2,
  };
}

export function buildMetroScreenLabelLayout(
  model: AtlasMetroModel,
  ids: string[],
  screenPositions: Map<string, [number, number]>,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  selectedId: string | null = null,
  hoveredId: string | null = null,
): MetroScreenLabelLayout {
  const visibleSet = new Set(ids);
  const compactViewport = viewportWidth <= 640;
  const visibleMaxSiblings = maxVisibleSiblingCount(model, visibleSet);
  const ultraDenseOverview = ids.length > 140 || visibleMaxSiblings > 52 || zoom < .45;
  const siblingIndex = new Map<string, { index: number; count: number; sampled: boolean }>();

  for (const [parentId, allChildren] of model.childrenMap) {
    const children = allChildren.filter(id => visibleSet.has(id));
    const cap = densityCap(children.length, zoom);
    const sampled = evenlySampledIndices(children.length, cap);
    children.forEach((id, index) => siblingIndex.set(id, {
      index,
      count: children.length,
      sampled: sampled.has(index),
    }));
  }

  const nodeRects = new Map<string, Rect>();
  for (const id of ids) {
    const node = model.nodeMap.get(id);
    const position = screenPositions.get(id);
    if (!node || !position) continue;
    const radius = Math.max(5, metroNodeSize(node) * zoom / 2) + 5;
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
        node.id === selectedId ? -3
          : node.id === hoveredId ? -2
            : node.entityType === 'hub' ? -1
              : node.entityType === 'subdomain' ? 0
                : 1;
      return priority(a) - priority(b)
        || b.childCount - a.childCount
        || b.relationCount - a.relationCount
        || a.name.localeCompare(b.name);
    });

  const occupied: Array<{ id: string; rect: Rect }> = [];
  const byId = new Map<string, MetroScreenLabelSpec>();
  const distances = [0, 8, 18, 30, 46, 64, 86, 112, 142];

  for (const node of ordered) {
    const position = screenPositions.get(node.id);
    if (!position) continue;

    const siblings = siblingIndex.get(node.id);
    // On compact touch viewports, forcing every subdomain label to remain visible
    // recreates the exact pile-up that adaptive density is meant to prevent.
    // Hubs and the actively selected/touched station stay mandatory; passive
    // subdomain labels may yield when no collision-free placement exists.
    const mustShow = node.entityType === 'hub'
      || node.id === selectedId
      || node.id === hoveredId
      || (!compactViewport && !ultraDenseOverview && node.entityType === 'subdomain');

    if (!mustShow && siblings && !siblings.sampled) {
      byId.set(node.id, {
        id: node.id,
        visible: false,
        left: 0,
        top: 0,
        width: estimateLabelWidth(node),
        height: estimateLabelHeight(node),
        fontSize: metroLabelFontSize(node),
        maxWidth: labelMaxWidth(node),
        placement: 'bottom',
        leader: null,
      });
      continue;
    }

    const preferred = preferredPlacement(model, node, screenPositions);
    const placements = placementOrder(preferred);
    let chosen: { placement: MetroLabelPlacement; extra: number; rect: Rect; score: number } | null = null;
    let fallback: { placement: MetroLabelPlacement; extra: number; rect: Rect; score: number } | null = null;

    for (const extra of distances) {
      for (const placement of placements) {
        const rect = screenCandidateBox(position, node, placement, extra, zoom);
        const score = labelCollisionScore(
          rect,
          node.id,
          occupied,
          nodeRects,
          viewportWidth,
          viewportHeight,
        );

        const candidate = { placement, extra, rect, score };
        if (score === 0) {
          chosen = candidate;
          break;
        }
        if (!fallback || score < fallback.score) fallback = candidate;
      }
      if (chosen) break;
    }

    if (!chosen && mustShow) {
      const angularCandidates = [0, 45, 90, 135, 180, 225, 270, 315, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
      const radialCandidates = [58, 76, 96, 120, 148, 182, 220];
      for (const distance of radialCandidates) {
        for (const angle of angularCandidates) {
          const rect = floatingLabelBox(position, node, angle, distance);
          const score = labelCollisionScore(
            rect,
            node.id,
            occupied,
            nodeRects,
            viewportWidth,
            viewportHeight,
          );
          const candidate = {
            placement: preferred,
            extra: distance,
            rect,
            score,
          };
          if (score === 0) {
            chosen = candidate;
            break;
          }
          if (!fallback || score < fallback.score) fallback = candidate;
        }
        if (chosen) break;
      }
    }

    const finalChoice = chosen || (mustShow ? fallback : null);
    if (!finalChoice) {
      byId.set(node.id, {
        id: node.id,
        visible: false,
        left: 0,
        top: 0,
        width: estimateLabelWidth(node),
        height: estimateLabelHeight(node),
        fontSize: metroLabelFontSize(node),
        maxWidth: labelMaxWidth(node),
        placement: preferred,
        leader: null,
      });
      continue;
    }

    occupied.push({ id: node.id, rect: finalChoice.rect });
    byId.set(node.id, {
      id: node.id,
      visible: true,
      left: finalChoice.rect.x1,
      top: finalChoice.rect.y1,
      width: finalChoice.rect.x2 - finalChoice.rect.x1,
      height: finalChoice.rect.y2 - finalChoice.rect.y1,
      fontSize: metroLabelFontSize(node),
      maxWidth: labelMaxWidth(node),
      placement: finalChoice.placement,
      leader: leaderFor(position, finalChoice.rect, node, zoom, finalChoice.extra),
    });
  }

  let collisions = 0;
  for (let left = 0; left < occupied.length; left += 1) {
    for (let right = left + 1; right < occupied.length; right += 1) {
      if (intersects(occupied[left]!.rect, occupied[right]!.rect, 1)) collisions += 1;
    }
  }

  let uiZoneViolations = 0;
  const safeZones = atlasUiSafeZones(viewportWidth, viewportHeight);
  for (const item of occupied) {
    if (safeZones.some(zone => intersects(item.rect, zone, 1))) uiZoneViolations += 1;
  }

  return {
    byId,
    visible: [...byId.values()].filter(spec => spec.visible).length,
    hidden: [...byId.values()].filter(spec => !spec.visible).length,
    collisions,
    uiZoneViolations,
    maxSiblings: visibleMaxSiblings,
    zoom,
  };
}
