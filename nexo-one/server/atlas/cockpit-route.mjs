import {atlasStore} from '../auth/atlas-session.mjs';
import {GOOGLE_AUTH_DIAGNOSTICS} from '../adapters/connect.mjs';
import {
  LIMITS, auditEntry, buildSelection, campaignCandidates, catalogCandidates, publicSelection,
  readSelection, selectionDrift, towerCandidates,
} from './public-selection.mjs';

// One document, one audit list, in the same Redis-compatible store as the Atlas
// sessions. The public route reads only this document; it never reads Drive.
export const SELECTION_KEY = 'atlas:public-selection:v1';
export const AUDIT_KEY = 'atlas:public-selection:audit';
export const DEFAULT_CATALOG_URL = 'https://nexoresearch.org/atlas-public.json';
// Compare-and-set on the version, then append the audit line, atomically.
export const SAVE_SCRIPT = "local cur=redis.call('GET',KEYS[1]) local v=0 if cur then local ok,doc=pcall(cjson.decode,cur) if not ok then return {0,-1} end v=tonumber(doc['version']) or -1 end if v~=tonumber(ARGV[1]) then return {0,v} end redis.call('SET',KEYS[1],ARGV[2]) redis.call('LPUSH',KEYS[2],ARGV[3]) redis.call('LTRIM',KEYS[2],0,99) return {1,v+1}";

const shadowEnabled = env => env.NEXO_ATLAS_SHADOW_SOURCE_ENABLED === 'true';
const shadowErrors = new Set(['SHADOW_SOURCE_DISABLED','SHADOW_READ_CREDENTIAL_REQUIRED','SHADOW_AUTH_REQUIRED','SHADOW_METADATA_UNAVAILABLE','SHADOW_METADATA_INVALID','SHADOW_REQUIRED_TAB_MISSING','SHADOW_BATCH_TOO_LARGE','SHADOW_BATCH_IDENTITY_INVALID','SHADOW_CANONICAL_UNAVAILABLE']);
function safeShadowError(error) {
  if (shadowErrors.has(error?.message)) return error.message;
  if (GOOGLE_AUTH_DIAGNOSTICS.includes(error?.googleDiagnostic)) return `SHADOW_${error.googleDiagnostic}`;
  if (error?.name === 'TimeoutError') return 'SHADOW_SOURCE_TIMEOUT';
  if (error?.code === 'AUTH_REQUIRED') return 'SHADOW_AUTH_REQUIRED';
  return 'SHADOW_SOURCE_UNAVAILABLE';
}
const tabAvailability = board => Object.fromEntries(['roadmap','mural','resumo','resultados','equipe'].map(name=>{
  const value=board?.availability?.[name];
  return [name,value==='available'||value==='unavailable'?value:'unknown'];
}));

export async function readStoredSelection(store) {
  const raw = await store('GET', SELECTION_KEY);
  if (raw === null || raw === undefined) return null;
  return readSelection(JSON.parse(raw));
}

