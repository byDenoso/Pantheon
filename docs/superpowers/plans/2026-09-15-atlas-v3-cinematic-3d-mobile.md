# Atlas Neural V3 Cinematic 3D + Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone V3 SVG surface with a cinematic, navigable 3D graph that is robust on mobile while preserving the TOWER_V06 Projection V3 authority boundary.

**Architecture:** Promote `/atlas-v3/` from a copied `public/` static page to a Vite multi-page React entry. Reuse the repository's already-tested React Three Fiber `AtlasCanvas`/scene primitives instead of creating a second WebGL engine, and adapt Projection V3 into a presentation graph with NEXO/cluster hubs that never enter canonical state. Responsive chrome is React/CSS: desktop HUD + inspector, mobile full-screen canvas + bottom-sheet inspector and compact controls. WebGL fallback remains functional through the existing Canvas fallback.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Three.js 0.185, @react-three/fiber 9.7, @react-three/drei 10.7, Node test runner, Playwright in Pages CI.

**Spec:** `docs/superpowers/specs/2026-09-15-atlas-v3-cinematic-3d-mobile-design.md`

## Global Constraints

- TOWER_V06 remains the sole operational authority.
- Browser remains read-only and consumes Projection V3 only.
- Public projection remains privacy allowlist-first.
- NEXO and cluster hubs are presentation-only.
- No blank-canvas failure: retain Canvas fallback.
- Mobile controls use 44px minimum hit targets, `100dvh`, safe-area insets, and touch-capable camera controls.
- Respect `prefers-reduced-motion`.
- Merge only after tests, typecheck, build, desktop/mobile browser smoke, Pages deploy and HTTP readback pass.

---

### Task 1: Lock the regression contracts

**Files:**
- Create: `atlas-control-tower/test/atlas-v3-cinematic-contract.test.mjs`
- Create: `atlas-control-tower/test/atlas-v3-mobile-contract.test.mjs`
- Modify: `.github/workflows/atlas-pages-fallback.yml`

**Interfaces:**
- Consumes: current V3 page and build contract.
- Produces: tests that require a bundled R3F V3 entry, mobile sheet/HUD markers, WebGL fallback, reduced-motion support, and multi-viewport Playwright smoke.

- [ ] Write failing static-contract tests asserting `/atlas-v3/` is a Vite input, V3 imports `AtlasCanvas`, no longer ships the legacy SVG renderer, exposes `data-testid="atlas-v3-stage"`, mobile inspector sheet, safe-area CSS, reduced-motion handling and presentation-only graph adapter.
- [ ] Run `npm test -- --test-name-pattern="Atlas V3 cinematic|Atlas V3 mobile"` and confirm RED on the current SVG implementation.
- [ ] Extend Pages smoke with 390x844 portrait, 844x390 landscape and 768x1024 tablet V3 pages; assert canvas/fallback visible, no horizontal overflow, 44px controls, inspector reachable after selecting a node, and no page errors.
- [ ] Commit the regression contracts.

### Task 2: Add Projection V3 scene adapter

**Files:**
- Create: `atlas-control-tower/src/atlas-v3/types.ts`
- Create: `atlas-control-tower/src/atlas-v3/projection.ts`
- Create: `atlas-control-tower/src/atlas-v3/scene-adapter.ts`
- Test: `atlas-control-tower/test/atlas-v3-scene-adapter.test.mjs`

**Interfaces:**
- Consumes: `ATLAS_PROJECTION_V3` manifest/snapshot and `scene/types.ts` `AtlasGraph`.
- Produces: `loadAtlasV3Snapshot(baseUrl): Promise<AtlasV3Snapshot>` and `buildAtlasV3Scene(snapshot): { graph: AtlasGraph; focusId: string; canonicalIds: Set<string> }`.

- [ ] Write failing adapter tests for authority/fingerprint validation, presentation-only NEXO root, cluster hubs, canonical-node preservation and interdomain edges.
- [ ] Run focused tests and confirm RED.
- [ ] Implement strict typed loader and adapter. Generate `__PRESENTATION_NEXO__` plus deterministic `__PRESENTATION_CLUSTER__:<cluster>` nodes, mark them `presentationOnly:true`, assign canonical nodes with `layoutParent` without mutating snapshot objects, and connect presentation hierarchy using `CONTAINS` edges.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit adapter implementation.

### Task 3: Promote V3 to a bundled React/R3F page

