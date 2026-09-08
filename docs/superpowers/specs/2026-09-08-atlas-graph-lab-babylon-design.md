# ATLAS Graph Lab · Babylon.js Design

## Goal
Create a Babylon.js implementation of the existing ATLAS Graph Lab for visual and performance comparison, while preserving the Canvas 2D baseline and the production Atlas untouched.

## Comparison Contract
The Babylon variant must reuse the same synthetic graph semantics, Paleta A color contract, deterministic orbital placement, node hierarchy, edge classes, and interaction concepts used by the current Graph Lab. Only the renderer changes.

## Isolation
- New directory: `atlas-control-tower/graph-lab-babylon/`.
- Do not modify `atlas-control-tower/graph-lab/` renderer behavior.
- Do not read or write Atlas production APIs, Neon, Durable Runner, or automation state.
- Synthetic data only.

## Rendering
- Babylon.js browser runtime loaded from the official Babylon CDN.
- Real 3D scene with `ArcRotateCamera`.
- Spherical meshes for nodes with emissive/specular materials and restrained glow.
- NEXO uses the approved antique-gold Paleta A accent.
- Other systems use the exact Paleta A semantic colors from the existing Graph Lab.
- Curved relations use tube meshes built from quadratic Bézier samples.
- Travelling pulses use small emissive spheres moving along those same curves.
- Background remains near-black, with restrained star particles and depth haze.
- Labels are DOM overlays projected from 3D positions so typography remains crisp.

## Interaction
- Drag: orbit camera.
- Wheel/pinch: zoom.
- Click: select node.
- Double click structural node: focus its local subgraph.
- Home/back/fit/center controls mirror the baseline lab.
- Reduced-motion disables automatic pulse animation and camera auto-rotation.

## HUD and Identity
The page must clearly display `BABYLON.JS` in the top bar and show FPS, frame time, nodes, edges, and labels. A visitor must never confuse this renderer with the Canvas baseline.

## Performance Scope
Initial test scales: 50, 100, 250, 500 nodes. The 1000-node option may be exposed, but visual fidelity takes priority over heroic optimization in this first comparison build.

## Acceptance Criteria
1. Page loads independently with no Atlas backend dependency.
2. Top bar clearly identifies `BABYLON.JS`.
3. Paleta A semantic colors match the Canvas Graph Lab.
4. NEXO and structural systems are visually dominant over leaf nodes.
5. Relations are curved, not straight lines.
6. Pulses travel on the same curves.
7. Camera orbit and zoom work on desktop and touch devices.
8. Labels track nodes and use a bounded label budget.
9. Existing Graph Lab files remain unchanged by this variant.
10. Automated contract tests, typecheck, and project build remain green.
