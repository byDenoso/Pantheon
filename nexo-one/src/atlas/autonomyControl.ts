import {isIsoTime, isObj, type Fetch} from './api.ts';

export type AutonomyActionName = 'approve' | 'revoke';
export type HumanEnvelope = {kind: 'OPERATOR_INTENT'; source: 'DENER'; created_at: string; payload: Record<string, unknown>};
export type AutonomyAction = {available: boolean; blockers: string[]; envelope: HumanEnvelope | null; proposal_sha256: string | null};
export type AutonomyView = {
  contract: 'NEXO_AUTONOMY_CONTROL_VIEW_V1'; observed_at: string; tower_fingerprint: string;
  mandate: {id: string; revision: number; status: string} | null;
  actions: Record<AutonomyActionName, AutonomyAction>; receipt: null;
};
export type DeliveryReceipt = {stage: 'DELIVERED'; readback: 'PASS'; stable_id: string; proposal_sha256: string};
export type Submission = {kind: 'delivered'; receipt: DeliveryReceipt} | {kind: 'uncertain' | 'rejected'; code: string};

const HEX = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^(?:sha256:)?[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{3,80}$/;
const options: RequestInit = {credentials: 'same-origin', cache: 'no-store', redirect: 'error'};
const utf8 = new TextEncoder();
const fail = (): never => {throw new Error('AUTONOMY_CONTRACT_INVALID');};
const boundedText = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
export function canonicalProposal(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return fail();
    const json = JSON.stringify(value); return typeof json === 'string' ? json : fail();
  }
  return Array.isArray(value) ? '[' + value.map(canonicalProposal).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalProposal((value as Record<string, unknown>)[key])).join(',') + '}';
}
export async function proposalDigest(envelope: HumanEnvelope): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', utf8.encode(canonicalProposal(envelope)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function jsonBytes(response: Response): Promise<Record<string, unknown>> {
  if (response.redirected || ['opaque', 'opaqueredirect'].includes(response.type)
      || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return fail();
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 65536) return fail();
  let body: unknown;
  try {body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));} catch {return fail();}
  return isObj(body) ? body : fail();
}
function envelopeFor(value: unknown, action: AutonomyActionName): HumanEnvelope {
  if (!isObj(value) || Object.keys(value).sort().join(',') !== 'created_at,kind,payload,source'
      || value.kind !== 'OPERATOR_INTENT' || value.source !== 'DENER' || !isIsoTime(value.created_at) || !isObj(value.payload)) return fail();
  const body = value.payload;
  if (body.action !== (action === 'approve' ? 'APPROVE_AUTONOMY_MANDATE' : 'REVOKE_AUTONOMY_MANDATE')
      || !ID.test(String(body.mandate_id ?? '')) || !Number.isSafeInteger(body.expected_revision)
      || (body.expected_revision as number) < 0 || !boundedText(body.approval_ref)) return fail();
  canonicalProposal(value); // The server's human proposal accepts only safe integer numbers.
  if (utf8.encode(canonicalProposal({envelope: value, confirmation_sha256: 'a'.repeat(64)})).length > 32768) return fail();
  if (action === 'approve') {
    const receipt = body.activation_receipt;
    if (!isObj(receipt) || !isObj(receipt.checks) || !['transport', 'writer', 'public_projection', 'prompts', 'quota'].every(key => receipt.checks && (receipt.checks as Record<string, unknown>)[key] === true)
        || !/^[a-f0-9]{40}$/.test(String(receipt.source_revision ?? ''))
        || !FINGERPRINT.test(String(receipt.tower_fingerprint ?? '')) || !isIsoTime(receipt.checked_at)
        || (receipt.tcc_revision !== undefined && !/^[a-f0-9]{40}$/.test(String(receipt.tcc_revision)))) return fail();
  }
  return value as HumanEnvelope;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
}
export async function fetchAutonomyStatus(fetchImpl: Fetch, signal?: AbortSignal): Promise<AutonomyView> {
  const response = await fetchImpl('/api/autonomy-status', {...options, signal, headers: {Accept: 'application/json'}});
  const value = await jsonBytes(response);
  if (response.status !== 200) throw new Error(boundedText(value.error, 80) ? value.error : 'AUTONOMY_UNAVAILABLE');
  if (value.contract !== 'NEXO_AUTONOMY_CONTROL_VIEW_V1' || !isIsoTime(value.observed_at)
      || !FINGERPRINT.test(String(value.tower_fingerprint ?? '')) || !isObj(value.actions) || value.receipt !== null) return fail();
  let mandate: AutonomyView['mandate'] = null;
  if (value.mandate !== null) {
    const m = value.mandate;
    if (!isObj(m) || !ID.test(String(m.id ?? '')) || !Number.isSafeInteger(m.revision) || (m.revision as number) < 0 || !boundedText(m.status, 40)) return fail();
    mandate = {id: m.id as string, revision: m.revision as number, status: m.status};
  }
  const actions = {} as AutonomyView['actions'];
  for (const key of ['approve', 'revoke'] as const) {
    const a = value.actions[key];
    if (!isObj(a) || typeof a.available !== 'boolean' || !Array.isArray(a.blockers)
        || a.blockers.length > 40 || !a.blockers.every(v => boundedText(v))) return fail();
    if (!a.available) {
      if (a.envelope !== null || a.proposal_sha256 !== null || !a.blockers.length) return fail();
      actions[key] = {available: false, blockers: a.blockers as string[], envelope: null, proposal_sha256: null};
      continue;
    }
    const envelope = envelopeFor(a.envelope, key);
    if (a.blockers.length || typeof a.proposal_sha256 !== 'string' || !HEX.test(a.proposal_sha256)
        || await proposalDigest(envelope) !== a.proposal_sha256 || envelope.payload.expected_revision !== (mandate?.revision ?? 0)) return fail();
    if (key === 'approve' && (mandate?.status === 'ACTIVE' || (envelope.payload.activation_receipt as Record<string, unknown>).tower_fingerprint !== value.tower_fingerprint)) return fail();
    if (key === 'revoke' && (mandate?.status !== 'ACTIVE' || envelope.payload.mandate_id !== mandate.id)) return fail();
    actions[key] = {available: true, blockers: [], envelope, proposal_sha256: a.proposal_sha256};
  }
  return freeze({contract: 'NEXO_AUTONOMY_CONTROL_VIEW_V1', observed_at: value.observed_at,
    tower_fingerprint: value.tower_fingerprint as string, mandate, actions, receipt: null});
}
/** Local review only. Proof values come from the pasted task receipt, never from the client. */
export async function reviewActivationReceipt(raw: string, view: AutonomyView): Promise<AutonomyAction> {
  if (utf8.encode(raw).length > 32768 || view.mandate?.status === 'ACTIVE') return fail();
  let value: unknown;
  try {value = JSON.parse(raw);} catch {return fail();}
  if (!isObj(value) || Object.keys(value).sort().join(',') !== 'envelope,proposal_sha256'
      || typeof value.proposal_sha256 !== 'string' || !HEX.test(value.proposal_sha256)) return fail();
  const envelope = envelopeFor(value.envelope, 'approve');
  if (await proposalDigest(envelope) !== value.proposal_sha256
      || envelope.payload.expected_revision !== (view.mandate?.revision ?? 0)
      || (envelope.payload.activation_receipt as Record<string, unknown>).tower_fingerprint !== view.tower_fingerprint) return fail();
  return freeze({available: true, blockers: [], envelope, proposal_sha256: value.proposal_sha256});
}
export async function submitAutonomy(fetchImpl: Fetch, action: AutonomyAction): Promise<Submission> {
  if (!action.available || !action.envelope || !action.proposal_sha256
      || await proposalDigest(action.envelope) !== action.proposal_sha256) return {kind: 'rejected', code: 'EXACT_PROPOSAL_CONFIRMATION_REQUIRED'};
  try {
    const response = await fetchImpl('/api/autonomy-control', {...options, method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: canonicalProposal({envelope: action.envelope, confirmation_sha256: action.proposal_sha256})});
    const body = await jsonBytes(response);
    if (response.status === 202 && body.stage === 'DELIVERED' && body.readback === 'PASS'
        && boundedText(body.stable_id, 120) && body.proposal_sha256 === action.proposal_sha256) {
      return {kind: 'delivered', receipt: {stage: 'DELIVERED', readback: 'PASS', stable_id: body.stable_id, proposal_sha256: action.proposal_sha256}};
    }
    if ([400, 401, 403, 409, 413, 415].includes(response.status) && boundedText(body.error, 80)) return {kind: 'rejected', code: body.error};
    return {kind: 'uncertain', code: 'DELIVERY_UNCONFIRMED'};
  } catch {return {kind: 'uncertain', code: 'DELIVERY_UNCONFIRMED'};}
}
