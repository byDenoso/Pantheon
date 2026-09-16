// Shared request gate for every api/private/* endpoint. Private endpoints accept a
// server-issued PIN session cookie first and retain Google bearer auth as a backwards-
// compatible secondary path. The PIN itself never reaches browser storage or source.
import { classifyGoogleSession, isAllowedOrigin, verifyGoogleIdToken, PRODUCTION_PAGES_ORIGIN } from '../../lib/auth.mjs';
import { isPinAuthConfigured, readPinSession } from '../../lib/pin-auth.mjs';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

function sameOrigin(req, origin) {
  if (!origin) return true;
  const host = String(req.headers?.host || '').trim();
  if (!host) return false;
  return origin === `https://${host}` || origin === `http://${host}`;
}

function allowedOrigins() {
  const extra = String(process.env.NEXO_DEV_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return [PRODUCTION_PAGES_ORIGIN, ...extra];
}

function originAllowed(req, origin) {
  return sameOrigin(req, origin) || isAllowedOrigin(origin, allowedOrigins());
}

function applyCors(req, res) {
  const origin = req.headers?.origin || null;
  if (origin && originAllowed(req, origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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

export function withGoogleAuth(handler, { fetchJwks = () => fetch(GOOGLE_JWKS_URL).then(response => response.json()) } = {}) {
  return async function gated(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return send(res, {}, 204);

    const origin = req.headers?.origin || null;
    if (origin && !originAllowed(req, origin)) return send(res, { error: 'CORS_ORIGIN_NOT_ALLOWED' }, 403);

    if (isPinAuthConfigured()) {
      const pinSession = readPinSession(req);
      if (pinSession.ok) {
        req.session = { auth: 'pin', expiresAt: pinSession.expiresAt };
        return handler(req, res, { send });
      }
    }

    const token = bearerToken(req);
    if (!token) {
      return send(res, { error: 'UNAUTHORIZED', reason: 'SESSION_OR_TOKEN_ABSENT' }, 401);
    }

    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const allowedEmailsRaw = String(process.env.NEXO_ALLOWED_EMAILS || '').trim();
    if (!clientId || !allowedEmailsRaw) {
      return send(res, { error: 'AUTH_SETUP_REQUIRED', missing: [!isPinAuthConfigured() && 'NEXO_ACCESS_PIN', !clientId && 'GOOGLE_CLIENT_ID', !allowedEmailsRaw && 'NEXO_ALLOWED_EMAILS'].filter(Boolean) }, 503);
    }

    let claims;
    try {
      claims = await verifyGoogleIdToken(token, { fetchJwks });
    } catch (error) {
      return send(res, { error: 'UNAUTHORIZED', reason: error.message || 'INVALID_TOKEN' }, 401);
    }

    const allowedEmails = allowedEmailsRaw.split(',').map(email => email.trim()).filter(Boolean);
    const outcome = classifyGoogleSession(claims, clientId, allowedEmails);
    if (outcome.status !== 200) return send(res, { error: outcome.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', reason: outcome.reason }, outcome.status);

    req.session = { auth: 'google', email: claims.email };
    return handler(req, res, { send });
  };
}

export { applyCors, originAllowed, send };
