# ATLAS Graph Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated Canvas 2D laboratory that reproduces the approved orbital NEXO Atlas graph language without modifying the production Atlas renderer or backend.

**Architecture:** `atlas-control-tower/graph-lab/` is a standalone static application with synthetic data only. Pure math modules own projection, deterministic layout, filaments, motion, picking and label placement; `renderer.mjs` consumes those modules and draws the scene. The production `graph3d.mjs`, Neon APIs, Durable Runner, Vercel production manifest and automations remain untouched.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Canvas 2D, Node test runner.

**Spec:** Conversation-approved `ATLAS GRAPH LAB` design: orbital 2.5D/3.5D canvas, volumetric nodes, curved Bézier filaments, travelling pulses, deterministic semantic layout, bounded labels, subgraph expansion, lab presets, responsive mobile controls and performance HUD.

## Global Constraints

- Do not edit `atlas-control-tower/graph3d.mjs`, `app.mjs`, Neon/API/Durable Runner files or production Vercel routes.
- No backend dependency in the lab; synthetic data only.
- Canvas 2D is the first renderer. No Three.js/React in phase 1.
- One global animation loop; no per-edge timers.
- Layout and motion must be deterministic for identical node IDs and data.
- `prefers-reduced-motion` freezes drift and travelling pulses.
- Visual fidelity takes priority over benchmark maximization.

---

### Task 1: Contract and pure geometry

**Files:**
- Test: `atlas-control-tower/test/graph-lab.test.mjs`
- Create: `atlas-control-tower/graph-lab/graph/projection.mjs`
- Create: `atlas-control-tower/graph-lab/graph/layout.mjs`
- Create: `atlas-control-tower/graph-lab/graph/filaments.mjs`
- Create: `atlas-control-tower/graph-lab/graph/picking.mjs`
- Create: `atlas-control-tower/graph-lab/graph/motion.mjs`

**Interfaces:**
- `projectPoint(point, camera, width, height, options)` -> projected `{x,y,z,scale}`.
- `layoutNodes(nodes, focusId, options)` -> deterministic `Map<id,[x,y,z]>`.
- `quadraticBezierPoint(a, cp, b, t)` and `filamentControl(a,b,curve,bias)`.
- `pickNode(points,x,y,padding)` -> front-most hit or null.
- `orbitalDrift(id,timeMs,amplitude)` -> deterministic offset.

- [ ] Write tests first for perspective depth, deterministic layout, Bézier endpoints, front-most picking and deterministic bounded drift.
- [ ] Verify RED because graph-lab modules do not exist.
- [ ] Implement minimum pure modules.
- [ ] Verify focused tests and full Atlas suite GREEN.

### Task 2: Synthetic semantic graph

**Files:**
- Create: `atlas-control-tower/graph-lab/data/synthetic-graph.mjs`

**Interfaces:**
- `createSyntheticGraph(targetCount=50)` -> `{nodes,edges,rootId}`.
- Nodes expose `id,label,type,parentId,status,system,hiddenChildren`.
- Edges expose `source,target,kind,authority`.

- [ ] Extend failing tests for root systems, exact requested scale and endpoint validity.
- [ ] Verify RED.
- [ ] Implement deterministic hierarchy and scale expansion for 50/100/250/500/1000 nodes.
- [ ] Verify GREEN.

### Task 3: Labels, palette and renderer

**Files:**
- Create: `atlas-control-tower/graph-lab/graph/labels.mjs`
- Create: `atlas-control-tower/graph-lab/graph/palette.mjs`
- Create: `atlas-control-tower/graph-lab/graph/renderer.mjs`

**Interfaces:**
- `placeLabels(points, options)` -> collision-aware bounded label records.
- `PRESETS` exposes ORIGINAL, CLEAN, DEEP_SPACE, HIGH_CONTRAST, DENSE_GRAPH, MOBILE.
- `GraphLabRenderer` exposes `setGraph`, `setFocus`, `setPreset`, `setOptions`, `reset`, `fit`, `centerSelected`, `zoom`, `toggleFlat`, `start`, `stop`.

- [ ] Test semantic label priority, collision rejection, preset existence and renderer source contract (single animation loop, radial gradients, quadratic curves).
- [ ] Verify RED.
- [ ] Implement volumetric bodies, depth fog, orbital rings, curved filaments, travelling LED pulses, deterministic drift and transitions from parent positions.
- [ ] Verify GREEN.

### Task 4: Lab shell, controls and mobile

**Files:**
- Create: `atlas-control-tower/graph-lab/index.html`
- Create: `atlas-control-tower/graph-lab/styles.css`
- Create: `atlas-control-tower/graph-lab/app.mjs`
- Create: `atlas-control-tower/graph-lab/README.md`

**Interfaces:**
- Canvas `#graph-lab-canvas`.
- HUD fields for FPS, frame time, nodes, edges, labels and DPR.
- Controls for preset, dataset size, radius, glow, fog, perspective, drift, pulse speed, filament curve, label budget and visible-node budget.

- [ ] Add failing static-contract tests for shell, controls, mobile bottom-sheet behavior and strict separation from production APIs.
- [ ] Verify RED.
- [ ] Implement static lab UI and bind controls to renderer options.
- [ ] Verify GREEN.

### Task 5: Preview and readback

**Files:** none in production manifest.

- [ ] Run complete Atlas test suite.
- [ ] Deploy only `graph-lab/` as a separate Vercel preview payload; do not target production.
- [ ] Read back HTML, CSS and JS from preview.
- [ ] Confirm production `https://nexo-atlas-control-tower.vercel.app/` remains the approved orbital Atlas.
