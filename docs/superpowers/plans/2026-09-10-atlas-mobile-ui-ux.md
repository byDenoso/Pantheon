# Atlas Mobile + UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEXO Atlas mobile-native and simplify the overall UI/UX while preserving graph semantics, SSOT authority and renderer behavior.

**Architecture:** Keep the graph as the primary surface. Introduce safe-area-aware mobile layout bands, a compact bottom navigation, a responsive cockpit sheet and a mobile performance profile. Shared UI simplifications apply only where they remove duplicated controls or unclear hierarchy.

**Tech Stack:** ES modules, CSS, Canvas/Pixi/Three/Babylon renderer contract, Node Test, Chromium browser smoke, Vercel production bootstrap.

**Spec:** `docs/superpowers/specs/2026-09-10-atlas-mobile-ui-ux-design.md`

## Global Constraints

- Preserve `NEXO -> Ciência/Olympus/Engenharia` hierarchy.
- Associative memory remains overlay-only and `DERIVED_NOT_TRUTH`.
- Filamentos must be reachable on mobile.
- Mobile heavy-renderer fallback remains enforced.
- No change to canonical IDs or SSOT truth ownership.
- Tap targets for primary mobile controls must be at least 44px.
- Validate 375x812 and 393x852 viewports.

---

### Task 1: Add mobile layout regression contracts

**Files:**
- Create: `atlas-control-tower/test/graph-lab-mobile-ui.test.mjs`
- Modify: `atlas-control-tower/test/graph-lab-browser-smoke.mjs`

**Interfaces:**
- Consumes: current Graph Lab DOM and stylesheet contracts.
- Produces: failing assertions for safe areas, bottom navigation, cockpit states and overflow.

- [ ] Write tests asserting `100dvh`, `env(safe-area-inset-bottom)`, mobile bottom navigation with Filamentos, minimum 44px primary targets and responsive cockpit state classes.
- [ ] Extend Chromium smoke with 375x812 and 393x852 viewports and assert `document.documentElement.scrollWidth <= innerWidth`.
- [ ] Assert status, node-action bar and bottom navigation rectangles do not intersect.
- [ ] Run `cd atlas-control-tower && node --test test/graph-lab-mobile-ui.test.mjs` and confirm RED for missing contracts.
- [ ] Commit as `test(atlas): define mobile UX layout contract`.

### Task 2: Establish safe-area mobile frame

**Files:**
- Modify: `atlas-control-tower/graph-lab/styles.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/editorial-observatory-v5.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.css`

**Interfaces:**
- Consumes: existing `.lab-topbar`, `.stage`, `.atlas-status-summary`, `.atlas-node-actions`, `.stage-dock`.
- Produces: non-overlapping mobile layout bands.

- [ ] Replace mobile viewport sizing with `height:100dvh` / `min-height:calc(100dvh - ...)` and safe-area paddings.
- [ ] Define CSS variables `--mobile-top`, `--mobile-nav-h`, `--mobile-safe-bottom` and derive all bottom offsets from them.
- [ ] Remove competing fixed values such as independent `bottom:58px`, `104px`, `92px` where they describe the same stack.
- [ ] Keep the status summary in one top band and node actions in one bottom band.
- [ ] Run the mobile contract test and confirm the safe-area assertions pass.
- [ ] Commit as `fix(atlas): reserve mobile safe layout bands`.

### Task 3: Replace mobile experience bar with primary bottom navigation

**Files:**
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.mjs`
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.css`

**Interfaces:**
- Consumes: `onGoHome`, macro-domain open callbacks and `onToggleFilaments`.
- Produces: mobile nav actions `NEXO`, `CIÊNCIA`, `OLYMPUS`, `ENGENHARIA`, `FILAMENTOS`.

