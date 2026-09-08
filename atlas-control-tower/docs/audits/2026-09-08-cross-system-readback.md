# NEXO Cross-System Reconciliation · 2026-09-08

## Authority matrix after repair

| Domain | Mutable Truth Owner | Evidence / projection boundary |
|---|---|---|
| SCIENCE | `NEON:steep-sound-00663650/neondb/science_v1` | Drive retains evidence and frozen Tower ancestry; Atlas is derived |
| LEARNING | `NEON:steep-sound-00663650/neondb/learning_v1` | Atlas semantic projection is derived |
| BLACK BOX / OPS | `NEON:steep-sound-00663650/neondb/nexo_ops` | Atlas is derived operational projection |
| OLYMPUS | `NEON:steep-sound-00663650/neondb/olympus` | Drive ledger/current-state docs are legacy read-only provenance |
| ENGINEERING / CODE | `GitHub:byDenoso/Pantheon + real runtime` | GitHub `main` owns active code/tests/migrations; deployment/runtime remains execution surface |

`nexo_ops.truth_states` was read back after repair and confirms Science, Learning, Olympus and Engineering pointers according to this matrix.

## Neon → Drive

Source-kind-aware reference extraction produced 22 real Drive IDs from current canonical Science/Olympus/operational provenance.

Readback:
- real referenced Drive IDs: **22**;
- Drive metadata resolution: **22/22**;
- semantic `drive:<id>` projection: **22/22**;
- broken referenced Drive objects: **0**;
- missing indexable source projection: **0**.

Four apparent references from an earlier broad regex were operational IDs, not Drive IDs, and are excluded from the Drive denominator.

## Drive → Neon

Current Science result/evidence objects directly referenced by Science provenance resolve and are semantically projected. Olympus legacy state/ledger/protocol files referenced by Olympus records also resolve and are projected.

Drive objects do not create graph edges merely because they share folders or names. Reverse projection is evidence-driven only.

Two ambiguous Drive folders named `NEXO_READ_MODEL` were renamed in place to explicit `LEGACY_READONLY__...` names. Their IDs, parents and MIME types were preserved.

## GitHub → Neon schema/runtime assumptions

Current Atlas/Durable Runner code references only live canonical schemas relevant to its role:
- `science_v1`
- `learning_v1`
- `nexo_ops`
- `olympus`
- `flight_api`

The Durable Runner's raw reads are allowlisted and its writes are limited to Black Box receipts/checkpoints. `main` subsequently versioned the minimum Neon grants for `nexo_ops.execution_runs` and `nexo_ops.runtime_events`.

No new database/schema/service was created to bridge scheduled automation to Neon.

## Canonical semantic coverage

Fresh readback after repairing two newly arrived Durable Runner projections:

| System | Expected current canonical objects | Indexed | Missing |
|---|---:|---:|---:|
| SCIENCE | 5,047 | 5,047 | 0 |
| LEARNING | 135 | 135 | 0 |
| BLACKBOX | 84 | 84 | 0 |
| OLYMPUS | 17 | 17 | 0 |

The two Black Box misses were not stale Truth Owner data. They were a new Durable Runner `execution_run` and `runtime_event` created after the previous index sweep. They were added only to the derived semantic index with authority `DERIVED_NOT_EVIDENCE`.

## Query and performance readback

Representative canonical lookups use existing indexes:
- Science entity by PK: ~0.032 ms;
- Science relation endpoint lookup: ~0.354 ms using endpoint indexes;
- semantic index by PK: ~1.664 ms.

No additional index showed a measured benefit sufficient to justify migration risk. The optimization therefore avoids speculative DDL.

## Storage readback

Largest legacy candidates:
- `public.snapshots`: 20 MB;
- `public.sync_changes`: 9,344 kB.

They are not current Truth Owners and no active Pantheon runtime reference was found, but they remain preserved until a destructive retention/export decision is explicitly approved.

## GitHub governance readback

Safe changes completed:
- obsolete PR #1 closed without merge;
- obsolete PR #2 closed without merge;
- retired `apply-project-atlas-v3.yml` workflow removed;
- `Atlas Quality` retained;
- TDD proved RED before workflow removal and GREEN after removal;
- 47 branches inventoried;
- merged-feature and exact-SHA alias branch families classified without deleting any branch refs.

The audit branch deliberately does not delete branches with unique commits, scientific experiments, deployment ancestry or unresolved active intent.

## Before / after matrix

| Metric | Before | After reconciliation |
|---|---:|---:|
| broken Science/Olympus referential checks | 0 | 0 |
| missing canonical Science semantic objects | 0 | 0 |
| missing canonical Learning semantic objects | 0 | 0 |
| missing canonical Black Box semantic objects at latest sweep | 2 recent deltas | 0 |
| missing canonical Olympus semantic objects | 0 | 0 |
| real current Drive refs | 22 | 22 |
| broken real current Drive refs | 0 | 0 |
| missing Drive semantic projections | 0 | 0 |
| stale Olympus Truth Owner pointer | 1 | 0 |
| stale Engineering code-owner pointer | 1 | 0 |
| ambiguous `NEXO_READ_MODEL` names | 2 | 0 |
| obsolete open non-merge PRs | 2 | 0 |
| obsolete one-shot workflows | 1 | 0 |
| destructive deletes | 0 | 0 |

## Black Box finalization contract

The consolidated operational record uses event ID:
`INFRA_OPTIMIZATION::2026-09-08::NEON_DRIVE_GITHUB`

It is recorded once in `nexo_ops.runtime_events`, source `GitHub / byDenoso/Pantheon`, and finalized with the verified PR/head/merge references plus the metrics above. Because runtime events are current searchable Black Box objects, its derived semantic projection is also required and must be read back after insertion.

## Gated leftovers

Not executed automatically:
- Neon migration/ancestor branch deletion;
- legacy `public` table deletion/compaction;
- Drive empty-folder/evidence deletion;
- GitHub branch-ref deletion.

These are cleanup opportunities, not unresolved integrity failures. The canonical authority graph and current source/projection coverage do not depend on executing them.
