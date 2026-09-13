// GET /api/private/entity?id=... -- full private detail for one entity (test, claim,
// dataset, artifact...), including fields the public path never exposes. Proxies the
// existing /api/entity route (unmodified) after auth.
import { withGoogleAuth, send } from './_middleware.mjs';
import { proxyInternal } from './_proxy.mjs';

export default withGoogleAuth(async (req, res) => {
  const url = new URL(req.url, 'https://atlas.local');
  if (!url.searchParams.get('id')) return send(res, { error: 'MISSING_ID' }, 400);
  const { status, body } = await proxyInternal(req, '/api/entity');
  send(res, { session: req.session, entity: body }, status);
});
