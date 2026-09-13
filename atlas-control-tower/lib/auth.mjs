// Shared auth logic, consumed both by the browser bundle (via src/core/auth.ts,
// which imports from here) and by the Vercel serverless functions under api/private/*
// (plain .js, no TS build step there -- matches this repo's existing api/*.js
// convention). One implementation, not two copies drifting apart.

const VALID_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
export const PRODUCTION_PAGES_ORIGIN = 'https://bydenoso.github.io';

/**
 * Pure classification of already-signature-verified Google ID token claims against
 * the expected audience and the email allowlist. Never trusts an unverified token --
 * callers must call verifyGoogleIdToken (or equivalent) first.
 */
export function classifyGoogleSession(claims, expectedAudience, allowedEmails, now = Math.floor(Date.now() / 1000)) {
  if (!claims) return { status: 401, reason: 'TOKEN_ABSENT' };
  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) return { status: 401, reason: 'INVALID_ISSUER' };
  if (claims.aud !== expectedAudience) return { status: 401, reason: 'INVALID_AUDIENCE' };
  if (!claims.exp || claims.exp <= now) return { status: 401, reason: 'EXPIRED' };
  if (!claims.email_verified) return { status: 401, reason: 'EMAIL_NOT_VERIFIED' };
  if (!claims.email) return { status: 401, reason: 'EMAIL_ABSENT' };
  const allowlist = new Set(allowedEmails.map(email => email.trim().toLowerCase()));
  if (!allowlist.has(claims.email.trim().toLowerCase())) return { status: 403, reason: 'NOT_IN_ALLOWLIST' };
  return { status: 200, reason: 'OK' };
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

function base64UrlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

/**
 * Decodes a JWT's header/payload WITHOUT verifying the signature. Only ever used
 * internally by verifyGoogleIdToken to find the key id before verification, and
 * exposed for tests -- never call this alone and trust the result as an identity.
 */
export function decodeJwtUnsafe(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('MALFORMED_JWT');
  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: base64UrlDecode(parts[2]) };
}

/**
 * Verifies a Google-issued RS256 JWT's signature against a JWKS key set (as returned
 * by https://www.googleapis.com/oauth2/v3/certs) using node:crypto -- no external JWT
 * library dependency. `fetchJwks` is injectable so this is testable with a locally
 * generated keypair instead of a real network call. Returns the verified payload, or
 * throws with a specific reason string on any failure (malformed token, unknown kid,
 * bad signature, unsupported algorithm).
 */
export async function verifyGoogleIdToken(token, { fetchJwks }) {
  const { createPublicKey, verify } = await import('node:crypto');
  const { header, payload, signingInput, signature } = decodeJwtUnsafe(token);
  if (header.alg !== 'RS256') throw new Error('UNSUPPORTED_ALG');
  const jwks = await fetchJwks();
  const key = (jwks.keys || []).find(candidate => candidate.kid === header.kid);
  if (!key) throw new Error('UNKNOWN_KID');
  const publicKey = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });
  const valid = verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);
  if (!valid) throw new Error('INVALID_SIGNATURE');
  return payload;
}
