// Contract client for the same-origin Atlas API. Pure module: no React, no globals
// except the injected fetch. Every response is validated; anything unexpected is
// reported as a CONTRACT failure instead of being interpreted leniently.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export const SESSION_PATH = '/api/atlas-session';
export const PUBLIC_PATH = String(import.meta.env?.VITE_PUBLIC_API_URL || '/api/atlas-public');
export const PRIVATE_PATH = '/api/atlas-private';
export const LOCALE_PATH = '/api/atlas-locale';

export type ApiCode =
  | 'AUTH_REQUIRED' | 'AUTH_NOT_CONFIGURED' | 'AUTH_UNAVAILABLE' | 'ORIGIN_NOT_ALLOWED'
  | 'RATE_LIMITED' | 'PRIVATE_SOURCE_UNAVAILABLE' | 'DRIVE_REAUTH_REQUIRED' | 'DRIVE_UNAVAILABLE'
  | 'NOT_DEPLOYED' | 'NETWORK' | 'CONTRACT' | 'ABORTED';

export class ApiError extends Error {
  code: ApiCode;
  status: number;
  retryAfter: number | null;
  constructor(code: ApiCode, status: number, retryAfter: number | null = null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const mediaType = (h: string | null) => (h ?? '').split(';')[0]!.trim().toLowerCase();
const isJson = (res: Response) => mediaType(res.headers.get('content-type')) === 'application/json';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
export const isIsoTime = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && ISO.test(v) && Number.isFinite(Date.parse(v));

const KNOWN: readonly string[] = [
  'AUTH_REQUIRED', 'AUTH_NOT_CONFIGURED', 'AUTH_UNAVAILABLE', 'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED', 'PRIVATE_SOURCE_UNAVAILABLE',
];

const REQ_BASE: RequestInit = {credentials: 'same-origin', cache: 'no-store', redirect: 'error'};

async function send(fetchImpl: Fetch, url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(url, {...REQ_BASE, ...init, signal, headers: {Accept: 'application/json', ...(init.headers as Record<string, string> | undefined)}});
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new ApiError('ABORTED', 0);
    throw new ApiError('NETWORK', 0);
  }
}

/** Parses a JSON object response. Non-JSON 404/405 means "API not deployed here". */
async function readJson(res: Response): Promise<{status: number; body: Record<string, unknown> | null}> {
  if (res.redirected || res.type === 'opaque' || res.type === 'opaqueredirect') throw new ApiError('CONTRACT', res.status);
  if (!isJson(res)) {
    if (res.status === 404 || res.status === 405) throw new ApiError('NOT_DEPLOYED', res.status);
    throw new ApiError('CONTRACT', res.status);
  }
  let body: unknown;
  try { body = await res.json(); } catch { throw new ApiError('CONTRACT', res.status); }
  return {status: res.status, body: isObj(body) ? body : null};
}

function failure(status: number, body: Record<string, unknown> | null, retryHeader: string | null = null): ApiError {
  if (status === 503 && body?.error === 'PRIVATE_SOURCE_UNAVAILABLE') {
    if (body.connectorStatus === 'reauthentication_required') return new ApiError('DRIVE_REAUTH_REQUIRED', status);
    if (['connector_access_disabled','tool_not_allowed','tool_not_found','binding_unavailable'].includes(String(body.connectorStatus))) return new ApiError('DRIVE_UNAVAILABLE', status);
  }
  const code = body && typeof body.error === 'string' && KNOWN.includes(body.error) ? (body.error as ApiCode) : null;
  if (!code) return new ApiError(status === 404 || status === 405 ? 'NOT_DEPLOYED' : 'CONTRACT', status);
  const positiveSeconds = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 86400 ? value : null;
  const ra = ['RATE_LIMITED','PRIVATE_SOURCE_UNAVAILABLE'].includes(code)
    ? positiveSeconds(body!.retryAfter) ?? (retryHeader && /^\d{1,5}$/.test(retryHeader) ? positiveSeconds(Number(retryHeader)) : null) : null;
  return new ApiError(code, status, ra);
}

// ---- public -------------------------------------------------------------------
export type PublicPayload = {contract: 'ATLAS_PUBLIC_V1'; items: unknown[]; links: unknown[]; tests?: unknown[]; campaigns?: unknown[]; campaignsContract?: string; coverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; generatedAt?: string; sourceRevision?: string; visuals?:unknown[]};

export async function fetchPublic(fetchImpl: Fetch, signal?: AbortSignal): Promise<PublicPayload> {
  const res = await send(fetchImpl, PUBLIC_PATH, {}, signal);
  const {status, body} = await readJson(res);
  if (status !== 200) throw failure(status, body, res.headers.get('retry-after'));
  if (!body || body.contract !== 'ATLAS_PUBLIC_V1' || !Array.isArray(body.items) || !Array.isArray(body.links)) throw new ApiError('CONTRACT', status);
  if (body.tests !== undefined && !Array.isArray(body.tests)) throw new ApiError('CONTRACT', status);
  if(body.visuals!==undefined&&(!Array.isArray(body.visuals)||body.visuals.length>200||body.visualsContract!=='ATLAS_PUBLIC_VISUALS_V1'))throw new ApiError('CONTRACT',status);
  const campaignFields = body.campaigns === undefined ? {} : (() => {
    if (!Array.isArray(body.campaigns) || body.campaignsContract !== 'ATLAS_PUBLIC_CAMPAIGNS_V1' || !['COMPLETE','PARTIAL','UNAVAILABLE'].includes(String(body.coverage)) || !isIsoTime(body.generatedAt) || typeof body.sourceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(body.sourceRevision)) throw new ApiError('CONTRACT', status);
    return {campaigns: body.campaigns, campaignsContract: body.campaignsContract, coverage: body.coverage as 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE', generatedAt: body.generatedAt, sourceRevision: body.sourceRevision};
  })();
  return {contract: 'ATLAS_PUBLIC_V1', items: body.items, links: body.links, ...(body.tests === undefined ? {} : {tests: body.tests as unknown[]}), ...campaignFields,...(body.visuals===undefined?{}:{visuals:body.visuals as unknown[]})};
}

// ---- session ------------------------------------------------------------------
export type SessionStatus = {configured: boolean; authenticated: boolean; expiresAt: string | null};

export async function fetchSession(fetchImpl: Fetch, signal?: AbortSignal): Promise<SessionStatus> {
  const res = await send(fetchImpl, SESSION_PATH, {}, signal);
  const {status, body} = await readJson(res);
  if (status !== 200) throw failure(status, body, res.headers.get('retry-after'));
  if (!body || typeof body.configured !== 'boolean' || typeof body.authenticated !== 'boolean') throw new ApiError('CONTRACT', status);
  if (body.authenticated && (!body.configured || !isIsoTime(body.expiresAt))) throw new ApiError('CONTRACT', status);
  return {configured: body.configured, authenticated: body.authenticated, expiresAt: body.authenticated ? body.expiresAt as string : null};
}

export type LoginResult = {authenticated: true; expiresAt: string};

export async function login(fetchImpl: Fetch, pin: string, signal?: AbortSignal): Promise<LoginResult> {
  if (typeof pin !== 'string' || pin.length < 8 || pin.length > 128) throw new ApiError('CONTRACT', 0);
  const res = await send(fetchImpl, SESSION_PATH, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pin})}, signal);
  const {status, body} = await readJson(res);
  if (status !== 200) throw failure(status, body, res.headers.get('retry-after'));
  if (!body || body.authenticated !== true || !isIsoTime(body.expiresAt)) throw new ApiError('CONTRACT', status);
  return {authenticated: true, expiresAt: body.expiresAt};
}

