# Atlas public/private backend contract (draft)

This patch is not a production privacy migration. Do not merge/deploy until the
release blockers below are resolved. No credentials or infrastructure are
created by this change. Frontend visual work is intentionally separate.

## Frontend API contract

Use the same HTTPS origin for the browser and backend. Do not place credentials,
private payloads or private project identifiers in public bundles, localStorage,
URLs, analytics, service workers or static JSON. Fetch with `cache: 'no-store'`
and `credentials: 'same-origin'`. Discard private state on logout or HTTP 401/503.

- `GET /api/atlas-public`: 200 `{contract:"ATLAS_PUBLIC_V1",items:[],links:[]}`.
  There is no approved public content yet. Authentication does not change this
  response. Adding content requires an explicit reviewed field/content allowlist;
  never subtract a blacklist from the full private projection.
- `GET /api/atlas-session`: 200 `{configured:boolean,authenticated:boolean}`;
  when authenticated, also returns authoritative `expiresAt:ISO8601` from the
  stored session. Restoring a page must never invent a new one-hour expiry.
- `POST /api/atlas-session`: JSON `{pin:string}`; exact configured Origin required.
  200 `{authenticated:true,expiresAt:ISO8601}` plus opaque HttpOnly cookie.
  401 invalid PIN, 403 wrong/missing Origin, 415 non-JSON, 429 rate limited,
  503 absent configuration/storage outage. PIN length is 8–128 characters;
  a long passphrase is preferable. Never put the PIN in chat or source code.
- `DELETE /api/atlas-session`: exact Origin required. Revokes the session in
  shared storage, then clears cookie. A copied logged-out token no longer works.
  A storage failure returns 503; the UI must not claim server logout succeeded.
- `GET /api/atlas-private`: authenticated only; 200
  `{contract:"ATLAS_PRIVATE_V1",data:object}`. The object must satisfy the complete five-section
  private runtime in `ATLAS_PRIVATE_VIEW_CONTRACT.md`; missing sections, public
  classifications or mismatched generations return 503. A missing/unavailable source returns 503;
  there is no public Pages, raw GitHub, bundled or cached fallback.

All API responses carry `Cache-Control: private, no-store` and
`Vary: Authorization, Origin, Cookie`. There is no credentialed cross-origin
browser access. Atlas sessions expire after one hour, rotate on login, and are
invalidated when the configured PIN hash changes. Logout is server-side.

Browser access to legacy research/system/world/MCP and inbox-drop routes
requires the Atlas session before any adapter/cache read. The independently
verified machine exceptions below retain their bounded access. Their historical public-source readers
are compatibility code, not the new private source; migrate consumers to
`atlas-private`. Existing personal routes additionally retain their existing
private-session requirements. Legacy `/api/session` is not an Atlas credential.
OIDC machine routes `atlas-ssot`, `projections`, `inbox-list`, `inbox-ack` retain
independent existing authorization; `projections` no longer falls back to an
anonymous response. The legacy session endpoint retains its existing checks. Google consent
initiation and readback require Atlas authentication. The callback alone is
exempt from the browser cookie gate: its existing signed, expiring flow nonce
and fixed owner/profile checks still apply. It grants no session or data access;
readback again requires both active Atlas and legacy owner sessions. Existing
MCP bearer keys and signed Writer OIDC retain their original MCP grants and equivalent spool ingress
without needing a browser cookie. The inbox-drop gateway still applies its
existing envelope restrictions. Legacy tasks that only open anonymous inbox-drop
URLs must migrate to authenticated MCP or send their already-authorized machine
credential; they cannot use the browser PIN or an anonymous URL as a substitute. A legacy owner cookie alone is not a machine
identity. Anonymous MCP discovery and all anonymous data reads stay denied.

## Authenticated legacy UI assets (mount still outstanding)

- `GET /api/atlas-private-ui` serves the private build's index.html after Atlas
  authentication. `GET /api/atlas-private-assets/<path>` serves only a manifest-
  listed, SHA-256 verified resource. Neither is a public static path.
- The private build must live at `server/private-ui/`, outside `dist` and Git.
  Its manifest is `{contract:"ATLAS_PRIVATE_ASSETS_V1",files:{"index.html":"sha256hex","assets/example.js":"sha256hex"}}`.
- Unknown/traversing/integrity-invalid files never return content; unauthenticated
  access returns 401 before file lookup. Missing/unusable build returns 503
  `PRIVATE_UI_UNAVAILABLE`. Responses are no-store, same-origin frameable and
  protected by a self-only script/connect policy.
- Root/nexo-one Vercel and packaged-release routes include assets only in the
  server function. The actual deployment bundle and frame headers must be tested
  on staging; local filesystem tests do not prove deployment packaging.
- These endpoints do not themselves restore the old interactive features. The
  authenticated legacy entry, private data/session/cache adapters, and full
  acceptance mapping in `ATLAS_PRIVATE_VIEW_CONTRACT.md` are mandatory work.

## Language hint, without location storage

`GET /api/atlas-locale?lang=pt-BR` (or `lang=en`) returns only:
`{contract:"ATLAS_LOCALE_V1",locale:"pt-BR",source:"preference",supported:["pt-BR","en"]}`.
The source enum is `preference | browser | country | default`.

Precedence: supported explicit manual preference, then supported
`Accept-Language` with quality weights, then approximate country from the existing
Vercel `x-vercel-ip-country` header, then `pt-BR`. Country is used only when the
server's platform environment is `VERCEL=1`; caller-supplied trust/proxy headers
cannot enable it. Outside that runtime it is ignored. Country is a language hint,
never authentication. No external lookup, vendor, IP logging, country persistence,
or precise-location access is added. The response does not include country/IP.

