// Cosmic-web classification of tests from graph structure alone (graph analogue of the T-web: knots, filaments, walls, voids).
import type {TowerGraph} from './model.ts';

export type Structure = 'knot' | 'filament' | 'wall' | 'void';
export const STRUCTURES: readonly Structure[] = ['knot', 'filament', 'wall', 'void'];
export const STRUCTURE_PT: Record<Structure, string> = {knot: 'Nó (hub)', filament: 'Filamento', wall: 'Parede', void: 'Isolado (vazio)'};

/**
 * knot     = articulation point, or betweenness in the top decile of the positive values
 * void     = no dependency or contest at all
 * filament = degree 1..2 (a strand between knots, or its tip)
 * wall     = everything else (degree >= 3)
 */
export function classify(g: TowerGraph): Map<string, Structure> {
  const b = [...g.metrics.betweenness.values()].filter(v => v > 0).sort((x, y) => x - y);
  const cut = b.length ? b[Math.floor(b.length * 0.9)]! : Infinity;
  const out = new Map<string, Structure>();
  for (const n of g.nodes) {
    if (n.kind !== 'test') continue;
    const deg = g.metrics.degree.get(n.id) ?? 0;
    out.set(n.id, deg === 0 ? 'void' : g.metrics.articulation.has(n.id) || (g.metrics.betweenness.get(n.id) ?? 0) >= cut ? 'knot' : deg <= 2 ? 'filament' : 'wall');
  }
  return out;
}
