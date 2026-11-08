// Last good SHADOW projection, shared by every worker through the Atlas store.
// Vercel Connect answers 429 under repeated token requests, and an in-process
// cooldown does not survive a cold start. Credentials are never stored here:
// only the projection already filtered by private-shadow-source, sealed with a
// key derived from the Atlas credential so it dies when the PIN rotates.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';

export const SHADOW_CACHE_KEY = 'atlas:shadow-board:last-good:v1';
export const SHADOW_COOLDOWN_KEY = 'atlas:shadow-board:cooldown:v1';
export const SHADOW_LOCK_KEY = 'atlas:shadow-board:lock:v1';
export const SHADOW_FRESH_SECONDS = 240;
export const SHADOW_MAX_AGE_SECONDS = 7 * 24 * 3600;
export const SHADOW_LOCK_SECONDS = 40;
const RELEASE_LOCK = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const MAX_SEALED_BYTES = 900 * 1024;

const keyFrom = secret => createHash('sha256').update(`nexo-shadow-cache:${secret}`).digest();

export function sealBoard(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(value))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function openBoard(sealed, secret) {
  const raw = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])).toString('utf8'));
}

const diagnostic = error => String(error?.googleDiagnostic || error?.message || 'SHADOW_SOURCE_UNAVAILABLE').slice(0, 80);
const isRateLimited = error => error?.code === 'RATE_LIMITED' || error?.googleDiagnostic === 'CONNECT_RATE_LIMITED';

/**
 * Wraps a board reader. The result carries `cache`: where the rows came from,
 * their age, and why a refresh did not happen. A store failure degrades to a
 * direct read, so the cache can never make the Cockpit less available.
 */
export function cachedShadowReader({store, readShadow, secret, now = () => Date.now(), jitter = () => 0}) {
  const annotate = (board, fetchedAt, stale, reason) => ({
    ...board,
    cache: {fetchedAt: new Date(fetchedAt).toISOString(), ageSeconds: Math.max(0, Math.round((now() - fetchedAt) / 1000)), stale, reason: reason ?? null},
  });
  const safe = async (...command) => {
    try { return await store(...command); } catch { return undefined; }
  };
  return async function read() {
    if (!secret) return annotate(await readShadow(), now(), false, null);
    const readCached = async () => {
      const sealed = await safe('GET', SHADOW_CACHE_KEY);
      if (typeof sealed !== 'string') return null;
      try {
        const opened = openBoard(sealed, secret);
        if (Number.isFinite(opened?.fetchedAt) && now() - opened.fetchedAt <= SHADOW_MAX_AGE_SECONDS * 1000) return opened;
      } catch { /* Corrupt values and values sealed before PIN rotation are ignored. */ }
      return null;
    };
    let cached = await readCached();
    const fresh = () => cached && now() - cached.fetchedAt <= SHADOW_FRESH_SECONDS * 1000;
    const cooled = () => {
      if (cached) return annotate(cached.board, cached.fetchedAt, true, 'CONNECT_RATE_LIMITED');
      throw Object.assign(new Error('RATE_LIMITED'), {code: 'RATE_LIMITED', googleDiagnostic: 'CONNECT_RATE_LIMITED'});
    };
    if (fresh()) return annotate(cached.board, cached.fetchedAt, false, null);
    if (await safe('GET', SHADOW_COOLDOWN_KEY)) return cooled();

    const owner = randomBytes(16).toString('hex');
    const lock = await safe('SET', SHADOW_LOCK_KEY, owner, 'NX', 'EX', SHADOW_LOCK_SECONDS);
    if (lock === null) {
      if (cached) return annotate(cached.board, cached.fetchedAt, true, 'REFRESH_IN_PROGRESS');
      throw new Error('SHADOW_REFRESH_IN_PROGRESS');
    }
    try {
      if (lock === 'OK') {
        cached = await readCached() ?? cached;
        if (fresh()) return annotate(cached.board, cached.fetchedAt, false, null);
        if (await safe('GET', SHADOW_COOLDOWN_KEY)) return cooled();
      }
      const board = await readShadow();
      const fetchedAt = now();
      const value = sealBoard({fetchedAt, board}, secret);
      if (value.length <= MAX_SEALED_BYTES) await safe('SET', SHADOW_CACHE_KEY, value, 'EX', SHADOW_MAX_AGE_SECONDS);
      await safe('DEL', SHADOW_COOLDOWN_KEY);
      return annotate(board, fetchedAt, false, null);
    } catch (error) {
      if (isRateLimited(error) && error.retryDelayMs !== undefined) {
        const seconds = Math.ceil(Math.min(900000, Math.max(60000, Number(error.retryDelayMs) || 60000)) / 1000) + jitter();
        await safe('SET', SHADOW_COOLDOWN_KEY, '1', 'EX', seconds);
      }
      if (cached) return annotate(cached.board, cached.fetchedAt, true, diagnostic(error));
      throw error;
    } finally {
      if (lock === 'OK') await safe('EVAL', RELEASE_LOCK, 1, SHADOW_LOCK_KEY, owner);
    }
  };
}
