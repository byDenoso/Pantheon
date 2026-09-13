// GET /api/private/learner -- operational Learner state (scheduler enabled/disabled,
// pending handoffs, consumption proof). No existing reader exposes this (confirmed:
// api/atlas.js's loadLearning() returns the *learning ladder* -- observation/pattern/
// lesson/strategy/policy content -- not scheduler/handoff operational state). Returns
// DATA_UNAVAILABLE honestly rather than inventing a filament with no backing evidence,
// consistent with getLearnerLayer() in src/core/PublicSnapshotSource.ts.
import { withGoogleAuth, send } from './_middleware.mjs';

export default withGoogleAuth((req, res) => {
  send(res, {
    session: req.session,
    data: [],
    state: 'DATA_UNAVAILABLE',
    issues: [{ code: 'LEARNER_OPERATIONAL_READER_NOT_IMPLEMENTED', severity: 'INFO', message: 'No backend reader currently exposes Learner scheduler/handoff operational state.' }]
  });
});
