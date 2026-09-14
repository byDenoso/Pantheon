# Science Read Model V2 + NEXO MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate a deterministic Science Read Model V2 with shard discovery, record-level diff/ledgers, generic scientific observations, Manifest V3, Atlas consumers, NEXO One read APIs, and a read-only MCP endpoint.

**Architecture:** Google Drive/SSOT remains truth owner. A deterministic projection compiler discovers and normalizes source shards, hashes records, computes deltas against a durable projection ledger, emits an activity ledger, builds SRM V2 plus compatibility surfaces, then publishes a hash-addressed Manifest V3 only after readback. Atlas Pages, NEXO One API and MCP consume the same SRM V2 contract.

**Tech Stack:** Node.js ESM, Node test runner, TypeScript 5.9, React 19, Vite 8, SHA-256 via `node:crypto`, Vercel single-function runtime, MCP Streamable HTTP.

**Spec:** `docs/superpowers/specs/2026-09-14-science-read-model-v2-mcp-design.md`

## Global Constraints

- Google Drive remains Truth Owner for scientific/operational records.
- GitHub remains code/contract authority and may contain generated projections.
- Canonical structural hierarchy is `SYSTEM → PROGRAM → CAMPAIGN`; D1…D10/CROSS are facets.
- Public SRM V2 and MCP must exclude private Olympus/client data.
- `EMPTY` must mean a successful zero-result read; unavailable source data must surface as `DATA_UNAVAILABLE`/`PARTIAL`/`STALE`/`ERROR`.
- Missing scientific uncertainty, timestamps or synthesis must remain missing; never infer them.
- MCP v1 is read-only and reuses the existing `nexo-one/api/index.js` Vercel function.
- Existing Atlas routes/contracts stay readable during migration.
- Promotion is fail-closed: a readback/hash failure preserves the previous promoted snapshot.
- TDD is mandatory for implementation changes.

---

### Task 1: Shard discovery and source completeness

**Files:**
- Create: `atlas-control-tower/lib/science-shard-catalog.mjs`
- Modify: `atlas-control-tower/scripts/generate-static-state.mjs`
- Test: `atlas-control-tower/test/science-shard-catalog.test.mjs`

**Interfaces:**
- Consumes: canonical science index and `data/science-drive-projection/*.json`.
- Produces: `discoverScienceShards({ scienceIndex, dataDir }) -> ShardDescriptor[]` and `loadScienceShardCatalog(...)`.

- [ ] **Step 1: Write failing tests** proving that an empty/missing `scienceIndex.shards` still discovers `D1.json`…`D10.json`/`CROSS.json`, computes SHA-256 and count metadata, and that a declared campaign test count with no provable shard yields `DATA_UNAVAILABLE`/`PARTIAL`, never a successful zero.

```js
assert.equal(catalog.find(x => x.id === 'D1').state, 'READY');
assert.ok(catalog.find(x => x.id === 'D1').sha256.startsWith('sha256:'));
assert.equal(missing.state, 'DATA_UNAVAILABLE');
```

- [ ] **Step 2: Run the focused test** with `node --test test/science-shard-catalog.test.mjs` and verify RED due to missing module/behavior.
- [ ] **Step 3: Implement discovery** with explicit catalog first, generated shard directory second, deterministic lexical/numeric ordering, and per-shard `includedCount`, `declaredCount`, `truncated`, `sourceVersion`, `sha256`, `state`.
- [ ] **Step 4: Wire the generator** so `scienceShards` is loaded from the catalog rather than only `scienceIndex.shards`.
- [ ] **Step 5: Re-run focused + full Atlas tests** and commit `feat(srm): discover scientific shard catalog`.

### Task 2: Deterministic projection hashing and diff engine

**Files:**
- Create: `atlas-control-tower/lib/projection-diff.mjs`
- Test: `atlas-control-tower/test/projection-diff.test.mjs`

**Interfaces:**
- Produces: `canonicalRecordHash(record)`, `diffProjection({ previousLedger, currentRecords, observedAt })`.

- [ ] **Step 1: Write failing tests** for deterministic field ordering and exact `ADDED`, `UPDATED`, `RELINKED`, `UNPUBLISHED`, `UNCHANGED` behavior.

```js
assert.equal(canonicalRecordHash({id:'T1',domains:['D1'],status:'PASS'}), canonicalRecordHash({status:'PASS',id:'T1',domains:['D1']}));
assert.deepEqual(result.deltas.map(x => x.eventType), ['ADDED']);
```

