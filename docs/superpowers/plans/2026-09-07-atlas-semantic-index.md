# NEXO Atlas Semantic PT-BR Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate and consume a derived PT-BR cockpit overlay for Science, Learning and Black Box without changing canonical truth.

**Architecture:** Store display-only semantics in `flight_api.atlas_cockpit_index`, keyed by canonical entity id. Runtime loads the overlay independently and merges only display metadata onto graph/entity projections.

**Tech Stack:** PostgreSQL/Neon Data API, Node.js ESM, Vercel, node:test.

**Spec:** `docs/superpowers/specs/2026-09-07-atlas-semantic-index-design.md`

## Global Constraints
- Overlay authority is always `DERIVED_NOT_EVIDENCE`.
- Never mutate `science_v1`, `learning_v1`, `nexo_ops` canonical rows.
- O QUÊ / COMO / POR QUÊ must not contain technical hashes, paths, schema names, commit SHAs or payload dumps.
- When source support is insufficient, write `Não informado na fonte.`.
- Existing Atlas behavior and tests must stay green.

---

### Task 1: Cockpit index schema and access
**Files:** Neon only.
**Produces:** `flight_api.atlas_cockpit_index` readable by `atlas_runtime_readonly`.
- [x] Write schema migration on a temporary Neon branch.
- [x] Verify columns and runtime-role SELECT privilege.
- [x] Apply migration to the canonical branch.

### Task 2: Index canonical sources
**Files:** Neon only.
**Consumes:** Science entities/display rows; Learning observations/patterns/lessons/strategies/policies; Black Box actions/runs/events.
**Produces:** Idempotent overlay rows for all materialized entities.
- [ ] Upsert Science rows with conservative type-aware PT-BR copy.
- [ ] Upsert Learning rows with PT-BR stage semantics and curated short labels.
- [ ] Upsert Black Box rows with operational O QUÊ / COMO / POR QUÊ.
- [ ] Validate coverage, orphan count, authority and technical-leak checks.

### Task 3: Runtime overlay integration
**Files:**
- Modify: `atlas-control-tower/api/runtime.js`
- Test: `atlas-control-tower/test/semantic-index.test.mjs`
**Produces:** `loadCockpitIndex(token, force)` and metadata merge for Science/Learning/Black Box entities.
- [x] Add failing contract tests first.
- [ ] Confirm CI fails because runtime does not yet read the overlay.
- [ ] Implement 60-second cockpit cache and merge helper.
- [ ] Refresh cockpit cache on `/api/sync`.
- [ ] Re-run CI and require green.

### Task 4: Production readback
**Files:** deployment only.
- [ ] Deploy the verified branch to Atlas preview/production.
- [ ] Read `/api/health` and require `v1`, `LIVE`, `usedFallback=false`.
- [ ] Read one Science, one Learning and one Black Box entity and verify `short_label_pt`, `what_pt`, `how_pt`, `why_pt` are present in metadata.
- [ ] Check runtime error clusters/logs after deploy.
- [ ] Report final coverage and any rows using `Não informado na fonte.`.
