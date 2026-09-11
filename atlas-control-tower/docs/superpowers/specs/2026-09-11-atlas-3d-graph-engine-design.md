# Atlas 3D Graph Engine Design

## Objective
Replace the current Pixi structural graph renderer with a real 3D canvas renderer while preserving Atlas routes, Drive authority, Learning semantics, and rollback safety.

The target interaction is a navigable orbital knowledge map: hubs and subgraphs occupy real x/y/z coordinates, the camera orbits and dollies through the scene, and focusing a node moves the camera into that local system instead of accumulating every branch in one flat surface.

## Architecture

### Renderer
Use React Three Fiber over Three.js inside a single WebGL canvas.

Stack:
- `@react-three/fiber` for React integration and scene lifecycle.
- `three` for geometry, materials, camera, raycasting and instancing.
- `@react-three/drei` for PerspectiveCamera, controls and helper primitives where they reduce boilerplate.
- `gsap` for deterministic camera transitions between graph focus states.
- `troika-three-text` for SDF text labels that remain readable in 3D.

The existing Pixi renderer remains available as a rollback path until 3D parity is verified.

### Scene ownership
Create a dedicated `GraphScene3D` subsystem. It owns only rendering and interaction. It receives a normalized `GraphProjection` and emits selection/focus events. It must not read Drive, infer Learning, invent nodes, or mutate the projection.

The scene contains:
- one perspective camera;
- a world root group;
- instanced node geometry for small/medium nodes;
- dedicated meshes for hubs/focus nodes;
- curved structural edges;
- separate Learning filament layer;
- SDF labels with semantic LOD;
- optional sparse particles/stars that carry no semantics.

## 3D layout

### Deterministic orbital layout
Add `orbital-layout-3d` that maps the declared hierarchy to stable `{x,y,z}` positions.

Rules:
- focus node is always at local origin `[0,0,0]`;
- depth 1 children occupy a wide orbital shell;
- depth 2 children occupy cluster-local shells around their parent;
- dense sibling sets use multiple rings/shells instead of angular compression;
- sibling clusters reserve non-overlapping angular sectors;
- layout is deterministic from canonical IDs and hierarchy;
- Learning never changes structural coordinates;
- no force simulation runs continuously in production.

The initial NEXO scene exposes only declared top-level systems. Entering Science, Engineering, or Olympus makes that node the new local origin and de-emphasizes or hides the previous context.

## Camera and navigation

Use a PerspectiveCamera with a constrained orbit controller.

Desktop:
- primary drag: orbit around current focus;
- wheel: dolly in/out;
- secondary drag or modifier drag: pan;
- click: select;
- click selected node again: enter/focus;
- Escape: return to parent focus;
- Center: restore canonical camera pose for current focus.

Mobile:
- one-finger drag: orbit;
- pinch: dolly;
- two-finger drag where supported: pan;
- tap: select;
- second tap on selected node: enter/focus;
- no mandatory tilt gesture separate from orbit.

The camera target and pose are explicit state, not inferred from DOM transforms.

### Camera transitions
When focus changes, GSAP interpolates camera position and controls target over roughly 350–650 ms. Reduced-motion mode uses immediate or near-immediate transitions.

## Focus grammar

Atlas keeps bounded exploration state:
- `activeDomainId`
- `activeSubgraphId`
- `activeEntityId`

Only one deep domain branch and one deep subgraph branch can be active at a time.

Entering another domain replaces the previous deep context instead of adding more nodes to the same scene. Entering a subgraph likewise replaces the previous deep subgraph context.

Browser URLs/deep links remain compatible with current routes.

## Labels

All structural labels live in the 3D renderer using SDF text. HTML labels are not used for normal graph rendering.

Priority:
1. focus
2. selected
3. domain/system hubs
4. active subgraph
5. nearby relevant entities
6. remaining entities only at high zoom/detail

Labels billboard toward the camera. Focus and selected labels are always retained. A screen-space occupancy pass suppresses lower-priority labels that collide after projection.

Long descriptions remain in the inspector, not on the canvas.

