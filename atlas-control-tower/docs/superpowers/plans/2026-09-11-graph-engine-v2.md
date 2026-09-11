# Graph Engine V2 Completion Plan

**Goal:** finish the Pixi/GSAP graph engine on `feat/atlas-graph-engine-v2`, verify it from source through preview, and keep the official site untouched.

## Task 1: Lock completion behavior with tests

Create branch tests for persistent renderer lifecycle, viewport helpers, Learning edge inspection, reduced motion, context recovery, accessibility, mobile interaction, and bounded semantic LOD. Run the branch CI and confirm the new test is RED for the missing behavior.

## Task 2: Add pure viewport and LOD policy

Create `src/graph-engine/viewport.mjs` with zoom clamping, adaptive DPR, label/node budgets, and deterministic visible-node selection that always preserves focus and selection. Cover synthetic 100, 1k, 5k, and 10k inputs.

## Task 3: Make Pixi persistent

Refactor `GraphExplorer.tsx` so `PIXI.Application` is initialized once per component mount. Keep persistent world/layers in refs; update graph contents and viewport transforms incrementally. Selection, Learning toggle, zoom, and redraw must not recreate the renderer.

## Task 4: Complete interaction and resilience

Add drag pan, wheel zoom, pinch zoom, reset view, reduced-motion behavior, adaptive renderer resolution, WebGL context-loss/recovery, and local `atlas:graph-metrics` events.

## Task 5: Complete Learning inspection and accessibility

Give Learning filaments enlarged invisible hit targets, edge selection callbacks, and a relation inspector. Add a DOM accessibility layer for visible nodes/edges with keyboard selection/open behavior. Keep node and edge selections mutually exclusive.

## Task 6: Deep-link selection state

Use `entity` and `edge` query parameters in Atlas, domain, and detail pages. Preserve `learning=1` and `engine=v1` rollback semantics through navigation.

## Task 7: Mobile polish

Update `graph-v2.css` with 44px controls, stable graph height, bottom-sheet-like inspector behavior, touch-safe canvas, and reduced-motion CSS.

## Task 8: Full verification

Run `npm test`, `npm run typecheck`, and `npm run build` in GitHub Actions from the branch. Inspect logs and bundle output. Do not claim completion if any gate fails.

## Task 9: SSOT-backed preview and smoke

Deploy a preview whose `/api/*` requests reach the official backend. Smoke `/`, `/graphs`, `/graphs/science`, `/graphs/science/D3`, `/universes`, `/operations`, `/provenance`, and `/api/health`. Leave production unchanged.

## Task 10: Finish branch

Review the branch diff and verification evidence. Retain the legacy R3F/Three rollback until preview equivalence is demonstrated; do not merge into `main` without explicit user approval.