// GET /api/auth/session -- the one endpoint the frontend calls to find out who (if
// anyone) is signed in. Returns the verified email on success; withGoogleAuth already
// covers every failure mode (AUTH_SETUP_REQUIRED/401/403/CORS) before this ever runs.
import { withGoogleAuth, send } from '../private/_middleware.mjs';

export default withGoogleAuth((req, res) => {
  send(res, { email: req.session.email, authenticated: true });
});
