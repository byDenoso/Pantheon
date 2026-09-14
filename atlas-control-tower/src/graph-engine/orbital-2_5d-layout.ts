// Pure geometry for the Canvas 2.5D renderer. No canvas/DOM here -- every position,
// hit-test and parallax calculation is a plain function so the actual layout math is
// unit-tested directly, not inferred from a screenshot.

export type OrbitalPosition = {
  id: string;
  x: number; // canvas-space, centered at (0,0) before pan/zoom
  y: number;
  z: number; // 0..1 depth cue: 1 = center/focus (nearest), 0 = far edge
  angle: number;
};

/**
 * Places `count` satellites evenly around a center point at `radius`, starting at
 * `startAngle` (radians). Deterministic (same inputs -> same outputs, no randomness),
 * so a re-render with the same node set never jitters.
 */
export function layoutRing(ids: string[], radius: number, startAngle = -Math.PI / 2): OrbitalPosition[] {
  const count = ids.length;
  if (count === 0) return [];
  return ids.map((id, index) => {
    const angle = startAngle + (index / count) * Math.PI * 2;
    return { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.55, z: 0.6, angle };
  });
}

export type SceneLayout = {
  center: { id: string; x: 0; y: 0; z: 1 };
  satellites: OrbitalPosition[];
};

/**
 * Builds the full 2.5D scene for one focus: the focused node pinned at the visual
 * center (z=1, nearest/brightest), and its direct satellites laid out on one ring.
 * This is deliberately flat -- the locked map contract has exactly two rendered
 * levels (Universo/Domínio ring, then Domínio/Campanha ring on focus), never a third.
 */
export function buildSceneLayout(centerId: string, satelliteIds: string[], radius: number): SceneLayout {
  return { center: { id: centerId, x: 0, y: 0, z: 1 }, satellites: layoutRing(satelliteIds, radius) };
}

/**
 * Applies parallax: satellites drift a fraction of the pointer offset from center,
 * scaled by (1 - z) so nearer things move less -- the actual "2.5D" depth illusion.
 * Pass pointer {0,0} (or skip calling this) to render a static frame, e.g. under
 * prefers-reduced-motion.
 */
export function applyParallax(position: OrbitalPosition, pointer: { x: number; y: number }, strength = 0.06): OrbitalPosition {
  const depthFactor = 1 - position.z;
  return { ...position, x: position.x + pointer.x * strength * depthFactor, y: position.y + pointer.y * strength * depthFactor };
}

/**
 * Screen-space hit test: returns the id of the topmost node whose radius contains
 * (px, py), or null. Iterates in reverse draw order so a node drawn on top (later in
 * the array) wins ties, matching what the user actually sees.
 */
export function hitTest(positions: Array<{ id: string; x: number; y: number; radius: number }>, px: number, py: number): string | null {
  for (let i = positions.length - 1; i >= 0; i--) {
    const node = positions[i];
    const dx = px - node.x;
    const dy = py - node.y;
    if (dx * dx + dy * dy <= node.radius * node.radius) return node.id;
  }
  return null;
}

export function nodeRadius(kind: 'center' | 'domain' | 'campaign', selected: boolean): number {
  const base = kind === 'center' ? 34 : kind === 'domain' ? 22 : 15;
  return base + (selected ? 4 : 0);
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

/** Clamps a zoom level to the supported range. Pure so the +/- buttons and any future
 * wheel/pinch handler share exactly one bound, never drifting out of sync. */
export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function zoomStep(current: number, direction: 1 | -1, step = 0.25): number {
  return clampZoom(current + direction * step);
}
