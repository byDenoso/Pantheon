import { createHmac, timingSafeEqual } from 'node:crypto';

export const PIN_SESSION_COOKIE = 'nexo_atlas_session';
const SESSION_VERSION = 'v1';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function configuredPin() {
  return String(process.env.NEXO_ACCESS_PIN || '').trim();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signingKey(pin = configuredPin()) {
  if (!pin) return '';
  return createHmac('sha256', pin).update('NEXO_ATLAS_PIN_SESSION_KEY_V1').digest('hex');
}

function signature(payload, pin = configuredPin()) {
  const key = signingKey(pin);
  if (!key) return '';
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function isPinAuthConfigured() {
  return Boolean(configuredPin());
}

export function verifyAccessPin(candidate) {
  const pin = configuredPin();
  if (!pin) return { ok: false, reason: 'PIN_AUTH_NOT_CONFIGURED' };
  const value = String(candidate ?? '').trim();
  if (!/^\d{4,12}$/.test(value)) return { ok: false, reason: 'INVALID_PIN' };
  return safeEqual(value, pin) ? { ok: true, reason: 'OK' } : { ok: false, reason: 'INVALID_PIN' };
}

export function createPinSession(nowSeconds = Math.floor(Date.now() / 1000)) {
  const pin = configuredPin();
  if (!pin) throw new Error('PIN_AUTH_NOT_CONFIGURED');
  const expiresAt = nowSeconds + SESSION_TTL_SECONDS;
  const payload = `${SESSION_VERSION}.${nowSeconds}.${expiresAt}`;
  return `${payload}.${signature(payload, pin)}`;
}

export function verifyPinSession(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const pin = configuredPin();
  if (!pin || !token) return { ok: false, reason: pin ? 'SESSION_ABSENT' : 'PIN_AUTH_NOT_CONFIGURED' };
  const parts = String(token).split('.');
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return { ok: false, reason: 'INVALID_SESSION' };
  const issuedAt = Number(parts[1]);
  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) return { ok: false, reason: 'INVALID_SESSION' };
  if (expiresAt <= nowSeconds) return { ok: false, reason: 'SESSION_EXPIRED' };
  if (issuedAt > nowSeconds + 60) return { ok: false, reason: 'INVALID_SESSION' };
  const payload = parts.slice(0, 3).join('.');
  const expected = signature(payload, pin);
  return safeEqual(parts[3], expected) ? { ok: true, reason: 'OK', issuedAt, expiresAt } : { ok: false, reason: 'INVALID_SESSION' };
}

export function parseCookies(header) {
  const result = {};
  for (const pair of String(header || '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

export function readPinSession(req) {
  const token = parseCookies(req?.headers?.cookie || '')[PIN_SESSION_COOKIE];
  return verifyPinSession(token);
}

export function pinSessionCookie(token, { secure = true } = {}) {
  const flags = [`${PIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', `Max-Age=${SESSION_TTL_SECONDS}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

export function clearPinSessionCookie({ secure = true } = {}) {
  const flags = [`${PIN_SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}
