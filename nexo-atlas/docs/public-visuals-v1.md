# Optional approved public figures — NEXO 0.4.4

The Tower remains canonical. This frontend change does not read or change Tower, scientific contracts, schedules or publication authority. Without a Writer export, the public endpoint preserves its existing approved catalog exactly. The gallery reports that no approved figures are available.

The optional deployment input is `worker/public-visuals.approved.json`, contract `ATLAS_PUBLIC_VISUALS_V1`. It must be produced by the existing authorized publication process, independently reviewed where scientific, and sanitized before delivery to this project. Packaging verifies receipts and content binding; it does not create approvals. The structural verification of a receipt is not proof that a scientific review took place. The existing trusted Writer publication channel must provide that proof and the export.

## Exact shape and binding

The export contains only `contract`, `sourceRevision`, `generatedAt`, `visuals`, `approvals`, and `snapshotDigest`. Revision and digests are `sha256:` plus 64 lowercase hex digits. Digests use recursively sorted object keys, preserve array order, and hash UTF-8 JSON; `visualDigest` in `server/atlas/public-visual-projection.mjs` is the reference implementation. `snapshotDigest` covers the other five export fields.

Each visual contains `id`, `subject`, bilingual `title` and `caption`, bilingual `limitations`, `publishedAt`, `evidenceKind`, `sources`, and optional `image` / `plot`. Bilingual fields have exactly `pt-BR` and `en`. At least an image or plot is required. `evidenceKind` is `SCIENTIFIC_RESULT` or `SOFTWARE_VALIDATION`, displayed explicitly. `src/atlas/publicVisuals.ts` defines the positive field list and bounds. Unknown fields, private families, credentials, signed URLs, unsafe paths, malformed dates and nonfinite points fail validation.

- A legacy-test subject binds exactly `kind: legacy-test`, `question`, `answers`, `method`, and `result` to the four bilingual fields of the served public record, after the approved editorial presentation is applied.
- A campaign-test subject binds exactly `kind: campaign-test`, `campaignId`, `testId`, `updatedAt`, and the complete public `result` to a canonical test in stage `REVIEWED`. Matching an ID alone is insufficient. A changed reviewed revision requires a newly bound export.
- Every visual needs one approval with `visualId`, `visualDigest`, `subjectDigest`, and `publication: {policy: NEXO_PUBLIC_VISUALS_V1, status: APPROVED, receiptId, approvedAt}`. Scientific results additionally need `review: {policy: NEXO_SCIENTIFIC_INDEPENDENCE_V1, eligible: true, receiptId, reviewedAt}`. Review precedes publication approval; neither approval nor publication may be later than the export date.

The public endpoint exposes the approved visual data only. Approval receipts and internal export metadata remain in the server package, outside the public projection. Do not copy BOARD, PEER, Olympus, internal paths, identities, access tokens or raw private records into visual captions, labels, filenames or source links.

## Raster assets and plots

Raster images use local `/assets/research-<safe-name>.png`, `.jpg` or `.webp`, with exact SHA-256, width, height and bilingual alt text. Source bytes belong in `public-extra/assets/`. The packager checks signature, byte hash, size and references. Unapproved or unreferenced `research-*` files fail packaging. User-supplied HTML/SVG is not accepted as a public image.

Plots have bilingual X/Y labels, units, style `line` or `scatter`, and at most eight series with at most 2,000 finite points each. Points contain `x`, `y` and optional jointly present `low`, `high` enclosing `y`. Plots display only supplied numbers. CSV preserves all original series and numbers, independently of the current zoom or visible series, and protects text cells against spreadsheet formulas. SVG export captures the displayed view with resolved colors and typography. The accessible table is paginated by 50 rows.

## Packaging and publication

Run the existing `scripts/build-site.mjs`. It invokes `scripts/package-public-visuals.mjs` and combines the optional export with the current approved public projection. Orphaned subjects or drift abort the build. The generated visual module is server-only; a missing approved export produces a null module and does not change the existing public response.

Save and deploy the exact packaged source through the existing Sites project. The browser checks the deployed public endpoint every 60 seconds while visible, backs off after failure, supports manual refresh, and keeps the last verified view on failure. A valid empty projection removes the previous records. A checked-at timestamp is separate from a recorded publication date. Background polling does not publish or approve changes in Tower.

An optional approved campaign snapshot continues to use the already established canonical-campaign contract and packaging path. No lifecycle or next step is inferred from the legacy editorial grouping. Negative and inconclusive results remain visible when publicly approved; closure still requires the canonical closure record.

## Release and rollback

Product version is `0.4.4`. Sites deployment counters are infrastructure identifiers and are not displayed as the product version. The public footer contains no version badge, version history or changelog. Preserve the existing contact and method links.

The pre-change rollback is product `0.4`, source `226d49a4b0dc73d85f3e1d012c01123872f697af`, saved Sites version `appgprj_6ac45767d678819182c86c56d11e0d37~appgver_398ecb3237888191a37b033653deebc1` (counter 42). Redeploy that existing saved version in the same project, then read the public page, its served asset hashes and the public API. Do not change DNS, runtime access or environment variables for this rollback. A frontend rollback does not undo a scientific publication in the Tower.
