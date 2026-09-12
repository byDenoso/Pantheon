# NEXO Atlas Research API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-safe, read-only research aggregation API that gives the Atlas frontend stable graph, observatory, lab and universe contracts from the canonical SSOT.

**Architecture:** Keep `readAtlasSsot()` as source reader. Add a pure `atlas-research-api.mjs` compiler that normalizes safe views, then expose additive GET routes from the existing `handler.mjs`. Do not infer scientific values from prose; absent structured science returns `EMPTY`/`PARTIAL` envelopes.

**Tech Stack:** Node 24 ESM, Vercel serverless handler, node:test, canonical Google Sheets SSOT.

**Spec:** `docs/superpowers/specs/2026-09-12-atlas-research-api-design.md`

## Global Constraints

- GET-only; existing write guard remains unchanged.
- Olympus content is excluded from all public research routes.
- No invented cosmological values, tensions, signals, claims or results.
- Existing NEXO ONE routes remain backward compatible.
- All new endpoints use `NEXO_ATLAS_RESEARCH_API_V1` envelope.

---

### Task 1: Pure research API compiler

**Files:**
- Create: `nexo-one/server/compiler/atlas-research-api.mjs`
- Create: `nexo-one/test/atlas-research-api.test.mjs`

**Interfaces:**
- Consumes: canonical Atlas SSOT snapshot from `readAtlasSsot()`.
- Produces: `buildAtlasResearchView(snapshot, route)` returning the public envelope.

- [ ] Write failing tests for common envelope, Olympus exclusion, graph projection, Science WORK test normalization, and empty observatory scientific products.
- [ ] Run `node --test test/atlas-research-api.test.mjs` and verify RED because the compiler does not exist.
- [ ] Implement the minimal pure compiler and route-specific view builders.
- [ ] Run the focused test and verify PASS.

### Task 2: Handler routes

**Files:**
- Modify: `nexo-one/server/handler.mjs`
- Create: `nexo-one/test/atlas-research-routes.test.mjs`

**Interfaces:**
- Consumes: `buildAtlasResearchView(snapshot, route)` from Task 1.
- Produces: public GET endpoints for graph/observatory/lab/universe.

- [ ] Write failing route tests proving the route allowlist, SSOT read, compiler dispatch and GET-only behavior.
- [ ] Run focused route tests and verify RED.
- [ ] Add additive route dispatch before the legacy route allowlist.
- [ ] Run focused route tests and verify PASS.

### Task 3: Full regression and deployment readiness

**Files:**
- Modify only if regression demands it: `nexo-one/vercel.json` or tests.

**Interfaces:**
- Consumes: completed compiler and handler routes.
- Produces: release-ready NEXO ONE backend.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Verify public privacy tests still pass and no existing route changed semantics.
- [ ] Deploy preview and read back at least `atlas-graph`, `observatory-summary`, `lab-tests`, and `universe-snapshot`.
- [ ] Promote only after preview verification and perform production readback.