# NEXO Test Groups / Neural Design

## Goal

Keep the NEXO Neural graph legible with ~2.2k historical tests while preserving test auditability and making future tests appear automatically through stable aggregate nodes.

## Authority

`byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06` remains operational truth. Pantheon/ATLAS is a read-only projection. The legacy `PEER_CONTROL_TOWER_CANONICAL` Test Registry is migration provenance only.

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

The frozen migration backfill summarizes 2,198 unique historical Test IDs into 67 TEST_GROUPs. It does **not** copy the 2,198 historical test records into TOWER. Each virtual group keeps migration provenance and an access descriptor for the legacy Test Registry.

## Test record

Future/current material tests are canonical compact entities carrying only navigation/audit metadata needed by the projection: `id`, `test_group_id`, `campaign_id`, `program_id`, `status`, `evidence_class`, `title`, and provenance/source refs. Detailed scientific artifacts stay in their existing canonical/evidence locations.

Future terminal or materially updated tests are upserted through the canonical mutation writer as `entity_kind=test`; their group is upserted as `entity_kind=test_group` when needed. The writer may create only the explicitly allowlisted new entity kinds `work`, `test`, and `test_group` at `expected_version=0`.

## ATLAS projection

Atlas V3 reads:

- canonical live `entities/test_group/*.json`;
- canonical live `entities/test/*.json`;
- frozen `migration/test-registry-backfill-v1.json` group summaries as historical fallback.

Live groups override matching migration groups. `TEST_GROUP` becomes a graph node with `CAMPAIGN -> TEST_GROUP` `CONTAINS` edges. Canonical `TEST` records are omitted from the graph node map and are exposed only to the group detail/registry surface.

A TEST_GROUP is terminal in the Neural. Opening it selects the group and opens the inspector but must not change graph focus. The inspector exposes one `Abrir testes` link.

For a live/declared group, the linked registry view can list canonical TEST records from the published snapshot. For a migration-only virtual group, the link opens the historical Test Registry access surface using the stored campaign/family filter. The Neural never expands to individual historical tests.

## Filaments

A cross-domain relation may retain precise `test_refs` internally. When rendered in the Neural, test-level provenance is visually anchored to the owning TEST_GROUP where resolvable. This aggregation never changes the underlying evidence relation.

## Privacy

No private Olympus/client identity, labs, photographs, health data or personal check-ins may enter the public projection. Existing Atlas public-safety filtering remains authoritative for projection eligibility.

## Acceptance criteria

- Historical migration reports 2,198 unique tests compressed into 67 group summaries and does not duplicate the historical tests in TOWER.
- GZ01 eROSITA superbattery is represented as one explicit `TEST_GROUP` of kind `BATTERY` under `CAMP-GROWTH-LSS`.
- Atlas graph contains TEST_GROUP nodes and zero TEST nodes.
- Canonical live tests remain addressable by group outside the graph; historical virtual groups expose a legacy registry access link/filter.
- Opening a TEST_GROUP does not drill the graph deeper and exposes a tests link.
- New canonical `test` and `test_group` entities can be created with CAS/readback using the existing mutation pipeline.
- Regression tests and build/typecheck pass before merge.
