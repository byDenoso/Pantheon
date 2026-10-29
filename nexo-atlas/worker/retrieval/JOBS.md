# Fixed-LEARNER serving-build jobs

Use `createTrustedLearnerProducerJobs` for the proposed live integration. The older `createTrustedSourceProducer` is an offline/full-record benchmark orchestrator; its all-role record cache and 900-statement budget are not the approved serving storage/HTTP contract.

Apply `schema.sql` and `producer-jobs.sql` to the existing private D1 only through the separately authorized deployment. No migration or hosted import is performed by these modules. The job module itself defaults to disabled and has no route.

Server construction supplies the existing D1 binding, request-scoped fixed Drive binding, and a fresh `authorize()` callback matching owner+PIN/session/epoch/LEARNER/policy/current-UTC. `start()` accepts no arguments. `resume(cursor)` accepts one opaque server-issued cursor string. Browser request bodies must contain no role/source/revision/clock/head/authorization data. Production I/O is fixed to the existing read-only canonical Drive adapter. Alternate callbacks require explicit synthetic-fixture opt-in; resulting generations are fixture-only and rejected by the default serving adapter.

Each resume verifies the job's hashed private state, code pin, subject/session/epoch and role. It rechecks current Drive revision, validity and expected selected head. A source, authorization, clock-boundary or head change cancels/rejects the old job; restart under fresh trusted context. Concurrent duplicate resumes cannot advance the same cursor twice. A one-step-late transport retry returns the current cursor without repeating work.

Phases are durable: staging → linking → verifying → publishing → done. Staging reads and validates the full canonical body, transiently imports all required scientific records, then writes only the redacted LEARNER view. Bounded JSON_each inbox transactions insert content-addressed payloads and generation links without per-row SQL calls; the inbox row is consumed atomically. If staging needs another invocation, only the unstaged suffix is written. Linking and subsequent verification/publication resumes need only fresh Drive revision metadata, not the source body.

Verification walks authenticated catalogs and header-first byte-bounded pages. Every payload is authenticated, counts/scope/metadata checked, and the staging mutation sequence is bound across all steps before verification can complete. Only a verified generation can replace the expected head by CAS. A final authorization check follows the final job-state write.

At rest, this mode stores:
- Redacted LEARNER-visible document output metadata, chunks, indexes, authorized aliases/titles/numbers, incident graph shards and catalogs
- Minimal current/former/excluded identifiers and source locators, in hashed private alias parts required to suppress references after deletion/revocation
- Source revision/raw SHA/transport/validity/code bindings and private job bookkeeping

It does not use `retrieval_source_records` or full source-observation manifests, and does not persist role-withheld scientific bodies, health/bodybuilding/Olympus/personal/client/peer bodies, source-derived credentials, or arbitrary raw Tower files. Old scoped generations remain private at rest; retention/GC is a separate policy. Minimal excluded aliases can identify a withheld record or its locator; they contain no withheld body.

The job's own SQL counter caps at30. This is not the full HTTP count: the parent must add its outer owner/session checks and every fresh authorization callback. Current measured phases leave room for those checks, but the actual route must be instrumented after integration. Never replace fresh primary authorization reads with a stale shared snapshot to meet a budget.

`pin-retrieval-producer.mjs --check` verifies core data semantics. `pin-retrieval-jobs.mjs --check` separately pins the job policy, byte-bounded verifier and job schema. Oversized input rejects explicitly. Local workerd timings and sampled memory are not a hosted CPU/isolate guarantee; the actual Sites plan still has to admit this work.

Before staging, the producer explicitly releases raw bytes, the source envelope, imported all-role records and full authorized document data/text/ACL structures. The prepared continuation retains only serving metadata, original sanitized chunks and already-derived memberships/graphs. Core and job hashes bind the hardened1.3 generation distinctly. Runtime fit remains a measured canary gate; local unconstrained workerd does not enforce the hosted memory limit.