**Files:**
- Create: `atlas-control-tower/atlas-v3/index.html`
- Create: `atlas-control-tower/src/atlas-v3/main.tsx`
- Create: `atlas-control-tower/src/atlas-v3/AtlasV3App.tsx`
- Modify: `atlas-control-tower/vite.config.ts`
- Delete: `atlas-control-tower/public/atlas-v3/index.html`
- Delete: `atlas-control-tower/public/atlas-v3/atlas-v3.js`

**Interfaces:**
- Consumes: Task 2 loader/adapter and existing `AtlasCanvas`.
- Produces: bundled `/atlas-v3/` page with actual 3D orbit/pan/zoom/touch navigation and Canvas fallback.

- [ ] Add Vite multi-page inputs for root `index.html` and `atlas-v3/index.html` while preserving Pages `--base=/Pantheon/` behavior.
- [ ] Implement `AtlasV3App`: load manifest/snapshot, adapt scene, render `AtlasCanvas`, search/focus/select state, layers, inspector, loading/error states, Tower metadata and home/reset behavior.
- [ ] Use existing `AtlasCanvas` OrbitControls for one-finger orbit, pinch/dolly and pan. Selection focuses the inspector; explicit focus/search updates `focusId` and triggers the existing camera recenter transition.
- [ ] Remove legacy SVG renderer files so two renderer implementations cannot drift.
- [ ] Run cinematic contracts, typecheck and build.
- [ ] Commit bundled V3 page.

### Task 4: Mobile-first responsive shell and UX sweep

**Files:**
- Create: `atlas-control-tower/src/atlas-v3/atlas-v3.css`
- Modify: `atlas-control-tower/src/atlas-v3/AtlasV3App.tsx`
- Modify: `atlas-control-tower/src/scene/AtlasCanvas.tsx`

**Interfaces:**
- Consumes: Task 3 app and existing scene.
- Produces: desktop cinematic HUD plus mobile full-screen graph, bottom-sheet inspector and adaptive rendering quality.

- [ ] Implement full-screen `100dvh` shell, safe-area padding, no horizontal overflow, compact top HUD, scrollable layer rail, desktop floating inspector and mobile bottom sheet.
- [ ] Enforce 44px controls and visible keyboard focus. Remove hover-only affordances and keep selected/focused labels accessible.
- [ ] Add compact/mobile renderer quality: cap Canvas DPR to `[1,1.5]` when compact, lower semantic LOD/label budgets, lower star count or suppress stars under reduced motion, and preserve selected/focus nodes.
- [ ] Make inspector dismissible on mobile and avoid overlap with navigation controls/search/layers.
- [ ] Add loading skeleton and explicit renderer/projection failure copy without invented state.
- [ ] Run mobile contracts and typecheck.
- [ ] Commit responsive/UX implementation.

### Task 5: Browser-level implementation audit

**Files:**
- Modify: `.github/workflows/atlas-pages-fallback.yml`
- Modify: `atlas-control-tower/test/atlas-v3-ui-contract.test.mjs`

**Interfaces:**
- Consumes: production build.
- Produces: CI evidence for desktop/mobile rendering, navigation and overflow safety.

- [ ] Add Playwright assertions for portrait/landscape/tablet/desktop: `scrollWidth <= innerWidth`, stage height is usable, canvas or fallback exists, no page errors, Tower authority visible, search opens/focuses a canonical node, layer buttons work, mobile inspector opens/closes, and controls meet 44px.
- [ ] Add reduced-motion browser context and verify continuous decorative motion is disabled/degraded.
- [ ] Exercise page resize/orientation changes and verify canvas remains mounted and usable.
- [ ] Run full `npm test`, `npm run typecheck`, and `npm run build -- --base=/Pantheon/`.
- [ ] Commit audit gates.

### Task 6: PR, CI, merge and production readback

**Files:**
- No product files unless CI exposes a root cause requiring a regression test + fix.

**Interfaces:**
- Consumes: completed branch.
- Produces: merged, deployed, publicly verified Atlas V3.

- [ ] Open PR against `main` with root-cause summary and UX changes.
- [ ] Wait for PR CI and inspect every failing check; fix only root causes with regression coverage.
- [ ] Merge only after CI is green.
- [ ] Verify post-merge `Atlas Quality` and canonical `Atlas Deploy` on the merge SHA.
- [ ] Verify public `/Pantheon/atlas-v3/`, Projection V3 manifest authority/fingerprint, no private-structure markers, and mobile/desktop browser smoke.
- [ ] Report exact merge SHA, test count, deploy/readback status and any deliberate remaining limitation.