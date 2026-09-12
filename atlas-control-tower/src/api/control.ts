import { configuredBaseUrl } from './client';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ControlStatus = 'OK' | 'EMPTY' | 'PARTIAL' | 'DATA_UNAVAILABLE' | 'API_ERROR';
export type ControlFreshness = 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' | 'OFFLINE';

export type ControlEnvelope<T extends JsonValue = JsonObject> = {
  contract?: string;
  status?: ControlStatus | string;
  freshness?: ControlFreshness | string;
  generatedAt?: string;
  updatedAt?: string;
  sourceVersion?: string;
  data?: T;
  error?: string;
  [key: string]: JsonValue | undefined;
};

export type ControlRequest = JsonObject;
export type ControlContext = JsonObject;
export type ControlRun = JsonObject;
export type WorkCapsule = JsonObject;
export type OutboxItem = JsonObject;

export class ControlApiError extends Error {
  readonly status: number;
  readonly payload: ControlEnvelope<JsonValue> | null;

  constructor(message: string, status: number, payload: ControlEnvelope<JsonValue> | null = null) {
    super(message);
    this.name = 'ControlApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function isRecord(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseJson(value: string): JsonValue | undefined {
  try {
    const parsed: JsonValue = JSON.parse(value) as JsonValue;
    return parsed;
  } catch {
    return undefined;
  }
}

function parseEnvelope(value: JsonValue | undefined): ControlEnvelope<JsonValue> {
  if (!isRecord(value)) throw new ControlApiError('CONTROL_INVALID_RESPONSE', 200);
  return value as ControlEnvelope;
}

function controlBaseUrl(): string {
  const base = configuredBaseUrl();
  return `${base}/nexo/control`.replace(/\/+/g, '/').replace(':/', '://');
}

async function request<T extends JsonValue = JsonObject>(path: string, init?: RequestInit): Promise<ControlEnvelope<T>> {
  const response = await fetch(`${controlBaseUrl()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }
  });
  const body = parseJson(await response.text());
  if (body === undefined) throw new ControlApiError('CONTROL_INVALID_RESPONSE', response.status);
  const payload = parseEnvelope(body) as ControlEnvelope<T>;
  if (!response.ok) throw new ControlApiError(payload?.error || `CONTROL_HTTP_${response.status}`, response.status, payload as unknown as ControlEnvelope<JsonValue>);
  return payload;
}

function post(body: ControlRequest): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export type ControlApiClient = {
  getContext: () => Promise<ControlEnvelope<ControlContext>>;
  dispatch: (input: ControlRequest) => Promise<ControlEnvelope>;
  getRun: (runId: string) => Promise<ControlEnvelope<ControlRun>>;
  getCapsule: (runId: string) => Promise<ControlEnvelope<WorkCapsule>>;
  execute: (runId: string, input?: ControlRequest) => Promise<ControlEnvelope>;
  listOutbox: (query?: Record<string, string | number | undefined>) => Promise<ControlEnvelope<OutboxItem[]>>;
  appendOutbox: (input: ControlRequest) => Promise<ControlEnvelope<OutboxItem>>;
  mcp: (method: string, params?: ControlRequest) => Promise<ControlEnvelope>;
};

export function createControlApi(): ControlApiClient {
  return {
    getContext: () => request<ControlContext>('/context'),
    dispatch: input => request('/dispatch', post(input)),
    getRun: runId => request<ControlRun>(`/runs/${encodeURIComponent(runId)}`),
    getCapsule: runId => request<WorkCapsule>(`/runs/${encodeURIComponent(runId)}/capsule`),
    execute: (runId, input = {}) => request(`/runs/${encodeURIComponent(runId)}/execute`, post(input)),
    listOutbox: query => {
      const params = new URLSearchParams();
      Object.entries(query || {}).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<OutboxItem[]>(`/outbox${suffix}`);
    },
    appendOutbox: input => request<OutboxItem>('/outbox', post(input)),
    mcp: (method, params = {}) => request('/mcp', post({ method, params }))
  };
}