export type LogoutFailure = 'AUTH_UNAVAILABLE' | 'ORIGIN_NOT_ALLOWED' | 'NETWORK' | 'CONTRACT';
export type LogoutResult = {revoked: true} | {revoked: false; reason: LogoutFailure; status: number};

/**
 * Server revocation is confirmed only by exactly: HTTP 200, JSON media type,
 * non-array object body with authenticated === false, no redirect.
 * 204, other 2xx, HTML fallbacks, redirected responses and invalid JSON are all
 * "not confirmed". Never throws. Not abortable on purpose: it must outlive a
 * route change (keepalive).
 */
export async function logoutStrict(fetchImpl: Fetch): Promise<LogoutResult> {
  let res: Response;
  try {
    res = await fetchImpl(SESSION_PATH, {method: 'DELETE', ...REQ_BASE, keepalive: true, headers: {Accept: 'application/json'}});
  } catch {
    return {revoked: false, reason: 'NETWORK', status: 0};
  }
  const status = res.status;
  if (res.redirected || res.type === 'opaque' || res.type === 'opaqueredirect') return {revoked: false, reason: 'CONTRACT', status};
  if (!isJson(res)) return {revoked: false, reason: 'CONTRACT', status};
  let body: unknown;
  try { body = await res.json(); } catch { return {revoked: false, reason: 'CONTRACT', status}; }
  if (status === 200) {
    return isObj(body) && body.authenticated === false
      ? {revoked: true}
      : {revoked: false, reason: 'CONTRACT', status};
  }
  if (isObj(body) && body.error === 'AUTH_UNAVAILABLE') return {revoked: false, reason: 'AUTH_UNAVAILABLE', status};
  if (isObj(body) && body.error === 'ORIGIN_NOT_ALLOWED') return {revoked: false, reason: 'ORIGIN_NOT_ALLOWED', status};
  return {revoked: false, reason: 'CONTRACT', status};
}