- [ ] Add a mobile semantic nav container using the existing callbacks, not a second navigation state.
- [ ] Keep the desktop Experience bar unchanged.
- [ ] Make each mobile nav button at least 44px high and expose `aria-pressed` for Filamentos.
- [ ] Ensure Filamentos is no longer hidden under `@media(max-width:760px)`.
- [ ] Add active-domain state styling without introducing a new domain source of truth.
- [ ] Run mobile contracts and browser smoke.
- [ ] Commit as `feat(atlas): add mobile primary graph navigation`.

### Task 4: Turn cockpit into a responsive mobile bottom sheet

**Files:**
- Modify: `atlas-control-tower/graph-lab/app.mjs`
- Modify: `atlas-control-tower/graph-lab/styles.css`
- Modify: `atlas-control-tower/graph-lab/cockpit.mjs`

**Interfaces:**
- Consumes: `openCockpit()`, cockpit close, selected node and cockpit tab state.
- Produces: `data-sheet-state="compact|expanded|closed"` and explicit expand/collapse controls.

- [ ] Replace fixed `height:72vh` with compact and expanded CSS states using `dvh` and safe areas.
- [ ] Add a visible drag-handle/expand button in `.cockpit-bar`; do not rely on gesture-only discovery.
- [ ] Compact state should show header + key actions; expanded state allows full scrollable content.
- [ ] Preserve current tab navigation and semantic-memory cockpit content.
- [ ] When sheet is expanded beyond 70% of viewport, call renderer `stop()` or disable auto-orbit; resume on close/compact without rebuilding graph data.
- [ ] Add browser smoke that selects a semantic node, opens cockpit, expands it, switches to Atividade and closes it.
- [ ] Commit as `feat(atlas): make cockpit a mobile bottom sheet`.

### Task 5: Simplify stage controls and remove mobile chrome duplication

**Files:**
- Modify: `atlas-control-tower/graph-lab/styles.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.css`
- Modify: `atlas-control-tower/graph-lab/index.html` only if control grouping requires semantic wrappers.

**Interfaces:**
- Consumes: home/back/zoom/fit/center/flat/motion controls.
- Produces: compact essential-control dock.

- [ ] On mobile keep only Back, Fit, Center and one More menu visible by default.
- [ ] Move zoom, motion, flat mode and renderer tuning into More/Advanced.
- [ ] Hide duplicated focus readout when node action sheet already communicates selected context.
- [ ] Reduce pill-shaped chrome and uppercase microcopy on shared mobile components.
- [ ] Ensure no control duplicates the function of bottom navigation.
- [ ] Run mobile layout tests and screenshots through browser smoke.
- [ ] Commit as `refactor(atlas): simplify mobile stage controls`.

### Task 6: Apply a dedicated mobile renderer performance profile

**Files:**
- Modify: `atlas-control-tower/graph-lab/graph/palette.mjs` or existing centralized preset module.
- Modify: `atlas-control-tower/graph-lab/app.mjs`
- Modify: `atlas-control-tower/graph-lab/graph/renderers/renderer-registry.mjs` only if defaults belong there.

**Interfaces:**
- Consumes: existing `MOBILE` preset and renderer options.
- Produces: deterministic mobile graph budget.

- [ ] Set mobile defaults to fewer labels, lower visible-node budget, reduced glow/fog/drift and no automatic orbit unless explicitly enabled.
- [ ] Prefer Canvas/Pixi for mobile selection while preserving explicit fallback from Three/Babylon.
- [ ] Do not change graph data or hierarchy to meet the budget; only projection/render budgets may change.
- [ ] Add contract tests proving mobile and desktop presets differ without changing node IDs.
- [ ] Run unit tests for all renderer contracts.
- [ ] Commit as `perf(atlas): tune mobile graph rendering budget`.

### Task 7: Improve associative-memory UX on small screens

**Files:**
- Modify: `atlas-control-tower/graph-lab/cockpit.mjs`
- Modify: `atlas-control-tower/graph-lab/styles.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.mjs`

