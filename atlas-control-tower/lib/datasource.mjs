/** Datasource selection: legacy snapshot, science_v1/learning_v1, or auto.
 *
 *  A fallback is never silent — the chosen source and its freshness travel in
 *  every contract payload so the UI can say exactly what the reader is looking
 *  at. The legacy snapshot is a fallback, never promoted to truth owner. */
import {SOURCES, FRESHNESS} from './graph-contract.mjs';

export const MODES = Object.freeze({LEGACY:'legacy', V1:'v1', AUTO:'auto'});

export function configuredMode(env = process.env) {
 const raw = String(env.ATLAS_DATA_SOURCE || MODES.AUTO).toLowerCase();
 return Object.values(MODES).includes(raw) ? raw : MODES.AUTO;
}
export const v1BaseUrl = (env = process.env) => String(env.ATLAS_V1_BASE_URL || '').replace(/\/+$/, '');
export const v1Staging = (env = process.env) => /staging|preview/i.test(String(env.ATLAS_V1_ENVIRONMENT || ''));

/** Health is cached briefly so a dead V1 does not cost a probe on every request. */
export function createV1Reader({env = process.env, fetchImpl, healthTtlMs = 30000, timeoutMs = 6000} = {}) {
 const doFetch = fetchImpl || ((...a) => fetch(...a));
 let health = {ok:false, checkedAt:0, detail:'NOT_CONFIGURED'};

 async function json(path, params = {}) {
  const base = v1BaseUrl(env);
  if (!base) throw Error('V1_BASE_URL_NOT_CONFIGURED');
  const url = base + path + '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const r = await doFetch(url, {signal: AbortSignal.timeout(timeoutMs), headers:{accept:'application/json'}});
  if (!r.ok) throw Error('V1_HTTP_' + r.status);
  return r.json();
 }

 async function checkHealth({force = false} = {}) {
  if (!v1BaseUrl(env)) {health = {ok:false, checkedAt:Date.now(), detail:'NOT_CONFIGURED'}; return health}
  if (!force && Date.now() - health.checkedAt < healthTtlMs) return health;
  try {
   const d = await json('/health');
   health = {ok: d?.ok !== false, checkedAt:Date.now(), detail:'OK', version:d?.version || '', generatedAt:d?.generatedAt || ''};
  } catch (e) {
   health = {ok:false, checkedAt:Date.now(), detail:String(e.message || 'V1_UNAVAILABLE')};
  }
  return health;
 }

 return {
  get health() {return health},
  checkHealth,
  graph: params => json('/graph', params),
  state: params => json('/state', params),
  entity: params => json('/entity', params),
  learning: params => json('/learning', params),
  audit: params => json('/audit', params)
 };
}

/**
 * Decides which reader answers this request.
 * @returns {{source:string,freshness:string,mode:string,reason:string,usedFallback:boolean}}
 */
export async function resolveSource({mode, reader, force = false} = {}) {
 const requested = mode || MODES.AUTO;
 if (requested === MODES.LEGACY)
  return {source:SOURCES.LEGACY, freshness:FRESHNESS.SNAPSHOT, mode:requested, reason:'CONFIGURED_LEGACY', usedFallback:false};

 const health = reader ? await reader.checkHealth({force}) : {ok:false, detail:'NO_READER'};
 if (health.ok)
  return {
   source:SOURCES.V1,
   freshness: v1Staging() ? FRESHNESS.STAGING : FRESHNESS.LIVE,
   mode:requested, reason:'V1_HEALTHY', usedFallback:false
  };

 // Never configured: this is legacy by design, not a degraded fallback.
 if (health.detail === 'NOT_CONFIGURED' && requested === MODES.AUTO)
  return {source:SOURCES.LEGACY, freshness:FRESHNESS.SNAPSHOT, mode:requested, reason:'V1_NOT_CONFIGURED', usedFallback:false};

 // Requested V1 and it is not answering: serve legacy and say so loudly.
 return {
  source:SOURCES.LEGACY,
  freshness:FRESHNESS.FALLBACK,
  mode:requested,
  reason: health.detail || 'V1_UNAVAILABLE',
  usedFallback:true
 };
}

/** Contract-shaped note the UI renders next to the source badge. */
export function fallbackIssue(decision) {
 if (!decision.usedFallback) return null;
 return {
  level:'WARN',
  type:'DATASOURCE_FALLBACK',
  reason:decision.reason,
  detail:`Solicitado ${decision.mode}; servindo snapshot legacy porque science_v1 não respondeu.`
 };
}
