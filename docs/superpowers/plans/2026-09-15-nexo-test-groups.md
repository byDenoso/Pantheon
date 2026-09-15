# NEXO Test Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materialize historical and future NEXO tests behind terminal TEST_GROUP nodes so the Neural remains legible while every test stays accessible.

**Architecture:** TOWER_V06 remains truth. A frozen migration backfill carries legacy compact tests/groups; live `test_group` and `test` entities override migration records. Atlas V3 projects TEST_GROUP nodes into the graph and exposes TEST records only through a registry view. The mutation writer gets bounded create support for `test`/`test_group`.

**Tech Stack:** Python 3.11 mutation runtime/tests; JSON TOWER state; Node.js V3 projection tests; React 19/TypeScript/Vite Atlas UI.

**Spec:** `docs/superpowers/specs/2026-09-15-nexo-test-groups-design.md`

## Global Constraints

- Operational truth remains `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`.
- ATLAS is read-only projection.
- No frozen scientific test contract changes.
- No new scheduler, database, service or agent.
- TEST_GROUP is the last Neural node; TEST is never a graph node.
- Legacy Drive registry is migration provenance only.
- Explicit group membership overrides virtual migration membership.
- Public projection must preserve existing privacy gates.

---

### Task 1: Canonical mutation create support

**Files:**
- Modify: `byDenoso/TCC/runtime/nexo_agent_api/test_mutations.py`
- Modify: `byDenoso/TCC/runtime/nexo_agent_api/mutations.py`

**Interfaces:**
- Consumes: existing `apply_mutation_request(root, request)` CAS mutation contract.
- Produces: creation at `expected_version=0` for exactly `work`, `test`, `test_group`.

- [ ] Add failing tests proving a missing `test` and `test_group` can be created, identity must match `entity_name`, receipt is accepted, version becomes 1, and exact file readback contains the requested fields.
- [ ] Run the focused mutation test suite and confirm RED because non-work creates return `ENTITY_NOT_FOUND`.
- [ ] Replace the work-only create branch with an explicit allowlist `CREATABLE_ENTITY_KINDS = {'work','test','test_group'}` while preserving the work hydration path for nonzero versions.
- [ ] Run focused tests and the NEXO agent API test suite; confirm GREEN.
- [ ] Commit the bounded runtime change.

### Task 2: Historical backfill and canonical group contract

**Files:**
- Create: `byDenoso/NEXO-Obsidian-Vault/TOWER_V06/contracts/TEST_GROUP_V1.json`
- Create: `byDenoso/NEXO-Obsidian-Vault/TOWER_V06/migration/test-registry-backfill-v1.json`

**Interfaces:**
- Consumes: legacy `PEER_CONTROL_TOWER_CANONICAL/Test Registry` migration source.
- Produces: frozen compact `{groups, tests, meta}` backfill consumed read-only by Atlas V3.

- [ ] Generate from unique Test IDs using last-row-wins and `campaign + first ID family >=10 else OTHER`.
- [ ] Assert generation invariants: `unique_tests=2198`, `groups=67`, every test has one group, every group has a campaign, sum(group.test_count)=2198.
- [ ] Add explicit contract semantics: `VIRTUAL_GROUP` is navigation only; declared/live groups override migration records; TEST_GROUP is terminal visual node.
- [ ] Commit migration artifacts without modifying frozen scientific contracts.

### Task 3: Atlas V3 source and projection

**Files:**
- Create: `atlas-control-tower/test/atlas-v3-test-groups.test.mjs`
- Modify: `atlas-control-tower/v3/tower-source.mjs`
- Modify: `atlas-control-tower/v3/contracts.mjs`
- Modify: `atlas-control-tower/v3/project.mjs`
- Modify: `atlas-control-tower/src/atlas-v3/types.ts`

**Interfaces:**
- Consumes: `migration/test-registry-backfill-v1.json`, live `entities/test_group/*.json`, live `entities/test/*.json`.
- Produces: graph TEST_GROUP nodes plus `testing.groups[]` and `testing.tests[]` in snapshot; no TEST graph nodes.

- [ ] Write failing Node tests using a temporary Tower fixture: migration groups/tests load; live records override same IDs; TEST_GROUP receives `CAMPAIGN -> TEST_GROUP` edge; TEST stays out of `graph.root.nodes`; compact tests remain in `testing.tests`.
- [ ] Run focused test and confirm RED.
- [ ] Implement sanitizers/readers/merge-by-ID in `tower-source.mjs`.
- [ ] Add explicit `TEST_GROUP`/`TEST` normalization and public compact views.
- [ ] Exclude `test` bucket from node materialization, emit test registry collection, and include it in fingerprint/counts.
- [ ] Run focused tests, full `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Commit projection change.

### Task 4: Terminal TEST_GROUP UI and test registry view

**Files:**
- Create: `atlas-control-tower/src/atlas-v3/test-groups.mjs`
- Create: `atlas-control-tower/src/atlas-v3/test-groups.d.mts`
- Create: `atlas-control-tower/test/atlas-v3-test-group-ui.test.mjs`
- Modify: `atlas-control-tower/src/atlas-v3/AtlasV3App.tsx`
- Modify: `atlas-control-tower/src/atlas-v3/atlas-v3.css`

**Interfaces:**
- Produces: `testsForGroup(snapshot, groupId)` and `testGroupHref(groupId)` pure helpers used by UI.

- [ ] Write failing tests for deterministic group URL encoding and filtering tests by exact `testGroupId`.
- [ ] Run focused test and confirm RED.
- [ ] Implement pure helpers.
- [ ] Make TEST_GROUP open terminal: select/open inspector, never change graph focus.
- [ ] Add `Abrir testes` inspector link.
- [ ] Render `?testGroup=<id>` registry view from the same snapshot with group metadata, counts, search and compact test rows; no graph expansion.
- [ ] Change Neural search copy from individual test to group terminology.
- [ ] Run focused tests, full test/typecheck/build.
- [ ] Commit UI change.

### Task 5: Live GZ01 bootstrap and future writer rule

**Files/state:**
- Canonical mutations after TCC support lands:
  - create `TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY` with `group_kind=BATTERY`, `campaign_id=CAMP-GROWTH-LSS`, `work_ref=WORK::GZ01-EROSITA-SUPERBATTERY-V1`.
  - materialize known current GZSB test records with that `test_group_id`.
  - add `test_group_id` to the parent WORK by CAS mutation.
- Update the existing NEXO Autoconsistente automation prompt minimally.

**Interfaces:**
- Future scientific execution upserts compact canonical TEST after each material test state/result change.

- [ ] Create canonical group/test entities through mutation inbox, never direct live entity writes.
- [ ] Verify accepted receipt + entity version + exact readback for each create/update.
- [ ] Update Autoconsistente rule: inherit explicit `test_group_id`; batteries use declared BATTERY group; otherwise use an existing deterministic campaign group or campaign `OTHER`; upsert TEST compact state after material test changes.
- [ ] Confirm scheduler prompt readback without cadence changes.

### Task 6: Integration and production verification

- [ ] Open PRs for TCC, TOWER migration, and Pantheon.
- [ ] Require CI/checks green; fix any regression before merge.
- [ ] Merge TCC first, then TOWER migration/contracts, then Pantheon projection/UI.
- [ ] Trigger/confirm Atlas deployment through the existing linked project only.
- [ ] Read back the public snapshot: historical groups exist, graph has TEST_GROUP and zero TEST nodes, GZ01 group is BATTERY, group registry resolves its tests.
- [ ] Verify no private Olympus/client data entered the public projection.