**Interfaces:**
- Consumes: semantic/procedural node metadata and weighted filament edges.
- Produces: compact memory presentation and contextual Filamentos state.

- [ ] Show memory type, status and strongest filament weight in the compact cockpit header.
- [ ] Keep evidence and next discriminant one tap away in Atividade/Integridade instead of dumping full records in compact state.
- [ ] When Filamentos is enabled, expose a small count/state indicator in the bottom nav.
- [ ] Ensure OFF removes overlay nodes from the mobile projection without losing current canonical selection.
- [ ] Add E2E for `FILAMENTOS ON -> select SEM-CROSS-NULL-AUDIT-001 -> cockpit -> evidence -> OFF`.
- [ ] Commit as `feat(atlas): compact associative memory for mobile`.

### Task 8: General UI/UX cleanup shared with desktop

**Files:**
- Modify: `atlas-control-tower/graph-lab/styles.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/editorial-observatory-v5.css`
- Modify: `atlas-control-tower/graph-lab/graph/experience/visual-experience-v4.css`

**Interfaces:**
- Consumes: existing editorial design tokens and state classes.
- Produces: clearer hierarchy with less visual redundancy.

- [ ] Standardize three UI levels: primary action, secondary action, metadata; remove ad-hoc button appearances that duplicate these roles.
- [ ] Keep one visible primary CTA for selected expandable nodes: `ABRIR ...`.
- [ ] Reduce simultaneous translucent surfaces and reserve blur for overlays that actually cover graph content.
- [ ] Normalize typography sizes for entity title, section title, body and metadata.
- [ ] Add explicit loading, empty, stale and error visual states using existing truth/provenance status, never invented health.
- [ ] Verify light/dark and Editorial/Performance variants preserve contrast and layout.
- [ ] Commit as `style(atlas): tighten shared information hierarchy`.

### Task 9: Accessibility and touch behavior

**Files:**
- Modify: `atlas-control-tower/graph-lab/index.html`
- Modify: `atlas-control-tower/graph-lab/app.mjs`
- Modify: `atlas-control-tower/graph-lab/styles.css`

**Interfaces:**
- Consumes: current keyboard controls, search, dialogs/sheets and renderer selection.
- Produces: keyboard/touch/focus-visible behavior.

- [ ] Add `:focus-visible` states to every interactive chrome surface.
- [ ] Ensure bottom sheet and renderer drawer return focus to the control that opened them.
- [ ] Add `aria-expanded`, `aria-controls`, `aria-current` and dialog semantics where appropriate.
- [ ] Respect `prefers-reduced-motion` for sheet transitions, graph drift and filament pulses.
- [ ] Verify no primary action is hover-only or double-click-only.
- [ ] Commit as `fix(atlas): improve touch and keyboard accessibility`.

### Task 10: Final visual regression, CI and production promotion

**Files:**
- Modify: `atlas-control-tower/test/graph-lab-browser-smoke.mjs`
- Modify: `.github/workflows/atlas-quality.yml` only if new viewport commands require it.
- Update production bootstrap after the source commit is green.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: release-quality evidence and pinned production deployment.

- [ ] Run `cd atlas-control-tower && npm test` and require 0 failures.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Run browser smoke for desktop plus 375x812 and 393x852.
- [ ] Validate Canvas/Pixi mobile, heavy-renderer fallback, search, select, ABRIR, Filamentos, semantic cockpit, bottom sheet, back/home and orientation resize.
- [ ] Fail the smoke on horizontal overflow or intersecting reserved UI rectangles.
- [ ] Push the final source commit and wait for Atlas Quality to complete successfully.
- [ ] Pin the standalone Vercel bootstrap to that exact commit.
- [ ] Deploy production, verify `READY`, canonical alias and HTTP 200 readback containing the exact commit SHA.
- [ ] Commit release notes as `docs(atlas): record mobile UX verification`.