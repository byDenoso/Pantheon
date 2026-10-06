# Atlas public/private integration review

Status: local review artifact only. No commit, push, merge, deploy, credentials,
DNS, permissions, production settings or historical-data changes performed.

## Inputs and integration

- Fresh main base: `49784dfc8b298cd5418df39dba48e22cb8b84adb`.
- Backend input patch SHA-256:
  `3359b69c2606a6441231b216f5beacdbb63ee026436f18710b74e5511591cf0e`.
- Frontend input patch SHA-256:
  `92cee12703b938609d677d78885da31765abe9acea85ff70449b0c9649abde33`.
- Frontend declared base: `3e16e65318545cb84451586e5c78eaa75b03b98d`.
- Both patches applied cleanly. Independently added locale tests were preserved
  under separate backend/frontend filenames. No AGENTS.md found in this checkout.
- Existing design/layout retained. Integration fixes cover contracts and races.

## Corrections independently made

- Session GET returns the stored `expiresAt` for an authenticated session;
  restoration never invents another hour of visibility. Client validates it.
- Failed logout cannot automatically reload private data in existing tabs.
  Revocation status is separate from local clearing, and a page-memory sign-out
  barrier survives route remounts and simulated back/forward cache events.
- Delayed private responses cannot publish expired data. A later logout cannot
  be overwritten by an earlier operation's result.
- Manual language selection survives storage errors; Automatic propagates across
  tabs. Locale responses require the agreed source enum and supported locales.
- Build publication guard follows Vite's resolved output directory. Test builds
  retain the disposable `dist` boundary instead of bypassing the guard.
- Old HTML `/mcp/` and `/atlas3d/` entry links enter `#/privado` without forwarding
  old query/hash identifiers. Machine `/api/mcp` is unchanged by these redirects.

The parity pass mounts the preserved App/NexoStore in an authenticated iframe.
Private legacy modules, fonts and graph libraries build separately into 97
manifest-hashed server-only files. The public build contains only the public UI,
auth controller and frame bridge. Private adapters use one in-memory canonical
generation; no legacy data fetch falls back to a public feed. The default source
is the existing verified canonical Drive reader, followed by a pure five-view
compiler. Writer's filtered operational reader remains unchanged.

## Independent verification (Node 24.19.0)

- `cd nexo-one && npm run check`: PASS, 990 tests, no skips; TypeScript, style and
  production build all pass.
- `node scripts/static-publication.mjs --check`: PASS, zero public data files.
- `node scripts/scan-public-bundle.mjs dist`: PASS, eleven shell/build assets,
  no forbidden static projection, source-map or archived payload markers.
- Actual HTTP handler plus actual frontend API client: PASS for public empty
  response, locale preference, login, original expiry, private source, failed
  logout, successful revocation and rejection of the copied revoked cookie.
  The same test serves actual built private HTML/chunks, rejects anonymous asset
  reads, and rejects both HTML/chunks after revocation. Canonical source and Redis
  transports use synthetic fixtures, not live services.
- Legacy targeted privacy/machine suite: 25/25 PASS. Exact suites:
  legacy-machine-boundary, private-publication-boundary, scientific-mcp-http,
  mcp-consolidated-surface, olympus-detection.
- Legacy Tower typecheck: PASS. Standalone legacy build: BLOCKED deliberately
  by the strengthened publication guard: old JS/HTML still contains private
  taxonomy/source-authority labels. Removing JSON alone was insufficient.
  The canonical nexo-one public/private build is green; the separate legacy
  public entry must be migrated before that legacy project can be published.
- Production chunks: main ~209.6 kB (~66.9 kB gzip), optional visual ~4.4 kB,
  private frame controller ~8.4 kB plus bridge ~3.2 kB. Legacy UI chunks are outside public dist.
- Browser harness included at `test/atlas-integration.browser.mjs`.
  Independent Chromium launch could not run: the cloud OS denied its Unix socket
  with EPERM, including the permitted retry. A later attempt in the existing
  cloud browser also refused loopback with ERR_BLOCKED_BY_CLIENT. No alternate
  proxy, bind or firewall route was attempted. No browser screenshots, native
  bfcache, browser cookie handling, accessibility or visual acceptance are claimed.
  To run on a capable runner: build, install the matching Playwright Chromium,
  then `node test/atlas-integration.browser.mjs`; CHROMIUM_PATH is optional.
  The harness uses synthetic transports and adapts localhost Origin to a test
  HTTPS origin; it does not verify production TLS/CDN or real credentials.

## Release decisions and work still required

1. Publish approval remains pending. This artifact does not authorize deployment.
2. Existing PR CI still invokes archived UI browser suites/historical screenshots.
   They need an explicit migration to the new interface's acceptance coverage;
   no failing requirement has silently been removed or waived here. The standalone
   legacy public bundle also remains blocked by its private-label scan.
3. The original interactive UI is mounted through private adapters. Read-only
   queries use preserved source fields, including evidence and activity. Programs,
   observations/H0 and prior diffs are conditional on explicit source records;
   absent records remain unavailable rather than invented.
4. Browser-capable validation is outstanding, especially actual multi-tab races,
   native bfcache restore, tab closure while login is pending, mobile and keyboard
   use. Controller event mocks are not native browser proof. An abandoned login
   may still create a session that expires server-side; no compensating logout
   is sent that could revoke a newer shared session.
5. Configure approved shared session storage and PIN hash through secure setup.
   Verify the existing canonical Google read authorization and production source
   completeness; no new scientific mirror or credentials were created here.
6. Migrate anonymous inbox-drop URL callers and static projection-sync consumers.
   Existing verified MCP/Writer identities retain bounded machine compatibility;
   see `ATLAS_PRIVATE_BACKEND.md` and the legacy API compatibility document.
7. Existing deployed feeds, public source/history, Actions artifacts and caches
   remain unchanged. A reviewed remediation and real post-deploy readback are
   required. Local build isolation cannot retroactively make those copies private.

Public content remains `items:[]` and `links:[]`; no scientific/private fields
have been approved for publication by this integration.

## Integration refinements after the frontend addendum

- PRIVATE classification enforced for world/topology/publication manifest; explicit
  PUBLIC system classifications are rejected. Canonical compiler output passes
  the same frontend validator, without public relabeling.
- Refresh checks authoritative session expiry before and after data fetch, rejects
  older source generations before updating parent state, aborts on teardown and
  releases timed-out requests for an actual retry.
- Only explicit validated source-link clicks open external tabs; generic
  window.open stays closed across synchronous code, microtasks and timers.
- Browser smoke harness updated for the retained iframe and canonical synthetic
  compiler. It remains unexecuted independently here.
