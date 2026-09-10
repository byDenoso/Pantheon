export type ConfirmationLevel = 'NONE' | 'CONFIRM' | 'STRONG_CONFIRM';
export type BrokerFinalStatus = 'PASS' | 'PENDING_READBACK' | 'BLOCKED' | 'FAILED' | 'DEGRADED' | 'CONFLICT';

export interface ActionIntentInput {
  action_id: string;
  action_type: string;
  domain: 'NEXO' | 'SCIENCE' | 'ENGINEERING' | 'OLYMPUS';
  provider: string;
  capability_id: string;
  target_ref: string;
  requested_payload: Record<string, unknown>;
  idempotency_key: string;
}

export interface BrokerReceipt {
  receipt_id: string;
  action_id: string;
  action_type: string;
  provider: string;
  domain: string;
  capability_id: string;
  target_ref: string;
  idempotency_key: string;
  intent_fingerprint: string;
  confirmation_level: ConfirmationLevel;
  status: string | BrokerFinalStatus;
  checked_at: string;
  provider_effect_id: string | null;
  source_ref: string | null;
  before_revision: string | null;
  after_revision: string | null;
  provider_response_classification: string | null;
  readback_status: string | null;
  authority_decision: Record<string, unknown> | null;
  capability_decision?: Record<string, unknown> | null;
  material?: boolean;
  explanation: string;
  trace: { stage: string; at: string }[];
}

export class BrokerClientError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = 'BrokerClientError';
    this.code = code;
  }
}

async function request<T>(route: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${route}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({ error: 'PROVIDER_UNAVAILABLE' })) as { error?: string } & T;
  if (!response.ok) throw new BrokerClientError(payload.error || 'PROVIDER_UNAVAILABLE');
  return payload;
}

export const planAction = (intent: ActionIntentInput): Promise<BrokerReceipt> =>
  request('actions-plan', { method: 'POST', body: JSON.stringify(intent) });

export const executeAction = (intent: ActionIntentInput, confirmation: ConfirmationLevel | false): Promise<BrokerReceipt> =>
  request('actions-execute', { method: 'POST', body: JSON.stringify({ intent, confirmation }) });

export const readbackAction = (receiptId: string): Promise<BrokerReceipt> =>
  request('actions-readback', { method: 'POST', body: JSON.stringify({ receipt_id: receiptId }) });

export async function recentActionReceipts(): Promise<BrokerReceipt[]> {
  const payload = await request<{ actions: BrokerReceipt[] }>('actions-recent');
  return Array.isArray(payload.actions) ? payload.actions : [];
}
