// Shared request gate for every api/private/* endpoint. No endpoint handler talks to
// req/res directly for auth/CORS -- they all go through withGoogleAuth so the 401/403/
// AUTH_SETUP_REQUIRED/CORS behavior is defined and tested in exactly one place.
import { classifyGoogleSession, isAllowedOrigin, verifyGoogleIdToken, PRODUCTION_PAGES_ORIGIN } from '../../lib/auth.mjs';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

function allowedOrigins() {
  const extra = String(process.env.NEXO_DEV_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return [PRODUCTION_PAGES_ORIGIN, ...extra];
}

function applyCors(req, res) {
  const origin = req.headers?.origin || null;
  if (isAllowedOrigin(origin, allowedOrigins())) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function send(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Wraps a handler with: CORS headers + OPTIONS short-circuit, config check
 * (AUTH_SETUP_REQUIRED when GOOGLE_CLIENT_ID/NEXO_ALLOWED_EMAILS are missing --
 * never a fake session), JWT verification against Google's real JWKS, and allowlist
 * classification (401 vs 403). The wrapped handler only ever runs with a verified,
 * allowlisted identity attached at req.session.
 */
export function withGoogleAuth(handler, { fetchJwks = () => fetch(GOOGLE_JWKS_URL).then(response => response.json()) } = {}) {
  return async function gated(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return send(res, {}, 204);

    const origin = req.headers?.origin || null;
    if (origin && !isAllowedOrigin(origin, allowedOrigins())) return send(res, { error: 'CORS_ORIGIN_NOT_ALLOWED' }, 403);

    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const allowedEmailsRaw = String(process.env.NEXO_ALLOWED_EMAILS || '').trim();
    if (!clientId || !allowedEmailsRaw) {
      return send(res, { error: 'AUTH_SETUP_REQUIRED', missing: [!clientId && 'GOOGLE_CLIENT_ID', !allowedEmailsRaw && 'NEXO_ALLOWED_EMAILS'].filter(Boolean) }, 503);
    }

    const token = bearerToken(req);
    if (!token) return send(res, { error: 'UNAUTHORIZED', reason: 'TOKEN_ABSENT' }, 401);

    let claims;
    try {
      claims = await verifyGoogleIdToken(token, { fetchJwks });
    } catch (error) {
      return send(res, { error: 'UNAUTHORIZED', reason: error.message || 'INVALID_TOKEN' }, 401);
    }

    const allowedEmails = allowedEmailsRaw.split(',').map(email => email.trim()).filter(Boolean);
    const outcome = classifyGoogleSession(claims, clientId, allowedEmails);
    if (outcome.status !== 200) return send(res, { error: outcome.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', reason: outcome.reason }, outcome.status);

    req.session = { email: claims.email };
    return handler(req, res, { send });
  };
}

export { send };
