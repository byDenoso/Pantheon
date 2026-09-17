# Atlas Canvas 2.5D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Atlas Babylon/WebGL scene with a deterministic Canvas 2D renderer that presents the graph as a readable 2.5D structural map on mobile and desktop.

**Architecture:** Keep the existing filtered graph and deterministic `layoutGraph3D` output as the data contract. Add a Canvas projection/view model for screen projection and a React renderer responsible only for drawing, hit-testing and viewport gestures. Update the Atlas view to consume the new renderer while keeping filters, legend and inspector unchanged.

**Tech Stack:** React 19, TypeScript 5.9, Canvas 2D API, existing graph contracts/viewmodels, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-atlas-canvas-25d-design.md`

## Global Constraints
- No WebGL or Babylon runtime dependency in the Atlas render path.
- Preserve existing graph semantics and selection contract.
- Deterministic first-frame layout for identical graph input.
- Mobile must support drag, pinch, tap and double-tap without directional buttons.
- Canvas failure must be visible and explicit.

---

### Task 1: Add deterministic 2.5D projection helpers

**Files:**
- Create: `nexo-one/src/viewmodels/graph25d.ts`
- Create: `nexo-one/test/graph25d.test.mjs`

**Interfaces:**
- Consumes: `PlacedNode3D`, `Point3` from `graph3d.ts`.
- Produces: `projectNode25D`, `projectGraph25D`, `graphBounds25D`, `neighboursOf25D`.

- [ ] Write tests proving deterministic projection, bounded depth scale and stable draw order.
- [ ] Run the focused test and confirm RED.
- [ ] Implement pure projection helpers with no DOM dependency.
- [ ] Run the focused test and confirm GREEN.
- [ ] Commit projection helpers and tests.

### Task 2: Replace the WebGL renderer with Canvas 2D

**Files:**
- Create: `nexo-one/src/components/Atlas25DCanvas.tsx`
- Create: `nexo-one/src/styles/atlas25d.css`
- Modify: `nexo-one/src/features/system/Atlas.tsx`
- Test: `nexo-one/test/atlas25d-contract.test.mjs`

**Interfaces:**
- Consumes: `PlacedNode3D[]`, `GraphEdge[]`, selected node id and `onSelect` callback.
- Produces: an accessible Canvas viewport with pan, zoom, focus and hit-testing.

- [ ] Write a contract test requiring Canvas 2D and forbidding Babylon imports/mobile directional controls.
- [ ] Run the focused test and confirm RED.
- [ ] Implement Canvas drawing, high-DPI resize, deterministic edge/node layering, labels, state halos and selection.
- [ ] Implement pointer drag, wheel zoom, pinch zoom, tap selection and double-tap focus.
- [ ] Wire `AtlasView` to the new component without changing graph data semantics.
- [ ] Run typecheck and focused tests until GREEN.
- [ ] Commit the renderer replacement.

### Task 3: Tune responsive presentation and remove the legacy renderer

**Files:**
- Delete: `nexo-one/src/components/Atlas3DCanvas.tsx`
- Delete: `nexo-one/src/styles/atlas3d.css`
- Modify: `nexo-one/src/styles/atlas25d.css`
- Modify: `nexo-one/package.json` only if dependency cleanup can be completed consistently with lockfile in the same change.

**Interfaces:**
- Consumes: Canvas renderer from Task 2.
- Produces: production-ready mobile/desktop presentation with no legacy control surface.

- [ ] Remove the legacy 3D component and stylesheet after confirming no references remain.
- [ ] Tune mobile stage height, compact controls and focus overlay.
- [ ] Run full `npm run check` and browser verification.
- [ ] Commit cleanup.

### Task 4: Release verification

**Files:**
- No source changes unless verification exposes a regression.

- [ ] Open a PR from `feat/atlas-canvas-25d-20260917` to `main`.
- [ ] Require CI to pass before merge.
- [ ] Merge to main.
- [ ] Verify production deployment is READY.
- [ ] Read back the production Atlas and confirm the new Canvas surface is served and the legacy mobile control grid is absent.
