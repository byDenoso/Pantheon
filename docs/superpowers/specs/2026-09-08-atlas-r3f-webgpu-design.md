# NEXO Atlas R3F WebGPU Design

## Goal
Replace the current Canvas 2D `Graph3D` renderer and imperative frontend shell with a React 19 + TypeScript + React Three Fiber frontend using WebGPU first, while preserving the approved orbital Atlas visual language, existing API contracts, Durable Neon Bridge, Neon truth ownership, and operational backend.

## Stable technology choices
- React 19.2.8 + React DOM 19.2.8.
- Three.js 0.185.1.
- `@react-three/fiber` 9.7.0 stable.
- Vite 8.2.2 + TypeScript.
- Three `WebGPURenderer`, initialized asynchronously; WebGL2 fallback is mandatory when WebGPU cannot initialize.
- TSL/node materials for GPU-driven node/filament effects. A minimal shader fallback may use conventional Three materials when the backend is WebGL2.

## Boundaries
The migration changes the browser application only. It does not change:
- `api/runner.js` or `lib/durable-runner.mjs`.
- Neon grants or Truth Owner rules.
- runtime/projection API response contracts.
- `lib/atlas-api.mjs`, `lib/graph-session.mjs`, model authority semantics, or WebMCP semantics except for a thin React adapter when necessary.

Atlas remains `DERIVED_NOT_EVIDENCE`.

## Architecture

### React application shell
`src/main.tsx` mounts a single React tree into `#root`. The approved orbital visual is retained as React components: top bar, sidebar, map stage, graph controls, inspector, command center, analytics, Black Box and footer. Existing CSS remains reusable where practical; React-specific layout overrides live in `src/styles/react-atlas.css`.

### Session bridge
`src/state/useAtlasSession.ts` owns a `createApi()` + `createSession()` instance. It subscribes to existing session events and converts them into immutable React state. No scientific semantics are reimplemented in React.

### Scene pipeline
`src/scene/AtlasCanvas.tsx` owns the R3F Canvas and async renderer factory. `src/scene/createRenderer.ts` attempts `WebGPURenderer`, awaits `init()`, and falls back to `WebGLRenderer` only if WebGPU initialization fails.

### Semantic layout + LOD
Existing map data preparation remains authoritative for graph topology. `src/scene/semantic-lod.ts` ranks nodes by semantic importance before distance:
1. selected
2. current focus
3. SYSTEM
4. DOMAIN
5. blocked/active CLAIM or blocker-like entity
6. CAMPAIGN
7. TEST
8. RUN / RESULT / low-priority peripheral entity

LOD returns two sets: GPU-visible nodes and HTML-label nodes. Label budget defaults to 36 desktop / 20 compact. Selection and focus are never dropped.

### Instanced nodes
`src/scene/InstancedNodes.tsx` partitions nodes into a small fixed set of semantic classes and renders one `instancedMesh` per class. Per-instance transform/color/pick-id attributes are updated without creating one React mesh per node.

### Instanced filaments
`src/scene/InstancedFilaments.tsx` draws relation ribbons/segments using instanced geometry. Each instance receives source, target, Bézier control offset, relation kind and pulse phase. Shader logic computes the visible curve/pulse on the GPU.

### TSL materials
`src/scene/materials.ts` creates WebGPU-first node materials with TSL and a compatible fallback material for WebGL2. GPU animation uses time/uniform nodes; CPU does not rebuild geometry every frame.

### GPU picking
`src/scene/gpu-picking.ts` assigns stable 24-bit object IDs, renders an offscreen ID pass, and uses asynchronous render-target pixel readback when supported. Picking is invalidated only on pointer/camera/scene changes. CPU raycast is allowed only as an explicit WebGL2 compatibility fallback.

### HTML overlay
`src/scene/LabelOverlay.tsx` renders a single DOM overlay above the canvas. Only LOD-approved labels exist in the DOM. Positions are projected from Three camera/world positions; labels use CSS transforms and pointer-events are disabled except for selected/focused controls.

## Data flow
`runtime API -> createApi -> createSession -> React session bridge -> semantic LOD -> R3F scene + DOM overlay`.

Selection flows `GPU pick -> stable node id -> session.select/focus -> existing inspector/session contract`.

## Compatibility and failure behavior
- WebGPU failure must not blank the Atlas; WebGL2 fallback boots automatically.
- If the graph API fails, preserve the prior rendered graph and show the current Atlas warning behavior.
- `prefers-reduced-motion` freezes ambient drift/pulses and disables auto orbit.
- The approved orbital layout, breadcrumbs, search, filters, inspector, sync, domain navigation and Black Box must remain reachable.
- No renderer capability may mutate scientific state.

## Performance targets
- One draw-call family per semantic node class rather than one mesh per node.
- Filaments use instanced rendering rather than one object per edge.
- HTML labels are bounded by semantic budget.
- Picking pass runs on demand, not every frame.
- Avoid React state updates inside the frame loop; use refs/Three buffers for frame-level changes.

## Test gates
1. Static architecture contract confirms React/R3F/WebGPU/TSL source boundaries and no removal of Durable Runner routes.
2. Semantic LOD unit tests prove selected/focus retention and deterministic rank/budgets.
3. Pick ID encode/decode tests prove stable round trips and reserved background ID.
4. Renderer policy tests prove WebGPU-first and explicit WebGL2 fallback path.
5. Build passes `tsc --noEmit` and `vite build`.
6. Existing backend/unit tests remain green; old Canvas-specific renderer tests are retired/replaced.
7. Preview readback confirms HTML shell, built JS assets, `/api/health` 200 and `/api/runner` remains healthy.
8. Production deployment occurs only after preview passes.