/** The published, reviewed catalog exactly as the public site serves it. */
export async function readPublishedCatalog(env, fetcher = fetch) {
  const url = new URL(env.NEXO_PUBLIC_CATALOG_URL || DEFAULT_CATALOG_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('PUBLIC_CATALOG_NOT_CONFIGURED');
  const response = await fetcher(url, {redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000), headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error('PUBLIC_CATALOG_UNAVAILABLE');
  const text = await response.text();
  if (text.length > 16 * 1024 * 1024) throw new Error('PUBLIC_CATALOG_TOO_LARGE');
  return {url: url.href, rows: catalogCandidates(JSON.parse(text))};
}

async function sources({env, fetcher, readShadow}) {
  const [shadow, catalog] = await Promise.allSettled([
    shadowEnabled(env) ? readShadow() : Promise.reject(new Error('SHADOW_SOURCE_DISABLED')),
    readPublishedCatalog(env, fetcher),
  ]);
  const board = shadow.status === 'fulfilled' ? shadow.value : null;
  const availability=tabAvailability(board);
  return {
    board, availability, shadowError: board ? null : safeShadowError(shadow.reason),
    catalog: catalog.status === 'fulfilled' ? catalog.value : null,
    catalogError: catalog.status === 'fulfilled' ? null : String(catalog.reason?.message || 'PUBLIC_CATALOG_UNAVAILABLE').slice(0, 80),
    tower: board && availability.resultados === 'available' ? towerCandidates(board) : null,
    campaigns: board && availability.roadmap === 'available' ? campaignCandidates(board) : null,
  };
}

const tail = (rows, n) => Array.isArray(rows) ? rows.slice(-n) : [];

/** Everything the cockpit shows, for the authenticated owner only. */
export async function cockpitView({env = process.env, store = atlasStore(env), fetcher = fetch, readShadow, now = new Date()}) {
  const [src, stored, audit] = await Promise.all([
    sources({env, fetcher, readShadow}),
    readStoredSelection(store).then(value => ({value}), error => ({error: String(error?.message || 'SELECTION_STORE_UNAVAILABLE').slice(0, 80)})),
    store('LRANGE', AUDIT_KEY, 0, 19).then(rows => (Array.isArray(rows) ? rows : []).flatMap(row => { try { return [JSON.parse(row)]; } catch { return []; } }), () => []),
  ]);
  const board = src.board;
  const availableRows=(name,n)=>src.availability[name]==='available' ? tail(board?.[name],n) : [];
  return {
    contract: 'NEXO_COCKPIT_V1', generatedAt: now.toISOString(),
    shadow: board ? {available: true, modifiedAt: board.modified_at ?? null, counts: board.counts ?? {}, availability:src.availability,
      equipe: availableRows('equipe',300), roadmap: availableRows('roadmap',300), resultados: availableRows('resultados',60), resumo: availableRows('resumo',20), mural: availableRows('mural',60)}
      : {available: false, reason: src.shadowError},
    catalog: src.catalog ? {available: true, url: src.catalog.url, rows: src.catalog.rows} : {available: false, reason: src.catalogError},
    candidates: {tower: src.tower ?? [], campaigns: src.campaigns ?? []},
    selection: stored.error ? {available: false, reason: stored.error} : {available: true, value: stored.value},
    drift: stored.value ? selectionDrift(stored.value, {tower: src.tower, campaigns: src.campaigns}) : [],
    audit,
  };
}

/** Saves the owner's selection. Digests and catalog membership come from server reads. */
export async function saveCockpitSelection(body, {env = process.env, store = atlasStore(env), fetcher = fetch, readShadow, now = new Date()}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {status: 400, body: {error: 'INVALID_JSON'}};
  if (JSON.stringify(body).length > LIMITS.body) return {status: 413, body: {error: 'REQUEST_BODY_TOO_LARGE'}};
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) return {status: 400, body: {error: 'EXPECTED_VERSION_REQUIRED'}};
  let previous;
  try { previous = await readStoredSelection(store); } catch { return {status: 503, body: {error: 'SELECTION_STORE_UNAVAILABLE'}}; }
  const currentVersion = previous?.version ?? 0;
  if (currentVersion !== body.expectedVersion) return {status: 409, body: {error: 'VERSION_CONFLICT', currentVersion}};
  const src = await sources({env, fetcher, readShadow});
  const {selection, errors} = buildSelection(body, {previous, catalog: src.catalog?.rows ?? [], tower: src.tower, campaigns: src.campaigns, now});
  if (!selection) return {status: 422, body: {error: 'SELECTION_INVALID', errors: errors.slice(0, 50)}};
  readSelection(selection); // the stored document must pass its own strict reader
  const audit = auditEntry(previous, selection);
  let result;
  try { result = await store('EVAL', SAVE_SCRIPT, 2, SELECTION_KEY, AUDIT_KEY, String(currentVersion), JSON.stringify(selection), JSON.stringify(audit)); }
  catch { return {status: 503, body: {error: 'SELECTION_STORE_UNAVAILABLE'}}; }
  if (!Array.isArray(result) || Number(result[0]) !== 1) return {status: 409, body: {error: 'VERSION_CONFLICT', currentVersion: Array.isArray(result) ? Number(result[1]) : null}};
  return {status: 200, body: {saved: true, version: selection.version, updatedAt: selection.updatedAt, audit}};
}

/** Anonymous read for nexoresearch.org: approved public text only. */
export async function publicSelectionView({env = process.env, store = atlasStore(env)} = {}) {
  try { return {status: 200, body: publicSelection(await readStoredSelection(store))}; }
  catch { return {status: 503, body: {error: 'PUBLIC_SELECTION_UNAVAILABLE'}}; }
}
