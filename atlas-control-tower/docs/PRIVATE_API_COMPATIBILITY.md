# Legacy Atlas API compatibility boundary

The public content allowlist is empty. This change does not publish research or
operational data, and does not make a browser PIN a dependency for machine work.

## Preserved machine surfaces

- `api/mcp.js`: preserves the existing bearer-key contract. SHA-256 verification
  uses `NEXO_MCP_ACCESS_KEY_SHA256`, otherwise `NEXO_RUNNER_KEY_SHA256`, otherwise
  the existing `DEFAULT_RUNNER_KEY_SHA256` scheduled-task contract. This grant
  applies only to MCP. GET discovery, initialization, tool listing, bootstrap,
  and execution now all require that same verifiable machine credential.
  The existing storage-mode selection and downstream semantic/Writer checks
  still apply. A non-Drive mode does not gain a new write path.
- `api/runtime.js`, `api/runtime-v2.js`, `api/runtime-semantic.js`, and
  `api/universal-projection.js`: retain their existing OIDC transport for the
  production Atlas service. A caller must present the token in
  `x-vercel-oidc-token` or Bearer authorization. Conflicting headers fail closed.
  The shared `verifyProjectionServiceToken` verifier checks the signature,
  issuer, audience, subject, owner, project, environment, and lifetime against
  the existing `PROJECTION_SERVICE_TRUST` identity. No environment-only token,
  other Vercel project, browser cookie, or MCP/runner key grants access.

The exact existing Atlas deployment identity is recorded in `FRONTEND.md` and
`audits/2026-09-14-cockpit-source-readback.md`. These four readers already used
caller OIDC and/or the Atlas deployment's own OIDC for their upstream transport;
the new gate validates the caller before any branch, private read, or cached
response. It does not extend this identity to Drive/GitHub readers that never
had such an inbound identity contract.

All successful machine responses are `private, no-store`, including old handlers
that previously selected public or short-lived shared caches. The internal
private proxy preserves a presented machine token when forwarding. That helper
adds no new HTTP route grant and does not bypass the retirement below.

## Remaining retired data entrypoints

The following retain a non-data 410 response; old Google/PIN sessions and machine
keys cannot grant them a broader role:

- `api/atlas.js`, `api/projection.js`, `api/runner.js`, `api/science.js`
- `api/observatory-questions.js`, `api/runtime-drive.js`, `api/runtime-github.js`,
  `api/runtime-orphans.js`, `api/live/activity.mjs`
- `api/private/index.mjs`, `cockpit.mjs`, `activity.mjs`, `research.mjs`,
  `entity.mjs`, `learner.mjs`, `sync.mjs`, `semantic.mjs`, `control.mjs`, and
  `drive-bootstrap.mjs`

Browser access belongs to the canonical opaque-session backend. The legacy
`api/auth/session.mjs` route does not create that new session and cannot unlock
these legacy data routes. Plain `/api/state` and related legacy aliases remain
retired rather than being silently switched to a different source of truth.

## Verification and limits

Synthetic tests exercise real RSA-signed fixture claims, invalid signatures,
wrong audiences/projects/environments, expired tokens, absent tokens despite a
server environment token, conflicting headers, warm caches, MCP key precedence,
and successful machine discovery/Writer dispatch without a browser session.
All upstream interactions in these tests are mocked; no external reads or writes
are needed for them.

Static publication remains closed. Existing hosted files, old deployments,
Actions artifacts, and Git history are not withdrawn by this source patch.
Remediation and deployment require separate authorization.
