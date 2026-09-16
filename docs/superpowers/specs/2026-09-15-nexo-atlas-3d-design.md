# NEXO Atlas 3D — Design

## Goal
Replace the current deterministic radial SVG Atlas with a real navigable 3D knowledge-space projection while preserving the same SystemState graph, filters, selection, inspector, provenance, and authority semantics.

## Rendering
Use Babylon.js (`@babylonjs/core`) as an isolated renderer inside React. NEXO is the central hub. SCIENCE, ENGINEERING, and OLYMPUS are large orbital hubs. Providers/capabilities sit near their domain hub; actions/effects/projections occupy intermediate shells; claims/filaments/tests/memory occupy outer shells.

The 3D layout is deterministic. Stable input must produce stable x/y/z coordinates. It must not use a live force simulation.

## Interaction
- orbit camera by drag
- zoom by wheel/pinch
- pan with secondary pointer gesture
- click/tap selects a node and preserves the existing inspector behavior
- double click/double tap performs camera fly-to
- selected node highlights its immediate graph neighborhood and dims unrelated nodes/edges
- external selection changes also fly the camera to the selected node
- filters continue to act before layout/rendering
- desktop keeps the inspector aside; mobile keeps the existing sheet pattern

## Visual hierarchy
Dark spatial background, restrained bloom/glow, domain-colored hubs, smaller satellite nodes, low-contrast connection lines, and billboard labels. Domain hubs are always labelled. Ordinary nodes reveal labels on selection/hover to avoid visual noise.

## Data contract
No backend or Truth Owner changes. The renderer consumes `SystemState.graph` only. Filtering and relation semantics remain in `src/viewmodels/graph.ts`. 3D placement lives in a separate viewmodel.

## Files
- add `nexo-one/src/viewmodels/graph3d.ts`
- add `nexo-one/src/components/Atlas3DCanvas.tsx`
- add `nexo-one/src/styles/atlas3d.css`
- update `nexo-one/src/features/system/Atlas.tsx`
- update package manifest/lock for Babylon.js
- add deterministic-layout and browser smoke coverage

## Acceptance
`npm run check` passes; browser verification passes on desktop/mobile; production deployment is READY; production root and Atlas surface respond without runtime errors.