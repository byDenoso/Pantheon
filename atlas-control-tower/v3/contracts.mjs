export const ATLAS_PROJECTION_CONTRACT = 'ATLAS_PROJECTION_V3';
export const ATLAS_PROJECTION_VERSION = '3.0.0';
export const ATLAS_SCHEMA_VERSION = '3.0';
export const TOWER_AUTHORITY = 'TOWER_V06';
export const TOWER_TRUTH_OWNER = 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06';

export const LAYERS = Object.freeze(['SCIENCE', 'LEARNING', 'OPERATIONS', 'EVIDENCE', 'PROVENANCE', 'HEALTH']);
export const FRESHNESS = Object.freeze(['SNAPSHOT', 'STALE', 'UNAVAILABLE', 'CORRUPT']);

const PRIVATE_PATTERNS = [/client/i, /paciente/i, /renilde/i, /josu[eé]/i, /miqu[eé]ias/i, /nat[aá]lia/i];

export function assertTowerControl(control) {
  if (!control || control.truth_owner !== TOWER_TRUTH_OWNER) {
    throw new Error('ATLAS_V3_INVALID_TOWER_AUTHORITY');
  }
  if (control.atlas_role && control.atlas_role !== 'READ_ONLY_PROJECTION') {
    throw new Error('ATLAS_V3_INVALID_ATLAS_ROLE');
  }
  if (control.drive_writeback_to_truth && control.drive_writeback_to_truth !== 'FORBIDDEN') {
    throw new Error('ATLAS_V3_DRIVE_WRITEBACK_FORBIDDEN');
  }
  return control;
}

export function assertPublicEntitySafe(entity) {
  const privacy = String(entity?.privacy || entity?.visibility || '').toUpperCase();
  if (['PRIVATE', 'PERSONAL', 'RESTRICTED'].includes(privacy)) return false;
  const haystack = [entity?.id, entity?.label, entity?.name, entity?.subject, entity?.person]
    .filter(Boolean)
    .join(' ');
  return !PRIVATE_PATTERNS.some(pattern => pattern.test(haystack));
}

export function normalizeEntityKind(bucket, entity) {
  if (bucket === 'interdomain' || String(entity?.kind || '').toUpperCase() === 'INTERDOMAIN') return 'FILAMENT';
  if (bucket === 'work') return 'WORK';
  if (bucket === 'hypothesis') return 'HYPOTHESIS';
  if (bucket === 'governance') return 'GOVERNANCE';
  if (bucket === 'system') return 'SYSTEM';
  return String(entity?.kind || entity?.type || bucket || 'ENTITY').toUpperCase();
}

export function canonicalLabel(entity) {
  return String(entity?.label || entity?.name || entity?.title || entity?.question || entity?.id || 'Unnamed');
}
