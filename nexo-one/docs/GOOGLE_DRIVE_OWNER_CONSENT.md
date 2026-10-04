# Owner Google Drive consent

The production pilot uses Vercel Connect `google/alizarin-saddle` with the
fixed `user/owner` subject. Its operational context requests exactly
`https://www.googleapis.com/auth/drive.readonly`.

The owner flow is isolated at `/google-drive-connect.html`. It logs into the
existing NEXO private session, discloses renewable read access to the account's
Drive files, and requires a checkbox and explicit preparation action. It calls
the supported `@vercel/connect` `startAuthorization` from the project's OIDC
context. It never creates a connector, changes project links, requests another
subject, reads Connect administration, or persists provider credentials.

## Security boundary

- The API refuses another connector, subject, environment, or hostname
- Start and verification require the signed owner session, same-origin POST,
  and a short-lived signed CSRF token bound to that exact session
- The callback is fixed to the production origin. An independent HttpOnly,
  Secure, Lax cookie carries a signed ten-minute nonce and session fingerprint
- The existing owner-session cookie retains SameSite=Strict
- Connect owns provider OAuth state, PKCE, callback exchange, and refresh storage
- The application callback validates its own nonce and transfers a short-lived
  signed return proof into a Strict cookie. It only redirects to the consent page
- Verification requires the original owner session and return proof, asks only
  for a Drive readonly token, then verifies canonical Tower metadata, content,
  MD5, and revision using the existing reader
- Provider tokens, OIDC, SDK request/verifier, and raw errors are withheld from
  the browser and application logs
- Verification has a shared twenty-second deadline across token exchange and
  canonical reads, below the thirty-second function limit

## Uncertain initiation and interrupted flows

The SDK does not expose request cancellation. Its twelve-second outer deadline
limits the application wait; it cannot establish that the remote request stopped.
A timeout, network failure, or unexpected response produces
`GOOGLE_CONSENT_START_UNCERTAIN`, retains a signed pending marker, and blocks
another start from that session until the ten-minute preparation expires. There
is no automatic retry. The owner reloads the page after expiry before manually
starting again.

The page prevents repeated clicks within one tab. Simultaneous requests from
separate tabs or server instances can still create two authorization preparations;
the most recently installed flow cookie determines the accepted callback. An
older callback is rejected rather than associated with the newer flow. This
flow makes no durable exactly-once claim and adds no new data store.

A new owner-session nonce after logout/login cannot reuse the previous return
proof. A denied or incomplete Google grant remains unverified. If Google's
consent screen requests additional permissions, stop and review the configuration.

## Release and acceptance

The immutable release explicitly includes the three consent-page assets,
runtime dependency manifest, and lockfile. Install production dependencies with
`npm ci --omit=dev --ignore-scripts` before checking the packaged server import.

Local tests use synthetic sessions, OIDC, consent responses and Tower bytes. They
issue no real grant, read no real Google account and do not publish or deploy.
After publication is approved, acceptance requires a real owner consent and
canonical Drive readback. `DRIVE_VERIFIED` establishes that readback only. The
sum pilot still needs dispatch, expected sum 6 / mean 2, and its own receipt.

Official references:

- https://vercel.com/docs/connect/concepts/authentication
- https://github.com/vercel/vercel/blob/main/packages/connect/src/authorization.ts
- https://github.com/vercel/vercel/blob/main/packages/connect/test/authorization.test.ts
