# Atlas Neural V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a parallel Atlas V3 read path where TOWER_V06 is the sole operational authority and the browser consumes a deterministic projection through one SDK.

**Architecture:** Keep the current Atlas untouched while adding pure V3 contracts, a deterministic projector and a read-only SDK. Reconcile authority documents first, then prove the new path with node:test before integrating the visual shell.

**Tech Stack:** Node.js ESM, node:test, React/TypeScript for later UI integration, GitHub Pages/static artifacts.

**Spec:** `docs/superpowers/specs/2026-09-14-atlas-neural-v3.md`

## Global Constraints

- Canonical operational authority is `byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06`.
- Atlas is projection-only and cannot write back to TOWER_V06.
- Drive cannot override operational truth.
- Inter-domain entities project as `FILAMENT` nodes/relations.
- Public projection must exclude personal Olympus/client data.
- Failed projection must preserve the last valid snapshot.
- V3 is parallel until verified; do not delete legacy runtime merely to simplify architecture.

---

### Task 1: Reconcile authority

**Files:**
- Modify: `NEXO_ARCHITECTURE.md`
- Modify: `NEXO_AUTHORITY.json`
- Modify: `NEXO_BOOTSTRAP.md`
- Modify: `NEXO_SYSTEM_STATE.json`

**Interfaces:**
- Consumes: `TOWER_V06/CONTROL.json` authority contract.
- Produces: one unambiguous authority declaration for every architecture-sensitive agent.

- [ ] Update the four authority files to declare TOWER_V06 as sole operational truth.
- [ ] Preserve Drive as evidence/artifact/legacy projection only.
- [ ] Preserve GitHub/Pantheon as code/projection/presentation authority only.
- [ ] Verify no updated file still calls Drive the mutable operational SSOT.

### Task 2: Projection V3 contract

**Files:**
- Create: `atlas-control-tower/v3/contracts.mjs`
- Create: `atlas-control-tower/v3/project.mjs`
- Test: `atlas-control-tower/test/atlas-v3-projection.test.mjs`

**Interfaces:**
- Consumes: `{ control, entities, sourceVersion, generatedAt, completeness }`.
- Produces: `buildAtlasProjectionV3(input) -> snapshot`.

- [ ] Write a failing node:test asserting `authority === 'TOWER_V06'`, `projectionOnly === true`, deterministic fingerprinting and filament projection.
- [ ] Run `node --test test/atlas-v3-projection.test.mjs` and observe failure before implementation.
- [ ] Implement stable normalization, graph edges, learning filaments, operations projection, health and provenance.
- [ ] Run the focused test and require PASS.

### Task 3: Atlas Data SDK V3

**Files:**
- Create: `atlas-control-tower/v3/sdk.mjs`
- Test: `atlas-control-tower/test/atlas-v3-sdk.test.mjs`

**Interfaces:**
- Consumes: validated Atlas Projection V3 snapshot.
- Produces: `createAtlasV3Sdk(snapshot)` with `manifest`, `graph`, `entity`, `learning`, `operations`, `search`.

- [ ] Write a failing SDK test using a real Projection V3 fixture generated in-memory.
- [ ] Implement strict snapshot validation and read-only accessors.
- [ ] Verify search and layer reads never call alternate truth providers.
- [ ] Run focused SDK tests and require PASS.

### Task 4: Static publication boundary

**Files:**
- Create: `atlas-control-tower/scripts/generate-atlas-v3-state.mjs`
- Create: `atlas-control-tower/test/atlas-v3-static-contract.test.mjs`

**Interfaces:**
- Consumes: canonical export JSON supplied to the script.
- Produces: `public/data/v3/snapshots/<fingerprint>/snapshot.json` and `public/data/v3/current/manifest.json`.

- [ ] Test atomic current-manifest behavior and immutable fingerprint directory naming.
- [ ] Implement file publication using temp directory then rename.
- [ ] Do not replace current manifest when validation fails.
- [ ] Run focused static publication tests and require PASS.

### Task 5: Neural visual shell

**Files:**
- Create: `atlas-control-tower/src/v3/AtlasNeuralV3Page.tsx`
- Create: `atlas-control-tower/src/v3/atlas-neural-v3.css`
- Create: `atlas-control-tower/src/v3/useAtlasV3Snapshot.ts`
- Modify: routing only after the static projection tests pass.

**Interfaces:**
- Consumes: Atlas SDK V3 only.
- Produces: one spatial workspace with `SCIENCE`, `LEARNING`, `OPERATIONS`, `EVIDENCE`, `PROVENANCE`, `HEALTH` layers.

- [ ] Render graph stage, context rail, inspector and bottom operations strip from the same snapshot.
- [ ] Project inter-domain learning as visually distinct filaments.
- [ ] Keep layer changes as presentation state, never alternate data sources.
- [ ] Add an explicit V3 route without replacing the verified legacy route yet.

### Task 6: Verification and cutover gate

**Files:**
- Modify CI only after focused V3 tests are green.

**Interfaces:**
- Consumes: V3 tests, typecheck, build and production readback.
- Produces: a cutover decision, not an automatic legacy deletion.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Publish V3 preview.
- [ ] Verify public readback, fingerprint, graph, learning filaments and operations layer.
- [ ] Keep old Atlas as fallback until parity is proven.