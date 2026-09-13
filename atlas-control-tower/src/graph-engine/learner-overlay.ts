// Product contract (locked): Learner is a separate overlay layer, never a structural
// edge and never a new graph node. It renders only what is provable; it must never turn
// a declared-enabled scheduler into a promise of live flow.

export type LearnerState = 'active' | 'pending' | 'disabled' | 'stale' | 'unknown';

export type ConsumptionProof = {
  receiptId: string;
  observedAt: string;
};

export type LearnerFilament = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string | null;
  state: LearnerState;
  observedAt: string | null;
  sourceRef: string | null;
  consumptionProof: ConsumptionProof | null;
};

export type LearnerGeometryKind = 'none' | 'badge' | 'static-line' | 'animated-line';

export type LearnerRenderInstruction = {
  filamentId: string;
  sourceNodeId: string;
  targetNodeId: string | null;
  geometry: LearnerGeometryKind;
  animated: boolean;
  desaturated: boolean;
  ageLabel: string | null;
  legendText: string;
};

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h: matches the audit's own freshness horizon for scheduler evidence.

function withinFreshnessWindow(observedAt: string | null, now: number): boolean {
  if (!observedAt) return false;
  const timestamp = Date.parse(observedAt);
  if (Number.isNaN(timestamp)) return false;
  return now - timestamp <= FRESHNESS_WINDOW_MS;
}

function ageLabel(observedAt: string | null, now: number): string | null {
  if (!observedAt) return null;
  const timestamp = Date.parse(observedAt);
  if (Number.isNaN(timestamp)) return null;
  const hours = Math.max(0, Math.round((now - timestamp) / (60 * 60 * 1000)));
  return hours < 1 ? 'há menos de 1h' : `há ${hours}h`;
}

const LEGEND_TEXT: Record<LearnerState, string> = {
  active: 'Learner: ativo',
  pending: 'Learner: handoff pendente',
  disabled: 'Learner: desabilitado',
  stale: 'Learner: desatualizado',
  unknown: 'Learner: status desconhecido'
};

/**
 * Turns one LearnerFilament fact into a render instruction, applying the evidence-gate
 * rules that are the whole point of this module:
 *  - `active` renders a moving line ONLY when target, proof and freshness all line up.
 *    `enabled:true` alone (a scheduler flag) is never sufficient — that is exactly the
 *    CONTROL_SCHEDULER_DRIFT gap the audit found, and this function has no code path
 *    that can turn a bare "declared active" into an animated particle.
 *  - `targetNodeId: null` NEVER produces a line, active or otherwise; it can only ever
 *    produce a source-side badge. A line to a guessed target is worse than no line.
 *  - `pending` with a known target draws a static (non-animated) line. `pending` with
 *    no known target draws nothing but a badge.
 *  - `disabled` and `unknown` never draw geometry, only the legend text.
 *  - `stale` draws a static, desaturated line with an explicit age.
 */
export function resolveLearnerRenderInstruction(
  filament: LearnerFilament,
  now: number = Date.now()
): LearnerRenderInstruction {
  const base = {
    filamentId: filament.id,
    sourceNodeId: filament.sourceNodeId,
    targetNodeId: filament.targetNodeId,
    legendText: LEGEND_TEXT[filament.state]
  };

  if (filament.state === 'disabled' || filament.state === 'unknown') {
    return { ...base, geometry: 'none', animated: false, desaturated: false, ageLabel: null };
  }

  if (filament.state === 'active') {
    const proofFresh = Boolean(filament.consumptionProof) && withinFreshnessWindow(filament.consumptionProof!.observedAt, now);
    const canAnimate = filament.targetNodeId !== null && Boolean(filament.consumptionProof) && proofFresh;
    if (!canAnimate) {
      // Evidence gate failed: never claim an active flow without target + proof + freshness.
      // Fall back to the honest "pending" shape instead of silently downgrading to inactive.
      return resolveLearnerRenderInstruction({ ...filament, state: 'pending' }, now);
    }
    return { ...base, geometry: 'animated-line', animated: true, desaturated: false, ageLabel: null };
  }

  if (filament.state === 'pending') {
    if (filament.targetNodeId === null) {
      return { ...base, geometry: 'badge', animated: false, desaturated: false, ageLabel: null };
    }
    return { ...base, geometry: 'static-line', animated: false, desaturated: false, ageLabel: null };
  }

  // stale
  if (filament.targetNodeId === null) {
    return { ...base, geometry: 'badge', animated: false, desaturated: true, ageLabel: ageLabel(filament.observedAt, now) };
  }
  return { ...base, geometry: 'static-line', animated: false, desaturated: true, ageLabel: ageLabel(filament.observedAt, now) };
}

export function resolveLearnerLayer(filaments: LearnerFilament[], now: number = Date.now()): LearnerRenderInstruction[] {
  return filaments.map(filament => resolveLearnerRenderInstruction(filament, now));
}
