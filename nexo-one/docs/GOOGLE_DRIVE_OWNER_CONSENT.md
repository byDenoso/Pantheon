# Owner Google Drive consent

The default production profile uses Vercel Connect `google/alizarin-saddle`
with the fixed `user/owner` subject. It requests exactly
`https://www.googleapis.com/auth/drive.readonly` and remains the normal
read-only connection.

A separate owner-selected profile, `sheets_spool_write`, requests the fixed
pair `https://www.googleapis.com/auth/drive.readonly` and
`https://www.googleapis.com/auth/spreadsheets`. The Sheets scope permits
viewing, editing, creating, and deleting all Google Sheets spreadsheets
accessible to the selected account; Google does not restrict that permission to
one file. NEXO uses it to write intents to the operational Sheet spool, whose
fixed ID is `1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E`, and to append or
update records in the configured NEXO sheet when its private record features
are used. The page displays this broader scope and the spool destination before
the owner can start this optional flow and requires a separate explicit
checkbox. It tells the owner to stop if Google requests additional scopes.

The owner flow is isolated at `/google-drive-connect.html`. Both profiles log
into the existing NEXO private session, disclose their exact scopes and intended
use, and require a profile-specific checkbox and explicit preparation action.
They call the supported `@vercel/connect` `startAuthorization` from the
project's OIDC context. Neither profile creates a connector, changes project
links, requests another subject, reads Connect administration, or persists
provider credentials.

## Security boundary

- The API refuses another connector, subject, environment, or hostname
- Start and verification require the signed owner session, same-origin POST,
  and a short-lived signed CSRF token bound to that exact session and selected
  profile
- The callback is fixed to the production origin. An independent HttpOnly,
  Secure, Lax cookie carries a signed ten-minute nonce, session fingerprint, and
  profile; the callback URL must carry the same exact profile
- Profile-free signed cookies created by the earlier release remain valid only
  as Drive-readonly flows and callbacks. They cannot verify or start the Sheets
  profile
- The existing owner-session cookie retains SameSite=Strict
- Connect owns provider OAuth state, PKCE, callback exchange, and refresh storage
- The application callback validates its own nonce and transfers a short-lived
  signed return proof into a Strict cookie. It only redirects to the consent page
- Drive verification requires the original owner session and return proof,
  asks only for a Drive readonly token, then verifies canonical Tower metadata,
  content, MD5, and revision using the existing reader
- Optional Sheets-profile verification requests the two disclosed scopes, uses
  the same Tower reader, and performs GET-only reads of the fixed spool's
  metadata and header. It does not read queued rows, append data, or prove that
  a future write succeeds. A successful result is named
  `SHEETS_SPOOL_READ_VERIFIED`; it is not a write receipt
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
consent screen requests additional permissions, stop and review the
configuration. The default Drive-only flow never selects or silently upgrades
to Sheets write access.

## Release and acceptance

The immutable release explicitly includes the three consent-page assets,
runtime dependency manifest, and lockfile. Install production dependencies with
`npm ci --omit=dev --ignore-scripts` before checking the packaged server import.

Local tests use synthetic sessions, OIDC, consent responses and Tower/spool
metadata. They issue no real grant, read no real Google account and do not
publish or deploy. A real owner must explicitly choose and complete the relevant
Google consent flow before the corresponding private runtime can use that
profile. `DRIVE_VERIFIED` establishes canonical Drive readback only;
`SHEETS_SPOOL_READ_VERIFIED` establishes Tower and spool reads only. Neither is
a write receipt. The sum pilot still needs dispatch, expected sum 6 / mean 2,
and its own receipt.

Official references:

- https://developers.google.com/identity/protocols/oauth2/scopes
- https://vercel.com/docs/connect/concepts/authentication
- https://github.com/vercel/vercel/blob/main/packages/connect/src/authorization.ts
- https://github.com/vercel/vercel/blob/main/packages/connect/test/authorization.test.ts
