import type { ScientificStatus } from './types';

const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const STATUS_ALIASES: Record<string, ScientificStatus> = {
  measured: 'MEASURED',
  observed: 'MEASURED',
  supported: 'SUPPORTED',
  validated: 'SUPPORTED',
  approved: 'SUPPORTED',
  provisional: 'PROVISIONAL',
  candidate: 'CANDIDATE',
  inconclusive: 'INCONCLUSIVE',
  unknown: 'UNKNOWN',
  stale: 'STALE',
  blocked: 'BLOCKED',
  contradicted: 'CONTRADICTED',
  disproved: 'CONTRADICTED',
  consistent: 'CONSISTENT',
  interesting: 'INTERESTING',
  tension: 'TENSION',
  significant: 'SIGNIFICANT',
  // Real per-domain hypothesis-verdict vocabulary published in science/index.json
  // and graph/science*.json (checked live -- not guessed): a domain's `status`
  // field uses these values, not the measurement-style ones above. Mapped onto the
  // closest existing ScientificStatus so the same badge/CSS semantics apply
  // without inventing a second status vocabulary in the UI layer.
  constrained: 'SUPPORTED',
  survives: 'CANDIDATE',
  survives_class_only: 'CANDIDATE',
  mixed: 'TENSION',
  killed_parent: 'CONTRADICTED'
};

export function scientificStatus(value: unknown, fallback: ScientificStatus = 'UNKNOWN'): ScientificStatus {
  const raw = text(value)?.toLowerCase();
  return raw ? STATUS_ALIASES[raw] || fallback : fallback;
}
