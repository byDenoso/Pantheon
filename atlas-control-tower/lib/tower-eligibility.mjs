// Selection-time eligibility for the Executor (AUT-004).
//
// READY is a Tower status; RUNNABLE is a selection decision. A test may be READY and still
// not runnable: its frozen contract is missing, a required capability is not active, or the
// hot-set index is simply stale (2026-09-27: 66 of 81 "READY" executor items in
// indexes/active-work.json were INCONCLUSIVE/execution_policy NONE in their own entity).
// Deciding this at selection, from the hydrated entity, is what keeps a round from
// spending its budget on items that hydration then blocks.

const ACTIVE_CAPS = new Set(['ACTIVE', 'PROVEN', 'VALIDATED_CURRENT']);
const RUNNABLE_STATUS = new Set(['READY', 'RUNNING', 'CHECKPOINTED']);
const LEGITIMATE_BLOCKERS = new Set(['SCIENTIFIC_DEFINITION_MISSING', 'AUTHORIZATION_MISSING', 'IRREVERSIBLE_CONFLICT']);
const FROZEN_FIELDS = ['id', 'method', 'decision_rule', 'outputs', 'claim_boundary'];

const upper = value => String(value ?? '').toUpperCase();

/** Resolve a capability by manifest key, capability_id or task_id. */
export function findCapability(capabilities, { capabilityId, taskId } = {}) {
  for (const [key, cap] of Object.entries(capabilities || {})) {
    if (!cap || typeof cap !== 'object') continue;
    if (capabilityId && (key === capabilityId || cap.capability_id === capabilityId || cap.id === capabilityId)) return cap;
    if (taskId && (key === taskId || cap.task_id === taskId)) return cap;
  }
  return null;
}

const capabilityActive = cap => Boolean(cap && ACTIVE_CAPS.has(upper(cap.status || 'ACTIVE')) && (cap.backend || cap.executable || cap.task_id));
const frozenComplete = frozen => Boolean(frozen && typeof frozen === 'object' && FROZEN_FIELDS.every(key => frozen[key]));

/** Refs a frozen contract declares as inputs (likelihood pairs, selection functions, reconstructions…). */
export function declaredInputRefs(frozen) {
  if (!frozen || typeof frozen !== 'object') return [];
  const raw = [frozen.input_refs, frozen.frozen_inputs, frozen.required_inputs].flat().filter(Boolean);
  return raw.map(ref => (typeof ref === 'string' ? ref : ref?.ref || ref?.path || ref?.id)).filter(Boolean).map(String);
}

/**
 * Classify one executor candidate.
 * @param indexItem  row from indexes/active-work.json (may be a synthetic stub)
 * @param entity     hydrated entities/work/<id>.json, or null when it could not be read
 * @param options    { capabilities, frozenTests: Map|object of resolved frozen contracts by ref, resolveRef(ref)->bool }
 * @returns {{ id, selection: 'RUNNABLE'|'BLOCKED_INPUT'|'STALE_INDEX'|'NOT_RUNNABLE'|'NOT_EXECUTOR', reasons: string[] }}
 */
export function classifyExecutorCandidate(indexItem, entity, { capabilities = {}, frozenTests = {}, resolveRef = null } = {}) {
  const id = String(indexItem?.id || entity?.id || '');
  if (upper(indexItem?.owner_role || entity?.owner_role) !== 'EXECUTOR') return { id, selection: 'NOT_EXECUTOR', reasons: [] };
  if (!entity) return { id, selection: 'BLOCKED_INPUT', reasons: ['ENTITY_UNREADABLE'] };

  const status = upper(entity.status);
  const policy = upper(entity.execution_policy || 'AUTO');
  const drifted = upper(indexItem?.status) !== status;
  if ((!RUNNABLE_STATUS.has(status) || policy === 'NONE') && !drifted) {
    return { id, selection: 'NOT_RUNNABLE', reasons: [`STATUS_${status || '?'}${policy === 'NONE' ? '_POLICY_NONE' : ''}`] };
  }
  if (!RUNNABLE_STATUS.has(status) || policy === 'NONE') {
    return { id, selection: 'STALE_INDEX', reasons: [`INDEX_${upper(indexItem?.status) || '?'}_ENTITY_${status || '?'}${policy === 'NONE' ? '_POLICY_NONE' : ''}`] };
  }

  const reasons = [];
  if (policy === 'MANUAL') reasons.push('EXECUTION_POLICY_MANUAL');
  const blocker = upper(entity.blocker_class || entity.blocker_type || entity.blocker_reason_code);
  if (LEGITIMATE_BLOCKERS.has(blocker)) reasons.push(blocker);

  // A runnable binding: an active capability, or a complete frozen scientific contract.
  const cap = findCapability(capabilities, { capabilityId: entity.capability_id, taskId: entity.task_id });
  const frozenRef = entity.frozen_test_ref || entity.source_test_ref || null;
  const frozen = entity.frozen_test || (frozenRef ? (frozenTests instanceof Map ? frozenTests.get(frozenRef) : frozenTests[frozenRef]) : null);
  if (entity.capability_id || entity.task_id) {
    if (!cap) reasons.push(`CAPABILITY_MISSING:${entity.capability_id || entity.task_id}`);
    else if (!capabilityActive(cap)) reasons.push(`CAPABILITY_${upper(cap.status)}:${entity.capability_id || entity.task_id}`);
  } else if (frozenRef && !frozen) {
    reasons.push(`FROZEN_REF_UNRESOLVED:${frozenRef}`);
  } else if (!frozen) {
    reasons.push('NO_RUNNABLE_BINDING');
  }
  if (frozen && !cap && !frozenComplete(frozen)) reasons.push('FROZEN_CONTRACT_INCOMPLETE');

  for (const required of entity.required_capabilities || []) {
    const need = findCapability(capabilities, { capabilityId: required, taskId: required });
    if (!capabilityActive(need)) reasons.push(`REQUIRED_CAPABILITY_UNAVAILABLE:${required}`);
  }
  if (resolveRef) {
    for (const ref of declaredInputRefs(frozen)) if (!resolveRef(ref)) reasons.push(`INPUT_REF_UNRESOLVED:${ref}`);
  }

  return { id, selection: reasons.length ? 'BLOCKED_INPUT' : 'RUNNABLE', reasons };
}

/** Classify every executor row; `entities` maps id -> hydrated entity (missing = unreadable). */
export function classifyExecutorQueue(indexItems, entities, options = {}) {
  const lookup = entities instanceof Map ? id => entities.get(id) : id => entities?.[id];
  const rows = (indexItems || []).map(item => classifyExecutorCandidate(item, lookup(item.id) ?? null, options))
    .filter(row => row.selection !== 'NOT_EXECUTOR');
  const stats = { candidates: rows.length, runnable: 0, blocked_input: 0, stale_index: 0, not_runnable: 0 };
  for (const row of rows) {
    if (row.selection === 'RUNNABLE') stats.runnable += 1;
    else if (row.selection === 'BLOCKED_INPUT') stats.blocked_input += 1;
    else if (row.selection === 'STALE_INDEX') stats.stale_index += 1;
    else stats.not_runnable += 1;
  }
  return { rows, stats };
}