The frontend persists only the explicit language choice and sends `lang`; choosing
automatic clears it. Unsupported/duplicate overrides are ignored. The backend
stores nothing and emits no locale cookie. If unavailable, the frontend retains
manual/browser/default behavior. Response and CDN caches are disabled; `Vary`
includes `Accept-Language`, `X-Vercel-IP-Country`, `Cookie`, `Origin`, and
`Authorization`. POST and other write methods return 405.

Platform header contract: https://vercel.com/docs/headers/request-headers .

## Server-only configuration, through an approved secure setup

- `NEXO_ATLAS_ORIGIN`: exact HTTPS origin, without trailing slash/path.
- `NEXO_ATLAS_PIN_HASH`: scrypt hash using the repository password utility format.
- `NEXO_ATLAS_REDIS_URL`, `NEXO_ATLAS_REDIS_TOKEN`: existing authorized
  Redis-compatible HTTPS REST store supporting atomic EVAL, GET, SET EX NX, DEL.
- Default private source: the existing Google read-only authorization and
  verified canonical Drive reader. One raw source revision compiles the system,
  world, topology, private publication and galaxy views; no new mirror is stored.
- Optional backward-compatible proxy override: `NEXO_ATLAS_PRIVATE_SOURCE_URL`
  and `NEXO_ATLAS_PRIVATE_SOURCE_TOKEN`, both required together, for an already
  access-controlled HTTPS source returning the `ATLAS_PRIVATE_V1` envelope.

Never use `VITE_` names for these values. An optional proxy source must enforce its own
bearer access; giving a public URL a secret header does not make it private.
No new store, account, credential or OAuth grant is provisioned by this patch.

The limiter reserves every login attempt atomically in shared storage, at most
five attempts per 15 minutes for the entire single-user deployment. It does not
trust spoofable forwarding headers. This deliberately permits login denial of
service under attack rather than weak PIN brute force. Platform rate limits and
a strong passphrase remain recommended. No in-memory/distributed equivalence is
claimed. Storage failure and invalid store responses fail closed.

## Static/publication boundary and release blockers

Historical publication names do not establish approval. Static Tower exports,
science/research projections, world feeds, MCP topology and galaxy history must
not be published. Build output is restricted to the reviewed application shell;
development fixtures are replaced during production bundling. The private-name
bundle guard remains mandatory. The integrated public entry excludes archived
legacy modules and its separate private-UI chunk contains no private payload.
Combined production build and bundle scans pass locally. Backend authentication
cannot hide downloadable JavaScript; scan success does not make historical
repository contents or existing deployments private.

This patch does not erase already published files, previous deploy artifacts,
public repository history, upstream public mirrors, CDN/browser caches or links.
Those require a separately approved remediation plan and actual production
verification. Nineteen legacy browser/plain-data entrypoints return 410; clients must move
to the canonical private API. Five legacy machine entrypoints remain scoped:
`/api/mcp` accepts its existing dedicated/runner/scheduled-task bearer hash;
`/api/runtime`, `/api/runtime-v2`, `/api/runtime-semantic`, and
`/api/universal-projection` accept only signed, unexpired Vercel OIDC for the
already-trusted exact production Atlas project/team. Neither server environment
credentials nor a warmed cache authorizes a caller. Runner keys do not grant
access to OIDC routes. All those routes remain no-store.

Compatibility still requiring release coordination:
- Anonymous inbox-drop URL-only tasks must use authenticated MCP or provide an
  existing approved machine credential. Writer inbox-list/ack OIDC is unchanged.
- Legacy browser private routes retired by this patch need frontend migration.
- Consent initiation/readback needs both owner and Atlas sessions; its callback
  continues to work with the existing signed flow proof and no Strict cookie.
- Pages no longer publishes projection fingerprints/history. Legacy sync clients
  that wait for those artifacts must switch to the protected source.
- Existing integrations still require live staging verification; synthetic
  signature/transport tests do not establish deployment connectivity. Do not treat a failed/paused publisher as removal
of an old deployed artifact.

Before release: review frontend bundle split, obtain approved storage/source
configuration, verify upstream authentication independently, replace/remove old
public artifacts, test both root and nexo-one Vercel roots, validate fresh and
previously cached browser sessions, and rerun CI. No merge/deploy is authorized
by this draft.

## Canonical compiler and evidence limits

`private-tower-input.mjs` validates the existing canonical envelope identity,
revision/fingerprint, file count and CONTROL ownership before mapping JSON files.
Inputs are `entities/{work,test,hypothesis,campaign,lesson,interdomain,artifact}/`,
`roadmaps/`, `events/`, `manifests/capabilities.json`, `snapshot/latest.json`,
`indexes/active-work.json`, `evolution/*.json`, and optional existing cosmology
and integrity snapshots. Every original entity keeps its source path. Missing
collections/values carry coverage or unavailable state; no live health is inferred.

The raw verified reader checks Drive metadata before and after the body read.
A concurrent revision race retries once within the same deadline. The operational
Writer reader still applies its existing bounded projection; the private browser
compiler reads the canonical body separately only after the Atlas session gate.
The compiler writes no independent truth or public export. Tests use synthetic
canonical envelopes, never credentials or a copy of production scientific data.

The public build and the private build are separate. `npm run build` emits both;
only `dist` is public, while `server/private-ui` is included inside the authenticated
function package. The iframe is an integration/lifecycle boundary, not an XSS or
origin security boundary: same-origin scripts remain trusted application code.
