import {normalizePrivateTower} from './private-tower-input.mjs';
import {projectAutonomyState} from './autonomy-state.mjs';

// Reuse the canonical private reader's validator; never accept a detached CONTROL.
export function privateAutonomyView(tower, observedAt = new Date().toISOString()) {
  const {records, revision, generatedAt} = normalizePrivateTower(tower);
  return projectAutonomyState({control: records.control, revision, generatedAt}, observedAt);
}
