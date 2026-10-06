import { legacyMcpKeyAuthorized, legacyOidcAuthorized } from './legacy-machine-auth.mjs';

function send(res, status, error) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(JSON.stringify({ error }));
}

// Legacy browser sessions are not a substitute for the canonical opaque session.
// Preserve only machine identities that an individual entrypoint already used:
// MCP bearer keys on MCP; verified production-Atlas OIDC on OIDC-backed readers.
// Callers cannot select this policy through route/query/body/header values.
export function withPrivateApiBoundary(handler, { machine = null, env = process.env, verifyOidc } = {}) {
  return async function privateApiBoundary(req, res) {
    const setHeader = res.setHeader.bind(res);
    const cacheHeaders = new Set(['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control']);
    res.setHeader = (name, value) => setHeader(name, cacheHeaders.has(String(name).toLowerCase()) ? 'private, no-store' : value);
    for (const name of cacheHeaders) res.setHeader(name, 'private, no-store');
    try {
      if (machine === 'mcp') {
        if (!legacyMcpKeyAuthorized(req?.headers, env)) return send(res, 401, 'UNAUTHORIZED');
        return await handler(req, res);
      }
      if (machine === 'projection-oidc') {
        const token = await legacyOidcAuthorized(req, { verifyOidc });
        if (!token) return send(res, 401, 'UNAUTHORIZED');
        const authorizedReq = Object.create(req);
        // Always propagate the identity just verified; downstream readers must
        // not substitute their own server credential for an incoming identity.
        authorizedReq.headers = { ...req.headers, 'x-vercel-oidc-token': token };
        return await handler(authorizedReq, res);
      }
      return send(res, 410, 'LEGACY_ATLAS_DATA_API_RETIRED');
    } finally {
      res.setHeader = setHeader;
    }
  };
}
