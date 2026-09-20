// POST /api/private/sync -- the single operational control. Reads the fingerprint
// before, triggers a refresh (?refresh=1 on the existing /api/state route -- proxying,
// not a new refresh mechanism), then independently re-reads /api/state again (a
// separate request, not the same object reused) to compute readbackVerified via the
// shared resolveSyncReceipt rule. Never reports success without that independent
// after-read confirming it.
import { withGoogleAuth, send } from './_middleware.mjs';
import { proxyInternal } from './_proxy.mjs';
import { resolveSyncReceipt } from '../../lib/sync-receipt.mjs';

function sourceReadFrom(status, body) {
  if (status < 200 || status >= 300 || body?.error) return { id: 'tower-state', state: 'API_ERROR', observedAt: undefined };
  return { id: 'tower-state', state: 'READY', observedAt: body?.capabilities?.projection?.sourceVersion || body?.projection?.sourceVersion };
}

export async function performSync(req) {
  const requestId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date().toISOString();

  const before = await proxyInternal(req, '/api/state');
  const beforeFingerprint = before.body?.capabilities?.projection?.fingerprint || before.body?.projection?.fingerprint || null;

  const refreshReq = { ...req, url: `${req.url}${req.url.includes('?') ? '&' : '?'}refresh=1` };
  const refreshed = await proxyInternal(refreshReq, '/api/state');

  // Independent after-read: a second, separate request, not the refresh response
  // reused -- this is what makes readbackVerified mean something.
  const after = await proxyInternal(req, '/api/state');
  const afterFingerprint = after.body?.capabilities?.projection?.fingerprint || after.body?.projection?.fingerprint || null;

  const errors = [];
  if (refreshed.status < 200 || refreshed.status >= 300) errors.push({ code: 'REFRESH_FAILED', severity: 'ERROR', message: 'The upstream refresh call did not return a success status.' });

  return resolveSyncReceipt({
    requestId,
    startedAt,
    completedAt: new Date().toISOString(),
    beforeFingerprint,
    afterFingerprint,
    beforeSources: [sourceReadFrom(before.status, before.body)],
    afterSources: [sourceReadFrom(after.status, after.body)],
    errors
  });
}

export default withGoogleAuth(async (req, res) => {
  if (req.method !== 'POST') return send(res, { error: 'METHOD_NOT_ALLOWED' }, 405);
  const receipt = await performSync(req);
  send(res, { session: req.session, ...receipt });
});
