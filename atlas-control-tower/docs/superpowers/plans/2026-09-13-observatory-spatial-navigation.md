# Observatory Spatial Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Graphs as a top-level product area and make Observatory the full-bleed Canvas 2.5D spatial navigation surface.

**Architecture:** Legacy `/graphs` URLs normalize into Observatory. The existing graph projection/session logic remains authoritative for spatial context, while a new Observatory spatial surface reuses the Graphs workspace semantics. Pixi Canvas remains the sole product renderer; pure camera helpers provide the 2.5D projection model and UI controls manipulate that camera without exposing WebGL as a product mode.

**Tech Stack:** React, TypeScript, PixiJS 8, GSAP, Vite, Node test runner, Playwright in GitHub Actions.

**Spec:** `atlas-control-tower/docs/superpowers/specs/2026-09-13-observatory-spatial-navigation-design.md`

## Global Constraints

- Do not invent scientific data or syntheses.
- Preserve Drive/GitHub authority and the sovereign static runtime.
- Canvas/Pixi 2.5D is the default and normal product renderer.
- Never reintroduce `app.destroy(true)`; Pixi normal teardown keeps `releaseGlobalResources: false`.
- `/graphs` remains a compatibility input, not a visible product area.
- Mobile touch targets remain at least 44 px and layout uses safe-area-aware `100dvh`.

---

### Task 1: Route and navigation contract

**Files:**
- Modify: `atlas-control-tower/src/atlas-route.ts`
- Modify: `atlas-control-tower/src/App.tsx`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`

**Interfaces:**
- `AtlasArea = 'observatory' | 'lab' | 'universe'`
- `readAtlasRoute()` accepts legacy `/graphs` and returns `area: 'observatory'` with preserved context.
- `routeFor()` only generates current product routes.

- [ ] Write failing tests that require no `GRAFOS` primary nav item, brand/search/sidebar graph actions to target Observatory, and `/graphs/science/d7` to normalize to Observatory with D7 context.
- [ ] Run the new test and confirm it fails on current navigation/routing.
- [ ] Implement route normalization and App navigation changes.
- [ ] Run route/navigation tests until green.
- [ ] Commit `refactor: make observatory the spatial entrypoint`.

### Task 2: Observatory owns the spatial workspace

**Files:**
- Create: `atlas-control-tower/src/pages/ObservatorySpatialMap.tsx`
- Modify: `atlas-control-tower/src/pages/atlas-pages.tsx`
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/design/spatial-interface.css`
- Modify: `atlas-control-tower/src/design/mobile.css`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`

**Interfaces:**
- `ObservatorySpatialMap` consumes `AtlasUiState`, `AtlasActions`, `reducedMotion`, `compact` and observational panel content.
- Reuses `buildLiveProjection`, `GraphRenderer`, `SpatialInspector`, `AtlasContextBar`.

- [ ] Add failing assertions that Observatory renders `GraphRenderer`, `SpatialInspector`, Context Bar and spatial HUD while the old compact graph card and `ABRIR NO MODO GRAFOS` disappear.
- [ ] Extract/adapt the existing Graphs workspace into `ObservatorySpatialMap`.
- [ ] Convert H0/tension/directional/snapshot panels into a retractable Observatory signals drawer layered around the full-bleed map.
- [ ] Make the Observatory canvas fill the route viewport on desktop and mobile without horizontal overflow.
- [ ] Run focused tests and commit `feat: move spatial graph into observatory`.

### Task 3: Product renderer policy

**Files:**
- Modify: `atlas-control-tower/src/graph-engine/GraphRenderer.tsx`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`
- Test: `atlas-control-tower/test/renderer-policy.test.mjs`

**Interfaces:**
- `GraphRenderer(props)` always returns `GraphExplorer` for the normal product path.
- `GraphScene3D` remains rollback/experimental code only and is not selectable from product UI.

- [ ] Add failing test that rejects a visible WebGL renderer switch and requires Canvas-only product rendering.
- [ ] Remove renderer query switching and product-facing WebGL button.
- [ ] Keep GraphScene3D source untouched unless existing tests require compatibility exports.
- [ ] Run renderer tests and commit `refactor: make canvas 25d the product renderer`.

### Task 4: Pure 2.5D camera model and navigation controls

