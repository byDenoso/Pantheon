# NEXO Test Groups / Neural Design

## Goal

Keep the NEXO Neural graph legible with ~2.2k historical tests while preserving complete test auditability and making future tests appear automatically through stable aggregate nodes.

## Authority

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` remains operational truth. Pantheon/ATLAS is a read-only projection. The legacy `PEER_CONTROL_TOWER_CANONICAL` Test Registry is migration provenance only and is used once to construct a deterministic historical backfill.

## Visible hierarchy

The Neural graph stops at:

`DOMAIN -> PROGRAM -> CAMPAIGN -> TEST_GROUP`

`TEST` is never rendered as a Neural node. Results/evidence remain test metadata and referenced artifacts, not permanent graph clutter.

## TEST_GROUP semantics

A group has `id`, `campaign_id`, `group_kind`, `label`, `test_count`, status and optional `work_ref`.

Declared groups preserve scientific/operational semantics. `BATTERY` is the declared subtype for the GZ01 eROSITA superbattery. Historical tests that have no declared group use `VIRTUAL_GROUP`; this is visual/navigation compression only and is never scientific evidence.

The historical grouping rule is deterministic:

1. Deduplicate legacy Test Registry rows by Test ID, last row wins.
2. Group within Primary Campaign by first semantic Test-ID family token after `T-`/`MT-` when that family has at least 10 unique tests in that campaign.
3. Put smaller families into the campaign's `OTHER` group.
4. Explicit canonical groups override virtual membership for live/current tests.

The frozen backfill generated from the legacy registry contains 2,198 unique test IDs and 67 groups.

## Test record

A compact test record carries only navigation/audit metadata needed by the projection: `id`, `test_group_id`, `campaign_id`, `program_id`, `status`, `evidence_class`, `title`, and provenance/source refs. Detailed scientific artifacts stay in their existing canonical/evidence locations.

Future terminal or materially updated tests are upserted through the canonical mutation writer as `entity_kind=test`; their group is upserted as `entity_kind=test_group` when needed. The writer may create only the explicitly allowlisted new entity kinds `work`, `test`, and `test_group` at `expected_version=0`.

## ATLAS projection

Atlas V3 reads:

- canonical live `entities/test_group/*.json`;
- canonical live `entities/test/*.json`;
- frozen `migration/test-registry-backfill-v1.json` as historical fallback.

Live entities override matching backfill IDs. `TEST_GROUP` becomes a graph node with `CAMPAIGN -> TEST_GROUP` `CONTAINS` edges. `TEST` records are omitted from the graph node map and published under a compact `testing` collection.

A TEST_GROUP is terminal in the Neural. Double-click/open selects it and opens the inspector but must not change graph focus. The inspector exposes one `Abrir testes` link. The linked registry view lists/searches tests for that group from the same published snapshot.

## Filaments

A cross-domain relation may retain precise `test_refs` internally. When rendered in the Neural, test-level provenance is visually anchored to the owning TEST_GROUP where resolvable. This aggregation never changes the underlying evidence relation.

## Privacy

No private Olympus/client identity, labs, photographs, health data or personal check-ins may enter the public projection. Existing Atlas public-safety filtering remains authoritative for projection eligibility.

## Acceptance criteria

- Historical backfill reports 2,198 unique tests and 67 groups.
- GZ01 eROSITA superbattery is represented as one explicit `TEST_GROUP` of kind `BATTERY` under `CAMP-GROWTH-LSS`.
- Atlas graph contains TEST_GROUP nodes and zero TEST nodes.
- The snapshot still contains compact tests addressable by group.
- Opening a TEST_GROUP does not drill the graph deeper and exposes a tests link.
- New canonical `test` and `test_group` entities can be created with CAS/readback using the existing mutation pipeline.
- Regression tests and build/typecheck pass before merge.
