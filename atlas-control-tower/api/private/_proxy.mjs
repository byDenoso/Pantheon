import { presentedLegacyOidc } from '../../lib/legacy-machine-auth.mjs';
// Internal same-deployment proxy. Its browser HTTP entrypoints remain retired.
// An authenticated internal caller's machine identity takes precedence over the
// deployment credential when forwarding to an OIDC-aware backend route.
export async function proxyInternal(req, path) {
  const base = `https://${req.headers?.host || 'localhost'}`;
  const url = new URL(path, base);
  const forwardedQuery = new URL(req.url, base).search;
  if (forwardedQuery) url.search = forwardedQuery;
  const response = await fetch(url, { headers: { 'x-vercel-oidc-token': presentedLegacyOidc(req) || process.env.VERCEL_OIDC_TOKEN || '' } });
  const body = await response.json().catch(() => ({ error: 'UPSTREAM_NOT_JSON' }));
  return { status: response.status, body };
}
