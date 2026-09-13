// Internal same-deployment proxy: after withGoogleAuth verifies the caller, forward
// to an existing public route rather than re-implementing a second reader. Every
// route this touches already exists and is unmodified by this session's work.
export async function proxyInternal(req, path) {
  const base = `https://${req.headers?.host || 'localhost'}`;
  const url = new URL(path, base);
  const forwardedQuery = new URL(req.url, base).search;
  if (forwardedQuery) url.search = forwardedQuery;
  const response = await fetch(url, { headers: { 'x-vercel-oidc-token': process.env.VERCEL_OIDC_TOKEN || '' } });
  const body = await response.json().catch(() => ({ error: 'UPSTREAM_NOT_JSON' }));
  return { status: response.status, body };
}
