# Trusted Tower producer, hardened 1.3 semantics

This component is local, disabled by default, and has no HTTP/MCP route. No hosted schema migration, private import, scheduled task, deployment, connector grant, or external model is installed by this code. Tower is authoritative; every table is a private, rebuildable derived cache.

## Exact source contract

`readCanonicalDriveTowerBytes()` extends the existing fixed read-only Drive adapter. It preserves the complete raw body, SHA-256, byte size and pre/post transport revision before any JSON number is parsed. The legacy browse compiler still uses `readCanonicalDriveTower()`; it is not the retrieval importer.

`readSource(raw, {transport})` validates the fixed Tower ID, live schema/authority/CONTROL/write model, file count, canonical Python `files` fingerprint, source observation and raw SHA. It scans the JSON envelope and materializes only one logical file at a time. The Python-compatible parser preserves int/float identity, arbitrary integers within CPython's 4,300-digit limit, negative float zero, insertion order, Unicode codepoint ordering and shortest-roundtrip Python float serialization. Nonfinite values, lone surrogates and unsupported forms fail explicitly. Pure JSON is supported; legacy gzip source transport is deliberately rejected by this live producer.

The old1.2 code/proofs are preserved separately. The source semantics are pinned to hardened `nexo-retrieval-1.3.0`, `expanded=false`, `context-fields-1000-v2`. Producer code, Unicode 15 casing/digits, tokenizer and chunker are separately hashed. Run `node scripts/pin-retrieval-producer.mjs --check` before release. Updating a pin requires new parity evidence. A later Python version is not silently mixed into this implementation.

`importDocuments(snapshot, {previous, recordCache})` implements the baseline canonical surfaces, original Python content/evidence hashes, state/supersession, ACLs, source locators, ambiguous-identity quarantine, nested private-domain exclusion, credential cleaning, contextual chunks and explicit graph fields. It returns changed/added/deleted/retired/ACL-revoked IDs to trusted producer internals. Former/excluded aliases retain identifiers and locators, never removed private text. Record reuse is bound to source content and code; durable cache keys are additionally namespaced by producer hash.

`authorizedView(generation, {current, role, now})` implements current-ACL intersection, current deletion, validity intervals, inactive filtering, recursive hidden-reference masking and locator quarantine. Source locators are never rewritten. Graph edges survive only when both endpoints and their pointer remain authorized. Historical projection exists only for offline verification; the trusted serving adapter still forbids historical selection.

`prepareView()` computes complete authorized-view BM25 lengths/N/average/DF, exact aliases, titles and Python numeric membership. `emitView()` emits complete compatible manifest/catalog/shards in bounded batches. A role or validity change creates a new generation even when the source revision is unchanged. Non-string temporal metadata that would otherwise be silently rounded by the JSON serving boundary is rejected before emitting shards.

## Exact D1 interface and migration

Apply `worker/retrieval/schema.sql` to the **existing private D1 binding**, only after deployment/import authorization. It is idempotent and preserves legacy generation/shard tables. Added tables:

- `retrieval_payloads`: immutable, content-addressed private bytes; equal raw content reuses existing JSON/gzip encoding
- `retrieval_content_shards`: generation/family/key links authenticated by the manifest catalog
- `retrieval_build_shards`: private staging journal before the final manifest exists
- `retrieval_source_records`: code-namespaced canonical document/chunk records
- `retrieval_source_observations`: immutable compact observation manifests, with bounded content-addressed parts
- `retrieval_source_heads`: expected-observation CAS pointer

The optional manifest `payload_format: 'content-addressed-v1'` selects joined payload reads. Legacy envelopes continue working unchanged. Content sharing is private storage deduplication; it is not a cross-role result cache. A generation's catalog, scope, source/auth observations and validity bind every reused payload. No retrieval path reads staging generations. Verification authenticates every referenced payload before a one-statement expected-head CAS can publish it. Failed verification or a racing staging write cannot activate a generation.

No cleanup/retention job is provided. Source records and historical source observations remain private at rest. Do not infer that an unlinked payload is garbage: observation manifests also authenticate payload parts. Retention and hosted quota/cost must be reviewed before import.

## Trusted orchestration

Construct `createTrustedSourceProducer({db, driveBinding, authorize, enabled: true})` only inside trusted server code. It has a zero-argument `synchronize()` function. `authorize()` must freshly return the same owner/PIN/session/server-selected-role contract as `createTrustedLexicalAdapter`, including trusted UTC `now`. The constructor is closed by default and uses the fixed read-only Drive functions. Different I/O callbacks require explicit synthetic-fixture opt-in, which marks every resulting generation fixture-only so the default serving adapter rejects it.

Per call:

1. Snapshot owner/PIN/session/role, read the fixed Drive revision and private source journal on a first-primary D1 session
2. Reuse a still-current, valid selected view, or read/validate the complete canonical body when transport/source/code changes
3. Reuse code-bound records; preserve source observations including A→B→A and a new Drive revision carrying identical body bytes
4. Rebuild the entire authorized BM25 statistics/index at source, ACL or validity boundaries; reuse equal private payload bytes
5. Recheck source and authorization, complete staging, authenticate all shards, then publish by expected-head CAS
6. Recheck source, authorization and validity after publication; query serving independently repeats its own checks

Returns aggregate deltas and counts, never role-withheld record IDs. There is no user-selectable role, source, clock, revision or generation parameter.

The producer stops before exceeding 900 internal SQL statements with `PRODUCER_INVOCATION_BUDGET_REQUIRES_RESUME`. Reinvoking the same trusted synchronization is safe: durable source records/observations are reused, immutable staging retries are checked, and a completed staging manifest resumes full verification without re-emitting shards. The caller must arrange that next bounded invocation; no scheduler or background execution route is implicitly installed.

Explicit bounds include a 16 MiB source, 20,000 logical files, 12,000 imported documents, 500,000 imported leaves, 25,000 leaves and 256 chunks per document, 20,000 chunks per view, 65,000 terms, 100,000 non-catalog shards, bounded aliases and source locators, and 1.75 MB staging parameters. Oversized inputs fail; nothing is truncated to fake parity. Source prose retains the original reviewed 16,000-codepoint truncation flag/behavior.

## Verification and remaining gates

Code-only receipts live with the task deliverable; raw source/oracle exports and local SQLite files remain private outside this checkout. All three frozen snapshots match Python document/chunk/graph/exclusion hashes. All three frozen authorized scopes match document/chunk/graph hashes, scope keys and complete sparse postings/statistics. Local workerd/D1 exercises the full source synchronization and scoped query paths; there are no external requests.

Frozen clocks are proof fixtures only. The previously frozen current view expired at `2026-10-06T12:13:22Z`; production must rebuild at trusted current time and reject that expired view. Local workerd completion and Node memory measurements are not a hosted CPU/memory/concurrency guarantee. Hosted limits, retention, actual owner/PIN callbacks and route/MCP integration remain separate approval/review gates.

The live candidate now includes per-authorized-UID incident graph shards and unresolved-source pointers, without hidden reference strings. Every graph node (including zero-edge nodes) is present. The source/import/chunker hashes remain faithful, while manifest schema/policy/code/tokenizer pins are distinctly1.3. The all-role cached synchronizer is benchmark-only; use the fixed-LEARNER job API for live integration.
