# NEXO Atlas on Sites

This is the existing public NEXO Site with a Cloudflare Worker backend. The public page and its reviewed, four-field test summaries remain anonymous. All private UI assets and operational records are behind server-side authorization.

## Reviewed public tests

The public endpoint composes only reviewed build artifacts, including `worker/public-tests.json`. The historical source artifact contains 215 records; the current approved cosmology filter presents 169 analyses across 19 question groups, with 72 visuals grouped into 37 figures. Protected research and its linked records were excluded before publication. Each displayed analysis retains its four fields: question, what it answers, method, and result. Internal identifiers, source links, and private provenance are not published. These are publication-record counts, not counts of independent findings. Questions identify the actual dataset, prior, redshift partition, model or sample threshold when these distinguish related tests. Verified same-design repeats are labeled as repetitions without deleting records or changing results. The endpoint never reads Drive or derives new summaries from private records. Updates require another reviewed artifact and deployment.

The reviewed public JSON is memoized per Worker instance, with invalidation at publication-date boundaries. Its HTTP response remains `private, no-store`; neither private records nor visitor connector state enter this cache. See [the system review](docs/SYSTEM_REVIEW_2026-10-11.md) for the implementation, interface review, and validation limits.

## Private access

1. Sites supplies verified ChatGPT identity headers. The server-owned `NEXO_ATLAS_OWNER_EMAIL` allowlist permits the known owner’s initial setup only.
2. The owner enters and confirms a new PIN in the Site. That first successful submission atomically pins the Site-scoped user ID and stores only a salted scrypt hash in D1. Another signed-in account cannot claim or use the workspace.
3. Every private read requires the pinned ChatGPT identity and a valid, revocable, hashed D1 session. The PIN has one shared global login-attempt budget. Sessions last one hour, rotate on login, and revoke on logout. Database failure denies access.
4. Google Drive reads use the visitor’s request-scoped Sites connector and official read-only consent. The grant covers the connection; server code allows only the existing Tower file and fixed read actions. No provider credential fallback exists.

The user must complete real sign-in, Drive consent, and PIN setup in the hosted page. Tests do not perform those real-user steps or establish that hosted consent has succeeded.

## Data integrity and isolation

The Drive adapter downloads the complete file, checks its expected file ID and size, and verifies the revision did not change across the read. It records the body SHA-256 and preserves the canonical Tower fingerprint. It does not claim the Drive connector exposes the original provider MD5. It never loads a public projection, edits Tower, or persists a private snapshot.

The compatibility full-runtime compiler preserves every field and view. The current UI requests a smaller, explicit workspace profile with exact current view-model values and complete test records on demand; see `docs/PRIVATE_WORKSPACE_PERFORMANCE.md`. Its duplicate in-memory clones were removed and its canonical fingerprint and response encoding now stream in bounded chunks. On the authorized 2026-10-06 validation snapshot, the optimized 40,429,900-byte runtime matched the prior output byte-for-byte and compressed to 4,210,724 bytes. Cloudflare workerd successfully compiled and returned it locally. Source reads are limited to 16 MiB and output to 64 MiB JSON/8 MiB compressed; oversize inputs fail closed. One private compilation runs per isolate at a time.

Only `dist/client` is a static asset surface. The current private workspace is embedded inside the server Worker and served from guarded `/api/atlas-private-ui` and `/api/atlas-private-assets/*` routes. Raw Tower input, runtime snapshots, credentials, and test fixtures are not build inputs or public assets.

## Private startup performance

After owner/PIN session verification, guarded interface loading and the source read run in parallel. The frame still displays no private workspace until its complete runtime passes validation. Expiry, logout, source failure and stale responses tear down this early loading state. The retired cockpit is never mounted; old private bookmarks migrate into the current workspace. The agent mural reads canonical board posts even when unrelated evolution fields are incomplete. Empty reference-only domain surfaces can resolve to an explicitly recorded owner for navigation without merging canonical identities or counts; see `docs/PRIVATE_ATLAS_REPAIR.md`.

Private code is compressed at build time and embedded only once in the Worker. The guarded route sends gzip when accepted and streams a decoded response otherwise. Authentication and `private, no-store` still apply to every asset; no data or authentication cache is introduced. Owner identity, current PIN credential and session are checked again after private runtime encoding.

Runtime encoding batches bounded small JSON subtrees and uses 64 KiB stream handoffs. Canonical fingerprint serialization is unchanged. `node --expose-gc scripts/benchmark-private-runtime.mjs /path/to/authorized/tower.json [/path/to/previous/json-stream.mjs]` compares identical local input and verifies byte-for-byte decoded output across alternating runs. This measures local CPU/encoding time, not Drive latency, hosted login or browser rendering.

## Checks

- `npm run check`: TypeScript, full build, then the test suite. This order creates the generated public modules and guarded assets required by the tests on a fresh checkout.
- `npm run db:generate`: append D1 migrations after schema changes.
- `npm run build`: build the private interface, public shell, Worker, and metadata.
- `npm test`: owner/PIN/session/CSRF/source/bundle isolation tests.
- `node node_modules/typescript/bin/tsc --noEmit`: TypeScript checks.
- `node test/workerd-live-read.mjs /path/to/authorized/tower.json`: optional local-only real-source Worker validation, requiring a baseline metric file created outside the Site checkout.

Publishing uses the same `.openai/hosting.json` project ID. GitHub Pages and custom-domain DNS have not been changed by this integration.
