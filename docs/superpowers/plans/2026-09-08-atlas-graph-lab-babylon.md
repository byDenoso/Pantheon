# ATLAS Graph Lab Babylon.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated Babylon.js renderer of the ATLAS Graph Lab for direct visual/performance comparison with the existing Canvas baseline.

**Architecture:** A new static `graph-lab-babylon/` page reuses the existing synthetic dataset, deterministic layout, Paleta A semantics, and Bézier math from `graph-lab/`, while rendering nodes/edges/pulses in a Babylon.js 3D scene. Labels remain DOM overlays for crisp text. No production Atlas APIs are used.

**Tech Stack:** HTML, CSS, JavaScript modules, Babylon.js browser runtime, existing Graph Lab shared modules, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-08-atlas-graph-lab-babylon-design.md`

## Global Constraints
- Do not modify production Atlas renderer or APIs.
- Keep existing Canvas Graph Lab behavior unchanged.
- Synthetic data only.
- Paleta A is the visual contract.
- `BABYLON.JS` must be visibly identified in the UI.
- Curved relations and travelling pulses are mandatory.

---

### Task 1: Babylon Contract Test

**Files:**
- Modify: `atlas-control-tower/test/graph-lab.test.mjs`
- Create later: `atlas-control-tower/graph-lab-babylon/index.html`
- Create later: `atlas-control-tower/graph-lab-babylon/app.mjs`
- Create later: `atlas-control-tower/graph-lab-babylon/scene.mjs`

**Interfaces:**
- Consumes: existing Node test runner and repository filesystem.
- Produces: a failing contract requiring the Babylon page, runtime identity, shared dataset/palette usage, curved paths, and no `/api/` dependency.

- [ ] Add a test asserting the Babylon shell and modules exist, the HTML contains `BABYLON.JS`, `app.mjs` imports the existing synthetic graph and Paleta A modules, and `scene.mjs` references `ArcRotateCamera`, `MeshBuilder.CreateSphere`, `MeshBuilder.CreateTube`, and `GlowLayer`.
- [ ] Run `npm test -- --test-name-pattern="Babylon graph lab"` from `atlas-control-tower/` and verify RED because the Babylon directory does not exist.
- [ ] Commit the failing contract.

### Task 2: Babylon Static Shell and Scene

**Files:**
- Create: `atlas-control-tower/graph-lab-babylon/index.html`
- Create: `atlas-control-tower/graph-lab-babylon/styles.css`
- Create: `atlas-control-tower/graph-lab-babylon/app.mjs`
- Create: `atlas-control-tower/graph-lab-babylon/scene.mjs`

**Interfaces:**
- Consumes: `../graph-lab/data/synthetic-graph.mjs`, `../graph-lab/graph/layout.mjs`, `../graph-lab/graph/palette.mjs`, `../graph-lab/graph/filaments.mjs`.
- Produces: `BabylonGraphLab` with `setGraph(graph,{focusId})`, `setOptions(partial)`, `zoom(factor)`, `fit()`, `centerSelected()`, `start()`, `stop()`.

- [ ] Build a shell matching the current Graph Lab dimensions and Paleta A chrome, with a `BABYLON.JS` badge, HUD, dataset selector, and camera controls.
- [ ] Load Babylon from `https://cdn.babylonjs.com/babylon.js` before the module script.
- [ ] Implement `BabylonGraphLab` with `BABYLON.Engine`, `Scene`, `ArcRotateCamera`, hemispheric/point lighting, restrained `GlowLayer`, sphere meshes, Paleta A materials, and deterministic positions from shared `layoutNodes()`.
- [ ] Build every relation as a quadratic Bézier sampled into `MeshBuilder.CreateTube` instead of straight line meshes.
- [ ] Add emissive pulse spheres that move along the sampled curve in the single Babylon render loop.
- [ ] Add DOM labels projected via `Vector3.Project`, bounded to a fixed budget and hidden when behind camera/offscreen.
- [ ] Wire click selection, double-click structural focus, zoom, home/back/fit/center, resize, reduced motion, and dataset scale changes.
- [ ] Run the Babylon contract test and full `npm test`; verify GREEN.
- [ ] Run `npm run typecheck` and `npm run build`; verify both succeed.
- [ ] Commit implementation.

### Task 3: Preview Deployment and Readback

**Files:**
- No production Atlas files modified.

**Interfaces:**
- Consumes: tested Babylon static files.
- Produces: separate Vercel preview URL clearly identified as Babylon.js.

- [ ] Deploy `graph-lab-babylon` to a separate Vercel project/preview.
- [ ] Read back the root page and verify HTTP 200, `BABYLON.JS` identity, Paleta A title/badge, and pinned commit assets.
- [ ] Keep existing `nexo-atlas-graph-lab` Canvas site unchanged.
- [ ] Report the Babylon URL and identify it explicitly as the Babylon.js version.