// ---- private ------------------------------------------------------------------
export type PrivatePayload = {contract: 'ATLAS_PRIVATE_V1'; data: Record<string, unknown>};

export async function fetchPrivate(fetchImpl: Fetch, signal?: AbortSignal): Promise<PrivatePayload> {
  const res = await send(fetchImpl, PRIVATE_PATH, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({profile:'workspace-v1'})}, signal);
  const {status, body} = await readJson(res);
  if (status !== 200) throw failure(status, body, res.headers.get('retry-after'));
  if (!body || body.contract !== 'ATLAS_PRIVATE_V1' || !isObj(body.data)) throw new ApiError('CONTRACT', status);
  return {contract: 'ATLAS_PRIVATE_V1', data: body.data};
}

// ---- locale -------------------------------------------------------------------
export type Locale = 'pt-BR' | 'en';
export const LOCALES: readonly Locale[] = ['pt-BR', 'en'];
export const isLocale = (v: unknown): v is Locale => v === 'pt-BR' || v === 'en';

const LOCALE_SOURCES = ['preference', 'browser', 'country', 'default'] as const;
export type LocaleSource = typeof LOCALE_SOURCES[number];
export type LocalePayload = {contract: 'ATLAS_LOCALE_V1'; locale: Locale; source: LocaleSource; supported: Locale[]};

export async function fetchLocale(fetchImpl: Fetch, lang: Locale | null, signal?: AbortSignal): Promise<LocalePayload> {
  const url = lang ? `${LOCALE_PATH}?lang=${encodeURIComponent(lang)}` : LOCALE_PATH;
  const res = await send(fetchImpl, url, {}, signal);
  const {status, body} = await readJson(res);
  if (status !== 200) throw failure(status, body, res.headers.get('retry-after'));
  const supported = body?.supported;
  if (!body || body.contract !== 'ATLAS_LOCALE_V1' || !isLocale(body.locale)
    || typeof body.source !== 'string' || !LOCALE_SOURCES.includes(body.source as LocaleSource)
    || !Array.isArray(supported) || supported.length !== LOCALES.length
    || !LOCALES.every((locale, i) => supported[i] === locale)) throw new ApiError('CONTRACT', status);
  return {contract: 'ATLAS_LOCALE_V1', locale: body.locale, source: body.source as LocaleSource, supported: [...LOCALES]};
}