- [ ] **Step 2: Verify RED** with `node --test test/projection-diff.test.mjs`.
- [ ] **Step 3: Implement canonical hashing** over the spec-defined public scientific fields; sort object keys and order set-like arrays deterministically.
- [ ] **Step 4: Implement ledger transition semantics** preserving `firstSeenAt`, distinguishing it from optional `sourceCreatedAt`, updating `lastSeenAt`, hashes and revision only on change.
- [ ] **Step 5: Verify GREEN/full suite** and commit `feat(srm): add deterministic projection diff ledger`.

### Task 3: Activity ledger and dependency-aware change propagation

**Files:**
- Create: `atlas-control-tower/lib/activity-ledger.mjs`
- Create: `atlas-control-tower/lib/synthesis-dependencies.mjs`
- Test: `atlas-control-tower/test/activity-ledger.test.mjs`
- Test: `atlas-control-tower/test/synthesis-dependencies.test.mjs`

**Interfaces:**
- Produces: `buildActivityEvents(deltas)`, `dependencyFingerprint(ids, lookup)`, `selectInvalidatedSyntheses(...)`.

- [ ] **Step 1: Write failing tests** mapping test deltas to `TEST_ADDED/UPDATED/RELINKED/UNPUBLISHED` and proving only syntheses whose dependency fingerprints change are invalidated.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement append-only activity event generation** with deterministic IDs derived from entity/revision/event type and source provenance.
- [ ] **Step 4: Implement dependency fingerprints** as SHA-256 over sorted dependent IDs + their current hashes.
- [ ] **Step 5: Verify GREEN/full suite** and commit `feat(srm): add activity ledger and selective invalidation`.

### Task 4: Science Read Model V2 compiler

**Files:**
- Create: `atlas-control-tower/lib/science-read-model-v2.mjs`
- Modify: `atlas-control-tower/lib/h0-stack-projection.mjs`
- Test: `atlas-control-tower/test/science-read-model-v2.test.mjs`

**Interfaces:**
- Produces: `buildScienceReadModelV2({ scienceIndex, scienceShards, shardCatalog, projectionLedger, activity, previousSyntheses, generatedAt })`.

- [ ] **Step 1: Write failing tests** for `contract === 'NEXO_SCIENCE_READ_MODEL_V2'`, `SYSTEM→PROGRAM→CAMPAIGN` structure, D-domain facets, investigation tests/results, H0 represented as `metricId:'cosmology.H0'`, and missing uncertainty remaining absent.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Implement normalized `structure` and `investigation`** without adding tests/results to the structural graph.
- [ ] **Step 4: Implement generic observation extraction** beginning with H0 adapter reuse; rejected ambiguous observations go to diagnostics without dropping source tests.
- [ ] **Step 5: Implement comparisons/syntheses containers** with explicit empty/unavailable semantics and dependency fingerprints.
- [ ] **Step 6: Verify GREEN/full suite** and commit `feat(srm): compile science read model v2`.

### Task 5: Manifest V3 and fail-closed promotion artifacts

**Files:**
- Create: `atlas-control-tower/lib/public-manifest-v3.mjs`
- Modify: `atlas-control-tower/scripts/generate-static-state.mjs`
- Modify: `atlas-control-tower/lib/multisurface-static-api.mjs`
- Test: `atlas-control-tower/test/public-manifest-v3.test.mjs`

**Interfaces:**
- Produces: `NEXO_ATLAS_PUBLIC_MANIFEST_V3`, SRM/ledger/activity descriptors, V2 compatibility surface descriptors.

- [ ] **Step 1: Write failing tests** asserting SHA-256 descriptors for SRM V2, projection ledger, activity ledger, shard catalog, and preservation of V2 surface descriptors.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Materialize** `srm-v2/index.json`, `projection-ledger/index.json`, `activity-ledger/index.json`, and `shards/index.json` inside the fingerprinted snapshot.
- [ ] **Step 4: Generate Manifest V3** from raw artifact bytes and add independent hash verification in the static API reader.
- [ ] **Step 5: Ensure failed hash/readback does not replace cached last-valid manifest/state**.
- [ ] **Step 6: Verify GREEN/full suite** and commit `feat(srm): publish manifest v3 artifacts`.

### Task 6: Atlas adapter migration and generic renderer registry

**Files:**
- Create: `atlas-control-tower/src/api/science-read-model.ts`
- Create: `atlas-control-tower/src/components/ScientificObservationRenderer.tsx`
- Modify: `atlas-control-tower/src/api/types.ts`
- Modify: `atlas-control-tower/src/api/hooks.ts`
- Modify: `atlas-control-tower/src/api/multisurface-adapters.ts`
- Modify: `atlas-control-tower/src/pages/atlas-pages.tsx`
- Modify: `atlas-control-tower/src/pages/CockpitPage.tsx`
- Modify: `atlas-control-tower/src/core/PublicSnapshotSource.ts`
- Test: `atlas-control-tower/test/srm-v2-atlas-consumers.test.mjs`

