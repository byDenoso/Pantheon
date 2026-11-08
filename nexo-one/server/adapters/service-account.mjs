import {createSign} from 'node:crypto';
import {ProviderError} from './http.mjs';

// Direct Google access for the Atlas readers: a service account signs its own JWT, so no
// Vercel Connect token request (and no Connect rate limit) sits between the Cockpit and Drive.
// Only Drive and Sheets scopes are served here; Gmail and Calendar need user delegation and
// keep going through the existing path.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SERVED = new Set([
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets'
]);
const cache = new Map();

const b64u = value => Buffer.from(value).toString('base64url');

export function parseServiceAccount(env) {
  const raw = env?.GOOGLE_SERVICE_ACCOUNT_JSON_B64
    ? Buffer.from(String(env.GOOGLE_SERVICE_ACCOUNT_JSON_B64), 'base64').toString('utf8')
    : env?.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let key;
  try { key = JSON.parse(raw); } catch { throw new ProviderError('AUTH_REQUIRED'); }
  if (key?.type !== 'service_account' || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new ProviderError('AUTH_REQUIRED');
  }
  return key;
}

export function serviceAccountServes(env, scopes) {
  return Boolean(env?.GOOGLE_SERVICE_ACCOUNT_JSON || env?.GOOGLE_SERVICE_ACCOUNT_JSON_B64)
    && Array.isArray(scopes) && scopes.length > 0 && scopes.every(scope => SERVED.has(scope));
}

export function signAssertion(key, scopes, nowSeconds) {
  const head = b64u(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const claim = b64u(JSON.stringify({iss: key.client_email, scope: [...scopes].sort().join(' '), aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600}));
  const signature = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key).toString('base64url');
  return `${head}.${claim}.${signature}`;
}

export async function serviceAccountToken(env, signal, scopes, {fetchImpl = fetch, now = () => Date.now()} = {}) {
  const key = parseServiceAccount(env);
  if (!key) throw new ProviderError('AUTH_REQUIRED');
  const id = `${key.client_email}|${[...scopes].sort().join(' ')}`;
  const hit = cache.get(id);
  if (hit && hit.until > now()) return hit.token;
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST', redirect: 'error', signal,
      headers: {Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signAssertion(key, scopes, Math.floor(now() / 1000))})
    });
  } catch { throw new ProviderError('UNAVAILABLE'); }
  if (!response.ok) throw new ProviderError(response.status === 429 ? 'RATE_LIMITED' : [400, 401, 403].includes(response.status) ? 'AUTH_REQUIRED' : 'UNAVAILABLE');
  let data;
  try { data = await response.json(); } catch { throw new ProviderError('UNAVAILABLE'); }
  if (typeof data?.access_token !== 'string' || !data.access_token) throw new ProviderError('AUTH_REQUIRED');
  cache.set(id, {token: data.access_token, until: now() + Math.max(60, (Number(data.expires_in) || 3600) - 120) * 1000});
  return data.access_token;
}

export const clearServiceAccountCache = () => cache.clear();
