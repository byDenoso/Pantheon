# NEXO Atlas Native Graph Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Atlas shadow renderer environments with one native GraphRenderer contract implemented by Canvas, PixiJS, Three.js and Babylon.js.

**Architecture:** `app.mjs -> renderer-runtime -> renderer-registry -> renderer-factory -> native renderer`. All renderers consume the same graph projection. Renderer state is independent of SSOT and hierarchy.

**Tech Stack:** ES modules, Canvas 2D, PixiJS 8.20.1, Three.js 0.185.1, Babylon.js 9.25.0, Node test, Vite.

**Spec:** `docs/superpowers/specs/2026-09-09-native-graph-renderers-design.md`

## Global Constraints

- Preserve canonical graph IDs and hierarchy.
- Alternative filaments remain an overlay.
- Canvas remains the universal fallback.
- PixiJS is mobile-safe; Three/Babylon are not automatic mobile defaults.
- Experience owns renderer choice unless there is an explicit manual renderer override.
- No environment renderer shadow state.

---

### Task 1: GraphRenderer contract and registry
- [x] Write failing contract/registry tests.
- [x] Add `renderer-contract.mjs`.
- [x] Convert registry entries to native graph renderers.
- [x] Verify RED -> GREEN.

### Task 2: Native PixiJS renderer
- [x] Write failing source contract.
- [x] Implement graph geometry, edges, labels, picking, controls and lifecycle.
- [x] Add WebGPU -> WebGL fallback.
- [x] Verify renderer tests.

### Task 3: Native Babylon.js renderer
- [x] Write failing source contract.
- [x] Implement meshes, lines, camera, labels, picking and lifecycle.
- [x] Implement 2.5D / 3D modes.
- [x] Verify renderer tests.

### Task 4: Factory and runtime authority
- [x] Add renderer factory.
- [x] Collapse runtime state to one renderer authority.
- [x] Wire app through factory.
- [x] Separate click selection from explicit graph opening.

### Task 5: Remove legacy renderer ownership
- [x] Strip V3 registry/UI/persistence from Canvas visual adapter.
- [x] Move presets to `visual-presets.mjs`.
- [x] Delete retired environment bridge and preference shim.
- [x] Give Canvas its own theme and destroy lifecycle.

### Task 6: Verification and release
- [x] Run graph-lab tests locally.
- [ ] Run canonical GitHub Atlas Quality CI.
- [ ] Deploy production after CI passes.
- [ ] Read back canonical Vercel deployment and renderer bootstrap.
