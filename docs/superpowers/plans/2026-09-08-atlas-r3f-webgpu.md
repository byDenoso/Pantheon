# NEXO Atlas R3F WebGPU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the approved Atlas orbital frontend renderer with React + React Three Fiber + WebGPU while preserving its data contracts, visual semantics and Durable Runner backend.

**Architecture:** Keep existing Atlas APIs/session semantics as the model layer. Introduce a TypeScript React shell and an R3F scene using WebGPURenderer-first initialization, semantic LOD, instanced nodes/filaments, TSL materials, GPU picking and a bounded DOM label overlay. Vite builds the browser bundle; Vercel continues serving existing Node API functions unchanged.

**Tech Stack:** React 19.2.8, React DOM 19.2.8, Three 0.185.1, @react-three/fiber 9.7.0, Vite 8.2.2, TypeScript 5.x, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-08-atlas-r3f-webgpu-design.md`

## Global Constraints
- Preserve `api/runner.js`, `lib/durable-runner.mjs`, Neon grants and Truth Owner semantics.
- Preserve existing runtime/projection API response contracts.
- Atlas remains `DERIVED_NOT_EVIDENCE`.
- WebGPU is primary; WebGL2 fallback is mandatory.
- `prefers-reduced-motion` freezes ambient graph motion.
- Selection/focus must never be dropped by semantic LOD.
- HTML label count must be bounded.
- Production only after preview readback passes.

---

### Task 1: Architecture contract and migration boundary

**Files:**
- Create: `atlas-control-tower/test/r3f-architecture.test.mjs`
- Modify: `atlas-control-tower/package.json`
- Modify: `.github/workflows/atlas-quality.yml`

**Interfaces:**
- Consumes: existing repo layout.
- Produces: CI expectations for `src/main.tsx`, `src/scene/AtlasCanvas.tsx`, `src/scene/createRenderer.ts`, semantic LOD, GPU picking, and Vite build.

- [ ] **Step 1: Write failing architecture tests** that assert the new source files and package dependencies/scripts exist and that `api/runner.js` remains present in Vercel configuration.
- [ ] **Step 2: Open a PR and run CI; confirm RED** because React/R3F files and dependencies do not exist.
- [ ] **Step 3: Add package dependencies and CI install/typecheck/build steps** without implementing scene behavior yet.
- [ ] **Step 4: Keep the architecture test RED only for missing production source files.**

### Task 2: Pure semantic LOD and pick-ID core

**Files:**
- Create: `atlas-control-tower/src/scene/semantic-lod.ts`
- Create: `atlas-control-tower/src/scene/gpu-picking.ts`
- Create: `atlas-control-tower/test/r3f-core.test.mjs`

**Interfaces:**
- `semanticRank(node, context): number`
- `selectSemanticLOD(nodes, context): {visibleIds:Set<string>, labelIds:Set<string>}`
- `encodePickId(id:number): [number,number,number,number]`
- `decodePickId(pixel:ArrayLike<number>): number`

- [ ] **Step 1: Write failing tests** for selected/focus retention, deterministic rank, label budgets, pick round-trip, and background ID zero.
- [ ] **Step 2: Run CI and confirm RED** from missing modules/functions.
- [ ] **Step 3: Implement minimal pure TypeScript modules** with no Three/React dependency.
- [ ] **Step 4: Run tests and confirm GREEN.**

### Task 3: WebGPU-first renderer factory

**Files:**
- Create: `atlas-control-tower/src/scene/createRenderer.ts`
- Create: `atlas-control-tower/test/renderer-policy.test.mjs`

**Interfaces:**
- `createAtlasRenderer(canvas, options?): Promise<{renderer, backend:'webgpu'|'webgl2'}>`

- [ ] **Step 1: Write failing static/policy test** requiring `WebGPURenderer`, awaited `init()`, and `WebGLRenderer` fallback.
- [ ] **Step 2: Confirm RED.**
- [ ] **Step 3: Implement renderer factory** using dynamic Three WebGPU import and safe fallback.
- [ ] **Step 4: Confirm GREEN.**

### Task 4: R3F scene with instanced nodes and filaments

**Files:**
- Create: `atlas-control-tower/src/scene/AtlasCanvas.tsx`
- Create: `atlas-control-tower/src/scene/InstancedNodes.tsx`
- Create: `atlas-control-tower/src/scene/InstancedFilaments.tsx`
- Create: `atlas-control-tower/src/scene/materials.ts`
- Create: `atlas-control-tower/src/scene/types.ts`
- Create: `atlas-control-tower/test/r3f-scene-contract.test.mjs`

**Interfaces:**
- `AtlasCanvas({graph, focusId, selectedId, onSelect, onOpen, reducedMotion})`
- `InstancedNodes` consumes semantic-node instances and emits stable pick IDs.
- `InstancedFilaments` consumes prepared relation instances.

- [ ] **Step 1: Write failing scene-contract tests** requiring R3F Canvas, `instancedMesh`, TSL/node material usage, and no per-node React mesh map.
- [ ] **Step 2: Confirm RED.**
- [ ] **Step 3: Implement the minimal R3F scene** with semantic-class instancing and GPU-time material uniforms.
- [ ] **Step 4: Confirm unit/static tests and TypeScript build GREEN.**

### Task 5: Session bridge, React shell and HTML labels

**Files:**
- Create: `atlas-control-tower/src/state/useAtlasSession.ts`
- Create: `atlas-control-tower/src/scene/LabelOverlay.tsx`
- Create: `atlas-control-tower/src/App.tsx`
- Create: `atlas-control-tower/src/main.tsx`
- Create: `atlas-control-tower/src/styles/react-atlas.css`
- Modify: `atlas-control-tower/index.html`
- Create: `atlas-control-tower/test/react-shell.test.mjs`

**Interfaces:**
- React state bridge wraps existing `createApi`/`createSession`.
- Label overlay consumes world positions + semantic label IDs and renders bounded DOM labels.

- [ ] **Step 1: Write failing shell tests** for React root, retained Atlas copy/navigation, bounded label overlay and existing API/session imports.
- [ ] **Step 2: Confirm RED.**
- [ ] **Step 3: Implement React shell** preserving approved orbital visual hierarchy and wiring existing session actions.
- [ ] **Step 4: Confirm shell tests and build GREEN.**

### Task 6: Vite/Vercel production boundary

**Files:**
- Modify: `atlas-control-tower/vercel.json`
- Create: `atlas-control-tower/vite.config.ts`
- Create: `atlas-control-tower/tsconfig.json`
- Modify: `atlas-control-tower/frontend-files.mjs`
- Modify/replace: Canvas-specific frontend tests that assert obsolete renderer internals.

**Interfaces:**
- Vite output: `dist/`.
- API functions remain `/api/*` Node functions.

- [ ] **Step 1: Write failing deployment-contract test** requiring Vite static build and preserved `/api/runner` route.
- [ ] **Step 2: Confirm RED.**
- [ ] **Step 3: Configure Vite/static-build and API routes.**
- [ ] **Step 4: Retire only Canvas-internal tests; retain behavioral/API tests.**
- [ ] **Step 5: Run full CI: unit tests, `tsc --noEmit`, `vite build`. Expected: GREEN.**

### Task 7: Preview deployment and readback

**Files:**
- No source changes unless preview exposes a defect.

**Interfaces:**
- Preview URL must serve React shell and healthy backend.

- [ ] **Step 1: Deploy branch as preview.**
- [ ] **Step 2: Read back `/`, built JS asset, `/api/health`, and `/api/runner` health.**
- [ ] **Step 3: Verify no runtime-error clusters and that WebGPU boot code is present in built asset.**
- [ ] **Step 4: If any gate fails, fix via TDD and redeploy preview.**

### Task 8: Merge and production verification

**Files:**
- Merge PR only after all gates pass.

**Interfaces:**
- Production alias remains `nexo-atlas-control-tower.vercel.app`.

- [ ] **Step 1: Merge the GREEN PR.**
- [ ] **Step 2: Deploy production from the merged source.**
- [ ] **Step 3: Verify root HTML, JS bundle, `/api/health`, `/api/runner`, runtime errors, and approved orbital copy.**
- [ ] **Step 4: Close only after production readback proves React/R3F/WebGPU bundle and Durable Runner coexist.**
