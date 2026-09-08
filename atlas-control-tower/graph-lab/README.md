# ATLAS GRAPH LAB

Standalone visual laboratory for reproducing the approved orbital NEXO Atlas graph language without touching the production renderer.

## What is isolated

- Synthetic graph data only.
- No production API calls.
- No Neon access.
- No Durable Runner access.
- No changes to `../graph3d.mjs` or the Atlas shell.

## Visual model

The lab intentionally starts with Canvas 2D and a manual 3D-to-2D perspective projection. Volumetric nodes use radial gradients, depth fog and glow. Relationships use quadratic Bézier filaments with one global animation loop and travelling LED pulses. Layout, drift and generated data are deterministic.

## Controls

Presets: ORIGINAL, CLEAN, DEEP_SPACE, HIGH_CONTRAST, DENSE_GRAPH, MOBILE.

Live parameters: node radius, glow, fog, perspective, drift, pulse speed, filament curvature, label budget and visible-node budget. Dataset sizes: 50, 100, 250, 500 and 1000 nodes.

Interaction: drag to orbit, Shift-drag to pan, wheel/pinch to zoom, click to select, double-click a structural body to enter its subgraph.