**Files:**
- Create: `atlas-control-tower/src/graph-engine/camera-25d.mjs`
- Modify: `atlas-control-tower/src/graph-engine/GraphExplorer.tsx`
- Modify: `atlas-control-tower/src/pages/ObservatorySpatialMap.tsx`
- Test: `atlas-control-tower/test/camera-25d.test.mjs`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`

**Interfaces:**
- `projectPoint25d(point, camera)`
- `depthScale25d(z, camera)`
- `depthOpacity25d(z, camera)`
- `worldToScreen25d(point, camera)`
- perspective presets: `flat | balanced | deep`
- GraphExplorer accepts optional camera command/event integration without moving Atlas session authority into the renderer.

- [ ] Write failing math tests for deterministic projection, bounded scale/opacity and visible difference between Flat/Balanced/Deep.
- [ ] Implement pure camera helpers.
- [ ] Wire GraphExplorer projection/tilt to camera presets and reduced-motion rules.
- [ ] Add HUD buttons for zoom, center/reset and perspective preset alongside back/forward/home/LOD/focus.
- [ ] Ensure Home/+/−/F/Escape and existing pointer/touch navigation are non-conflicting.
- [ ] Run tests and commit `feat: add controllable canvas 25d camera`.

### Task 5: Search, deep links and spatial continuity

**Files:**
- Modify: `atlas-control-tower/src/App.tsx`
- Modify: `atlas-control-tower/src/atlas-route.ts`
- Modify as needed: `atlas-control-tower/src/components/GlobalSearch.tsx`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`
- Test as needed: `atlas-control-tower/test/theme-and-deeplinks.test.mjs`

**Interfaces:**
- Search navigates to Observatory with query/context.
- Legacy `/graphs` and browser back/forward preserve graph session focus/path where declared.

- [ ] Add failing search/deep-link assertions.
- [ ] Route search focus and graph sidebar/domain links through Observatory.
- [ ] Preserve graphPath/domain context when normalizing legacy routes.
- [ ] Run route/search/deep-link tests and commit `feat: preserve spatial context in observatory routes`.

### Task 6: Mobile and accessibility polish

**Files:**
- Modify: `atlas-control-tower/src/design/mobile.css`
- Modify: `atlas-control-tower/src/design/spatial-interface.css`
- Modify: `atlas-control-tower/src/graph-engine/SpatialInspector.tsx` if required for bottom-sheet state
- Test: `atlas-control-tower/test/graph-v2-mobile-layout.test.mjs`
- Test: `atlas-control-tower/test/premium-ux-foundation.test.mjs`
- Test: `atlas-control-tower/test/observatory-spatial-navigation.test.mjs`

**Interfaces:**
- Mobile Observatory uses full viewport canvas, compact dock and safe-area-aware inspector sheet.
- DOM accessibility mirror remains present.

- [ ] Add failing assertions for Observatory full-height canvas, 44px controls and no graph-tab dependency.
- [ ] Apply responsive CSS and bottom-sheet layering.
- [ ] Preserve reduced motion and keyboard/a11y mirror.
- [ ] Run focused mobile/a11y tests and commit `fix: harden observatory spatial mobile ux`.

### Task 7: Browser lifecycle smoke, CI and release

**Files:**
- Modify: `.github/workflows/atlas-pages-fallback.yml`
- Modify: `atlas-control-tower/test/pages-graph-lifecycle-smoke-contract.test.mjs`
- Test: full `atlas-control-tower/test/*.test.mjs`

**Interfaces:**
- Browser receipt: `OBSERVATORY_SPATIAL_NAVIGATION_OK`
- Existing receipt `GRAPH_LIFECYCLE_SMOKE_OK` remains.

- [ ] Add failing workflow-contract assertion requiring Observatory-first lifecycle smoke.
- [ ] Update Playwright smoke: open Observatory, wait for Pixi canvas, select/open a graph node when available, exercise back, navigate Lab, verify canvas detached, return Observatory, verify canvas remounted, ensure no `pageerror`, `/api`, Vercel or Neon requests.
- [ ] Run complete test suite.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Review PR diff for data/provenance changes, hidden retired-runtime calls and Pixi teardown regression.
- [ ] Open PR, wait for Atlas Quality, merge only when green.
- [ ] Validate Pages deploy/readback on the merged SHA and confirm `OBSERVATORY_SPATIAL_NAVIGATION_OK` plus static-state readback.
