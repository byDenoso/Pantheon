// GET /api/private/research -- full (non-sanitized) research data: tests, claims,
// datasets, artifacts, results, pipelines. Proxies the existing /api/graph route
// (unmodified), which already carries these entity types; the public map path
// (graph-entity-contract.ts) is what strips them for the map specifically -- this
// private research endpoint is exactly the place they are allowed to surface.
import { withGoogleAuth, send } from './_middleware.mjs';
import { proxyInternal } from './_proxy.mjs';

export default withGoogleAuth(async (req, res) => {
  const { status, body } = await proxyInternal(req, '/api/graph');
  send(res, { session: req.session, graph: body }, status);
});
