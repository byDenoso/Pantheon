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

export function containsPrivateSignal(value) {
  if (value == null) return false;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return PRIVATE_PATTERNS.some(pattern => pattern.test(text));
}

export function assertPublicEntitySafe(entity) {
  const privacy = String(entity?.privacy || entity?.visibility || '').toUpperCase();
  if (['PRIVATE', 'PERSONAL', 'RESTRICTED'].includes(privacy)) return false;
  const identityFields = [entity?.id, entity?.label, entity?.name, entity?.subject, entity?.person]
    .filter(Boolean)
    .join(' ');
  return !containsPrivateSignal(identityFields);
}

export function safePublicText(value) {
  if (value == null) return null;
  const text = String(value);
  return containsPrivateSignal(text) ? null : text;
}

export function normalizeEntityKind(bucket, entity) {
  if (bucket === 'interdomain' || bucket === 'learning' || ['INTERDOMAIN','LEARNING'].includes(String(entity?.kind || '').toUpperCase())) return 'FILAMENT';
  if (bucket === 'work') return 'WORK';
  if (bucket === 'hypothesis') return 'HYPOTHESIS';
  if (bucket === 'test_group') return 'TEST_GROUP';
  if (bucket === 'test') return 'TEST';
  if (bucket === 'governance') return 'GOVERNANCE';
  if (bucket === 'system') return 'SYSTEM';
  return String(entity?.kind || entity?.type || bucket || 'ENTITY').toUpperCase();
}

export function canonicalLabel(entity) {
  return String(entity?.label || entity?.name || entity?.title || entity?.question || entity?.id || 'Unnamed');
}
