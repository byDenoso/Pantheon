# NEXO Console V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Atlas-only experience with one production app that exposes live NEXO state, material activity, evolution, capabilities and the current 3-task topology while preserving canonical truth ownership.

**Architecture:** Keep the existing framework-free Vercel shape: static SPA + one Node serverless API. `Neon.nexo_ops` is the fast derived read model; the API explicitly marks degraded fallback when no supported Neon URL is configured. GitHub holds the complete source; the existing Vercel project remains the deployment target.

**Tech Stack:** HTML/CSS/vanilla JS, Node 24, `@neondatabase/serverless`, Node built-in test runner, Vercel serverless functions.

**Spec:** `docs/superpowers/specs/2026-09-05-nexo-console-v1-design.md`

## Global Constraints

- No new scheduler, agent, database, truth owner or recurring pipeline.
- `nexo_ops` remains DERIVED/RECONSTRUCTIBLE; canonical Drive/Tower/Git/runtime always wins.
- Production UI must never label embedded fallback as LIVE.
- Journal and Guardian are historical/retired in the current topology and hidden by default.
- Database URL lookup order: `DATABASE_URL`, `POSTGRES_URL`, `NEON_DATABASE_URL`.
- All material details show provenance when a source pointer exists.
- Evolution claims without a closed measurement gate render as `COLLECTING BASELINE`.

---

### Task 1: Data contract and degraded/live semantics

**Files:**
- Create: `lib/nexo-data.js`
- Create: `test/nexo-data.test.js`
- Create: `package.json`

**Interfaces:**
- Produces: `chooseDatabaseUrl(env)`, `deriveSync(syncRows, now)`, `shapePayload(input)`, `fallbackPayload(reason)`.
- Consumes: plain row objects returned from `nexo_ops` queries.

- [ ] **Step 1: Write failing tests** covering environment alias precedence, fallback labeling, retired-role filtering, live sync derivation, and material-event filtering.
- [ ] **Step 2: Run `npm test` and verify failures are caused by missing implementation.**
- [ ] **Step 3: Implement the minimal pure data helpers.**
- [ ] **Step 4: Run `npm test`; require all Task 1 tests PASS.**
- [ ] **Step 5: Commit `test: define NEXO Console data contract`.**

### Task 2: Live `/api/nexo` reader

**Files:**
- Create: `api/nexo.js`
- Modify: `lib/nexo-data.js`
- Create: `test/api-contract.test.js`

**Interfaces:**
- Consumes: the helpers from Task 1 and a supported Neon connection environment variable.
- Produces: JSON `{source, lanes, roles, attention, runtime, sync, evolution, capabilities}`.

- [ ] **Step 1: Write a failing API-contract test** that asserts supported env aliases and explicit degraded fallback behavior.
- [ ] **Step 2: Run the focused test and verify RED.**
- [ ] **Step 3: Implement Neon reads for `current_state`, `active_attention`, `runtime_events`, and `sync_state`; catch failures and return `fallbackPayload`.**
- [ ] **Step 4: Run focused + full tests and verify GREEN.**
- [ ] **Step 5: Commit `feat: read NEXO operational projection`.**

### Task 3: Unified app shell and NOW

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `test/ui-smoke.test.js`

**Interfaces:**
- Consumes: `/api/nexo` payload.
- Produces: SPA navigation with NOW, ACTIVITY, EVOLUTION, CAPABILITIES, SYSTEM and PRESENT entry points.

- [ ] **Step 1: Write failing UI smoke tests** for navigation labels, three domain cards, sync-state marker, `Since last refresh`, and degraded-banner marker.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Implement static shell, responsive layout, fetch/refresh behavior and NOW rendering.**
- [ ] **Step 4: Run tests and local static smoke; verify GREEN.**
- [ ] **Step 5: Commit `feat: add NEXO Console shell and NOW`.**

### Task 4: Flight Recorder, Evolution and Capabilities

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `lib/nexo-data.js`
- Modify: `test/nexo-data.test.js`
- Modify: `test/ui-smoke.test.js`

**Interfaces:**
- Consumes: recent material runtime events plus canonical baseline facts embedded with explicit source/freshness labels.
- Produces: causal flight cards, measured before/after cards, baseline-gated metrics, and capability-state cards.

- [ ] **Step 1: Add failing tests** that NO_OP heartbeats are de-emphasized, architecture consolidation renders `5 -> 3`, prompt-size delta renders `40,452 -> 18,910 (-53.3%)`, and unproven runtime gains render `COLLECTING BASELINE`.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement the three views with source labels and drill-down panels.**
- [ ] **Step 4: Verify all tests GREEN.**
- [ ] **Step 5: Commit `feat: add flight recorder evolution and capabilities`.**

### Task 5: Current SYSTEM topology and historical toggle

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `test/ui-smoke.test.js`

**Interfaces:**
- Consumes: active role/current-state rows and retired-role rows.
- Produces: current topology with Continuity, Scientific Core, Executor and three lanes; optional historical Journal/Guardian overlay.

- [ ] **Step 1: Add failing smoke tests** for exactly three current operational task labels and a separate historical toggle.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement topology view and retired-role toggle.**
- [ ] **Step 4: Verify GREEN and mobile fallback list rendering.**
- [ ] **Step 5: Commit `feat: align Atlas with three-task runtime`.**

### Task 6: Vercel packaging, source verification and production readback

**Files:**
- Create: `vercel.json`
- Create: `README.md`
- Modify: `.github/workflows/apply-project-atlas-v3.yml` only if the old blocked migration workflow would confuse the new source-of-truth state; otherwise leave historical workflow untouched.

**Interfaces:**
- Produces: deployable framework-free package for existing `nexo-research-os-live`.

- [ ] **Step 1: Add a failing packaging test** asserting `vercel.json` rewrites application routes to `index.html` while preserving `/api/*`.
- [ ] **Step 2: Verify RED, then add minimal Vercel config and README.**
- [ ] **Step 3: Run `npm test` and a local HTTP smoke test for static routes/API fallback.**
- [ ] **Step 4: Push the verified files to the GitHub feature branch and compare branch against `main`.**
- [ ] **Step 5: Attempt deployment to the existing Vercel project using the connected Vercel MCP. Do not create a second project if the tool cannot target the existing project.**
- [ ] **Step 6: Read back `/`, `/api/nexo`, runtime errors and deployment metadata. Require: HTTP 200, new shell markers present, API `source` truthfully LIVE or DEGRADED, and no new runtime-error cluster.**
- [ ] **Step 7: Only after verified production readback, merge/version the Git branch as appropriate; otherwise leave the feature branch intact and report the exact remaining deployment/environment blocker.**
