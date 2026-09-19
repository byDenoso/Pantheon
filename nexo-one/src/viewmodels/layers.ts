// Semantic layers and presets for the NEXO ONE galaxy. Layers only ever narrow
// what is already in state.graph via GraphFilters — they never invent a node,
// relation or status. NEEDS_YOU and CHANGES are not node-type filters: they
// gate the Operate HUD panels (see OperateHUD.tsx), since neither concept
// exists as a filterable GraphNodeType.
import type { GraphNodeType } from '../contracts/system.ts';
import { EMPTY_FILTERS, type GraphFilters } from './graph.ts';

export const LAYER_IDS = [
  'TESTS', 'HYPOTHESES', 'CAPABILITIES', 'AUTOMATIONS', 'NEEDS_YOU', 'CHANGES', 'RELATIONS',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** GraphNodeTypes a layer reveals. Layers with no canonical type map (NEEDS_YOU,
 * CHANGES, RELATIONS) are handled outside the node-type filter entirely. */
export const LAYER_TYPES: Record<LayerId, GraphNodeType[]> = {
  TESTS: ['TEST'],
  HYPOTHESES: ['FILAMENT'],
  CAPABILITIES: ['CAPABILITY'],
  AUTOMATIONS: ['PROVIDER'],
  NEEDS_YOU: [],
  CHANGES: [],
  RELATIONS: [],
};

export const PRESET_IDS = ['RESEARCH', 'EXECUTION', 'LEARNING', 'ATTENTION', 'FULL_SYSTEM'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface Preset {
  id: PresetId;
  label: string;
  layers: LayerId[];
}

export const PRESETS: Preset[] = [
  { id: 'RESEARCH', label: 'Research', layers: ['HYPOTHESES', 'TESTS', 'RELATIONS'] },
  { id: 'EXECUTION', label: 'Execution', layers: ['TESTS', 'CAPABILITIES', 'AUTOMATIONS'] },
  { id: 'LEARNING', label: 'Learning', layers: ['HYPOTHESES', 'CHANGES'] },
  { id: 'ATTENTION', label: 'Attention', layers: ['NEEDS_YOU', 'CHANGES'] },
  { id: 'FULL_SYSTEM', label: 'Full system', layers: [...LAYER_IDS] },
];

export const presetById = (id: string): Preset | null => PRESETS.find(preset => preset.id === id) ?? null;

/** Union of every GraphNodeType the given active layers reveal. Empty means
 * "no type narrowing" (every layer active, or none of the active layers gate
 * by type), which filterGraph already treats as "show everything". */
export function typesForLayers(active: LayerId[]): GraphNodeType[] {
  const types = new Set<GraphNodeType>();
  for (const id of active) for (const type of LAYER_TYPES[id]) types.add(type);
  return [...types];
}

/**
 * Applies a preset's layers on top of the current filters. ATTENTION narrows
 * by BLOCKED state (a real EntityState the Tower already reports) rather than
 * by type, since "needs attention" is a state, not a taxonomy of entities.
 * FULL_SYSTEM applies no type narrowing at all — "every layer active" means
 * everything the current LOD allows, which filterGraph already does when
 * `types` is empty; narrowing it to the union of every layer's types would
 * paradoxically hide untyped-by-layer entities (ACTION, EFFECT, CLAIM, ...).
 */
export function applyPreset(preset: Preset, filters: GraphFilters): GraphFilters {
  const types = preset.id === 'FULL_SYSTEM' ? [] : typesForLayers(preset.layers);
  const states = preset.id === 'ATTENTION' ? (['BLOCKED'] as GraphFilters['states']) : [];
  return { ...EMPTY_FILTERS, search: filters.search, types, states };
}