**Interfaces:**
- Consumes: SRM V2 from static/live client.
- Produces: renderer registry by `kind` with optional metric override.

- [ ] **Step 1: Write failing contract tests** proving Observatory/Universe/Cockpit no longer require DOMAIN nodes and use SRM V2 structure/observations.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Add TypeScript SRM V2 types/parser** and adapter method `getScienceReadModel()`.
- [ ] **Step 4: Add renderer registry**: scalar→ParameterCard, interval→Parameter/Forest grouping, directional→SkyMap, timeseries→trend placeholder component backed only by published points, matrix→heatmap component, distribution→distribution component, categorical→status/evidence component; H0-by-stack remains a metric override.
- [ ] **Step 5: Refactor Observatory/Universe/Cockpit/Lab/Activity consumers** to prefer SRM V2 while retaining compatibility adapters.
- [ ] **Step 6: Verify typecheck, focused tests and full Atlas build**; commit `feat(atlas): consume generic science read model v2`.

### Task 7: NEXO One SRM V2 read APIs

**Files:**
- Create: `nexo-one/server/compiler/science-read-model-v2.mjs`
- Modify: `nexo-one/server/compiler/atlas-research-api.mjs`
- Modify: `nexo-one/server/handler.mjs`
- Test: `nexo-one/test/science-read-model-v2.test.mjs`

**Interfaces:**
- Produces routes `science-read-model`, `science-changes`, `science-observations`, `science-comparisons`, `science-syntheses` from the same public snapshot contract.

- [ ] **Step 1: Write failing tests** for all five GET routes and parity of core SRM fields with the static projection shape.
- [ ] **Step 2: Verify RED** via `npm test -- --test-name-pattern="science read model"` or direct Node test file.
- [ ] **Step 3: Implement compiler/route views** without recomputing missing science or exposing credentials.
- [ ] **Step 4: Add route dispatch and CORS inclusion** in the existing single handler.
- [ ] **Step 5: Verify NEXO One tests/typecheck/build** and commit `feat(nexo-one): expose science read model v2`.

### Task 8: Read-only NEXO MCP over the existing Vercel function

**Files:**
- Create: `nexo-one/server/mcp/server.mjs`
- Create: `nexo-one/server/mcp/tools.mjs`
- Modify: `nexo-one/api/index.js`
- Modify: `nexo-one/server/handler.mjs`
- Modify: `nexo-one/package.json`
- Modify: `nexo-one/package-lock.json`
- Modify: `nexo-one/vercel.json`
- Test: `nexo-one/test/mcp.test.mjs`

**Interfaces:**
- Endpoint: `/api/mcp` using Streamable HTTP.
- Read-only tools: `get_science_state`, `get_changes`, `search_atlas`, `get_program`, `get_campaign`, `get_observations`, `get_h0_stacks`, `get_evidence_chain`, `get_operations`, `get_activity`, `get_provenance`.

- [ ] **Step 1: Write failing MCP tests** for initialize/tool discovery, one representative read call, H0 stack query, and rejection/absence of write-like tools.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Add the official MCP SDK dependency compatible with the current Node runtime** and instantiate one server per stateless request/session policy appropriate to Streamable HTTP.
- [ ] **Step 4: Register only read tools** whose handlers call SRM/Atlas read-model functions, always returning freshness/provenance metadata.
- [ ] **Step 5: Route `/api/mcp` through the existing `api/index.js` function** and verify Vercel config still declares one serverless function.
- [ ] **Step 6: Verify NEXO One tests/typecheck/build** and commit `feat(mcp): expose read-only nexo science server`.

### Task 9: End-to-end sync/readback and compatibility gates

**Files:**
- Modify: `.github/workflows/*` only where current quality/deploy workflows need explicit V3/MCP assertions.
- Test: existing Atlas/NEXO suites plus browser smoke.

**Interfaces:**
- Consumes all previous tasks.
- Produces deployment evidence and promotion readiness.

- [ ] **Step 1: Add/extend CI assertions** for SRM V2 artifact presence, Manifest V3 hash readback, MCP single-function constraint and public privacy gate.
- [ ] **Step 2: Run complete Atlas suite**: `npm test`, `npm run typecheck`, `npm run build`, browser smoke where configured.
- [ ] **Step 3: Run complete NEXO One suite**: `npm run check` plus MCP tests.
- [ ] **Step 4: Open PR** with exact fingerprints/test counts and explicit note that webhook-triggered sync is a non-goal.
- [ ] **Step 5: Merge only after exact-head CI is green**.
- [ ] **Step 6: Read back production Pages Manifest V3/SRM V2 and NEXO One `/api/mcp` initialize/tools/list plus `science-read-model`; verify no private Olympus/client data and record exact production SHA/fingerprints.
