# Neural Atlas UI, UX and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Atlas V3 into a clean, readable neural knowledge workspace that communicates live learning while improving graph interaction, mobile behavior and rendering efficiency.

**Architecture:** Keep one canonical Projection V3 graph and one R3F/Canvas renderer. Move all new behavior into pure graph presentation helpers and a small neural shell layer; do not create a second graph engine or fabricate scientific content. Use semantic LOD, stable label priority, contextual inspector content and CSS tokens for the visual system.

**Tech Stack:** React, TypeScript, React Three Fiber, Three.js, Canvas fallback, Vite, Node test runner.

**Spec:** `docs/superpowers/plans/2026-09-15-neural-atlas-ui-performance.md` plus the approved Neural Atlas direction from the conversation.

## Global Constraints

- TOWER_V06 remains the sole operational truth owner.
- Projection V3 remains read-only and sanitized.
- No permanent sidebar navigation in Atlas V3.
- Nexo, Science, Operations, Health, Automations and Evidences are the only visible layer controls.
- Graph colors must reach both WebGL and Canvas fallback.
- Reduced-motion and mobile touch targets remain supported.
- No invented entity, evidence, metric, freshness or learning event.

---

### Task 1: Neural shell foundation

**Files:**
- Modify: `src/atlas-v3/AtlasV3App.tsx`
- Modify: `src/atlas-v3/atlas-v3.css`
- Modify: `src/atlas-v3/atlas-v3-theme.css`
- Modify: `src/atlas-v3/types.ts`
- Test: `test/atlas-v3-neural-shell.test.mjs`

- [x] Add compact neural layer controls with accessible pressed state.
- [x] Add live-learning status indicator and clear scene caption.
- [x] Add responsive horizontal control behavior and remove permanent rail presentation.
- [x] Verify focused, mobile and reduced-motion states.

### Task 2: Graph presentation and readability

**Files:**
- Modify: `src/scene/CanvasGraphFallback.tsx`
- Modify: `src/scene/InstancedNodes.tsx`
- Modify: `src/scene/InstancedFilaments.tsx`
- Modify: `src/scene/LabelOverlay.tsx`
- Modify: `src/scene/types.ts`
- Test: `test/atlas-v3-neural-graph.test.mjs`

- [x] Define semantic node/edge visual roles without changing canonical data.
- [x] Render hierarchy, evidence, automation and attention relations with distinct stroke/weight rules.
- [x] Reserve glow and pulse for focus, selection and real activity signals.
- [x] Keep label placement deterministic and collision-aware.
- [x] Verify WebGL and Canvas use the same visual role contract.

### Task 3: Exploration UX

**Files:**
- Modify: `src/atlas-v3/AtlasV3App.tsx`
- Modify: `src/atlas-v3/atlas-v3.css`
- Modify: `src/atlas-v3/scene-adapter.mjs`
- Test: `test/atlas-v3-exploration-ux.test.mjs`

- [x] Add context-first inspector sections based only on published fields.
- [x] Add explicit focus, back, home and search affordances with useful empty states.
- [x] Preserve Health/Olympus synchronization copy and privacy boundary.
- [x] Keep mobile inspector as a bottom sheet with safe-area support.

### Task 4: Renderer performance

**Files:**
- Modify: `src/scene/AtlasCanvas.tsx`
- Modify: `src/scene/semantic-lod.ts`
- Modify: `src/scene/CanvasGraphFallback.tsx`
- Test: `test/atlas-v3-render-performance.test.mjs`

- [x] Make node and label budgets viewport-aware and stable.
- [x] Avoid rebuilding geometry/material state when only selection changes.
- [x] Suspend animation when hidden or outside the viewport.
- [x] Keep fallback bounded and avoid unnecessary per-frame allocations where practical.
- [x] Verify compact budgets, hidden rendering and reduced motion.

### Task 5: Full validation and integration checkpoint

**Files:**
- Modify: only files required by failing validation.
- Test: `test/*.test.mjs`

- [x] Run the focused neural tests.
- [x] Run `npm test` and confirm zero failures.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `git diff --check` and inspect the final diff.
- [ ] Commit the complete package with a scoped message.
