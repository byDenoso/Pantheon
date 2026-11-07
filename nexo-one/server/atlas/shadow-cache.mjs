// Last good SHADOW projection, shared by every worker through the Atlas store.
// Vercel Connect answers 429 under repeated token requests, and an in-process
// cooldown does not survive a cold start. Credentials are never stored here:
// only the projection already filtered by private-shadow-source, sealed with a
// key derived from the Atlas credential so it dies when the PIN rotates.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';
import {GOOGLE_AUTH_DIAGNOSTICS} from '../adapters/connect.mjs';

export const SHADOW_CACHE_KEY = 'atlas:shadow-board:last-good:v1';
export const SHADOW_COOLDOWN_KEY = 'atlas:shadow-board:cooldown:v1';
export const SHADOW_LOCK_KEY = 'atlas:shadow-board:lock:v1';
export const SHADOW_FRESH_SECONDS = 240;
export const SHADOW_MAX_AGE_SECONDS = 7 * 24 * 3600;
export const SHADOW_LOCK_SECONDS = 40;
// Commit the cache or cooldown only while this worker still owns the lease.
const FINISH_REFRESH = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == 'ready' then
  if ARGV[3] ~= '' then redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]) end
  redis.call('DEL', KEYS[3])
elseif ARGV[2] == 'limited' then
  redis.call('SET', KEYS[3], '1', 'EX', ARGV[4])
end
redis.call('DEL', KEYS[1])
return 1
`;
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

function diagnostic(error) {
  if (GOOGLE_AUTH_DIAGNOSTICS.includes(error?.googleDiagnostic)) return error.googleDiagnostic;
  if (error?.name === 'TimeoutError') return 'SHADOW_SOURCE_TIMEOUT';
  return /^SHADOW_[A-Z_]{1,64}$/.test(error?.message ?? '') ? error.message : 'SHADOW_SOURCE_UNAVAILABLE';
}
const isRateLimited = error => error?.code === 'RATE_LIMITED' || error?.googleDiagnostic === 'CONNECT_RATE_LIMITED';

/**
 * Wraps a board reader. The result carries `cache`: where the rows came from,
 * their age, and why a refresh did not happen. A store failure degrades to a
 * direct read, so the cache can never make the Cockpit less available.
 */
export function cachedShadowReader({store, readShadow, secret, now = () => Date.now(), jitter = () => 0, serviceAccount = false}) {
  // A cooldown from the Connect broker cannot block a different credential source.
  const cooldownKey = serviceAccount ? SHADOW_COOLDOWN_KEY + ':service-account' : SHADOW_COOLDOWN_KEY;
  const annotate = (board, fetchedAt, stale, reason) => ({
    ...board,
    cache: {fetchedAt: new Date(fetchedAt).toISOString(), ageSeconds: Math.max(0, Math.round((now() - fetchedAt) / 1000)), stale, reason: reason ?? null},
  });
  const safe = async (...command) => {
    try { return await store(...command); } catch { return undefined; }
  };
  return async function read() {
    if (!secret) return annotate(await readShadow(), now(), false, null);
    const readState = async () => {
      const state = await safe('MGET', SHADOW_CACHE_KEY, cooldownKey);
      const [sealed, cooldown] = Array.isArray(state) ? state : [];
      let snapshot = null;
      if (typeof sealed === 'string') {
        try {
          const opened = openBoard(sealed, secret);
          if (opened?.board && Number.isFinite(opened.fetchedAt) &&
              now() - opened.fetchedAt <= SHADOW_MAX_AGE_SECONDS * 1000) snapshot = opened;
        } catch { /* Corrupt values and values sealed before PIN rotation are ignored. */ }
      }
      return {snapshot, cooldown};
    };
    let {snapshot:cached, cooldown} = await readState();
    const fresh = () => cached && now() - cached.fetchedAt <= SHADOW_FRESH_SECONDS * 1000;
    const cooled = () => {
      if (cached) return annotate(cached.board, cached.fetchedAt, true, 'CONNECT_RATE_LIMITED');
      throw Object.assign(new Error('RATE_LIMITED'), {code: 'RATE_LIMITED', googleDiagnostic: 'CONNECT_RATE_LIMITED'});
    };
    if (fresh()) return annotate(cached.board, cached.fetchedAt, false, null);
    if (cooldown) return cooled();

    const owner = randomBytes(16).toString('hex');
    const lock = await safe('SET', SHADOW_LOCK_KEY, owner, 'NX', 'EX', SHADOW_LOCK_SECONDS);
    if (lock === null) {
      if (cached) return annotate(cached.board, cached.fetchedAt, true, 'REFRESH_IN_PROGRESS');
      throw new Error('SHADOW_REFRESH_IN_PROGRESS');
    }
    let finished = false;
    const finish = async (action, value = '', ttl = SHADOW_MAX_AGE_SECONDS) => {
      if (lock !== 'OK') return;
      const result = await safe('EVAL', FINISH_REFRESH, 3, SHADOW_LOCK_KEY, SHADOW_CACHE_KEY, cooldownKey,
                                owner, action, value, ttl);
      finished = result === 0 || result === 1;
      return result;
    };
    try {
      if (lock === 'OK') {
        const state = await readState();
        cached = state.snapshot ?? cached;
        if (fresh()) return annotate(cached.board, cached.fetchedAt, false, null);
        if (state.cooldown) return cooled();
      }
      const board = await readShadow();
      const fetchedAt = now();
      if (lock === 'OK') {
        const value = sealBoard({fetchedAt, board}, secret);
        if (await finish('ready', value.length <= MAX_SEALED_BYTES ? value : '') === 0) {
          // A later refresh may already have committed. Never authorize a write from this result.
          const latest = (await readState()).snapshot;
          if (latest) {
            const stale = now() - latest.fetchedAt > SHADOW_FRESH_SECONDS * 1000;
            return annotate(latest.board, latest.fetchedAt, stale, stale ? 'REFRESH_SUPERSEDED' : null);
          }
          return annotate(board, fetchedAt, true, 'REFRESH_SUPERSEDED');
        }
      }
      return annotate(board, fetchedAt, false, null);
    } catch (error) {
      if (isRateLimited(error) && error.retryDelayMs !== undefined) {
        const seconds = Math.ceil(Math.max(60000, Number(error.retryDelayMs) || 60000) / 1000) + jitter();
        await finish('limited', '', seconds);
      }
      if (cached) return annotate(cached.board, cached.fetchedAt, true, diagnostic(error));
      throw error;
    } finally {
      if (!finished) await finish('release');
    }
  };
}
