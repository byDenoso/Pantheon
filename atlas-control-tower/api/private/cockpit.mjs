// GET /api/private/cockpit -- health/state for the operational cockpit. Proxies the
// existing /api/state route (unmodified) after auth; this endpoint's own job is only
// the auth gate. Client-side shaping into the 8 locked HealthPlane rows already exists
// in src/core/cockpit-view-model.ts -- not duplicated here.
import { withGoogleAuth, send } from './_middleware.mjs';
import { proxyInternal } from './_proxy.mjs';

export default withGoogleAuth(async (req, res) => {
  const { status, body } = await proxyInternal(req, '/api/state');
  send(res, { session: req.session, state: body }, status);
});
