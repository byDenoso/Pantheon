# Atlas Canvas 2.5D Design

## Goal
Replace the Babylon/WebGL Atlas renderer with a deterministic Canvas 2D renderer that preserves the same graph data contract while expressing structural depth through projection, scale, shadow, layering and focus rather than a free 3D camera.

## Product intent
The Atlas must be readable before it is impressive. On mobile it must support direct touch interaction without a six-button directional control pad. On desktop it must remain explorable, precise and inspectable.

## Data contract
The renderer continues to consume the existing filtered graph and deterministic `PlacedNode3D[]` produced by `layoutGraph3D`. No authority, status, provenance or graph semantics move into the renderer. The z coordinate is treated as semantic depth only.

## Projection
Canvas projection maps x/y into screen space and uses z only to influence parallax, scale, opacity and draw order. The renderer sorts edges and nodes deterministically so identical graph input produces identical placement and first frame.

## Visual grammar
- Position encodes architecture and domain clustering.
- Color encodes node type/domain family, not health.
- State is encoded by outline/halo: blocked/conflict red, degraded/stale/unverified amber, healthy/live neutral/green-accented.
- Radius is bounded by node type and connectivity so one domain cannot visually consume the graph.
- Depth is expressed with scale, shadow, parallax and draw order.
- Labels appear for domains/providers by default and for selected or sufficiently zoomed nodes.

## Interaction
- Drag pans the graph.
- Pinch on touch and wheel on desktop zoom.
- Tap/click selects a node.
- Double tap/double click focuses a node.
- `Visão geral` resets the viewport.
- `Focar` centers and zooms the selected node.
- Keyboard-accessible hidden node controls remain available.

## Mobile
The Canvas becomes the primary interaction surface. The legacy arrow/plus/minus mobile control panel is removed. The graph keeps a minimum interactive height but does not force the previous tall 4:5 presentation. Tooltips are replaced by selection/focus behavior on touch.

## Failure behavior
Canvas 2D initialization failure must fail visibly, with an explicit fallback message. No WebGL capability is required.

## Compatibility
The surrounding Atlas filters, legend, inspector, selection model and graph contract remain unchanged. The implementation changes only the rendering layer and related styling.
