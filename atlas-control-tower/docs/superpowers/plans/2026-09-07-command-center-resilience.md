# NEXO Atlas Command Center + Resilient Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Atlas home decision-first and resilient while reducing initial backend work without changing Truth Owners or the graph contract.

**Architecture:** Add a pure command-center presentation module fed by existing health/ops/learning/state APIs, decouple graph and summary completion in the session, and add a static root fast path plus cheap health probe in the science runtime. Keep all existing graph/Black Box/Learning drill-down behavior.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, Vercel Node functions, Neon Data API/PostgREST.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-07-command-center-resilience-design.md`

## Global Constraints

- Atlas remains read-only projection; it never becomes a Truth Owner.
- No new database, schema, agent, scheduler, recurring loop, or dependency.
- Existing graph contract remains backward compatible.
- Missing auxiliary data degrades locally and preserves previously rendered state.
- science_v1, learning_v1 and nexo_ops authority boundaries remain unchanged.

---

### Task 1: Decouple graph and summary reads

**Files:**
- Modify: `atlas-control-tower/lib/graph-session.mjs`
- Create: `atlas-control-tower/test/graph-session-resilience.test.mjs`

**Interfaces:**
- Consumes: `api.graph(query): Promise<Graph>` and `api.state(filters): Promise<Summary>`
- Produces: session events `graph`, `summary`, `graph-error`, `summary-error`; `refresh(): Promise<Graph|null>`

- [ ] **Step 1: Write failing tests**

Create tests that construct `createSession()` with deferred `graph()` and `state()` promises. Assert that resolving graph first emits `graph` before summary settles, resolving summary later emits `summary`, summary rejection emits only `summary-error` while preserving graph, graph rejection emits `graph-error` while a later summary can still update `state.summary`, and an older refresh cannot overwrite a newer one.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/graph-session-resilience.test.mjs`
Expected: FAIL because current `Promise.all` emits only a combined `graph` event and treats either rejection as one global error.

- [ ] **Step 3: Implement independent settling**

In `refresh()`, start both reads concurrently under the same `seq`. Each promise updates only its own state and emits its own event when `seq === loadSeq`. Await `Promise.allSettled([graphRead, summaryRead])` before returning so manual sync semantics remain complete.

- [ ] **Step 4: Run focused test and full suite**

Run: `node --test test/graph-session-resilience.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: 0 failures.

---

### Task 2: Add bounded browser timeouts

**Files:**
- Modify: `atlas-control-tower/lib/atlas-api.mjs`
- Modify: `atlas-control-tower/test/atlas-api.test.mjs`

**Interfaces:**
- `createApi({fetchImpl, timeout=20000, syncTimeout=65000, maxEntries=64})`
- `request(..., {timeoutMs})`

- [ ] **Step 1: Add failing timeout tests**

Patch `AbortSignal.timeout` inside the test process to record requested durations. Assert ordinary `graph()` uses 20000 ms and `sync()` uses 65000 ms by default.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test test/atlas-api.test.mjs`
Expected: FAIL because current API uses 65000 ms for every route.

- [ ] **Step 3: Implement split timeouts**

