# Private Atlas memory view

Status: local candidate, not published. Read-only browsing and reviewable owner drafts are implemented. Canonical saving is intentionally unavailable because this Site has only the existing read-only Drive grant and no verified, authorized Writer transport.

## Existing source, no second database

- Reuses the fixed Tower file, request-scoped connector, full-body/revision readback, owner identity and PIN session.
- The retrieval surfaces follow `nexo-memory-1.0.1`: entities, roadmaps, contracts, board posts, learned rules, families/incidents/thoughts and procedural state.
- This is a lexical source browser. It does not claim to serve the Python LSA/BM25 index, semantic neighborhoods, derived candidates or local-only feedback. The UI and API report those cache surfaces as not connected.
- No memory table, snapshot persistence, browser content storage, alternative canonical store, new credential or new permission is added. D1 remains authentication-only.
- Personal/health/Olympus/PEER domain surfaces and cross-domain personal sources are excluded from this scoped view. The full existing private Atlas runtime is unchanged.
- Citations retain the Tower revision, logical path, JSON pointer and entity version. `content_sha256` uses declared `ATLAS_JSON_V1`, not the Python cache hash contract. It is an Atlas edit precondition; do not substitute it for a Writer fingerprint.
- Duplicate canonical IDs with conflicting content are shown as conflicted and cannot be edited. Existing superseded/retracted status is retained. Nothing promotes a draft or observation to scientific confirmation.

## Routes and boundary

All three exact routes require server-verified owner identity, an active PIN session, same-origin POST and JSON. Bodies are limited to 16 KiB. Source reads share the existing single-flight limit. Session validity is checked again after an upstream read. Responses are private/no-store.

- `/api/atlas-memory/browse`: source query, kind/status/related-ID filters, revision-bound pagination, citations and annotation history.
- `/api/atlas-memory/propose`: rejects stale Tower revision, stale content, ambiguous targets, unknown fields, invalid annotation types and stale annotation supersession heads. Returns an explicitly unsaved draft.
- `/api/atlas-memory/apply`: always returns `EXISTING_WRITER_ROUTE_REQUIRED`, `applied:false`, `persisted:false`. It does not contact any source or Writer.

The UI is built only into guarded private assets and linked at `#/teia/memoria`. The legacy frame remains globally network-closed. A narrow closure captures native fetch before containment and exposes only the two fixed browse/propose POST routes; it cannot call apply, arbitrary URLs or external sources. Logout/teardown destroys the frame and drafts; source requests abort on navigation. Expired-session responses clear the UI and trigger the existing logout flow.

## Append-only owner review

The editor supports notes, interpretation corrections and human decisions, with a required reason. Revising a previous human annotation creates a new proposal referring to the previous annotation. The original evidence and all previous annotations stay unchanged.

The review packet carries the expected Tower revision and a `LEARNING_SIGNAL` envelope, matching the existing Writer vocabulary. Its payload is explicitly owner-authored, scoped to `ATLAS_MEMORY_OWNER_ANNOTATION_V1`, and has `scientific_authority:false`. The review envelope is immutable: reuse exactly the same proposal bytes and intent ID for a transport retry. Preparing a fresh review generates a distinct identity. The suggested inbox filename must be used by any future authorized adapter so the existing Writer's inbox identity mapping is stable.

This is a proposal interface, not a verified new Writer operation. Before enabling canonical writes, the existing Writer adapter must validate the expected Tower revision, target hash and annotation head immediately before its normal CAS, preserve append-only semantics, and verify its own receipt plus canonical readback. The generic `LEARNING_SIGNAL` converter alone does not enforce the new UI preconditions. Do not merely enable Drive `update_file` or send arbitrary requests from the browser.

## Permission still needed

No Sites-compatible Writer HTTP route was verified. Production memory feedback currently follows the existing private inbox → Writer → Tower CAS/readback path. If that path is chosen for Atlas, the smallest contemplated access is a server-restricted, create-only proposal submission into that exact existing private inbox, with the Writer retaining sole Tower mutation authority. Enabling such persistent access requires the owner's explicit action-time approval through the supported permission flow. This candidate does not request or configure it.

## Verification

- TypeScript check passed.
- Production build passed, with memory UI only in private server assets.
- 41 unit/integration tests passed: source behavior, auth, CSRF, session revocation, public-bundle isolation, filtering, pagination, stale revisions/hashes, annotation history, duplicate IDs, blocked apply, secret redaction and fixed-route transport.
- The existing Python Writer converter accepted a synthetic owner review envelope as one create-only `artifact` request (`expected_version:0`, `LEARNING_SIGNAL`, owner attribution preserved); no apply or I/O was performed.
- Read-only check against the authorized Tower snapshot at 2026-10-06 03:24:38Z: 1,728 eligible records, 34 kinds, two canonical feedback records from LEARNER and EXECUTOR, 10 quarantined records in five identity conflicts; no mutations. Python memory 1.0.1 independently validated that snapshot. The source browser excludes 32 additional cross-domain/personal records compared with the memory module's broader retrieval surface.
- Browser regression script: `node test/memory.browser.mjs`. Not passed in this executor: Chromium launch is blocked by local socket restrictions, including the approved retry. No visual-QA claim is made. Run it in a browser-capable executor before shipping. It covers drafts, conflicts, cancel, private navigation, mobile overflow and session teardown using synthetic fixtures only.

No live Tower writes, new grants, remote pushes or publication were performed.
