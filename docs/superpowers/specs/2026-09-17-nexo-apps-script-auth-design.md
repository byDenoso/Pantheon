# NEXO ONE — Google Apps Script Auth Broker Design

## Goal

Replace the Vercel-dependent private authentication runtime with a Google Apps Script Web App while keeping GitHub Pages as the public/static frontend. Preserve the existing numeric PIN UX, rate limiting, short-lived authenticated state, logout, public/private access semantics, and the rule that no PIN, PIN hash, or session secret is committed to the public repository.

## Scope

This change covers only authentication/session transport and the minimal frontend integration needed to consume it. It does not move the NEXO frontend away from GitHub Pages, does not migrate unrelated backend routes, and does not expose private data to the static bundle.

## Architecture

### Frontend

GitHub Pages remains the canonical public frontend at `https://bydenoso.github.io/Pantheon`.

The React session layer stops calling same-origin `/api/session` and instead talks to an isolated Apps Script auth bridge loaded in a hidden iframe. The iframe runs from the deployed Apps Script Web App origin and is the only browser context allowed to submit credentials to the Apps Script server runtime.

The parent page and iframe communicate with `window.postMessage`. Every message is validated against the exact configured Apps Script origin and includes a protocol version plus a request ID so responses cannot be confused across concurrent requests.

### Google Apps Script Web App

The Apps Script project exposes an HTML Web App shell and server-side functions invoked with `google.script.run` from that shell. The shell receives parent messages, forwards commands to server-side Apps Script functions, and posts sanitized responses back to the GitHub Pages parent.

Secrets are stored in Apps Script `PropertiesService.getScriptProperties()`:

- `NEXO_PIN_HASH`
- `NEXO_SESSION_SECRET`
- `NEXO_ALLOWED_ORIGIN`

No plaintext PIN is stored in source or returned to the browser. The server validates the PIN against a salted hash using constant-time comparison logic implemented with Apps Script-supported cryptographic primitives.

## Session model

The existing HttpOnly cookie model cannot be preserved cross-origin on GitHub Pages, so the replacement uses opaque server-issued session tokens.

- Session lifetime: 8 hours.
- Session token: cryptographically random opaque value generated server-side.
- Server record: stored in `CacheService` with an 8-hour TTL and associated metadata sufficient to validate expiry and revoke on logout.
- Browser storage: token lives only in `sessionStorage`, never `localStorage`, never a URL, and never the DOM.
- The token is sent only inside validated `postMessage` requests from the parent to the Apps Script iframe.
- On page reload within the same tab, the token is revalidated through the iframe before private state is restored.
- Closing the tab clears `sessionStorage`; server-side expiry remains authoritative.

## Protocol

Protocol version: `1`.

Parent → iframe messages:

```ts
interface AuthBridgeRequest {
  source: 'NEXO_PARENT';
  version: 1;
  requestId: string;
  type: 'SESSION_GET' | 'SESSION_LOGIN' | 'SESSION_LOGOUT';
  payload?: {
    pin?: string;
    token?: string;
  };
}
```

Iframe → parent messages:

```ts
interface AuthBridgeResponse {
  source: 'NEXO_AUTH_BRIDGE';
  version: 1;
  requestId: string;
  ok: boolean;
  status: number;
  state?: {
    configured: boolean;
    authenticated: boolean;
    access: 'PUBLIC' | 'PRIVATE';
    mode: 'PUBLIC_READ_ONLY' | 'PRIVATE';
  };
  token?: string;
  error?: 'AUTH_REQUIRED' | 'AUTH_NOT_CONFIGURED' | 'RATE_LIMITED' | 'ORIGIN_NOT_ALLOWED' | 'SESSION_EXPIRED' | 'INVALID_REQUEST';
}
```

The parent rejects any response whose `event.origin` does not equal the configured Apps Script origin, whose `event.source` is not the expected iframe window, whose protocol version differs, or whose request ID is unknown.

The iframe rejects parent messages unless `event.origin === NEXO_ALLOWED_ORIGIN` and `event.source === window.parent`.

## PIN verification

The PIN remains numeric and 4–12 digits, matching the current UI constraint.

The Apps Script setup utility accepts a plaintext PIN only during an explicit administrator setup function and writes only the derived salted hash to Script Properties. Runtime login reads the derived hash and compares a newly derived candidate using a constant-time byte comparison.

A fresh deployment must not be considered configured until all required Script Properties exist.