## Nodes and edges

Node visual hierarchy:
- root/focus: dedicated large mesh, strong halo/glow;
- system/domain: medium-large body with semantic color;
- subgraph/program/campaign: medium body;
- entity/test/result/evidence: instanced small body.

Edges use curved line geometry with restrained opacity. Selected paths brighten while unrelated edges dim. Learning filaments use a separate material and never alter structure.

## Performance

Target mobile-first stability rather than maximal density.

Rules:
- use instanced meshes for repeated small node geometry;
- cap device pixel ratio on mobile;
- semantic node and label budgets remain active;
- frustum/offscreen elements are not rendered when avoidable;
- avoid one React component per tiny node where instancing can represent them;
- raycast/picking is bounded to visible interactive objects;
- animation loop can fall back to demand-driven rendering when the scene is idle;
- large legacy R3F renderer remains lazy-loaded and must not enter the root bundle.

## Mobile presentation

The `/graphs` route remains full-bleed.

- canvas occupies available viewport below global app navigation;
- graph controls float over the canvas;
- inspector remains a collapsible bottom sheet and closed by default;
- safe areas are respected;
- touching the graph must not accidentally scroll the document;
- controls must not consume a permanent horizontal band larger than necessary.

## Data and authority

Google Drive remains the truth owner.

The renderer consumes only normalized graph projections. It must never:
- create semantic nodes to improve composition;
- invent relationships;
- infer Learning relations;
- fabricate metrics;
- alter canonical IDs.

Layout-derived coordinates, grouping, depth, visibility and camera state are explicitly non-semantic presentation data.

## Error handling and rollback

If WebGL/Three initialization fails, show an explicit renderer-unavailable state. Do not silently synthesize data.

Keep the Pixi renderer behind an internal rollback switch until the following parity is verified:
- route/deep-link compatibility;
- selection and focus behavior;
- Learning overlay;
- mobile gestures;
- inspector path;
- accessibility mirror;
- Drive provenance and health.

## Accessibility

Maintain a DOM accessibility mirror for visible nodes so keyboard and assistive technology can select/focus graph entities even though primary rendering is WebGL.

`prefers-reduced-motion` disables orbit drift, pulse effects and long camera tweens.

## Testing requirements

Add tests for:
1. focus node at `[0,0,0]`;
2. deterministic 3D coordinates;
3. real non-zero z distribution;
4. multi-shell packing for dense clusters;
5. sibling cluster sector separation;
6. one active domain and one active subgraph at a time;
7. structural positions unchanged by Learning toggle;
8. focus/selected labels always retained;
9. screen-space label collision suppression;
10. camera orbit/dolly/focus state transitions;
11. mobile pinch/orbit input paths;
12. reduced-motion camera behavior;
13. renderer persistence across selection changes;
14. no dangling edges;
15. no non-SSOT semantic nodes;
16. rollback Pixi renderer remains reachable until parity gate removal.

## Acceptance criteria

Initial NEXO view:
- one dominant central hub;
- declared major systems distributed in real 3D orbital space;
- large negative space;
- no unreadable label wall.

Focused domain view:
- focused node becomes local center;
- child clusters occupy distinct 3D shells/sectors;
- previous context recedes instead of accumulating in front;
- camera can orbit enough to perceive actual depth.

Functional:
- selection works by click/tap;
- repeated click/tap focuses the selected node;
- browser back/deep links work;
- mobile pinch/orbit is usable;
- Learning remains an overlay only;
- no blank-screen transitions;
- `/graphs` returns 200;
- `/api/health` returns 200 and authority remains `GOOGLE_DRIVE`;
- production runtime errors are zero after deployment.

## Deployment strategy

1. implement behind the current graph route with Pixi rollback preserved;
2. run focused RED/GREEN tests and full suite;
3. run TypeScript and production build;
4. deploy preview;
5. smoke desktop and mobile interaction;
6. verify Drive authority and runtime errors;
7. promote the same verified revision to production;
8. read back the canonical production URL and assets before declaring completion.
