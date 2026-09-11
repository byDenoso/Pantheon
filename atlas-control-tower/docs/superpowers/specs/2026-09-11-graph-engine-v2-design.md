# Atlas Graph Engine V2 Design

## Goal

Replace the fragmented graph surfaces with one route-scoped, SSOT-faithful graph explorer while preserving rollback to the previous renderers until equivalence is verified.

## Product contract

- `/graphs` is the global graph entrypoint.
- `/graphs/:domainId` shows the domain and its published subgraphs.
- `/graphs/:domainId/:subgraphId` shows the detailed structural graph.
- Learning is an overlay on the graph, never a primary navigation area and never a truth owner.
- Overview, Operations, and Provenance remain dedicated non-graph surfaces.
- The frontend never fabricates nodes, metrics, relationships, counts, or taxonomy to fill missing source data.
- `?engine=v1` remains the emergency rollback path during V2 validation.

## Data and authority

Graph Projection V2 is a read-only presentation projection. Canonical IDs and declared edges come from the existing Atlas/SSOT APIs. The renderer may hide nodes through semantic LOD, but it may not rewrite their meaning or create undeclared relationships. Learning filaments are derived only from published Learning records whose endpoints resolve to visible graph entities.

## Renderer architecture

PixiJS owns the route-scoped Canvas/WebGL renderer and GSAP is used only for bounded presentation transitions. One `PIXI.Application` lives for the component lifetime. Selection, Learning visibility, zoom, pan, and redraws update persistent layers instead of recreating the application.

The world contains independent structural-edge, Learning-edge, node, and interaction layers. Viewport state is kept outside canonical graph state. Pan, wheel zoom, and pointer pinch alter only the world transform. Reduced-motion removes automatic transition animation.

## Interaction

- Single click/tap selects a node.
- Double click/tap on an explorable node drills down.
- Drag pans the graph.
- Wheel and pinch zoom around the interaction point within fixed scale bounds.
- Learning filaments have enlarged invisible hit targets and can be inspected independently from nodes.
- Node and edge selection are mutually exclusive and may be represented in the URL through `entity` and `edge` parameters.

## Accessibility

Canvas is supplemented by a DOM accessibility layer containing keyboard-operable controls for visible nodes and Learning edges. The inspector is an `aria-live` region. Interactive controls meet a 44px mobile target and reduced-motion is honored.

## Performance policy

The renderer uses adaptive DPR and deterministic semantic LOD. Focus and selected nodes survive LOD. Labels receive a tighter budget than nodes. Current detail API requests remain bounded; helper tests cover synthetic 100, 1,000, 5,000, and 10,000-node inputs without relying on timing-sensitive assertions. A Web Worker is not introduced unless profiling demonstrates that the O(n) deterministic projection/layout path blocks the main thread materially.

## Resilience and telemetry

WebGL context loss is surfaced as a recoverable renderer state; context restoration triggers redraw without mutating canonical graph data. The graph dispatches local `atlas:graph-metrics` CustomEvents containing renderer initialization duration, node/edge counts, visible counts, DPR, and bounded FPS samples. No new network telemetry sink is invented.

## Mobile

Below tablet width, the graph uses a single-column surface, horizontal-safe controls, an inspector that behaves like a bottom sheet, lower DPR where appropriate, and preserved canvas height. Touch panning and pinch zoom must not trigger page collapse.

## Cutover

V2 is eligible for preview only after the complete test suite, TypeScript check, and production Vite build pass on the branch. The official site is not changed as part of this design without an explicit production cutover decision.