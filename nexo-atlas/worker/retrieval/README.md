# Hardened current retrieval 1.3 on Worker + D1

Local, disabled-by-default candidate. This code does not grant source access, create credentials, import private data, or activate production. The fixed private POST route is `/api/atlas-retrieval/search`. Explicit activation gate: `NEXO_ATLAS_RETRIEVAL=faithful-contextual-router-v13`.

## Supported current operations

- Search: `{query, k?, mode?}`; modes `auto` (default), `exact`, `lexical`, `graph`; `k` 1–50, at most 4,000 Unicode code points / 16,000 UTF-8 bytes.
- Auto uses the reviewed Python 1.3 router: exact known/unknown technical IDs, explicit current-version identity questions, pure numeric membership, literal field passages, measured BM25 default, and explicit-edge structural graph requests.
- Graph in auto does not compute LSA or embeddings. One/two-entity requests use bounded authorized explicit edges, typed target kinds, and path witnesses. Generated edges are always zero. A two-entity witness can be absent, traversal-bounded, or result-truncated; those conditions remain explicit.
- Opt-in `graph` matches Python's exact-seeded graph/lexical combination. Without an exact entity/title, it fails `GRAPH_ENTITY_REQUIRED`, because the omitted branch would require LSA.
- `createTrustedRetrievalAdapter({...trustedOptions, operation:'trace'|'neighbors'})` exposes contained graph operations with the same pre/post authorization, source and generation checks. These are not automatically exposed by a new HTTP route. Trace accepts `{entity,depth?,direction?,relation?,limit?}`; neighbors fixes depth 1. Bounds: depth 0–6, limit 1–200.
- `createTrustedLexicalAdapter` / `searchLexicalView` remain explicitly lexical-named entry points. New consumers should use `createTrustedRetrievalAdapter` / `searchCurrentView`.

`as_of`, history, diffs, include-inactive, filters, caller-selected roles/source/generation, get/data, clustering, LSA, neural embeddings and rerankers are unsupported. Auto natural-date and changed-revision language fails `HISTORICAL_QUERY_UNSUPPORTED`; it never silently answers using current data. Unsupported options/modes fail closed.

## Immutable source and authorization boundary

Every call takes one primary-session D1 generation selected by the server's owner/PIN/current-role policy. Source revision checks occur before and after the operation; the final primary head read and fresh session check precede result release. Missing, corrupt, revoked, changed, expired, mixed-role or mixed-generation views fail closed. Historical source/authorization mismatches and `fixture_only` exports cannot be served by the current adapter.

`v13-bindings.mjs` pins the hardened 1.3 source, config, chunker source, and JS Unicode/tokenizer implementation. These are deliberately distinct from the legacy 1.2 schema/policy. A legacy 1.2 manifest or original unpatched 1.3 source cannot be silently relabelled. This implementation uses the existing reviewed Unicode 15.0.0 tables; the tables' original generation metadata remains historical provenance. Tokenizer/normalization/scoring behavior is differentially checked, while alias extraction applies the 1.3 trailing-hyphen fix.

## Authorized graph shard contract

Schema: `NEXO_PRIVATE_D1_RETRIEVAL_V13`; policy: `reviewed-contextual-router-v13`.

Existing `metadata`, `term`, `document`, `chunk`, `alias`, `title`, `number`, `catalog` families are unchanged in shape. New `graph` family has one key per authorized UID, including zero-edge nodes:

- `edges`: all incident edges from the already-redacted authorized view, in the exact original global edge order. Each contains only `source`, `target`, `relation`, `pointer`, `origin:'explicit_source_field'`. Both endpoints must be authorized; pointers must survive source redaction/quarantine.
- `unresolved_source_fields`: `{source:uid,pointer,reason:'UNRESOLVED_IN_AUTHORIZED_INDEX'}` from reference fields in the already-redacted document. Skip restricted-reference markers. Never include the raw unresolved ref.
- Manifest `graph_node_count` equals `document_count`; `edge_count` counts original authorized edges once.

The producer must derive these shards only from the reviewed role-scoped, redacted view, not from all-role records or raw source aliases. Full raw `data` is intentionally not served: a plain JS JSON parse would silently round sufficiently large numbers.

Each catalog/shard is SHA-256-bound to an immutable manifest; integrity/resource limits apply to decompression, total reads, SQL binds, posting pairs, traversed edges and response bytes. Limits reject explicitly rather than silently truncating search. Source text remains untrusted evidence, with original pointers, versions, hashes and revision citations.

## Verification and activation

Local receipts are in the separate `retrieval-reconcile-evidence/faithful-router-v13` handoff. Frozen fixture core parity, current-source adapter behavior under synthetic clocks, and actual live serving are separate claims. The 24 historical fixture queries are offline-only; the current adapter rejects historical views. Expired fixtures are not valid live imports. No historical rollout, independent experiment count, answer correctness or hosted latency/cost claim follows from frozen ranking parity.

New importers and consumers must explicitly adopt this version's contract and gate. Deployment approval alone does not create a private source grant.

See PRODUCER.md and JOBS.md for the trusted current-source projection builder and its separate activation/capacity gates.
