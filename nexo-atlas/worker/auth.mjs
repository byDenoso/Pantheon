import {randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const derive = promisify(scrypt);
export const ORIGIN = 'https://nexo-atlas.workspace-797984.chatgpt.site';
export const ALLOWED_ORIGINS = new Set([ORIGIN, 'https://nexo.denerpereira.com.br', 'https://nexoresearch.org']);
export const SESSION_SECONDS = 3600;
const WINDOW_MS = 900000;
const COOKIE = '__Host-atlas_session';
const HASH = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const cookie = value => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${value ? SESSION_SECONDS : 0}`;

export function configured(env) {
  return HASH.test(env.NEXO_ATLAS_PIN_HASH || '') && Boolean(env.DB?.prepare);
}
export function sameOrigin(request) {
  const origin = new URL(request.url).origin;
  return ALLOWED_ORIGINS.has(origin) && request.headers.get('origin') === origin &&
    (!request.headers.get('sec-fetch-site') || request.headers.get('sec-fetch-site') === 'same-origin');
}
function tokenFor(request) {
  const entries = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  if (entries.length !== 1) return '';
  const token = entries[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
// Request-scoped strong reads: never accept a stale replica after revocation.
export function database(env) {
  if (!env.DB?.prepare) throw new Error('AUTH_STORE_UNAVAILABLE');
  return env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
}
export async function readSession(request, env, now = Date.now(), db = database(env)) {
  if (!configured(env)) return null;
  const token = tokenFor(request);
  if (!token) return null;
  const row = await db.prepare('SELECT credential, expires_at FROM atlas_sessions WHERE token_hash = ?').bind(sha(token)).first();
  if (!row || row.credential !== sha(env.NEXO_ATLAS_PIN_HASH) || !Number.isSafeInteger(row.expires_at) || row.expires_at <= now || row.expires_at > now + SESSION_SECONDS * 1000) return null;
  return {expiresAt: new Date(row.expires_at).toISOString()};
}
// Server-only binding for the atomic autonomy confirmation INSERT. Never serialized.
export async function sessionBinding(request, env, now = Date.now()) {
  const session = await readSession(request, env, now);
  if (!session) return null;
  return {sessionHash: sha(tokenFor(request)), credentialHash: sha(env.NEXO_ATLAS_PIN_HASH),
    pinHash: env.NEXO_ATLAS_PIN_HASH, expiresAt: Date.parse(session.expiresAt)};
}
export async function sessionRoute(request, env, body = {}, now = Date.now()) {
  const result = (status, body, setCookie) => ({status, body, setCookie});
  if (request.method === 'GET') {
    const session = configured(env) ? await readSession(request, env, now) : null;
    return result(200, {configured: configured(env), authenticated: Boolean(session), ...(session || {})});
  }
  if (!['POST', 'DELETE'].includes(request.method)) return result(405, {error: 'METHOD_NOT_ALLOWED'});
  if (!sameOrigin(request)) return result(403, {error: 'ORIGIN_NOT_ALLOWED'});
  if (!configured(env)) return result(503, {error: 'AUTH_NOT_CONFIGURED'});
  const db = database(env);
  if (request.method === 'DELETE') {
    const token = tokenFor(request);
    if (token) await db.prepare('DELETE FROM atlas_sessions WHERE token_hash = ?').bind(sha(token)).run();
    return result(200, {authenticated: false}, cookie(''));
  }
  if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return result(415, {error: 'JSON_REQUIRED'});
  // One atomic global budget across every isolate. Proxy headers cannot evade it.
  const budget = await db.prepare(`INSERT INTO atlas_login_budget (key, count, expires_at) VALUES ('global', 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count, expires_at`).bind(now + WINDOW_MS, now, now).first();
  if (!Number.isSafeInteger(budget?.count) || budget.count < 1) throw new Error('AUTH_STORE_UNAVAILABLE');
  if (budget.count > 5) return result(429, {error: 'RATE_LIMITED', retryAfter: Math.max(1, Math.ceil((budget.expires_at - now) / 1000))});
  if (typeof body.pin !== 'string' || body.pin.length < 8 || body.pin.length > 128) return result(401, {error: 'AUTH_REQUIRED'});
  const [, salt, expected] = env.NEXO_ATLAS_PIN_HASH.split('$');
  const actual = await derive(body.pin, salt, 64);
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return result(401, {error: 'AUTH_REQUIRED'});
  const token = randomBytes(32).toString('hex'), exp = now + SESSION_SECONDS * 1000;
  const statements = [
    db.prepare('DELETE FROM atlas_sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO atlas_sessions (token_hash, credential, expires_at) VALUES (?, ?, ?)').bind(sha(token), sha(env.NEXO_ATLAS_PIN_HASH), exp),
  ];
  const previous = tokenFor(request);
  if (previous) statements.push(db.prepare('DELETE FROM atlas_sessions WHERE token_hash = ?').bind(sha(previous)));
  await db.batch(statements);
  return result(200, {authenticated: true, expiresAt: new Date(exp).toISOString()}, cookie(token));
}
