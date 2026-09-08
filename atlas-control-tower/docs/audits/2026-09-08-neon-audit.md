# NEXO Neon Audit · 2026-09-08

## Scope and authority

Project audited: `steep-sound-00663650` (`nexo-research-cockpit`), database `neondb`.

Authority after reconciliation:
- Science: `science_v1` in Neon.
- Learning: `learning_v1` in Neon.
- Operational flight recorder: `nexo_ops` in Neon.
- Olympus operational state: `olympus` in Neon.
- Atlas/`flight_api.atlas_cockpit_index`: derived read projection only.
- Drive: evidence/provenance/legacy bytes, not mutable operational state.

No database, schema, scheduler, queue, registry, extension, or new service was created by this audit.

## Branch inventory

| Branch | Role | Logical size | Decision |
|---|---|---:|---|
| `br-dark-hill-awc89q2k` / `science-v1-learning-v1-20260905` | primary + default | 102,424,576 B | CANONICAL |
| `br-still-butterfly-aw0jgyu5` / `main` | pre-cutover ancestor | 69,230,592 B | LEGACY_ANCESTRY; keep until cleanup gate |
| `br-floral-scene-awzhdufa` / `mcp-migration-2026-09-07T01-30-41` | migration child | 92,258,304 B | SAFE_CANDIDATE_FOR_DELETE after explicit destructive approval |

Manual rollback snapshot retained: `snap-proud-union-aw37yka2` / `pre-science-v1-cutover-20260906`, 69,230,592 B.

## Integrity baseline

Fresh referential checks returned zero for all audited cases:

| Check | Broken rows |
|---|---:|
| Science relation `from_entity_id` missing | 0 |
| Science relation `to_entity_id` missing | 0 |
| Science provenance owner missing | 0 |
| Science revision owner missing | 0 |
| Science entity-domain entity missing | 0 |
| Science entity-domain domain missing | 0 |
| Olympus current-state person missing | 0 |

No relation was invented to improve graph connectivity.

## Semantic projection coverage

Fresh canonical-object coverage against `flight_api.atlas_cockpit_index`:

| System | Canonical expected | Indexed canonical | Missing |
|---|---:|---:|---:|
| SCIENCE | 5,047 | 5,047 | 0 |
| LEARNING | 135 | 135 | 0 |
| BLACKBOX | 84 | 84 | 0 |
| OLYMPUS | 17 | 17 | 0 |

During the audit, two new Durable Runner objects appeared after the prior semantic sweep: one `execution_run` and one `runtime_event`. They were canonical in `nexo_ops` but absent from the derived semantic index. Both were indexed as `DERIVED_NOT_EVIDENCE`, then the complete coverage query was rerun and returned zero missing objects in all four systems.

The full semantic index also contains derived source/file/folder/domain projection nodes, so its total is larger than canonical-object coverage by design.

## Drive-reference coverage

The initial broad regex reported 28 apparent references and four missing projections. Inspection showed the four were operational identifiers (`CR-*` / `NEXO-*`), not Drive file IDs.

After source-kind-aware normalization:
- real current Drive IDs referenced by canonical Truth Owner records: **22**;
- Drive IDs resolving through Google Drive metadata: **22/22**;
- matching `drive:<id>` semantic projections: **22/22**;
- broken current Drive references: **0**;
- missing indexable Drive projections: **0**.

## Query-path evidence

Representative production-shaped lookups were measured with `EXPLAIN ANALYZE`:

| Query | Plan | Execution |
|---|---|---:|
| `science_v1.entities` by `entity_id` | `entities_pkey` index scan | ~0.032 ms |
| `science_v1.relations` by from/to entity | bitmap OR using both endpoint indexes | ~0.354 ms |
| `flight_api.atlas_cockpit_index` by `entity_id` | PK index scan | ~1.664 ms |

The current Atlas root/health path already avoids full semantic/science hydration where it is not required. No measured lookup justified an additional index.

Sequential scans are present on small/medium tables because audits, projections and bounded full reads intentionally scan them. None of the representative interactive lookup paths showed a missing-index bottleneck.

## Storage and bloat

Largest tables from the fresh size check:

| Table | Size | Classification |
|---|---:|---|
| `public.snapshots` | 20 MB | LEGACY_STORAGE_CANDIDATE |
| `public.sync_changes` | 9,344 kB | LEGACY_STORAGE_CANDIDATE |
| `flight_api.atlas_cockpit_index` | 8,264 kB | ACTIVE_DERIVED |
| `science_v1.revisions` | 6,256 kB | CANONICAL |
| `science_v1.entities` | 3,472 kB | CANONICAL |
| `science_v1.provenance` | 3,136 kB | CANONICAL |
| `science_v1.relations` | 1,224 kB | CANONICAL |

Bloat estimate found approximately 5.4 MB waste in `atlas_cockpit_index`, 1.6 MB in `science_v1.entities`, and ~0.5 MB in `science_v1.revisions`. This does not justify a blocking rewrite or `VACUUM FULL` at current scale.

Low-scan non-unique indexes were reviewed. No index was dropped merely because `idx_scan` was low; several support future/rare lookup paths and their storage cost is negligible.

## Legacy public schema

The old `public` read-model/sync family remains ancestry, including `snapshots`, `sync_changes`, `entities`, `relations`, `sources`, `source_refs`, `metrics`, `sync_runs`, `app_state`, `sync_lock`, `action_commands`, and `audit_events`.

Current Pantheon runtime search did not identify an active production path that requires these legacy read-model tables. They are therefore cleanup candidates, not automatically deletable objects. `public.snapshots` and `public.sync_changes` account for almost all meaningful legacy storage.

## Truth-owner correction performed

Two stale `nexo_ops.truth_states` pointers were corrected without schema changes or data deletion:

1. `OLYMPUS`
   - before: Drive ledger `OLYMPUS_LEDGER_v1.0` as authority;
   - after: `NEON:steep-sound-00663650/neondb/olympus`;
   - Drive ledger retained and explicitly marked `LEGACY_READONLY` in metadata.

2. `ENGINEERING`
   - before: `GitHub:byDenoso/NEXO-Obsidian-Vault + real runtime`;
   - after: `GitHub:byDenoso/Pantheon + real runtime`;
   - current code truth owner recorded as Pantheon/main.

Science and Learning pointers were already correct and were not rewritten.

## No-change decisions

No speculative index creation, table rewrite, extension install, branch deletion, or legacy-table DROP was executed. At the measured scale those changes would add operational risk without a demonstrated user-facing gain.

## Gated destructive candidates

The following remain explicit approval gates:
- delete Neon migration branch `br-floral-scene-awzhdufa`;
- retire pre-cutover ancestor branch when rollback policy permits;
- drop/compact legacy `public.snapshots` and `public.sync_changes` only after a final dependency/export retention decision;
- remove low-value legacy indexes only if a later workload proves them unnecessary.
