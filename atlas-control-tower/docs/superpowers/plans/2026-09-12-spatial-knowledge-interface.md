# NEXO Spatial Knowledge Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the live NEXO Atlas from a page containing a graph into a Canvas-first spatial knowledge interface with scene history, context shells, relation portals, real themes, pin/compare investigation state and reliable production validation.

**Architecture:** Keep the backend as truth owner and keep renderer choice behind `GraphRenderer`. Move navigation continuity into `lib/graph-session.mjs`, adapt the live `AtlasGraph` into one `GraphProjection`, and let Canvas/Pixi render that projection by default while R3F remains an explicit alternate renderer. DOM and graph visuals consume the same semantic theme tokens.

**Tech Stack:** React 19, TypeScript 5.9, PixiJS 8, R3F/Three.js, Vite 8, Node test runner, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-12-spatial-knowledge-interface.md`

## Global Constraints

- Canvas/Pixi 2.5D is default; WebGL/R3F is opt-in until profiling proves otherwise.
- Back and Forward restore navigation frames rather than recomputing a parent-only route.
- Last valid graph survives refresh errors.
- Stable layout remains ID-seeded.
- Themes: System, Light, Dark, Deep Space, High Contrast.
- Visible graph working set remains bounded; no renderer attempts to show the entire universe.
- Existing backend remains the current truth owner; frontend projections do not manufacture scientific entities.

---

### Task 1: Freeze executable acceptance tests

**Files:**
- Create: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Consumes: current source tree.
- Produces: regression assertions for navigation history, renderer policy, themes and live-app integration.

- [ ] Write assertions that fail while `lib/spatial-navigation.mjs` is absent and while `GraphRenderer` defaults to R3F.
- [ ] Assert the live app mounts the five-mode theme control.
- [ ] Assert the live session exposes Back, Forward, pin and compare state.
- [ ] Open a PR so `Atlas Quality` proves the RED state with `npm test`.

### Task 2: Spatial navigation state machine

**Files:**
- Create: `lib/spatial-navigation.mjs`
- Modify: `lib/graph-session.mjs`
- Modify: `src/state/useAtlasSession.ts`
- Test: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Produces: `createNavigationState`, `captureFrame`, `pushFrame`, `goBack`, `goForward`, `restoreFrame`.
- Session produces: `navigationStack`, `navigationIndex`, `scene`, `pins`, `compare` plus `forward`, `pin`, `unpin`, `toggleCompare`, `setSceneState` actions.

- [ ] RED: verify full scene payload survives Back/Forward.
- [ ] GREEN: implement immutable frame helpers with bounded history.
- [ ] Integrate frames into `focusNode`, `back`, `forward`, `home` and scene updates.
- [ ] Keep graph reads guarded by the existing stale-response sequence.

### Task 3: Live graph projection with context shells and portals

**Files:**
- Create: `src/graph-engine/live-projection.ts`
- Modify: `src/graph-engine/types.ts`
- Modify: `src/pages/graphs-page.tsx`
- Test: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Consumes: `AtlasGraph`, focus ID, path, pins and compare state.
- Produces: one `GraphProjection` containing current nodes, ancestor ghost nodes and relation-portal metadata without fabricating backend entities.

- [ ] RED: assert ancestors receive `contextRole:'ancestor'` and cross-hierarchy neighbors can receive `contextRole:'portal'`.
- [ ] GREEN: create projection adapter using only entities present in the current graph/path.
- [ ] Replace direct `AtlasCanvas` ownership in the live graphs page with `GraphRenderer`.
- [ ] Keep breadcrumb, freshness and error state visible around the graph rather than overlaying fake telemetry.

### Task 4: Canvas-first renderer policy

**Files:**
- Modify: `src/graph-engine/GraphRenderer.tsx`
- Modify: `src/graph-engine/GraphExplorer.tsx`
- Create: `src/graph-engine/theme-adapter.ts`
- Test: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Default URL state renders `GraphExplorer`.
- `?renderer=webgl` explicitly renders `GraphScene3D` behind an error boundary.
- Theme adapter returns numeric Pixi colors from semantic CSS tokens.

- [ ] RED: assert no-query renderer is Canvas.
- [ ] GREEN: invert current renderer selection and retain 3D fallback/rollback controls.
- [ ] Read semantic graph colors on draw and on `atlas:theme-change`.
- [ ] Invalidate/repaint Canvas visual caches on theme changes without reloading data.

### Task 5: Five-mode theme system

**Files:**
- Modify: `src/components/ThemeToggle.tsx`
- Modify: `src/App.tsx`
- Create: `src/design/premium-theme.css`
- Modify: `src/design/index.css`
- Test: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Stored values: `system`, `light`, `dark`, `deep-space`, `high-contrast`.
- DOM event: `atlas:theme-change` with resolved theme.

- [ ] RED: assert all five values and app mount point.
- [ ] GREEN: implement deterministic saved/system resolution and a compact selector.
- [ ] Define semantic DOM + graph tokens for all modes.
- [ ] Ensure light mode has independent surfaces/contrast rather than inversion.

### Task 6: Investigation controls

**Files:**
- Modify: `src/pages/graphs-page.tsx`
- Modify: `src/App.tsx`
- Modify: `src/state/useAtlasSession.ts`
- Test: `test/spatial-knowledge-interface.test.mjs`

**Interfaces:**
- Pin is persistent for the current session.
- Compare holds at most two canonical node IDs.
- Back/Forward controls call scene-history actions.

- [ ] Add Back, Forward, Home and immersive controls to graph HUD.
- [ ] Add contextual Pin and Compare actions to the inspector only when a selection exists.
- [ ] Surface pinned IDs and compare pair without creating duplicate truth owners.

### Task 7: Production validation and release

**Files:**
- Modify only if a failure exposes a defect.

**Interfaces:**
- GitHub Actions `Atlas Quality` is the build gate.
- Vercel production URL is the observable destination.

- [ ] Run PR CI and require `npm test`, `npm run typecheck`, and `npm run build` to pass.
- [ ] Inspect the PR diff for unintended changes and renderer regressions.
- [ ] Merge only the green PR.
- [ ] Verify Vercel deploy reaches READY and inspect production runtime errors.
- [ ] Read back the production URL and verify shell, theme control and graph route load successfully.