Add `syncTimeout`, let `request` accept `timeoutMs=timeout`, and pass `timeoutMs:syncTimeout` only from `sync()`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/atlas-api.test.mjs`
Expected: PASS.

---

### Task 3: Add backend fast root and cheap health

**Files:**
- Create: `atlas-control-tower/lib/system-overview.mjs`
- Create: `atlas-control-tower/test/system-overview.test.mjs`
- Modify: `atlas-control-tower/api/runtime.js`
- Modify: `atlas-control-tower/vercel.json`
- Modify: `atlas-control-tower/frontend-files.mjs`

**Interfaces:**
- `isFastRootQuery(query): boolean`
- `systemRootGraph(): GraphContractV1-compatible object`

- [ ] **Step 1: Write failing pure tests**

Assert `isFastRootQuery({focus:'system:NEXO', mode:'children', depth:'1'}) === true`, while depth 2, search mode, status/type/domain/authority/query/since filters are false. Assert `systemRootGraph()` contains `system:NEXO` plus SCIENCE, ENGINEERING, OLYMPUS, AUTOMATION and LEARNING and exactly five `CONTAINS` edges.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test test/system-overview.test.mjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement helper and runtime routing**

Import the helper into `api/runtime.js`. Before `loadScience(token)`, if `route==='graph' && isFastRootQuery(q)`, return `systemRootGraph()`. Change `/health` so the one-row `science_v1.entities` probe sets health and returns immediately; include fingerprint/sourceVersion only from an already-populated `scienceCache`.

- [ ] **Step 4: Publish helper as a static/runtime source file**

Add `lib/system-overview.mjs` to the explicit Vercel builds list and frontend/public manifest only if the existing manifest contract requires all shipped source modules to be declared.

- [ ] **Step 5: Verify focused tests**

Run: `node --test test/system-overview.test.mjs`
Expected: PASS.

---

### Task 4: Build the decision-first Command Center

**Files:**
- Create: `atlas-control-tower/ui/control-tower.mjs`
- Create: `atlas-control-tower/ui/control-tower.css`
- Create: `atlas-control-tower/test/control-tower.test.mjs`
- Modify: `atlas-control-tower/index.html`
- Modify: `atlas-control-tower/app.mjs`
- Modify: `atlas-control-tower/vercel.json`
- Modify: `atlas-control-tower/frontend-files.mjs`

**Interfaces:**
- `buildControlTowerModel({health, ops, learning, summary, lastSeenAt, now}): ControlTowerModel`
- `renderControlTower(root, model, {onFocus})`
- `loadControlTower(api, {summary, lastSeenAt, now}): Promise<ControlTowerModel>`

- [ ] **Step 1: Write failing model tests**

Use fixture objects matching the live API shapes. Assert the model exposes: source states; two blocked actions; `16/16` readback coverage; recent events newer than `lastSeenAt`; promoted learning items; and scientific counts when summary exists. Add degraded fixtures where health/ops/learning/summary are independently null and assert the model stays renderable.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test test/control-tower.test.mjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure model and renderer**

Render four sections in one compact panel: `SAÚDE`, `AGORA`, `MUDOU DESDE A ÚLTIMA VISITA`, and `PRÓXIMAS DECISÕES`. Use existing `esc()` and no inline evidence claims beyond the published fields. Blocker buttons focus Black Box; health/source buttons focus the relevant system; graph CTA scrolls/focuses the existing map workspace.

- [ ] **Step 4: Integrate non-blocking loading**

Insert `<section id="command-center">` before the graph toolbar. In `app.mjs`, capture `atlas.commandCenterSeenAt` before load, start health/ops/learning loads independently from `session.refresh()`, render an initial command-center model as results settle, and persist the new seen timestamp only after at least one auxiliary source succeeds. On `summary` event, refresh only summary-dependent command-center/scientific metrics.

- [ ] **Step 5: Split graph rendering from summary rendering**

Refactor the existing session listener into a graph path that updates the map, recorte, Black Box, breadcrumbs and provenance, and a summary path that updates metrics/source status/charts plus the command-center corpus counts. `summary-error` must show local unavailable text without firing the graph failure toast.

- [ ] **Step 6: Add responsive CSS and public assets**

Use the existing theme tokens. Desktop: health/attention cards in a dense grid above the map. Mobile: single column, no horizontal overflow, buttons remain touch-sized. Add CSS/JS to Vercel builds and frontend manifest.

- [ ] **Step 7: Verify focused test**

Run: `node --test test/control-tower.test.mjs`
Expected: PASS.

---

### Task 5: Regression verification and promotion

**Files:**
- Review all modified files

- [ ] **Step 1: Run complete tests**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 2: Verify public manifest and HTML wiring**

Run the existing frontend manifest/static tests plus the complete suite. Confirm `index.html` references `control-tower.css`, `app.mjs` imports `control-tower.mjs`, and `vercel.json` exposes every new shipped file.

- [ ] **Step 3: Deploy preview/production candidate**

Promote only the green branch commit through the existing Vercel project workflow. Do not change Neon schemas or Truth Owner data.

- [ ] **Step 4: Live readback**

Fetch `/api/health`, `/api/graph?focus=system:NEXO&depth=1`, `/api/state` and `/api/ops` from the deployed URL. Confirm HTTP 200, root graph has six nodes, health reports science_v1 healthy, state remains populated, and ops still reports readback data.

- [ ] **Step 5: UI smoke readback**

Open the deployed page and verify the Command Center appears before the graph, blocker counts match `/api/ops`, the map still navigates to Science/Black Box/Learning, and a summary/API auxiliary failure cannot blank the graph.
