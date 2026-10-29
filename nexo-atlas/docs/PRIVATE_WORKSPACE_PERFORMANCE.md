# Private workspace payload optimization

## Scope and mechanism

The public Site, current visual design, cosmic animation/slow replay, source-of-truth rules and existing authentication remain unchanged. This change targets the private startup payload measured against v27 (`d4e1a86`).

The current frame requests the opt-in `workspace-v1` profile from the existing owner/PIN-guarded private endpoint. The legacy full profile remains available for compatibility when no profile is requested. The new profile:

- Builds the existing exact Lab view model on the server once, instead of serializing both canonical records and the much larger evidence-wrapper projection and rebuilding the same values in the browser.
- Does not compile or transfer the retired world, galaxy or topology screens. These views are explicitly absent, never fabricated as empty source collections.
- Keeps the exact canonical graph, domain catalog, operation values and all board posts. The retired activity-history view is explicitly outside this profile.
- Loads the complete canonical record for a test only when its detail page opens. All existing test-page values and raw source details remain available.
- Loads research/operation presentation modules only when those views are selected.

There are no Tower edits, new credentials/grants, server-side private-data caches, database migrations, broad permission changes, new deployment services or public data changes.

## Authorization and generation isolation

`POST /api/atlas-private/test` uses the same pinned owner, PIN session, same-origin and no-store boundary. Its accepted body contains only a bounded test ID and exact expected Tower revision; caller-selected paths, URLs, accounts and files are rejected. The server reads the fixed canonical Tower, checks the expected revision, and rechecks owner/session after reading and encoding. A changed source returns 409 rather than mixing generations.

The browser keeps at most eight complete test records in the guarded frame's memory. This cache is tied to the exact runtime object and generation; every replacement or clear aborts pending reads and clears cached records, including same-revision refreshes. Abort/late-response checks prevent records from returning after logout, navigation teardown or generation replacement. Authentication failures clear the cache and request the existing logout flow. There is no localStorage, sessionStorage, service worker, shared global server cache or disk snapshot for this data.

## Measured comparison

Five alternating full/workspace runs on the same authorized frozen source. Times are local Node medians, not hosted login or network latency.

| Measurement | v27 full profile | Workspace profile |
| --- | ---: | ---: |
| Expanded JSON | 42,393,484 bytes | 9,291,150 bytes |
| Gzip transfer | 4,319,334 bytes | 806,853 bytes |
| Compile | 722 ms | 191 ms |
| Stream encode/compress | 1,002 ms | 157 ms |
| JSON parse | 132 ms | 23 ms |
| Browser Lab construction / hydration | 24.6 ms | 0.4 ms |
| Structured clone to frame (local analogue) | 357 ms | 49 ms |

Deterministic size reduction: **78.1% expanded JSON; 81.3% gzip**. Local CPU times vary with machine load. An example complete-record request transferred 2,533 JSON bytes / 1,205 gzip bytes; record sizes vary.

Current built JS was measured separately, rather than repeating the historical v23 claim. The frame entry changes from 235,954 to 238,423 raw bytes (75,763 to 76,570 gzip bytes) because it adds validation and the scoped detail reader. Entry plus current Teia static dependencies changes from 875,762 to 851,719 raw bytes (247,312 to 242,860 gzip bytes). The dominant improvement is the data path, not the small JS change. These JS figures exclude CSS/fonts and later-selected views.

Frozen source: snapshot `2026-10-06T20:06:37.473290Z`, 13,036,001 bytes, canonical revision `sha256:c8b7f3aabdc1ca4bfb7a0bc90c5adf12f586a447cc5c6ecdc9e02c9d82e380d0`, raw SHA-256 `7ebd8d652098d7b0f5b42d19bd77b78ea11fce036ddcdece52cfca790e7a3343`. It is a frozen validation source, not a claim about the latest live Tower.

## Verification

- 280 unit/security tests pass, covering existing and new routes, owner/PIN, CSRF, revocation during reads, malformed requests, current-versus-historical record isolation, stale source, bounded cache, cross-instance isolation, refresh/logout and late response rejection.
- TypeScript and the production Site build pass. The public artifact SHA-256 remains `a77870a4d47413a9a276ac786f419c92fd0d690054235372c417927da66225b4`.
- Frozen-source comparison proves equality for all 448 current test view models, canonical graph nodes/edges, domain catalog/outlines/counts, operation values, test relationships, Tower graph and all 300 board posts. Source input is unchanged.
- PT/EN component SSR is exactly equal for domains, research, operations, mural and a fully loaded test detail. The initial deferred-detail state is explicitly loading.
- Local Cloudflare workerd passes: synthetic owner/PIN setup, workspace route, transparent browser-style gzip/JSON decode, exact full output comparison and on-demand canonical record. This is not a hosted session or network-latency measurement.
- No hosted authenticated browser automation was performed. Visual browser QA remains outside this result; current UI/animation source was not changed.

Reproduce with:

- `node --expose-gc scripts/benchmark-workspace-payload.mjs <authorized-source-path> <report-path>`
- `node scripts/measure-private-js.mjs <v27-checkout> <optimized-checkout>`
- `node test/workspace-profile.render.mjs`
- `node test/workerd-workspace.mjs <authorized-source-path>`

Keep source and real-source replay reports outside the Site checkout/build inputs. Publish through the existing Sites workflow only. No hosting configuration changes are required.