## Rate limiting

Failed login attempts are limited to 5 per 15 minutes.

Because Apps Script Web Apps do not reliably expose the client IP in a way suitable for this design, the limiter keys failures by a generated browser installation identifier stored in `sessionStorage` plus a server-side global safety bucket. The identifier is not personally identifying and is never used outside authentication throttling.

Rules:

- per-browser bucket: maximum 5 failures / 15 minutes;
- global bucket: maximum 50 failures / 15 minutes;
- successful login clears the per-browser failure bucket;
- rate-limit state lives in `CacheService`;
- the response exposes only `RATE_LIMITED`, never internal counters.

## Frontend behavior

`useSession.ts` remains the public API for the React app, but delegates to a new auth bridge client rather than `fetch('/api/session')`.

Behavior preserved:

- initial state is public/read-only;
- runtime availability is tracked;
- successful login emits the existing session-change event;
- failed PIN shows `PIN inválido.`;
- rate limiting shows `Muitas tentativas. Aguarde 15 minutos.`;
- logout invalidates the remote token and clears the local `sessionStorage` entry;
- PIN state is cleared immediately after submit and is never persisted.

## Private data boundary

Authentication alone does not make static GitHub Pages private. Any private payload must be fetched only after server-side token validation.

Therefore the Apps Script bridge provides only authenticated RPC access to private data. The static bundle may contain UI code and public data, but no private dataset, private API key, secret, or privileged precomputed payload.

Future private RPCs must reuse the same token validation primitive and must not trust a client-side `authenticated` boolean by itself.

## Configuration

The frontend receives one non-secret build-time value:

- `VITE_NEXO_AUTH_BRIDGE_URL`: deployed Apps Script Web App URL.

The Apps Script deployment stores:

- `NEXO_PIN_HASH`
- `NEXO_SESSION_SECRET`
- `NEXO_ALLOWED_ORIGIN=https://bydenoso.github.io`

If `VITE_NEXO_AUTH_BRIDGE_URL` is absent, the frontend remains public/read-only and reports the private runtime as unavailable.

## Error handling

- Apps Script unavailable / iframe load failure → `runtimeAvailable=false`, public mode retained.
- malformed bridge response → ignored and request times out safely.
- invalid or expired token → server returns `SESSION_EXPIRED`, client clears token and returns to public mode.
- invalid parent origin → bridge returns no privileged response.
- missing Script Properties → state returns `configured:false`.

No failure path automatically grants private access.

## Testing

### Unit tests

Add tests for:

- bridge origin/source/requestId/version validation;
- token persistence only in `sessionStorage`;
- PIN never written to storage;
- session restore requires server validation;
- logout clears token even if remote invalidation fails;
- rate-limit state mapping;
- missing bridge URL keeps public mode.

### Browser tests

Extend Chromium verification to prove:

- GitHub Pages public load remains functional;
- PIN modal submits through the bridge;
- mocked valid bridge response flips the UI to PRIVATE;
- mocked invalid origin response is ignored;
- refresh restores only after token validation;
- logout returns to PUBLIC.

### Apps Script tests

Keep server logic in pure functions where possible so hash verification, token issuance/validation, TTL handling, and limiter semantics can be tested outside the Apps Script UI shell with deterministic inputs.

## Deployment

1. Create the Apps Script project files in the repository under `nexo-one/apps-script-auth/` so source is versioned.
2. Administrator creates/deploys the Apps Script Web App and configures Script Properties in Google, not in GitHub.
3. Set the public frontend bridge URL through the GitHub Pages build variable/environment mechanism.
4. Deploy Pages.
5. Validate public mode, login, refresh, logout, expiry, invalid-origin rejection, and rate limiting end to end.

## Security invariants

- No plaintext PIN in git, GitHub Actions logs, query strings, HTML, localStorage, or generated bundle.
- No PIN hash or session secret in the public repository.
- Client-side authenticated state is never sufficient authorization for private data.
- All privileged RPCs validate the opaque token server-side.
- Every cross-origin browser message validates exact origin and source window.
- Session lifetime is capped at 8 hours.
- Rate limiting is enforced server-side.
- Logout revokes the token server-side and clears it client-side.

## Non-goals

- Reproducing HttpOnly cookies across origins.
- Using Apps Script as a full replacement for all NEXO backend services.
- Moving the public site off GitHub Pages.
- Storing credentials in repository secrets that are currently unavailable through the connected GitHub tooling.
