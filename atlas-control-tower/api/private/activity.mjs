// GET /api/private/activity -- execution/receipt/readback/handoff timeline.
// No existing reader in this codebase produces this shape (confirmed by inspecting
// api/atlas.js, api/runtime*.js: they expose graph/state/entity/audit/learning/ops,
// none of which is an intent->execution->receipt->mutation->readback->handoff log).
// Returns an honest DATA_UNAVAILABLE rather than fabricating an activity feed.
import { withGoogleAuth, send } from './_middleware.mjs';

export default withGoogleAuth((req, res) => {
  send(res, {
    session: req.session,
    data: null,
    state: 'DATA_UNAVAILABLE',
    issues: [{ code: 'ACTIVITY_READER_NOT_IMPLEMENTED', severity: 'INFO', message: 'No backend reader currently produces an intent/execution/receipt/readback/handoff timeline.' }]
  });
});
