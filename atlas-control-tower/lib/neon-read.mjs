/** Shared Neon Data API reader for the projection endpoint.
 *
 *  One transport, one error vocabulary. The caller never sees a half-read table:
 *  a refused or failed read throws a typed error, so the projection can report
 *  SOURCE_UNAVAILABLE or PERMISSION_ERROR instead of publishing a partial graph
 *  that looks complete. */

export const NEON_BASE = 'https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';

export class NeonReadError extends Error {
 constructor(kind, {profile, table, status, detail} = {}) {
  super(`${kind}:${profile || '-'}.${table || '-'}${status ? `:${status}` : ''}`);
  this.name = 'NeonReadError';
  this.kind = kind;               // OIDC_NOT_AVAILABLE | PERMISSION_ERROR | SOURCE_UNAVAILABLE
  this.profile = profile || '';
  this.table = table || '';
  this.status = status || 0;
  this.detail = String(detail || '').slice(0, 200);
 }
}

export const tokenOf = req =>
 req?.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || '';

function paramsOf(query = {}) {
 return new URLSearchParams(
  Object.entries(query)
   .filter(([, v]) => v !== undefined && v !== null && v !== '')
   .map(([k, v]) => [k, String(v)])
 );
}

function classify(status) {
 if (status === 401 || status === 403) return 'PERMISSION_ERROR';
 return 'SOURCE_UNAVAILABLE';
}

/** Reads rows from one schema-qualified table. `fetchImpl` is injectable for tests. */
export async function readTable(req, profile, table, query = {}, {timeoutMs = 15000, fetchImpl = fetch} = {}) {
 const token = tokenOf(req);
 if (!token) throw new NeonReadError('OIDC_NOT_AVAILABLE', {profile, table});
 let response;
 try {
  response = await fetchImpl(`${NEON_BASE}/${encodeURIComponent(table)}?${paramsOf(query)}`, {
   headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Profile': profile},
   signal: AbortSignal.timeout(timeoutMs)
  });
 } catch (error) {
  throw new NeonReadError('SOURCE_UNAVAILABLE', {profile, table, detail: error?.message || error});
 }
 if (!response.ok) {
  const detail = await response.text().catch(() => '');
  throw new NeonReadError(classify(response.status), {profile, table, status: response.status, detail});
 }
 const rows = await response.json();
 if (!Array.isArray(rows)) throw new NeonReadError('SOURCE_UNAVAILABLE', {profile, table, detail: 'NON_ARRAY_PAYLOAD'});
 return rows;
}

/** Row count without transferring the table, via PostgREST's Content-Range. */
export async function countTable(req, profile, table, {timeoutMs = 8000, fetchImpl = fetch} = {}) {
 const token = tokenOf(req);
 if (!token) throw new NeonReadError('OIDC_NOT_AVAILABLE', {profile, table});
 const response = await fetchImpl(`${NEON_BASE}/${encodeURIComponent(table)}?limit=1&select=*`, {
  headers: {
   Authorization: `Bearer ${token}`, Accept: 'application/json',
   'Accept-Profile': profile, Prefer: 'count=exact'
  },
  signal: AbortSignal.timeout(timeoutMs)
 }).catch(error => {
  throw new NeonReadError('SOURCE_UNAVAILABLE', {profile, table, detail: error?.message || error});
 });
 if (!response.ok) {
  const detail = await response.text().catch(() => '');
  throw new NeonReadError(classify(response.status), {profile, table, status: response.status, detail});
 }
 return contentRangeTotal(response.headers?.get?.('content-range'));
}

/** `0-0/5047` → 5047. An absent or unparsed range is null, never 0: an unknown
 *  count and an empty table are different facts. */
export function contentRangeTotal(header) {
 const total = String(header || '').split('/')[1];
 if (!total || total === '*') return null;
 const parsed = Number(total);
 return Number.isFinite(parsed) ? parsed : null;
}
